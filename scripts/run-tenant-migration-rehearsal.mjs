import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const { Client } = pg;
const root = process.cwd();
const outputPath = resolve(root, "outputs/P4.1-T05/tenant-migration-rehearsal.json");
const adminUrl = process.env.P41_T05_ADMIN_DATABASE_URL ?? "postgresql://scheduler:scheduler@localhost:55432/scheduler";
const rowCountPerSchool = Number(process.env.P41_T05_REHEARSAL_ROWS ?? 20000);
const migrationDirectory = resolve(root, "backend/database/migrations");
const primarySchoolId = "10000000-0000-0000-0000-000000000001";
const secondarySchoolId = "10000000-0000-0000-0000-000000000002";
const databaseName = `scheduler_p41_t05_rehearsal_${process.pid}_${Date.now()}`;

if (!Number.isInteger(rowCountPerSchool) || rowCountPerSchool < 1000) {
  throw new Error("P41_T05_REHEARSAL_ROWS must be an integer >= 1000.");
}

const admin = new Client({ connectionString: adminUrl });
let rehearsal;

async function migrationFiles() {
  return (await readdir(migrationDirectory)).filter((file) => /^\d{3}_[a-z0-9_-]+\.sql$/u.test(file)).sort();
}

async function applyMigrations(client, files) {
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  for (const file of files) {
    const id = file.slice(0, 3);
    await client.query("BEGIN");
    try {
      await client.query(await readFile(resolve(migrationDirectory, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (id, name) VALUES ($1, $2)", [id, file]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}

async function snapshot(client, tenantColumnPresent) {
  const result = await client.query(
    `SELECT count(*)::int AS rows,
            md5(COALESCE(string_agg(id::text || ':' || school_id::text || ':' || action, ',' ORDER BY id), '')) AS checksum,
            ${tenantColumnPresent ? "count(*) FILTER (WHERE tenant_id IS NULL)::int" : "NULL::int"} AS null_tenant_rows,
            pg_total_relation_size('audit_logs')::bigint AS table_bytes
       FROM audit_logs`,
  );
  return {
    rows: Number(result.rows[0].rows),
    checksum: result.rows[0].checksum,
    nullTenantRows: Number(result.rows[0].null_tenant_rows),
    tableBytes: Number(result.rows[0].table_bytes),
  };
}

async function tenantCounts(client) {
  const result = await client.query(
    `SELECT school.id::text AS school_id,
            school.tenant_id::text AS tenant_id,
            count(audit.id)::int AS audit_rows
       FROM schools school
       LEFT JOIN audit_logs audit ON audit.school_id = school.id
      GROUP BY school.id, school.tenant_id
      ORDER BY school.id`,
  );
  return result.rows.map((row) => ({
    schoolId: row.school_id,
    tenantId: row.tenant_id,
    auditRows: Number(row.audit_rows),
  }));
}

try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName.replaceAll('"', '""')}"`);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  rehearsal = new Client({ connectionString: databaseUrl.toString() });
  await rehearsal.connect();

  const files = await migrationFiles();
  await applyMigrations(rehearsal, files.slice(0, 12));
  await rehearsal.query(
    `INSERT INTO schools (id, code, name)
     VALUES ($1, 'REHEARSAL-PRIMARY', 'Tenant migration rehearsal primary'),
            ($2, 'REHEARSAL-SECONDARY', 'Tenant migration rehearsal secondary')`,
    [primarySchoolId, secondarySchoolId],
  );
  await rehearsal.query(
    `INSERT INTO audit_logs (school_id, action, entity_type, entity_id, actor_id, metadata)
     SELECT CASE WHEN item <= $1 THEN $2::uuid ELSE $3::uuid END,
            'IMPORT', 'migration_rehearsal', gen_random_uuid(), 'p4-1-t05-rehearsal', '{}'::jsonb
       FROM generate_series(1, $1 * 2) AS series(item)`,
    [rowCountPerSchool, primarySchoolId, secondarySchoolId],
  );
  const before = await snapshot(rehearsal, false);
  const migrationStartedAt = Date.now();
  await applyMigrations(rehearsal, files.slice(12));
  const migrationFinishedAt = Date.now();
  const after = await snapshot(rehearsal, true);
  const counts = await tenantCounts(rehearsal);
  const expectedRows = rowCountPerSchool * 2;
  const checksumPass = before.checksum === after.checksum;
  const countsPass =
    counts.length === 2 && counts.every((row) => row.auditRows === rowCountPerSchool && Boolean(row.tenantId));
  const migrationSeconds = Number(((migrationFinishedAt - migrationStartedAt) / 1000).toFixed(3));
  await rehearsal.end();
  rehearsal = null;
  await admin.query(`DROP DATABASE "${databaseName.replaceAll('"', '""')}"`);
  const report = {
    task: "P4.1-T05",
    rehearsalVersion: "TENANT-MIGRATION-REHEARSAL-1.0.0",
    generatedAt: new Date().toISOString(),
    isolatedDatabase: databaseName,
    seeded: { schools: 2, auditRowsPerSchool: rowCountPerSchool, totalAuditRows: expectedRows },
    before,
    after,
    tenantCounts: counts,
    migration: {
      appliedMigrations: files.slice(12).map((file) => file.slice(0, 3)),
      durationSeconds: migrationSeconds,
      checksumPass,
      rowCountPass: after.rows === expectedRows,
      nullTenantPass: after.nullTenantRows === 0,
      tenantDistributionPass: countsPass,
    },
    gate: {
      rehearsalPass: checksumPass && after.rows === expectedRows && after.nullTenantRows === 0 && countsPass,
      productionApproved: false,
      limitation: "Local isolated rehearsal; no production lock-budget or online cutover measurement.",
    },
  };
  await mkdir(resolve(root, "outputs/P4.1-T05"), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify({ output: outputPath, rehearsalPass: report.gate.rehearsalPass, migrationSeconds }, null, 2),
  );
  if (!report.gate.rehearsalPass) process.exit(1);
} finally {
  if (rehearsal) await rehearsal.end().catch(() => undefined);
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName.replaceAll('"', '""')}"`).catch(() => undefined);
  await admin.end().catch(() => undefined);
}
