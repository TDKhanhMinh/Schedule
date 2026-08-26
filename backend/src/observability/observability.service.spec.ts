/// <reference types="jest" />

import { ObservabilityService } from "./observability.service";

describe("ObservabilityService", () => {
  it("records bounded metrics without logging workbook/raw identifiers", () => {
    const service = new ObservabilityService();

    service.recordHttp("post", "/api/v1/schools/:schoolId/optimization-jobs", 201, 42, "trace-001");
    service.recordQueue("ENQUEUED", { traceId: "trace-001", runId: "run-001", jobId: "teacher@example.com" });
    service.recordSolver("OPTIMAL", 120, { traceId: "trace-001", runId: "run-001" });

    const snapshot = service.getSnapshot();
    expect(snapshot.counters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "schedule_http_requests_total", value: 1 }),
        expect.objectContaining({ name: "schedule_queue_events_total", value: 1 }),
        expect.objectContaining({ name: "schedule_solver_runs_total", value: 1 }),
      ]),
    );
    expect(service.toPrometheus()).toContain(
      'schedule_observability_info{contract_version="SCHEDULE-OBSERVABILITY-1.0.0"} 1',
    );
    expect(service.toPrometheus()).not.toContain("teacher@example.com");
  });

  it("opens and closes an alert exactly through state transitions", () => {
    const service = new ObservabilityService();

    expect(service.setAlertState("solver_error_rate", "OPEN", "5xx rate above 5%")).toMatchObject({ state: "OPEN" });
    expect(service.setAlertState("solver_error_rate", "CLOSED", "5xx rate recovered")).toMatchObject({
      state: "CLOSED",
    });
    expect(service.getSnapshot().alerts).toEqual([
      expect.objectContaining({ alertId: "solver_error_rate", state: "CLOSED" }),
    ]);
    expect(service.toPrometheus()).toContain('state="OPEN"');
    expect(service.toPrometheus()).toContain('state="CLOSED"');
  });
});
