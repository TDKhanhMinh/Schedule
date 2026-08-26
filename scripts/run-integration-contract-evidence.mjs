import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outputPath = resolve(root, "outputs/P4.1-T03/integration-contract-report.json");
const args = [
  resolve(root, "node_modules/jest/bin/jest.js"),
  "--runInBand",
  "--runTestsByPath",
  "src/integrations/integration-contract.spec.ts",
];
const result = spawnSync(process.execPath, args, { cwd: resolve(root, "backend"), encoding: "utf8" });
const report = {
  task: "P4.1-T03",
  contractVersion: "SCHOOL-INTEGRATION-1.0.0",
  generatedAt: new Date().toISOString(),
  environment: "local unit tests; canonical import contract; no external provider/DLQ persistence",
  result: result.status === 0 ? "PASS" : "FAIL",
  exitCode: result.status,
  checks: [
    "HMAC signature/tamper/secret rotation",
    "event replay deduplication",
    "mapping profile diagnostics",
    "bounded retry/dead-letter classification",
  ],
  gates: {
    devTestComplete: result.status === 0,
    durableWebhookPersistence: false,
    externalProviderRollout: false,
    pilotApproved: false,
    productionApproved: false,
  },
  openDependencies: [
    "durable idempotency/DLQ persistence",
    "secret manager/rotation operation",
    "external provider contract and staging replay",
  ],
};
await mkdir(resolve(root, "outputs/P4.1-T03"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
console.log(JSON.stringify({ output: outputPath, result: report.result, gates: report.gates }, null, 2));
if (result.status !== 0) process.exit(result.status ?? 1);
