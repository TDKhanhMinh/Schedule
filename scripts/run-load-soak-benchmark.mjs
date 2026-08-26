import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const baseUrl = process.env.P33_T03_API_BASE_URL ?? "http://localhost:3011/api/v1";
const schoolId = process.env.P33_T03_SCHOOL_ID ?? "00000000-0000-0000-0000-000000000001";
const tenantId = process.env.P33_T03_TENANT_ID ?? "34ec13a2-7f70-4325-8439-408885feca58";
const outputPath = resolve(root, process.env.LOAD_SOAK_REPORT ?? "outputs/P3.3-T03/load-soak-report.json");
const adminHeaders = {
  "x-user-id": "p3-3-t03-load",
  "x-user-role": "ADMIN",
  "x-school-id": schoolId,
  "x-tenant-id": tenantId,
};
const terminalStates = new Set(["OPTIMAL", "FEASIBLE", "INFEASIBLE", "INVALID", "FAILED", "CANCELLED", "UNKNOWN"]);

async function request(path, options = {}) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, options);
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("json") ? await response.json() : await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body,
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { error: error instanceof Error ? error.message : String(error) },
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
    };
  }
}

async function runConcurrent(count, concurrency, task) {
  const results = [];
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= count) return;
      results[index] = await task(index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(count, concurrency) }, () => worker()));
  return results;
}

function percentile(values, ratio) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function summarize(label, results) {
  const durations = results.map((result) => result.durationMs);
  const successes = results.filter((result) => result.ok).length;
  return {
    label,
    requests: results.length,
    successes,
    failures: results.length - successes,
    errorRate: results.length === 0 ? 0 : Number(((results.length - successes) / results.length).toFixed(4)),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maxMs: durations.length ? Math.max(...durations) : null,
    statuses: Object.fromEntries(
      [...new Set(results.map((result) => result.status))].map((status) => [
        String(status),
        results.filter((result) => result.status === status).length,
      ]),
    ),
  };
}

function dockerStats() {
  try {
    const output = execFileSync(
      "docker",
      [
        "stats",
        "--no-stream",
        "--format",
        "{{json .}}",
        "schedule-api-1",
        "schedule-worker-1",
        "schedule-postgres-1",
        "schedule-redis-1",
      ],
      { cwd: root, encoding: "utf8" },
    );
    return output
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    return { status: "UNAVAILABLE", reason: error instanceof Error ? error.message : String(error) };
  }
}

const fixture = JSON.parse(
  await readFile(resolve(root, "backend/solver/examples/benchmarks/small-feasible.json"), "utf8"),
);
fixture.schoolId = schoolId;

const healthBefore = await runConcurrent(60, 10, () => request("/health"));
const preflight = await runConcurrent(20, 5, (index) =>
  request("/optimization-jobs/preflight", {
    method: "POST",
    headers: { ...adminHeaders, "content-type": "application/json" },
    body: JSON.stringify({ ...fixture, jobId: `p3-3-t03-preflight-${index}` }),
  }),
);
const metrics = await runConcurrent(10, 2, () => request("/metrics"));

const benchmarkPrefix = `p3-3-t03-load-${Date.now()}`;
const created = await Promise.all(
  Array.from({ length: 3 }, (_, index) => {
    const jobId = `${benchmarkPrefix}-${index}`;
    const traceId = `${benchmarkPrefix}-trace-${index}`;
    return request("/optimization-jobs", {
      method: "POST",
      headers: { ...adminHeaders, "content-type": "application/json", "x-request-id": traceId },
      body: JSON.stringify({ ...fixture, jobId }),
    }).then((result) => ({ jobId, traceId, result }));
  }),
);

const createdJobs = created
  .filter(({ result }) => result.status === 201)
  .map(({ jobId, traceId, result }) => ({
    jobId,
    traceId,
    runId: result.body?.runId ?? null,
    responseTraceId: result.body?.traceId ?? null,
  }));
const pollStartedAt = Date.now();
let statuses = [];
while (Date.now() - pollStartedAt < 30_000) {
  statuses = await Promise.all(
    createdJobs.map(({ jobId }) =>
      request(`/optimization-jobs/${encodeURIComponent(jobId)}`, {
        headers: { ...adminHeaders, "x-request-id": `${jobId}-status` },
      }).then((result) => ({ jobId, ...result })),
    ),
  );
  if (statuses.length > 0 && statuses.every((item) => terminalStates.has(item.body?.state))) break;
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
}

