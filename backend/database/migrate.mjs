import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const migrationDirectory = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for migrations.");

const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  await client.query("SELECT pg_advisory_lock(hashtext('school-timetable:migrations'))");

  const files = (await readdir(migrationDirectory)).filter((file) => /^\d{3}_[a-z0-9_-]+\.sql$/.test(file)).sort();
  const applied = new Set(
    (await client.query("SELECT id FROM schema_migrations ORDER BY id")).rows.map((row) => row.id),
  );

  if (applied.size === 0) {
    const existing = await client.query(
      "SELECT to_regclass('public.optimization_runs') AS runs, to_regclass('public.schedule_public_links') AS public_links",
    );
    const isExistingManagedDatabase = Boolean(existing.rows[0]?.runs && existing.rows[0]?.public_links);
    if (isExistingManagedDatabase) {
      for (const file of files) {
        await client.query("INSERT INTO schema_migrations (id, name) VALUES ($1, $2)", [file.slice(0, 3), file]);
      }
      console.log(`[migrate] baselined ${files.length} existing migrations; no SQL replay was required`);
    }
  }

  const current = new Set(
    (await client.query("SELECT id FROM schema_migrations ORDER BY id")).rows.map((row) => row.id),
  );
  for (const file of files) {
    const id = file.slice(0, 3);
    if (current.has(id)) continue;
    const sql = await readFile(join(migrationDirectory, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id, name) VALUES ($1, $2)", [id, file]);
      await client.query("COMMIT");
      console.log(`[migrate] applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  console.log(`[migrate] complete (${files.length} migrations)`);
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('school-timetable:migrations'))").catch(() => undefined);
  await client.end();
}
