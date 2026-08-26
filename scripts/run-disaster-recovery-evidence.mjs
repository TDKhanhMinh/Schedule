import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const reportPath = resolve(root, "outputs/P3.3-T04/disaster-recovery-report.json");
const dumpPath = resolve(root, "outputs/P2.5-T06/p3.3-t04-dr-rehearsal.dump");
const compose = process.platform === "win32" ? "docker.exe" : "docker";
const databaseUser = process.env.POSTGRES_USER ?? "scheduler";
const databaseName = process.env.POSTGRES_DB ?? "scheduler";
const startedAt = Date.now();

function runDocker(args, options = {}) {
  const result = spawnSync(compose, ["compose", ...args], {
    cwd: root,
    encoding: options.encoding ?? "utf8",
    input: options.input,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : (result.stderr ?? "");
    const stdout = Buffer.isBuffer(result.stdout) ? result.stdout.toString("utf8") : (result.stdout ?? "");
    throw new Error(`docker compose ${args.join(" ")} failed (${result.status}): ${stderr || stdout}`);
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

function serviceStatus() {
  const services = runDocker(["ps", "--status", "running", "--services"])
    .toString("utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  return {
    running: services,
    requiredRunning: ["api", "worker", "postgres", "redis"].every((service) => services.includes(service)),
  };
}

function isGitTracked(relativePath) {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", relativePath], { cwd: root, encoding: "utf8" });
  return result.status === 0;
}

function countSnapshot(database) {
  const sql = `SELECT json_build_object(
    'schemaMigrations', (SELECT count(*) FROM schema_migrations),
    'publishedVersions', (SELECT count(*) FROM schedule_versions WHERE status = 'PUBLISHED'),
    'scheduleTransitions', (SELECT count(*) FROM schedule_version_transitions),
    'importBatches', (SELECT count(*) FROM import_batches),
    'auditLogs', (SELECT count(*) FROM audit_logs)
  )::text`;
  return JSON.parse(query(database, sql));
}

if (!existsSync(resolve(root, "docker-compose.yml"))) throw new Error("docker-compose.yml was not found.");
mkdirSync(resolve(dumpPath, ".."), { recursive: true });

let report;
const restoreDatabase = `scheduler_dr_rehearsal_${process.pid}_${Date.now()}`;
try {
  const backupStartedAt = Date.now();
  const dump = runDocker(
    [
      "exec",
      "-T",
      "postgres",
      "pg_dump",
      "-U",
      databaseUser,
      "-d",
      databaseName,
      "-Fc",
      "--no-owner",
      "--no-privileges",
    ],
    { encoding: "buffer" },
  );
  if (!Buffer.isBuffer(dump) || dump.length === 0) throw new Error("pg_dump returned an empty backup.");
  writeFileSync(dumpPath, dump);
  const backupFinishedAt = Date.now();
  const checksum = createHash("sha256").update(dump).digest("hex");
  runDocker(["exec", "-T", "postgres", "pg_restore", "--list"], { input: dump, encoding: "buffer" });
  const sourceCounts = countSnapshot(databaseName);

  const restoreStartedAt = Date.now();
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
  const restoreCounts = countSnapshot(restoreDatabase);
  const restoreFinishedAt = Date.now();
  const consistencyPass = JSON.stringify(sourceCounts) === JSON.stringify(restoreCounts);
  const services = serviceStatus();
  const readiness = await fetch("http://localhost:3011/api/v1/health/ready").then(async (response) => ({
    status: response.status,
    ok: response.ok,
    body: await response.text(),
  }));
  const relativeDumpPath = dumpPath
    .replace(`${root}${process.platform === "win32" ? "\\" : "/"}`, "")
    .replaceAll("\\", "/");
  const gitTracked = isGitTracked(relativeDumpPath);
  const rtoSeconds = Number(((restoreFinishedAt - restoreStartedAt) / 1000).toFixed(3));
  const rpoSeconds = Number(((Date.now() - backupFinishedAt) / 1000).toFixed(3));
  report = {
    task: "P3.3-T04",
    rehearsalVersion: "DR-REHEARSAL-1.0.0",
    generatedAt: new Date().toISOString(),
    sourceDatabase: databaseName,
    backup: {
      path: relativeDumpPath,
      bytes: dump.length,
      sha256: checksum,
      catalogVerified: true,
      gitTracked,
      durationSeconds: Number(((backupFinishedAt - backupStartedAt) / 1000).toFixed(3)),
    },
    restore: {
      targetDatabase: restoreDatabase,
      succeeded: true,
      sourceCounts,
      restoredCounts: restoreCounts,
      consistencyPass,
      rtoSeconds,
      rpoSeconds,
      targets: { rtoSeconds: 3600, rpoSeconds: 86400 },
    },
    dependencies: { services, readiness },
    gate: {
      rehearsalPass:
        consistencyPass &&
        !gitTracked &&
        services.requiredRunning &&
        readiness.ok &&
        rtoSeconds <= 3600 &&
        rpoSeconds <= 86400,
      devTestComplete: true,
      pilotApproved: false,
      productionApproved: false,
    },
    limitations: [
      "Local Docker restore only; no production encrypted object-storage access or cross-region restore.",
      "Redis durability/worker drain and long-duration RTO were not simulated.",
      "No production/stakeholder approval is inferred from the rehearsal.",
    ],
  };
} finally {
  query(databaseName, `DROP DATABASE IF EXISTS ${quoteIdentifier(restoreDatabase)}`);
}

mkdirSync(resolve(reportPath, ".."), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      output: reportPath,
      rehearsalPass: report.gate.rehearsalPass,
      rtoSeconds: report.restore.rtoSeconds,
      rpoSeconds: report.restore.rpoSeconds,
    },
    null,
    2,
  ),
);
if (!report.gate.rehearsalPass) process.exit(1);
