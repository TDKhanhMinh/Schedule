import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(root, "outputs", "P2.5-T06");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const args = process.argv.slice(2);
const outputArgumentIndex = args.indexOf("--output");
const outputPath = resolve(
  root,
  outputArgumentIndex >= 0 && args[outputArgumentIndex + 1]
    ? args[outputArgumentIndex + 1]
    : resolve(outputDirectory, `scheduler-${timestamp}.dump`),
);
const compose = process.platform === "win32" ? "docker.exe" : "docker";
const databaseUser = process.env.POSTGRES_USER ?? "scheduler";
const databaseName = process.env.POSTGRES_DB ?? "scheduler";

function runDocker(composeArguments, options = {}) {
  const result = spawnSync(compose, ["compose", ...composeArguments], {
    cwd: root,
    encoding: options.encoding ?? "utf8",
    input: options.input,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : (result.stderr ?? "");
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString("utf8") : (result.stdout ?? "");
    throw new Error(`docker compose ${composeArguments.join(" ")} failed (${result.status}): ${stderr || stdout}`);
  }
  return result.stdout;
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function query(database, sql) {
  return runDocker([
    "exec",
    "-T",
    "postgres",
    "psql",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    databaseUser,
    "-d",
    database,
    "-At",
    "-c",
    sql,
  ])
    .toString("utf8")
    .trim();
}

if (!existsSync(resolve(root, "docker-compose.yml"))) {
  throw new Error("docker-compose.yml was not found at the repository root.");
}

mkdirSync(resolve(outputPath, ".."), { recursive: true });
const dump = runDocker(
  ["exec", "-T", "postgres", "pg_dump", "-U", databaseUser, "-d", databaseName, "-Fc", "--no-owner", "--no-privileges"],
  { encoding: "buffer" },
);
if (!Buffer.isBuffer(dump) || dump.length === 0) throw new Error("pg_dump returned an empty backup.");
writeFileSync(outputPath, dump);

const checksum = createHash("sha256").update(dump).digest("hex");
runDocker(["exec", "-T", "postgres", "pg_restore", "--list"], { input: dump, encoding: "buffer" });

const restoreDatabase = `scheduler_restore_rehearsal_${process.pid}_${Date.now()}`;
let restoreSucceeded = false;
try {
  query(databaseName, `CREATE DATABASE ${quoteIdentifier(restoreDatabase)}`);
  runDocker(
    [
      "exec",
      "-T",
      "postgres",
      "pg_restore",
      "-U",
      databaseUser,
      "-d",
      restoreDatabase,
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
    ],
    { input: dump, encoding: "buffer" },
  );
  const migrationCount = Number(query(restoreDatabase, "SELECT count(*) FROM schema_migrations"));
  if (!Number.isInteger(migrationCount) || migrationCount < 1) {
    throw new Error(`restored database has invalid schema_migrations count: ${migrationCount}`);
  }
  restoreSucceeded = true;
  const report = {
    task: "P2.5-T06",
    generatedAt: new Date().toISOString(),
    sourceDatabase: databaseName,
    backupFile: outputPath.replace(`${root}${process.platform === "win32" ? "\\" : "/"}`, "").replaceAll("\\", "/"),
    backupBytes: dump.length,
    sha256: checksum,
    restoreDatabase,
    restoreMigrationCount: migrationCount,
    restoreSucceeded,
    scope: "local Docker rehearsal; not production approval",
  };
  const reportPath = resolve(outputPath, "..", "restore-rehearsal-report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
} finally {
  query(databaseName, `DROP DATABASE IF EXISTS ${quoteIdentifier(restoreDatabase)}`);
}
