import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const root = process.cwd();
const outputPath = resolve(root, "outputs/P4.1-T05/cross-tenant-gate-report.json");

function run(command, args, cwd = root) {
  try {
    return { ok: true, output: execFileSync(command, args, { cwd, encoding: "utf8" }).trim() };
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : String(error) };
  }
}

const tenantTests = spawnSync(
  process.execPath,
  [
    resolve(root, "node_modules/jest/bin/jest.js"),
    "--runInBand",
    "--runTestsByPath",
    "src/auth/tenant-scope.spec.ts",
    "src/auth/auth.guard.spec.ts",
    "src/jobs/optimization-queue.service.spec.ts",
    "src/integrations/integration-contract.spec.ts",
  ],
  { cwd: resolve(root, "backend"), encoding: "utf8" },
);
const tenantColumnCheck = run("docker", [
  "compose",
  "exec",
  "-T",
  "postgres",
  "psql",
  "-U",
  "scheduler",
  "-d",
  "scheduler",
  "-At",
  "-c",
  "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenant_id'",
]);
const tenantColumnCount = Number(tenantColumnCheck.output || 0);
const report = {
  task: "P4.1-T05",
  gateVersion: "CROSS-TENANT-MIGRATION-GATE-1.0.0",
  generatedAt: new Date().toISOString(),
  policyTests: { status: tenantTests.status === 0 ? "PASS" : "FAIL", exitCode: tenantTests.status, suites: 4 },
  database: { tenantColumnCount, migrationApplied: tenantColumnCount > 0, rlsMigrationApplied: false },
  areas: {
    identityPayload: "PASS",
    queueNamespace: "PASS_POLICY_ONLY",
    apiRepositoryIsolation: tenantColumnCount > 0 ? "NOT_RUN" : "BLOCKED_MIGRATION_NOT_APPLIED",
    importExportIsolation: tenantColumnCount > 0 ? "NOT_RUN" : "BLOCKED_MIGRATION_NOT_APPLIED",
    publicLinkIsolation: tenantColumnCount > 0 ? "NOT_RUN" : "BLOCKED_MIGRATION_NOT_APPLIED",
    largeMigrationRehearsal: "BLOCKED_MIGRATION_NOT_APPLIED",
  },
  decision: tenantColumnCount > 0 ? "REQUIRES_FULL_ISOLATION_RETEST" : "BLOCKED_MIGRATION_NOT_APPLIED",
  gates: {
    devPolicyTestsComplete: tenantTests.status === 0,
    crossTenantLeakageProven: false,
    migrationApproved: false,
    pilotApproved: false,
    productionApproved: false,
  },
  nextSteps: [
    "P4.1 migration/repository scope",
    "isolated two-tenant negative matrix",
    "large-table checksum/throughput/RTO rehearsal",
    "security/architecture/release approval",
  ],
};
await mkdir(resolve(root, "outputs/P4.1-T05"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(tenantTests.stdout ?? "");
process.stderr.write(tenantTests.stderr ?? "");
console.log(JSON.stringify({ output: outputPath, decision: report.decision, gates: report.gates }, null, 2));
if (tenantTests.status !== 0) process.exit(tenantTests.status ?? 1);
