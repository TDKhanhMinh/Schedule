import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const solverRoot = resolve(root, "backend/solver");
const python = process.env.SOLVER_PYTHON ?? resolve(solverRoot, ".venv", "Scripts", "python.exe");
const fixturePath = resolve(solverRoot, "examples/local-repair.json");
const outputPath = resolve(root, "outputs/P3.2-T02/local-repair-report.json");
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const result = spawnSync(python, ["-m", "timetable_solver.main"], {
  cwd: solverRoot,
  encoding: "utf8",
  input: JSON.stringify(fixture),
  env: { ...process.env, PYTHONPATH: resolve(solverRoot, "src") },
});
if (result.status !== 0) throw new Error(result.stderr || `Solver exited with ${result.status}`);
const solveResult = JSON.parse(result.stdout);
assert.equal(solveResult.status, "OPTIMAL");
assert.equal(solveResult.diagnostics.localRepair.movedAssignmentCount, 1);
assert.equal(solveResult.diagnostics.localRepair.preservedAssignmentCount, 0);
assert.equal(solveResult.diagnostics.localRepair.outsideScopeUnchanged, true);
assert.deepEqual(
  solveResult.assignments.find((assignment) => assignment.lessonId === "lesson-b"),
  { lessonId: "lesson-b", sessionIndex: 0, slotId: "mon-2", roomId: null },
);

const report = {
  task: "P3.2-T02",
  evidenceVersion: "LOCAL-REPAIR-EVIDENCE-1.0.0",
  generatedAt: new Date().toISOString(),
  fixture: "backend/solver/examples/local-repair.json",
  contractVersion: solveResult.diagnostics.localRepair.contractVersion,
  status: solveResult.status,
  assignments: solveResult.assignments,
  localRepair: solveResult.diagnostics.localRepair,
  hardConstraintViolations: solveResult.diagnostics.hardConstraintViolations,
  environment: "local Python + OR-Tools CP-SAT; synthetic fixture; no pilot/production approval",
};
await mkdir(resolve(root, "outputs/P3.2-T02"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: outputPath, status: report.status, localRepair: report.localRepair }, null, 2));
