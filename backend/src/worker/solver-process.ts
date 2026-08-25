import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SolveJobRequest, SolveJobResult, SolverAdapterPayload } from "../contracts";

function getSolverRuntime() {
  const solverRoot = resolve(process.env.SOLVER_ROOT ?? "backend/solver");
  const defaultPython =
    process.platform === "win32"
      ? resolve(solverRoot, ".venv", "Scripts", "python.exe")
      : resolve(solverRoot, ".venv", "bin", "python");
  const python = process.env.SOLVER_PYTHON ?? defaultPython;

  if (!existsSync(python)) {
    throw new Error(`Python solver runtime was not found at ${python}`);
  }

  return { python, solverRoot };
}

export function runPythonSolver(payload: SolveJobRequest | SolverAdapterPayload): Promise<SolveJobResult> {
  const { python, solverRoot } = getSolverRuntime();

  return new Promise((resolveResult, reject) => {
    const child = spawn(python, ["-m", "timetable_solver.main"], {
      cwd: solverRoot,
      env: {
        ...process.env,
        PYTHONPATH: resolve(solverRoot, "src"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python solver exited with code ${code}: ${stderr.trim()}`));
        return;
      }

      try {
        resolveResult(JSON.parse(stdout.trim()) as SolveJobResult);
      } catch (error) {
        reject(new Error(`Python solver returned invalid JSON: ${String(error)}; stdout=${stdout}`));
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });
}
