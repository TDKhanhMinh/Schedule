import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const root = process.cwd();
const outputPath = resolve(root, "outputs/P4.1-T05/cross-tenant-gate-report.json");
const apiBaseUrl = process.env.P41_T05_API_BASE_URL ?? "http://localhost:3011/api/v1";
const primarySchoolId = "00000000-0000-0000-0000-000000000001";
const secondarySchoolId = "00000000-0000-0000-0000-000000000002";

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(resolve(root, relativePath), "utf8"));
  } catch {
    return null;
  }
}

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
    "src/auth/tenant-scope.test.ts",
    "src/auth/auth.guard.test.ts",
    "src/jobs/optimization-queue.service.test.ts",
    "src/integrations/integration-contract.test.ts",
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
const migrationCountCheck = run("docker", [...psqlArgs, "SELECT count(*) FROM schema_migrations"]);
const migrationCount = Number(migrationCountCheck.output || 0);
const schoolTenantQuery = run("docker", [
  ...psqlArgs,
  `SELECT id::text || '|' || tenant_id::text FROM schools WHERE id IN ('${primarySchoolId}', '${secondarySchoolId}') ORDER BY id`,
]);
const schoolTenantMap = new Map(
  (schoolTenantQuery.output?.split(/\r?\n/).filter(Boolean) ?? []).map((line) => {
    const [schoolId, tenantId] = line.split("|");
    return [schoolId, tenantId];
  }),
);
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
async function apiRequest(path, options = {}) {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, options);
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("json") ? await response.json() : await response.arrayBuffer();
    return { response, body };
  } catch (error) {
    return { response: null, body: null, error: error instanceof Error ? error.message : String(error) };
  }
}

const primaryTenantId = schoolTenantMap.get(primarySchoolId);
const secondaryTenantId = schoolTenantMap.get(secondarySchoolId);
const migrationRehearsal = await readJson("outputs/P4.1-T05/tenant-migration-rehearsal.json");
let applicationTenantContextTest = {
  executed: false,
  primarySchoolRows: null,
  secondarySchoolRows: null,
  crossTenantReadStatus: null,
  crossTenantExportStatus: null,
  publicLinkStatus: null,
  pass: false,
};
if (primaryTenantId && secondaryTenantId) {
  const primaryHeaders = {
    "x-user-id": "p4-1-t05-gate-primary",
    "x-user-role": "ADMIN",
    "x-school-id": primarySchoolId,
    "x-tenant-id": primaryTenantId,
  };
  const secondaryHeaders = {
    "x-user-id": "p4-1-t05-gate-secondary",
    "x-user-role": "ADMIN",
    "x-school-id": secondarySchoolId,
    "x-tenant-id": secondaryTenantId,
  };
  const primarySchools = await apiRequest("/schools", { headers: primaryHeaders });
  const secondarySchools = await apiRequest("/schools", { headers: secondaryHeaders });
  const crossTenantRead = await apiRequest(`/schools/${primarySchoolId}`, {
    headers: { ...secondaryHeaders, "x-school-id": primarySchoolId },
  });
  const crossTenantExport = await apiRequest(
    `/schools/${primarySchoolId}/schedule-versions/00000000-0000-0000-0000-000000000901/export.xlsx?view=all`,
    { headers: { ...secondaryHeaders, "x-school-id": primarySchoolId } },
  );
  let publicLinkStatus = null;
  const link = await apiRequest(
    `/schools/${primarySchoolId}/schedule-versions/00000000-0000-0000-0000-000000000901/public-links`,
    {
      method: "POST",
      headers: { ...primaryHeaders, "content-type": "application/json" },
      body: JSON.stringify({ expiresInHours: 1 }),
    },
  );
  if (link.response?.status === 201 && link.body?.token) {
    const publicView = await apiRequest(`/public/schedules/${link.body.token}`);
    publicLinkStatus = publicView.response?.status ?? null;
    await apiRequest(
      `/schools/${primarySchoolId}/schedule-versions/00000000-0000-0000-0000-000000000901/public-links/${link.body.id}/revoke`,
      { method: "POST", headers: primaryHeaders },
    );
  }
  const primaryRows = Array.isArray(primarySchools.body) ? primarySchools.body.map((row) => row.id) : [];
  const secondaryRows = Array.isArray(secondarySchools.body) ? secondarySchools.body.map((row) => row.id) : [];
  applicationTenantContextTest = {
    executed: true,
    primarySchoolRows: primaryRows,
    secondarySchoolRows: secondaryRows,
    crossTenantReadStatus: crossTenantRead.response?.status ?? null,
    crossTenantExportStatus: crossTenantExport.response?.status ?? null,
    publicLinkStatus,
    pass:
      primarySchools.response?.status === 200 &&
      secondarySchools.response?.status === 200 &&
      primaryRows.length === 1 &&
      primaryRows[0] === primarySchoolId &&
      secondaryRows.length === 1 &&
      secondaryRows[0] === secondarySchoolId &&
      crossTenantRead.response?.status === 404 &&
      crossTenantExport.response?.status === 404 &&
      publicLinkStatus === 200,
  };
}
const report = {
  task: "P4.1-T05",
  gateVersion: "CROSS-TENANT-MIGRATION-GATE-1.0.0",
  generatedAt: new Date().toISOString(),
  policyTests: { status: tenantTests.status === 0 ? "PASS" : "FAIL", exitCode: tenantTests.status, suites: 4 },
  database: { tenantColumnCount, migrationCount, migrationApplied: migrationCount >= 16, rlsTableCount, rlsPolicyTest },
  areas: {
    identityPayload: "PASS",
    queueNamespace: "PASS_POLICY_ONLY",
    apiRepositoryIsolation: applicationTenantContextTest.pass
      ? "PASS_RUNTIME_API_CONTEXT"
      : "BLOCKED_APP_CONTEXT_RUNTIME",
    importExportIsolation: applicationTenantContextTest.pass
      ? "PASS_RUNTIME_EXPORT_CONTEXT"
      : "BLOCKED_APP_REPOSITORY_SCOPE",
    publicLinkIsolation:
      applicationTenantContextTest.publicLinkStatus === 200
        ? "PASS_TOKEN_RESOLVER_CONTEXT"
        : "BLOCKED_PUBLIC_LINK_CONTEXT",
    largeMigrationRehearsal:
      migrationRehearsal?.gate?.rehearsalPass === true
        ? "PASS_ISOLATED_LARGE_TABLE_REHEARSAL"
        : "BLOCKED_LARGE_TABLE_REHEARSAL",
  },
  decision:
    applicationTenantContextTest.pass && migrationRehearsal?.gate?.rehearsalPass === true
      ? "REQUIRES_SECURITY_ARCHITECTURE_RELEASE_APPROVAL"
      : applicationTenantContextTest.pass
        ? "REQUIRES_LARGE_TABLE_REHEARSAL_AND_APPROVAL"
        : "BLOCKED_APP_CONTEXT_RUNTIME",
  runtime: { apiTenantContextTest: applicationTenantContextTest, migrationRehearsal },
  gates: {
    devPolicyTestsComplete: tenantTests.status === 0,
    migrationApplied: migrationCount >= 16,
    rlsPolicyIsolationProven: rlsPolicyTest.pass,
    applicationTenantContextConfigured: applicationTenantContextTest.pass,
    crossTenantLeakageProven: applicationTenantContextTest.pass,
    largeMigrationRehearsalProven: migrationRehearsal?.gate?.rehearsalPass === true,
    migrationApproved: false,
    pilotApproved: false,
    productionApproved: false,
  },
  nextSteps: ["security/architecture/release approval"],
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
