import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outputPath = resolve(root, process.env.SECURITY_REPORT ?? "outputs/P3.3-T02/security-review-report.json");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, cwd = root) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32" && command === npmCommand,
  });
}

const testArgs = [
  resolve(root, "node_modules/jest/bin/jest.js"),
  "--runInBand",
  "--runTestsByPath",
  "src/auth/auth.guard.spec.ts",
  "src/imports/imports.service.spec.ts",
  "src/timetable/public-schedule.service.spec.ts",
  "src/timetable/schedule-export.service.spec.ts",
  "src/common/http/api-exception.filter.spec.ts",
];
const tests = run(process.execPath, testArgs, resolve(root, "backend"));
const runtime = run(process.execPath, [resolve(root, "scripts", "test-p2-5-t04-runtime.mjs")]);
const audit = run(npmCommand, ["audit", "--omit=dev", "--json"]);
let auditPayload = {};
try {
  auditPayload = JSON.parse(audit.stdout || "{}");
} catch {
  auditPayload = { parseError: true, rawOutputAvailable: Boolean(audit.stdout) };
}

const sourcePaths = [
  "docs/security-threat-model.md",
  "backend/src/auth/auth.guard.spec.ts",
  "backend/src/imports/imports.service.spec.ts",
  "backend/src/timetable/public-schedule.service.spec.ts",
  "backend/src/timetable/schedule-export.service.spec.ts",
  "backend/src/common/http/api-exception.filter.spec.ts",
  "scripts/test-p2-5-t04-runtime.mjs",
  "docker-compose.yml",
  ".env.example",
];
const sourceArtifacts = [];
for (const relativePath of sourcePaths) {
  const bytes = await readFile(resolve(root, relativePath));
  sourceArtifacts.push({
    path: relativePath,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

const vulnerabilities = Object.values(auditPayload.vulnerabilities ?? {}).map((item) => ({
  name: item.name,
  severity: item.severity,
  isDirect: item.isDirect,
  via: item.via,
  fixAvailable: item.fixAvailable ?? false,
}));

const report = {
  task: "P3.3-T02",
  reviewVersion: "SECURITY-REVIEW-1.0.0",
  generatedAt: new Date().toISOString(),
  environment: "local Docker/dev; synthetic fixtures; no production approval",
  sourceArtifacts,
  validation: {
    targetedSecurityTests: { status: tests.status === 0 ? "PASS" : "FAIL", exitCode: tests.status },
    runtimeCrossScopeAndFileMatrix: { status: runtime.status === 0 ? "PASS" : "FAIL", exitCode: runtime.status },
    dependencyAudit: {
      status: audit.status === 0 ? "PASS" : "FINDINGS",
      exitCode: audit.status,
      totals: auditPayload.metadata?.vulnerabilities ?? null,
      vulnerabilities,
    },
  },
  findings: [
    {
      id: "THR-001",
      severity: "P0",
      status: "COVERED_LOCAL_OPEN_STAGING",
      owner: "Security/release approver",
      evidence: ["backend/src/auth/auth.guard.spec.ts", "scripts/test-p2-5-t04-runtime.mjs"],
      nextStep: "Repeat with staging identity and verify tenant/school isolation against real data boundary.",
    },
    {
      id: "THR-002",
      severity: "P0",
      status: "COVERED_LOCAL_OPEN_STAGING",
      owner: "Platform/security owner",
      evidence: ["backend/src/imports/imports.service.spec.ts", "backend/solver/examples/import-fixtures/*"],
      nextStep: "Add staging AV/WAF/quota evidence and confirm file retention/deletion behavior.",
    },
    {
      id: "THR-007",
      severity: "P1",
      status: "OPEN",
      owner: "Platform owner",
      evidence: ["npm audit --omit=dev"],
      detail:
        "Current audit reports 2 moderate advisories through exceljs -> uuid; compatible upgrade/override has not been approved.",
      nextStep:
        "Evaluate a compatible ExcelJS/uuid plan, run workbook regression, then close or record named risk acceptance with expiry.",
    },
    {
      id: "THR-008",
      severity: "P1",
      status: "OPEN_DEPLOYMENT_GATE",
      owner: "Release/platform owner",
      evidence: ["docker-compose.yml", ".env.example"],
      nextStep:
        "Use production secret manager/private network/non-default credentials; do not reuse local compose values.",
    },
    {
      id: "THR-009",
      severity: "P1",
      status: "OPEN_DEPLOYMENT_GATE",
      owner: "Observability/release owner",
      evidence: ["backend/src/observability/observability.controller.ts", "docs/observability.md"],
      nextStep: "Protect metrics scrape endpoint and verify collector access/retention/paging in staging.",
    },
  ],
  gates: {
    devTestComplete: tests.status === 0 && runtime.status === 0,
    p0LocalBypassEvidence: false,
    p1FindingsOpen: vulnerabilities.length > 0,
    riskAcceptance: { status: "NOT_GRANTED", approver: null, expiresAt: null },
    pilotApproved: false,
    productionApproved: false,
  },
  limitations: [
    "The dependency audit is current for this lockfile but remediation compatibility is not decided.",
    "Local headers/fixtures/runtime do not prove production identity, WAF/AV, secret manager, retention or paging.",
    "No external security approver or risk acceptance identity is supplied.",
  ],
};

await mkdir(resolve(root, "outputs/P3.3-T02"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(tests.stdout ?? "");
process.stdout.write(runtime.stdout ?? "");
console.log(
  JSON.stringify(
    {
      output: outputPath,
      devTestComplete: report.gates.devTestComplete,
      auditStatus: report.validation.dependencyAudit.status,
      vulnerabilityCount: vulnerabilities.length,
      pilotApproved: report.gates.pilotApproved,
      productionApproved: report.gates.productionApproved,
    },
    null,
    2,
  ),
);
if (tests.status !== 0 || runtime.status !== 0) process.exit(1);
