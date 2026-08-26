import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const solverPython =
  process.env.SOLVER_PYTHON ??
  (process.platform === "win32"
    ? resolve(root, "backend", "solver", ".venv", "Scripts", "python.exe")
    : resolve(root, "backend", "solver", ".venv", "bin", "python"));
const pythonCommand = existsSync(solverPython) ? solverPython : "python";
const failureArtifact = resolve(root, "outputs", "ci", "last-failure.json");

if (existsSync(failureArtifact)) {
  unlinkSync(failureArtifact);
}

const steps = [
  ["format", npmCommand, ["run", "format:check"]],
  ["lint", npmCommand, ["run", "lint"]],
  ["typecheck", npmCommand, ["run", "typecheck"]],
  ["tests", npmCommand, ["test"]],
  ["migrations", process.execPath, [resolve(root, "scripts", "check-migrations.cjs")]],
  ["release-gate", process.execPath, [resolve(root, "scripts", "check-release-gate.cjs")]],
  ["template", process.execPath, [resolve(root, "scripts", "check-template.cjs")]],
  ["python-tests", pythonCommand, ["-m", "unittest", "discover", "-s", "backend/solver/tests", "-v"]],
  ["test-matrix", process.execPath, [resolve(root, "scripts", "check-test-matrix.cjs")]],
  ["build", npmCommand, ["run", "build"]],
];

for (const [name, command, args] of steps) {
  console.log(`\n[ci] ${name}`);
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32" && command === npmCommand,
    env: {
      ...process.env,
      PYTHONPATH: resolve(root, "backend", "solver", "src"),
    },
  });
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");

  if (result.status !== 0) {
    mkdirSync(resolve(root, "outputs", "ci"), { recursive: true });
    writeFileSync(
      failureArtifact,
      JSON.stringify(
        {
          failedStep: name,
          command,
          args,
          exitCode: result.status,
          error: result.error?.message ?? null,
          stdout: result.stdout ?? "",
          stderr: result.stderr ?? "",
          generatedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    process.exit(result.status || 1);
  }
}

console.log("\n[ci] tất cả cổng chất lượng cục bộ đã đạt");
