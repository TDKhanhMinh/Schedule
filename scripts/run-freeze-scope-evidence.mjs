import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outputPath = resolve(root, process.env.FREEZE_SCOPE_REPORT ?? "outputs/P3.2-T01/freeze-scope-report.json");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const args = [
  "run",
  "test",
  "--workspace",
  "@schedule/backend",
  "--",
  "--runTestsByPath",
  "src/timetable/freeze-scope.spec.ts",
];
const result = spawnSync(npmCommand, args, {
  cwd: root,
  encoding: "utf8",
  shell: process.platform === "win32",
});

const report = {
  task: "P3.2-T01",
  contractVersion: "FREEZE-SCOPE-1.0.0",
  generatedAt: new Date().toISOString(),
  environment: "local unit test; immutable synthetic baseline fixture",
  command: `${npmCommand} ${args.join(" ")}`,
  result: result.status === 0 ? "PASS" : "FAIL",
  exitCode: result.status,
  checks: [
    "lesson/teacher/class/day/room resource nodes are represented",
    "before and after resources form a deterministic affected neighborhood",
    "frozen selectors block changes with explicit violations",
    "baseline hash and school/period/version drift are blocked",
    "baseline assignment input remains unchanged",
  ],
  gates: {
    devTestComplete: result.status === 0,
    pilotApproved: false,
    productionApproved: false,
  },
};

await mkdir(resolve(root, "outputs/P3.2-T01"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
console.log(
  JSON.stringify({ output: outputPath, result: report.result, devTestComplete: report.gates.devTestComplete }, null, 2),
);
if (result.status !== 0) process.exit(result.status ?? 1);
