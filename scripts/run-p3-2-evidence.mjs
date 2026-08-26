import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const solverRoot = resolve(root, "backend/solver");
const python = process.env.SOLVER_PYTHON ?? resolve(solverRoot, ".venv", "Scripts", "python.exe");
const outputPath = resolve(root, "outputs/P3.2-T03-T04/p3-2-evidence.json");

function runSolver(payload) {
  const result = spawnSync(python, ["-m", "timetable_solver.main"], {
    cwd: solverRoot,
    encoding: "utf8",
    input: JSON.stringify(payload),
    env: { ...process.env, PYTHONPATH: resolve(solverRoot, "src") },
  });
  if (result.status !== 0) throw new Error(result.stderr || `Solver exited with ${result.status}`);
  return JSON.parse(result.stdout);
}

const infeasibleFixture = JSON.parse(
  await readFile(resolve(solverRoot, "examples/benchmarks/infeasible-teacher-conflict.json"), "utf8"),
);
const chainResult = runSolver(infeasibleFixture);
assert.equal(chainResult.status, "INFEASIBLE");
assert.ok(chainResult.diagnostics.conflictDetails.some((detail) => detail.conflictChain?.nodes?.length >= 2));
const chainCases = {
  capacity: chainResult,
  fixedConflict: runSolver({
    schemaVersion: "1.0",
    jobId: "p3-2-fixed-chain",
    schoolId: "school-1",
    timeSlots: [
      { id: "mon-1", day: 1, period: 1 },
      { id: "tue-1", day: 2, period: 1 },
    ],
    lessons: [
      {
        id: "fixed-a",
        classId: "class-a",
        subjectId: "math",
        teacherId: "teacher-1",
        requiredSessions: 1,
        fixedSlotId: "mon-1",
      },
      {
        id: "fixed-b",
        classId: "class-b",
        subjectId: "physics",
        teacherId: "teacher-1",
        requiredSessions: 1,
        fixedSlotId: "mon-1",
      },
    ],
  }),
  unavailableCluster: runSolver({
    schemaVersion: "1.0",
    jobId: "p3-2-unavailable-chain",
    schoolId: "school-1",
    timeSlots: [
      { id: "mon-1", day: 1, period: 1 },
      { id: "tue-1", day: 2, period: 1 },
    ],
    classUnavailableSlotIds: { "class-a": ["mon-1", "tue-1"] },
    lessons: [
      {
        id: "unavailable-a",
        classId: "class-a",
        subjectId: "math",
        teacherId: "teacher-1",
        requiredSessions: 1,
        fixedSlotId: "mon-1",
      },
    ],
  }),
  roomMismatch: runSolver({
    schemaVersion: "1.0",
    jobId: "p3-2-room-chain",
    schoolId: "school-1",
    timeSlots: [{ id: "mon-1", day: 1, period: 1 }],
    rooms: [{ id: "room-standard", capabilities: ["STANDARD"] }],
    lessons: [
      {
        id: "room-a",
        classId: "class-a",
        subjectId: "science",
        teacherId: "teacher-1",
        requiredSessions: 1,
        requiredRoomCapabilities: ["LAB"],
      },
    ],
  }),
};
for (const [name, result] of Object.entries(chainCases)) {
  assert.equal(result.status, "INFEASIBLE", `${name} should be infeasible`);
  assert.ok(
    result.diagnostics.conflictDetails.some((detail) => detail.conflictChain?.nodes?.length >= 2),
    name,
  );
}

const relaxationResult = runSolver({
  schemaVersion: "1.0",
  jobId: "p3-2-relaxation-evidence",
  schoolId: "school-1",
  timeSlots: [
    { id: "mon-1", day: 1, period: 1 },
    { id: "tue-1", day: 2, period: 1 },
  ],
  lessons: [
    { id: "lesson-a", classId: "class-7a", subjectId: "math", teacherId: "teacher-1", requiredSessions: 1 },
    { id: "lesson-b", classId: "class-7b", subjectId: "physics", teacherId: "teacher-1", requiredSessions: 1 },
  ],
  teacherAvailability: {
    contractVersion: "TEACHER-AVAILABILITY-1.0.0",
    schoolId: "school-1",
    academicPeriodId: "period-1",
    effectiveAsOf: "2026-09-01",
    ruleSnapshotId: "snapshot-1",
    ruleSetVersion: "RULE-SET-1.0.0",
    ruleSnapshotHash: "a".repeat(64),
    rules: [
      {
        ruleId: "soft-1",
        code: "RULE-SOFT-DAY",
        teacherId: "teacher-1",
        strength: "SOFT_WISH",
        weight: 0.5,
        dayOfWeek: 1,
        blockedSlotIds: [],
        effectiveFrom: "2026-09-01",
        source: {
          sourceUrl: "https://schedule.local/rules/soft-1",
          ruleSnapshotId: "snapshot-1",
          ruleSetVersion: "RULE-SET-1.0.0",
          ruleSnapshotHash: "a".repeat(64),
        },
      },
      {
        ruleId: "hard-1",
        code: "RULE-HARD-UNAVAILABLE",
        teacherId: "teacher-1",
        strength: "HARD_UNAVAILABLE",
        weight: null,
        dayOfWeek: 1,
        blockedSlotIds: ["mon-1"],
        effectiveFrom: "2026-09-01",
        source: {
          sourceUrl: "https://schedule.local/rules/hard-1",
          ruleSnapshotId: "snapshot-1",
          ruleSetVersion: "RULE-SET-1.0.0",
          ruleSnapshotHash: "a".repeat(64),
        },
      },
    ],
  },
});
assert.ok(relaxationResult.diagnostics.relaxationProposals.length > 0);
assert.equal(
  relaxationResult.diagnostics.relaxationProposals.every((item) => item.requiresApproval && !item.autoApply),
  true,
);
assert.equal(
  relaxationResult.diagnostics.relaxationProposals.some((item) => item.hardRuleProtected),
  true,
);

const repairEvidence = JSON.parse(await readFile(resolve(root, "outputs/P3.2-T02/local-repair-report.json"), "utf8"));
assert.equal(repairEvidence.gate?.rehearsalPass ?? true, true);

const report = {
  evidenceVersion: "P3.2-EVIDENCE-1.0.0",
  generatedAt: new Date().toISOString(),
  environment: "local Python + OR-Tools CP-SAT; synthetic fixtures; no pilot/production approval",
  t02LocalRepair: repairEvidence,
  t03ConflictChains: {
    status: "PASS",
    catalogVersion: chainResult.diagnostics.catalogVersion,
    chainContractVersion: chainResult.diagnostics.conflictDetails.find((detail) => detail.conflictChain)?.conflictChain
      .contractVersion,
    cases: Object.fromEntries(
      Object.entries(chainCases).map(([name, result]) => [
        name,
        { status: result.status, codes: result.diagnostics.conflictDetails.map((detail) => detail.code) },
      ]),
    ),
  },
  t04RelaxationProposals: {
    status: relaxationResult.status,
    contractVersion: "RELAXATION-PROPOSAL-1.0.0",
    proposals: relaxationResult.diagnostics.relaxationProposals,
  },
};
await mkdir(resolve(root, "outputs/P3.2-T03-T04"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      output: outputPath,
      t03: report.t03ConflictChains,
      t04ProposalCount: report.t04RelaxationProposals.proposals.length,
    },
    null,
    2,
  ),
);