const healthDuringJobs = await runConcurrent(60, 10, () => request("/health"));
const healthBeforeSummary = summarize("health-before", healthBefore);
const preflightSummary = summarize("preflight", preflight);
const metricsSummary = summarize("metrics", metrics);
const healthDuringJobsSummary = summarize("health-during-jobs", healthDuringJobs);
const statusByJob = Object.fromEntries(statuses.map((item) => [item.jobId, item.body?.state ?? "UNKNOWN"]));
const jobIds = createdJobs.map((item) => item.jobId);
const duplicateJobIds = jobIds.length - new Set(jobIds).size;
const lostJobIds = createdJobs.filter((item) => !Object.hasOwn(statusByJob, item.jobId)).map((item) => item.jobId);
const terminalCount = Object.values(statusByJob).filter((state) => terminalStates.has(state)).length;
const benchmarkCriteria = {
  healthP95: healthBeforeSummary.p95Ms <= 500,
  preflightP95: preflightSummary.p95Ms <= 500,
  metricsP95: metricsSummary.p95Ms <= 500,
  healthDuringJobsP95: healthDuringJobsSummary.p95Ms <= 500,
  healthErrors: healthBeforeSummary.failures === 0,
  preflightErrors: preflightSummary.failures === 0,
  metricsErrors: metricsSummary.failures === 0,
  healthDuringJobsErrors: healthDuringJobsSummary.failures === 0,
  allJobsCreated: createdJobs.length === 3,
  allJobsTerminal: terminalCount === createdJobs.length,
  noDuplicateJobs: duplicateJobIds === 0,
  noLostJobs: lostJobIds.length === 0,
};
const benchmarkPass = Object.values(benchmarkCriteria).every(Boolean);

const report = {
  task: "P3.3-T03",
  benchmarkVersion: "LOAD-SOAK-1.0.0",
  generatedAt: new Date().toISOString(),
  environment: "local Docker Compose; synthetic small-feasible dataset; no production SLO claim",
  config: { baseUrl, schoolId, healthRequests: 60, preflightRequests: 20, metricsRequests: 10, concurrentJobs: 3 },
  scenarios: {
    healthBefore: healthBeforeSummary,
    preflight: preflightSummary,
    metrics: metricsSummary,
    healthDuringJobs: healthDuringJobsSummary,
  },
  jobs: {
    requested: 3,
    created: createdJobs.length,
    terminal: terminalCount,
    statusByJob,
    jobIds,
    traceIds: createdJobs.map((item) => item.traceId),
    responseTraceIds: createdJobs.map((item) => item.responseTraceId),
    duplicateJobIds,
    lostJobIds,
    integrityPass:
      createdJobs.length === 3 &&
      terminalCount === createdJobs.length &&
      duplicateJobIds === 0 &&
      lostJobIds.length === 0,
  },
  resources: dockerStats(),
  thresholds: {
    healthP95Ms: 500,
    preflightP95Ms: 500,
    metricsP95Ms: 500,
    jobIntegrity: "created == terminal; duplicateJobIds == 0; lostJobIds == 0",
  },
  gate: {
    benchmarkPass,
    benchmarkCriteria,
    devTestComplete: true,
    pilotApproved: false,
    productionApproved: false,
    capacityLimit: "3 concurrent synthetic solve jobs and bounded local request load only",
  },
  limitations: [
    "No production hardware, staging identity, autoscaling or long-duration soak was used.",
    "Docker stats is a point-in-time snapshot, not a time-series resource profile.",
    "Synthetic solver IDs are not school-sized data and do not establish real-school capacity.",
  ],
};

await mkdir(resolve(root, "outputs/P3.3-T03"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      output: outputPath,
      benchmarkPass: report.gate.benchmarkPass,
      jobs: report.jobs,
      capacityLimit: report.gate.capacityLimit,
    },
    null,
    2,
  ),
);
if (!report.gate.benchmarkPass) process.exit(1);
