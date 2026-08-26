import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outputPath = resolve(root, "outputs/P4.1-T02/tenant-scope-report.json");
const jestPath = resolve(root, "node_modules/jest/bin/jest.js");
const args = [
  jestPath,
  "--runInBand",
  "--runTestsByPath",
  "src/auth/tenant-scope.spec.ts",
  "src/auth/auth.guard.spec.ts",
  "src/jobs/optimization-queue.service.spec.ts",
];
const result = spawnSync(process.execPath, args, { cwd: resolve(root, "backend"), encoding: "utf8" });
const report = {
  task: "P4.1-T02",
  contractVersion: "TENANT-SCOPE-1.0.0",
  generatedAt: new Date().toISOString(),
  environment: "local unit tests; V1-compatible auth/queue boundary; no tenant DB migration",
  command: `${process.execPath} ${args.join(" ")}`,
  result: result.status === 0 ? "PASS" : "FAIL",
  exitCode: result.status,
  checks: [
    "trusted tenant identity is required when client requests tenant scope",
    "client tenant mismatch is rejected before business handler",
    "tenant job namespace and contract version are propagated from auth context",
    "legacy V1 requests remain compatible without tenant_id migration",
  ],
  gates: {
    devTestComplete: result.status === 0,
    tenantDatabaseMigrationApplied: false,
    repositoryRlsEnforced: false,
    pilotApproved: false,
    productionApproved: false,
  },
  openDependencies: ["P4.1-T03 tenant migration/repository scope", "P4.1-T05 cross-tenant integration/migration tests"],
};
await mkdir(resolve(root, "outputs/P4.1-T02"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
console.log(JSON.stringify({ output: outputPath, result: report.result, gates: report.gates }, null, 2));
if (result.status !== 0) process.exit(result.status ?? 1);
