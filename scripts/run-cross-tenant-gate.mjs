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
const psqlArgs = [
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
  "-v",
  "ON_ERROR_STOP=1",
  "-c",
];
const tenantColumnCheck = run("docker", [
  ...psqlArgs,
  "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'tenant_id'",
]);
const tenantColumnCount = Number(tenantColumnCheck.output || 0);
const rlsTableCheck = run("docker", [...psqlArgs, "SELECT count(*) FROM pg_class WHERE relrowsecurity"]);
const rlsTableCount = Number(rlsTableCheck.output || 0);
const tenantIdQuery = run("docker", [...psqlArgs, "SELECT id::text FROM tenants ORDER BY id"]);
const tenantIds = tenantIdQuery.output?.split(/\r?\n/).filter(Boolean) ?? [];
const scopedTables = [
  "schools",
  "academic_periods",
  "classes",
  "teachers",
  "subjects",
  "rooms",
  "time_slots",
  "lesson_requirements",
  "optimization_runs",
  "optimization_assignments",
  "import_batches",
  "import_rows",
  "audit_logs",
  "rule_profiles",
  "rule_definitions",
  "rule_set_snapshots",
  "schedule_versions",
  "schedule_assignments",
  "schedule_version_transitions",
  "schedule_public_links",
  "tenant_memberships",
];
let rlsPolicyTest = { executed: false, ownRows: null, crossTenantRows: null, pass: false };
if (tenantIds.length >= 2 && rlsTableCount >= scopedTables.length) {
  const setup = `DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tenant_gate_test') THEN CREATE ROLE tenant_gate_test NOLOGIN; END IF; END $do$; GRANT SELECT ON ${scopedTables.join(", ")} TO tenant_gate_test;`;
  run("docker", [...psqlArgs, setup]);
  const ownQuery = run("docker", [
    ...psqlArgs,
    `BEGIN; SET LOCAL ROLE tenant_gate_test; SET LOCAL app.tenant_id = '${tenantIds[0]}'; SELECT count(*) FROM schools; COMMIT;`,
  ]);
  const crossQuery = run("docker", [
    ...psqlArgs,
    `BEGIN; SET LOCAL ROLE tenant_gate_test; SET LOCAL app.tenant_id = '${tenantIds[0]}'; SELECT count(*) FROM schools WHERE tenant_id = '${tenantIds[1]}'; COMMIT;`,
  ]);
  const ownRows = Number(ownQuery.output?.split(/\r?\n/).find((line) => /^\d+$/.test(line)) ?? NaN);
  const crossTenantRows = Number(crossQuery.output?.split(/\r?\n/).find((line) => /^\d+$/.test(line)) ?? NaN);
  rlsPolicyTest = {
    executed: true,
    ownRows: Number.isFinite(ownRows) ? ownRows : null,
    crossTenantRows: Number.isFinite(crossTenantRows) ? crossTenantRows : null,
    pass: ownRows > 0 && crossTenantRows === 0,
  };
  run("docker", [...psqlArgs, "DROP OWNED BY tenant_gate_test; DROP ROLE IF EXISTS tenant_gate_test"]);
}
const report = {
  task: "P4.1-T05",
  gateVersion: "CROSS-TENANT-MIGRATION-GATE-1.0.0",
  generatedAt: new Date().toISOString(),
  policyTests: { status: tenantTests.status === 0 ? "PASS" : "FAIL", exitCode: tenantTests.status, suites: 4 },
  database: { tenantColumnCount, migrationApplied: tenantColumnCount > 0, rlsTableCount, rlsPolicyTest },
  areas: {
    identityPayload: "PASS",
    queueNamespace: "PASS_POLICY_ONLY",
    apiRepositoryIsolation: rlsPolicyTest.pass ? "RLS_POLICY_PASS_APP_CONTEXT_OPEN" : "BLOCKED_RLS_POLICY_TEST",
    importExportIsolation: "BLOCKED_APP_REPOSITORY_SCOPE",
    publicLinkIsolation: "BLOCKED_APP_REPOSITORY_SCOPE",
    largeMigrationRehearsal: "BLOCKED_LARGE_TABLE_REHEARSAL",
  },
  decision: rlsPolicyTest.pass ? "REQUIRES_APPLICATION_TENANT_CONTEXT" : "BLOCKED_RLS_POLICY_TEST",
  gates: {
    devPolicyTestsComplete: tenantTests.status === 0,
    migrationApplied: tenantColumnCount > 0,
    rlsPolicyIsolationProven: rlsPolicyTest.pass,
    applicationTenantContextConfigured: false,
    crossTenantLeakageProven: false,
    migrationApproved: false,
    pilotApproved: false,
    productionApproved: false,
  },
  nextSteps: [
    "set app.tenant_id from trusted request context for non-owner application role",
    "tenant-aware repository/import/export/public-link queries",
    "isolated two-tenant negative matrix",
    "large-table checksum/throughput/RTO rehearsal",
    "security/architecture/release approval",
  ],
};
await mkdir(resolve(root, "outputs/P4.1-T05"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(tenantTests.stdout ?? "");
process.stderr.write(tenantTests.stderr ?? "");
console.log(
  JSON.stringify(
    { output: outputPath, decision: report.decision, database: report.database, gates: report.gates },
    null,
    2,
  ),
);
if (tenantTests.status !== 0) process.exit(tenantTests.status ?? 1);
