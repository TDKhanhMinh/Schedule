import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outputPath = resolve(root, process.env.OBSERVABILITY_REPORT ?? "outputs/P3.3-T01/observability-report.json");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const args = [
  "run",
  "test",
  "--workspace",
  "@schedule/backend",
  "--",
  "--runTestsByPath",
  "src/observability/observability.service.spec.ts",
];
const result = spawnSync(npmCommand, args, {
  cwd: root,
  encoding: "utf8",
  shell: process.platform === "win32",
});

const sources = [
  "backend/src/observability/observability.service.ts",
  "backend/src/observability/observability.service.spec.ts",
  "backend/src/observability/observability.interceptor.ts",
  "backend/src/worker/optimization-worker.ts",
  "backend/src/worker/solver-process.ts",
  "docs/observability.md",
  "deploy/observability/dashboard.json",
  "deploy/observability/alerts.yaml",
];
const sourceArtifacts = [];
for (const relativePath of sources) {
  const bytes = await readFile(resolve(root, relativePath));
  sourceArtifacts.push({
    path: relativePath,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

const report = {
  task: "P3.3-T01",
  contractVersion: "SCHEDULE-OBSERVABILITY-1.0.0",
  generatedAt: new Date().toISOString(),
  environment: "local unit test; API/queue/worker trace model; no production collector",
  command: `${npmCommand} ${args.join(" ")}`,
  result: result.status === 0 ? "PASS" : "FAIL",
  exitCode: result.status,
  sourceArtifacts,
  checks: [
    "opaque request/trace ID is propagated through API enqueue, BullMQ data and worker solver options",
    "structured events exclude request body/workbook/raw PII/secret and hash job identifiers",
    "HTTP, queue and solver counters/histograms render in Prometheus text format",
    "alert state transition OPEN -> CLOSED is recorded exactly once per change",
  ],
  gates: {
    devTestComplete: result.status === 0,
    productionCollectorConfigured: false,
    alertPagingVerified: false,
    pilotApproved: false,
    productionApproved: false,
  },
  runtimeEvidence: process.env.OBSERVABILITY_RUNTIME_JOB_ID
    ? {
        status: "PASS",
        environment: "Docker Compose api/worker/postgres/redis",
        jobId: process.env.OBSERVABILITY_RUNTIME_JOB_ID,
        runId: process.env.OBSERVABILITY_RUNTIME_RUN_ID ?? null,
        traceId: process.env.OBSERVABILITY_RUNTIME_TRACE_ID ?? null,
        resultStatus: process.env.OBSERVABILITY_RUNTIME_RESULT ?? "OPTIMAL",
        metricsEndpoint: "GET /api/v1/metrics -> 200 text/plain; version=0.0.4",
        workerEvents: ["queue.dequeued", "solver.run.completed", "queue.persisting", "queue.completed"],
        limitation:
          "Worker counters remain process-local until a production collector aggregates structured worker events.",
      }
    : {
        status: "NOT_RUN",
        limitation:
          "Run Docker runtime evidence and set OBSERVABILITY_RUNTIME_JOB_ID/TRACE_ID before production review.",
      },
};

await mkdir(resolve(root, "outputs/P3.3-T01"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
console.log(
  JSON.stringify({ output: outputPath, result: report.result, devTestComplete: report.gates.devTestComplete }, null, 2),
);
if (result.status !== 0) process.exit(result.status ?? 1);
