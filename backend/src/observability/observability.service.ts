import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";

export const OBSERVABILITY_CONTRACT_VERSION = "SCHEDULE-OBSERVABILITY-1.0.0" as const;
export const OBSERVABILITY_HISTOGRAM_BUCKETS = [50, 100, 250, 500, 1000, 5000, 10000] as const;

type MetricLabels = Readonly<Record<string, string>>;
type MetricPoint = { name: string; labels: MetricLabels; value: number };

export interface ObservabilityEvent {
  timestamp: string;
  event: string;
  component: "api" | "queue" | "worker" | "solver" | "alert";
  traceId?: string;
  runId?: string;
  jobHash?: string;
  status?: string;
  state?: string;
  durationMs?: number;
  errorCode?: string;
}

type ObservabilityEventInput = Omit<ObservabilityEvent, "timestamp">;

export interface AlertState {
  alertId: string;
  state: "OPEN" | "CLOSED";
  reason: string;
  changedAt: string;
}

function labelsKey(labels: MetricLabels) {
  return Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

function escapePrometheus(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\n", "\\n");
}

@Injectable()
export class ObservabilityService {
  private readonly counters = new Map<string, MetricPoint>();
  private readonly histograms = new Map<string, { name: string; labels: MetricLabels; values: number[] }>();
  private readonly events: ObservabilityEvent[] = [];
  private readonly alerts = new Map<string, AlertState>();

  recordHttp(method: string, route: string, status: number, durationMs: number, traceId?: string) {
    const labels = { method: method.toUpperCase(), route: this.safeRoute(route), status: String(status) };
    this.increment("schedule_http_requests_total", labels);
    this.observe("schedule_http_request_duration_ms", { method: labels.method, route: labels.route }, durationMs);
    this.log({
      event: "http.request.completed",
      component: "api",
      traceId: this.safeToken(traceId),
      status: String(status),
      durationMs: this.safeDuration(durationMs),
    });
  }

  recordQueue(
    event: "ENQUEUED" | "DEQUEUED" | "PERSISTING" | "COMPLETED" | "FAILED" | "CANCELLED" | "PRECHECK_REJECTED",
    details: { traceId?: string; runId?: string; jobId?: string; state?: string } = {},
  ) {
    this.increment("schedule_queue_events_total", { event });
    this.log({
      event: `queue.${event.toLowerCase()}`,
      component: "queue",
      traceId: this.safeToken(details.traceId),
      runId: this.safeToken(details.runId),
      jobHash: details.jobId ? this.hashIdentifier(details.jobId) : undefined,
      state: this.safeToken(details.state),
    });
  }

  recordSolver(
    status: string,
    durationMs: number,
    details: { traceId?: string; runId?: string; errorCode?: string } = {},
  ) {
    const safeStatus = this.safeToken(status) ?? "UNKNOWN";
    this.increment("schedule_solver_runs_total", { status: safeStatus });
    this.observe("schedule_solver_duration_ms", { status: safeStatus }, durationMs);
    this.log({
      event: "solver.run.completed",
      component: "solver",
      traceId: this.safeToken(details.traceId),
      runId: this.safeToken(details.runId),
      status: safeStatus,
      durationMs: this.safeDuration(durationMs),
      errorCode: this.safeToken(details.errorCode),
    });
  }

  setAlertState(alertId: string, state: "OPEN" | "CLOSED", reason: string) {
    const next: AlertState = {
      alertId: this.safeToken(alertId) ?? "unknown",
      state,
      reason: this.safeReason(reason),
      changedAt: new Date().toISOString(),
    };
    const previous = this.alerts.get(next.alertId);
    if (!previous || previous.state !== state || previous.reason !== next.reason) {
      this.alerts.set(next.alertId, next);
      this.increment("schedule_alert_state_changes_total", { alert: next.alertId, state });
      this.log({ event: `alert.${state.toLowerCase()}`, component: "alert", state, errorCode: next.alertId });
    }
    return this.alerts.get(next.alertId)!;
  }

  getSnapshot() {
    return {
      contractVersion: OBSERVABILITY_CONTRACT_VERSION,
      counters: [...this.counters.values()].map((point) => ({ ...point, labels: { ...point.labels } })),
      histograms: [...this.histograms.values()].map((histogram) => ({
        name: histogram.name,
        labels: { ...histogram.labels },
        values: [...histogram.values],
      })),
      alerts: [...this.alerts.values()].map((alert) => ({ ...alert })),
      eventCount: this.events.length,
    };
  }

  toPrometheus() {
    const lines = [
      `# HELP schedule_observability_info Observability contract metadata`,
      `# TYPE schedule_observability_info gauge`,
    ];
    lines.push(`schedule_observability_info{contract_version="${OBSERVABILITY_CONTRACT_VERSION}"} 1`);
    for (const point of [...this.counters.values()].sort((left, right) =>
      labelsKey(left.labels).localeCompare(labelsKey(right.labels)),
    )) {
      lines.push(`${point.name}${this.renderLabels(point.labels)} ${point.value}`);
    }
    for (const histogram of [...this.histograms.values()].sort((left, right) =>
      labelsKey(left.labels).localeCompare(labelsKey(right.labels)),
    )) {
      const sorted = [...histogram.values].sort((left, right) => left - right);
      const sum = sorted.reduce((total, value) => total + value, 0);
      for (const bucket of OBSERVABILITY_HISTOGRAM_BUCKETS) {
        const count = sorted.filter((value) => value <= bucket).length;
        lines.push(
          `${histogram.name}_bucket${this.renderLabels({ ...histogram.labels, le: String(bucket) })} ${count}`,
        );
      }
      lines.push(`${histogram.name}_bucket${this.renderLabels({ ...histogram.labels, le: "+Inf" })} ${sorted.length}`);
      lines.push(`${histogram.name}_sum${this.renderLabels(histogram.labels)} ${sum}`);
      lines.push(`${histogram.name}_count${this.renderLabels(histogram.labels)} ${sorted.length}`);
    }
    return `${lines.join("\n")}\n`;
  }

  private increment(name: string, labels: MetricLabels) {
    const key = `${name}|${labelsKey(labels)}`;
    const current = this.counters.get(key);
    if (current) {
      current.value += 1;
      return;
    }
    this.counters.set(key, { name, labels, value: 1 });
  }

  private observe(name: string, labels: MetricLabels, value: number) {
    const key = `${name}|${labelsKey(labels)}`;
    const current = this.histograms.get(key);
    const safeValue = this.safeDuration(value);
    if (current) {
      current.values.push(safeValue);
      return;
    }
    this.histograms.set(key, { name, labels, values: [safeValue] });
  }

  private log(event: ObservabilityEventInput) {
    const record = Object.fromEntries(
      Object.entries({ ...event, timestamp: new Date().toISOString() }).filter(([, value]) => value !== undefined),
    ) as unknown as ObservabilityEvent;
    this.events.push(record);
    if (this.events.length > 500) this.events.shift();
    if (process.env.NODE_ENV !== "test") console.log(JSON.stringify(record));
  }

  private renderLabels(labels: MetricLabels) {
    const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0) return "";
    return `{${entries.map(([key, value]) => `${key}="${escapePrometheus(value)}"`).join(",")}}`;
  }

  private safeRoute(route: string) {
    return (
      route
        .split("?")[0]
        .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id")
        .slice(0, 200) || "unknown"
    );
  }

  private safeToken(value: string | undefined) {
    return value && /^[a-zA-Z0-9._:-]{1,128}$/.test(value) ? value : undefined;
  }

  private safeDuration(value: number) {
    return Number.isFinite(value) && value >= 0 ? Number(value.toFixed(3)) : 0;
  }

  private safeReason(value: string) {
    return value.replaceAll(/[\r\n]/g, " ").slice(0, 200);
  }

  private hashIdentifier(value: string) {
    return createHash("sha256").update(value).digest("hex").slice(0, 16);
  }
}
