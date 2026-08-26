const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
const requiredFiles = [
  "docs/backup-restore-release-runbook.md",
  "docker-compose.yml",
  "backend/database/migrate.mjs",
  "backend/contracts/schemas/solve-job-request.schema.json",
  "deploy/staging/kustomization.yaml",
];
const requiredRunbookMarkers = [
  "RPO",
  "RTO",
  "staging/UAT/security/restore",
  "forward-only",
  "rollback",
  "production approved",
  "secret manager",
];

const failures = [];
for (const relativePath of requiredFiles) {
  if (!existsSync(resolve(root, relativePath))) {
    failures.push(`missing required release artifact: ${relativePath}`);
  }
}

const runbookPath = resolve(root, "docs/backup-restore-release-runbook.md");
if (existsSync(runbookPath)) {
  const runbook = readFileSync(runbookPath, "utf8").toLowerCase();
  for (const marker of requiredRunbookMarkers) {
    if (!runbook.includes(marker.toLowerCase())) {
      failures.push(`runbook is missing required marker: ${marker}`);
    }
  }
}

const composePath = resolve(root, "docker-compose.yml");
if (existsSync(composePath)) {
  const compose = readFileSync(composePath, "utf8");
  for (const marker of ["migrate:", "condition: service_completed_successfully", "healthcheck:"]) {
    if (!compose.includes(marker)) {
      failures.push(`docker compose release wiring is missing: ${marker}`);
    }
  }
}

if (failures.length > 0) {
  console.error("[release-gate] failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `[release-gate] passed (${requiredFiles.length} artifacts and ${requiredRunbookMarkers.length} runbook markers)`,
);
