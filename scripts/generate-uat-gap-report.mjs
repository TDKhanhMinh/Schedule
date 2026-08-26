import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

const root = process.cwd();
const outputPath = resolve(root, process.env.UAT_REPORT ?? "outputs/P3.1-T05/uat-gap-report.json");

async function readArtifact(relativePath, parseJson = false) {
  const absolutePath = resolve(root, relativePath);
  const bytes = await readFile(absolutePath);
  const result = {
    path: relativePath,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  if (parseJson) {
    result.data = JSON.parse(bytes.toString("utf8"));
  }
  return result;
}

const t01 = await readArtifact("outputs/P3.1-T01/pilot-import-evidence.json", true);
const t02 = await readArtifact("outputs/P3.1-T02/pilot-reconciliation-report.json", true);
const t03 = await readArtifact("outputs/P3.1-T03/baseline-comparison-report.json", true);
const t04 = await readArtifact("outputs/P3.1-T04/weight-sensitivity-report.json", true);
const matrix = await readArtifact("docs/test-matrix-p2-5-t04.md");
const runtimeScript = await readArtifact("scripts/test-p2-5-t04-runtime.mjs");
const uatScript = await readArtifact("docs/uat-pilot-script.md");

const reconciliation = t02.data;
const openReconciliationBlockers = (reconciliation.exceptions ?? []).filter((item) => item.status === "OPEN");
const importEvidence = t01.data.serverEvidence ?? {};
const baseline = t03.data.comparison ?? {};
const weightGate = t04.data.pilotGate ?? {};

const cases = [
  {
    id: "TC-IMP-01",
    name: "Upload file Excel chuẩn và preview",
    devTest: "PASS",
    pilotUat: "BLOCKED",
    evidence: [t01.path],
    observed: {
      previewHttpStatus: importEvidence.preview?.httpStatus,
      rowCount: importEvidence.preview?.rowCount,
      validRowCount: importEvidence.preview?.validRowCount,
      errorCount: importEvidence.preview?.errorCount,
      warningCount: importEvidence.preview?.warningCount,
      fileChecksum: importEvidence.preview?.fileChecksum,
    },
    reason:
      "Local Docker/dev evidence is valid, but the artifact is a workspace template/fixture rather than school-issued workbook evidence.",
  },
  {
    id: "TC-IMP-02",
    name: "Chặn PDF/DOCX",
    devTest: "PASS",
    pilotUat: "BLOCKED",
    evidence: [
      "backend/solver/examples/import-fixtures/invalid.pdf",
      "backend/solver/examples/import-fixtures/invalid.docx",
      "backend/src/imports/imports.service.spec.ts",
    ],
    reason: "Covered by import validation tests; staging/UAT execution is not evidenced.",
  },
  {
    id: "TC-IMP-03",
    name: "Chặn workbook thiếu cột bắt buộc",
    devTest: "PASS",
    pilotUat: "BLOCKED",
    evidence: [
      "backend/solver/examples/import-fixtures/missing-required-column.xlsx",
      "backend/src/imports/imports.service.spec.ts",
    ],
    reason: "Covered by import validation tests; official pilot workbook is not attached.",
  },
  {
    id: "TC-VAL-01",
    name: "Cảnh báo dữ liệu bắt buộc bị trống",
    devTest: "PASS",
    pilotUat: "BLOCKED",
    evidence: [
      "backend/solver/examples/import-fixtures/missing-value.xlsx",
      "backend/src/imports/imports.service.spec.ts",
    ],
    reason: "Covered by import validation tests; no named QC/UAT operator record is attached.",
  },
  {
    id: "TC-VAL-02",
    name: "Cảnh báo sai kiểu dữ liệu",
    devTest: "PASS",
    pilotUat: "BLOCKED",
    evidence: [
      "backend/solver/examples/import-fixtures/wrong-number.xlsx",
      "backend/src/imports/imports.service.spec.ts",
    ],
    reason: "Covered by import validation tests; no school UAT environment evidence is attached.",
  },
  {
    id: "TC-VAL-03",
    name: "Cảnh báo master data không tồn tại",
    devTest: "PASS",
    pilotUat: "BLOCKED",
    evidence: [
      "backend/solver/examples/import-fixtures/unknown-master-data.xlsx",
      "backend/src/imports/imports.service.spec.ts",
    ],
    reason: "Covered by import validation tests; master-data ownership and approval remain open.",
  },
  {
    id: "TC-CFM-01",
    name: "Confirm import thành công",
    devTest: "PASS",
    pilotUat: "BLOCKED",
    evidence: [t01.path],
    observed: {
      confirmHttpStatus: importEvidence.confirm?.httpStatus,
      status: importEvidence.confirm?.status,
      rowCount: importEvidence.confirm?.result?.rowCount,
    },
    reason:
      "Local confirm is auditable; pilot batch must be re-run only after official workbook and academic period are approved.",
  },
  {
    id: "TC-CFM-02",
    name: "Audit log sau import",
    devTest: "PASS",
    pilotUat: "BLOCKED",
    evidence: [t01.path],
    observed: {
      action: importEvidence.audit?.entries?.auditLog?.action,
      actorId: importEvidence.audit?.entries?.auditLog?.actorId,
      batchId: importEvidence.audit?.entries?.importBatchId,
    },
    reason: "Audit evidence exists for the local fixture batch; official pilot actor/owner is not evidenced.",
  },
  {
    id: "TC-E2E-01",
    name: "Solve và hard-diagnostic",
    devTest: "PASS",
    pilotUat: "BLOCKED",
    evidence: [t02.path, t03.path, t04.path, matrix.path, runtimeScript.path],
    observed: {
      recentOptimizationRun: reconciliation.schedule?.recentOptimizationRuns?.[0]?.status ?? null,
      baselineComparison: baseline,
      solveAllowedForReconciledSnapshot: reconciliation.gate?.solveAllowed,
    },
    reason:
      "Synthetic solver regression passes, but the current pilot snapshot has open reconciliation blockers and solveAllowed=false.",
  },
  {
    id: "TC-E2E-02",
    name: "Review/Edit/Approve/Lock/Publish",
    devTest: "PASS_WITH_LIMITATION",
    pilotUat: "BLOCKED",
    evidence: [matrix.path, "backend/src/timetable/schedule-version.service.spec.ts", "frontend/src/App.tsx"],
    reason:
      "Lifecycle controls and contracts are covered by repository evidence and project-owner review; authenticated school UAT trace is not attached and the current published fixture has zero assignments.",
  },
  {
    id: "TC-E2E-03",
    name: "Published viewer và export",
    devTest: "PASS",
    pilotUat: "BLOCKED",
    evidence: [
      matrix.path,
      "backend/src/timetable/schedule-export.service.spec.ts",
      "backend/src/timetable/public-schedule.service.spec.ts",
    ],
    reason:
      "Synthetic published read/export boundary is covered; pilot publication and stakeholder acceptance remain open.",
  },
];

const gaps = [
  {
    id: "GAP-P0-001",
    category: "RELEASE_GATE",
    severity: "P0",
    status: "OPEN",
    finding: "Official school workbook owner/source and checksum are not evidenced.",
    owner: "School data steward",
    evidence: [t01.path],
    nextStep: "Attach the school-issued workbook, owner, version and checksum; re-run the intake evidence script.",
  },
  {
    id: "GAP-P0-002",
    category: "RELEASE_GATE",
    severity: "P0",
    status: "OPEN",
    finding: "Reconciliation has open blockers and solveAllowed=false.",
    owner: "Pilot data steward / Product-API owner",
    evidence: [t02.path],
    nextStep:
      "Quarantine repeated dev imports, bind one approved academic period and refresh the read-only reconciliation report.",
  },
  {
    id: "GAP-P0-003",
    category: "RELEASE_GATE",
    severity: "P0",
    status: "OPEN",
    finding: "Rule profile is DRAFT/PENDING_STAKEHOLDER with zero rule definitions and no approved snapshot.",
    owner: "School coordinator / rule approver",
    evidence: [t02.path, t04.path],
    nextStep: "Attach rule source, define hard/soft rules and approve an effective version before solving.",
  },
  {
    id: "GAP-P0-004",
    category: "RELEASE_GATE",
    severity: "P0",
    status: "OPEN",
    finding: "Published fixture assignment coverage is 0 while imported demand is 4 required sessions.",
    owner: "Solver/pilot coordinator",
    evidence: [t02.path],
    nextStep: "Solve the approved reconciled snapshot and verify assignment coverage before review or sign-off.",
  },
  {
    id: "GAP-P1-001",
    category: "DECISION_EVIDENCE",
    severity: "P1",
    status: "OPEN",
    finding: "No manual/third-party schedule baseline is supplied for a superiority comparison.",
    owner: "Product owner / school coordinator",
    evidence: [t03.path],
    nextStep: "Attach a versioned comparable baseline or record an explicit non-comparison decision.",
  },
  {
    id: "GAP-P1-002",
    category: "RELEASE_GATE",
    severity: "P1",
    status: "OPEN",
    finding: "Staging authenticated UAT, security and restore evidence are not the same as local Docker evidence.",
    owner: "Release approver",
    evidence: [matrix.path],
    nextStep: "Run the UAT script in the target environment and link browser/session, security and restore evidence.",
  },
  {
    id: "GAP-P1-003",
    category: "SIGNOFF",
    severity: "P1",
    status: "OPEN",
    finding: "No named school approver/stakeholder sign-off or time-bounded waiver is attached.",
    owner: "Project owner / release approver",
    evidence: [uatScript.path],
    nextStep:
      "Record approver, decision, scope, conditions and waiver expiry; do not infer approval from implementation review.",
  },
];

const report = {
  task: "P3.1-T05",
  reportVersion: "1.0",
  generatedAt: new Date().toISOString(),
  scriptVersion: "P3.1-T05-UAT-1.0",
  environment: "local Docker/dev; synthetic or workspace fixture data; no staging or production approval",
  participants: [
    {
      role: "Project owner / product reviewer",
      identity: "User-confirmed in task thread; personal name not supplied",
      result: "IMPLEMENTATION_REVIEW_CONFIRMED",
      scope: "Review of implementation evidence and UAT preparation",
    },
    {
      role: "School data steward / rule approver / release stakeholder",
      identity: null,
      result: "NOT_EVIDENCED",
      scope: "Required for pilot and production sign-off",
    },
  ],
  sourceArtifacts: [t01, t02, t03, t04, matrix, runtimeScript, uatScript].map(({ data, ...artifact }) => artifact),
  cases,
  gaps,
  signoff: {
    implementationReview: "CONFIRMED_BY_PROJECT_OWNER",
    devTestComplete: true,
    pilotUatComplete: false,
    pilotApproved: false,
    productionApproved: false,
    waiver: {
      status: "NOT_GRANTED",
      approver: null,
      expiresAt: null,
    },
    explanation:
      "Project-owner confirmation closes implementation review only; it does not provide school stakeholder or production approval.",
  },
  gate: {
    devTestComplete: true,
    openP0ReleaseGates: gaps.filter((gap) => gap.severity === "P0" && gap.status === "OPEN").map((gap) => gap.id),
    openP1Gates: gaps.filter((gap) => gap.severity === "P1" && gap.status === "OPEN").map((gap) => gap.id),
    noOpenProductDefectEstablishedByLocalEvidence: true,
    pilotApproved: false,
    productionApproved: false,
    nextStep:
      "Resolve GAP-P0-001..004, complete named UAT sign-off and attach any time-bounded waiver before pilot approval.",
  },
  limitations: [
    "The current database includes historical/dev runtime data and is not a school-approved baseline.",
    "The workbook evidence is a workspace template/fixture, not an official school-issued workbook.",
    "The current reconciliation report records 4 open blockers; do not use it as a production schedule.",
    "No named external participant, approver, staging session or production deployment evidence is attached.",
    `Candidate weight profiles remain stakeholder-review only (pilotWeightsApproved=${weightGate.pilotWeightsApproved ?? false}).`,
  ],
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      output: outputPath,
      devTestComplete: report.signoff.devTestComplete,
      pilotApproved: report.signoff.pilotApproved,
      productionApproved: report.signoff.productionApproved,
      openGaps: report.gaps.length,
      openReconciliationBlockers: openReconciliationBlockers.length,
    },
    null,
    2,
  ),
);
