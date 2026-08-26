import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const defaultOutput = resolve(root, "outputs", "P3.1-T03", "baseline-comparison-report.json");
const args = process.argv.slice(2);
const outputFlagIndex = args.indexOf("--output");
const outputPath = resolve(
  root,
  outputFlagIndex >= 0 && args[outputFlagIndex + 1] ? args[outputFlagIndex + 1] : defaultOutput,
);
const solverPython = process.env.SOLVER_PYTHON ?? resolve(root, "backend", "solver", ".venv", "Scripts", "python.exe");
const reconciliationPath = resolve(root, "outputs", "P3.1-T02", "pilot-reconciliation-report.json");
const priorReportPath = resolve(root, "outputs", "P2.2-T07", "solver-benchmark-report.json");
const runnerPath = resolve(root, "backend", "solver", "scripts", "run_benchmark_rubric.py");

if (existsSync(outputPath) && !args.includes("--force")) {
  throw new Error(`Report already exists: ${outputPath}. Use --force for an intentional refresh.`);
}
if (!existsSync(solverPython)) throw new Error(`Solver Python runtime not found: ${solverPython}`);

const result = spawnSync(solverPython, [runnerPath], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, PYTHONPATH: resolve(root, "backend", "solver", "src") },
  maxBuffer: 16 * 1024 * 1024,
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Benchmark runner failed (${result.status}): ${result.stderr}`);
const benchmark = JSON.parse(result.stdout);
const reconciliation = JSON.parse(readFileSync(reconciliationPath, "utf8"));
const prior = existsSync(priorReportPath) ? JSON.parse(readFileSync(priorReportPath, "utf8")) : null;

const currentResults = new Map(benchmark.datasets.map((dataset) => [dataset.id, dataset]));
const priorResults = new Map((prior?.datasets ?? []).map((dataset) => [dataset.id, dataset]));
const regression = benchmark.datasets.map((dataset) => {
  const previous = priorResults.get(dataset.id);
  return {
    dataset: dataset.id,
    current: {
      status: dataset.seedRuns[0]?.status,
      assignmentCount: dataset.seedRuns[0]?.assignmentCount,
      hardConflictCount: dataset.seedRuns[0]?.hardConflictCount,
      seedSet: dataset.seedRuns.map((run) => run.seed),
      passed: dataset.passed,
    },
    previous: previous
      ? {
          status: previous.seedRuns[0]?.status,
          assignmentCount: previous.seedRuns[0]?.assignmentCount,
          hardConflictCount: previous.seedRuns[0]?.hardConflictCount,
        }
      : null,
    stableAgainstPrior: previous
      ? dataset.seedRuns[0]?.status === previous.seedRuns[0]?.status &&
        dataset.seedRuns[0]?.assignmentCount === previous.seedRuns[0]?.assignmentCount &&
        dataset.seedRuns[0]?.hardConflictCount === previous.seedRuns[0]?.hardConflictCount
      : null,
  };
});

const report = {
  task: "P3.1-T03",
  generatedAt: new Date().toISOString(),
  scope: "local Docker/dev synthetic baseline; no school or third-party superiority claim",
  benchmark,
  regression,
  comparison: {
    syntheticBaseline: {
      status: benchmark.summary.allPassed ? "PASS" : "FAIL",
      seedSet: benchmark.environment.seedSet,
      datasetCount: benchmark.summary.datasetCount,
      feasibleHardConstraintGatesPass: benchmark.datasets
        .filter((dataset) => dataset.expected.status !== "INFEASIBLE")
        .every((dataset) => dataset.seedRuns.every((run) => run.hardConflictCount === 0)),
      infeasibleCasesMatchExpectedDiagnostics: benchmark.datasets
        .filter((dataset) => dataset.expected.status === "INFEASIBLE")
        .every((dataset) => dataset.checks.status && dataset.checks.assignmentCount),
      allSeedStabilityGatesPass: benchmark.datasets.every((dataset) => dataset.checks.seedStability),
      allPerformanceGatesPass: benchmark.datasets.every((dataset) => dataset.checks.runtime),
    },
    manualSchedule: {
      status: "NOT_SUPPLIED",
      comparable: false,
      reason:
        "No manual schedule artifact with the same input snapshot, rule set, seed/time limit and rubric was supplied.",
    },
    thirdPartySoftware: {
      status: "NOT_SUPPLIED",
      comparable: false,
      reason: "No third-party output or reproducible configuration was supplied.",
    },
  },
  pilotGate: {
    reconciliationSnapshotHash: reconciliation.snapshotHash,
    solveAllowedForPilotSnapshot: reconciliation.gate.solveAllowed,
    pilotBaselineRun: reconciliation.gate.solveAllowed ? "ALLOWED" : "BLOCKED_UNRECONCILED_SNAPSHOT",
    externalComparable: false,
    pilotApproved: false,
    productionApproved: false,
    blockers: reconciliation.exceptions
      .filter((exception) => exception.status === "OPEN")
      .map((exception) => ({
        id: exception.id,
        owner: exception.owner,
        action: exception.action,
      })),
  },
  decision: benchmark.summary.allPassed
    ? "Synthetic baseline passes the versioned rubric and is regression-stable; it is not evidence that the product beats a school/manual/third-party schedule."
    : "Synthetic baseline did not pass the versioned rubric; do not use it for comparison or sign-off.",
};

mkdirSync(resolve(outputPath, ".."), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      outputPath,
      allPassed: report.benchmark.summary.allPassed,
      datasets: report.benchmark.summary.datasetCount,
      pilotBaselineRun: report.pilotGate.pilotBaselineRun,
      externalComparable:
        report.comparison.manualSchedule.comparable || report.comparison.thirdPartySoftware.comparable,
    },
    null,
    2,
  ),
);
