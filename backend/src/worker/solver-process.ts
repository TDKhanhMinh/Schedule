import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type {
  SolveJobRequest,
  SolveJobResult,
  SolverAdapterPayload,
  TeacherAssignmentSolveRequest,
  TeacherAssignmentSolveResult,
} from "../contracts";

export type SolverProcessErrorCode = "SOLVER_CANCELLED" | "SOLVER_SYSTEM_ERROR";

export class SolverProcessError extends Error {
  constructor(
    public readonly code: SolverProcessErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SolverProcessError";
  }
}

export interface RunPythonSolverOptions {
  signal?: AbortSignal;
  traceId?: string;
}

function getSolverRuntime() {
  const solverRoot = resolve(process.env.SOLVER_ROOT ?? "backend/solver");
  const defaultPython =
    process.platform === "win32"
      ? resolve(solverRoot, ".venv", "Scripts", "python.exe")
      : resolve(solverRoot, ".venv", "bin", "python");
  const python = process.env.SOLVER_PYTHON ?? defaultPython;

  if (!existsSync(python)) {
    throw new Error(`Không tìm thấy môi trường chạy bộ tối ưu Python tại ${python}`);
  }

  return { python, solverRoot };
}

function invalidResult(
  payload: SolveJobRequest | SolverAdapterPayload,
  error: { code?: string; message?: string; details?: unknown },
  traceId?: string,
): SolveJobResult {
  const request = "input" in payload ? payload.input : payload;
  const randomSeed = "reproducibility" in payload ? payload.reproducibility.randomSeed : 0;
  const timeLimitSeconds = request.options?.timeLimitSeconds !== undefined ? request.options.timeLimitSeconds : 10;
  return {
    schemaVersion: "1.0",
    jobId: request.jobId ?? "invalid-solve-job",
    status: "INVALID",
    assignments: [],
    objectiveValue: null,
    diagnostics: {
      warnings: [],
      conflicts: [
        `${error.code ?? "INVALID_SOLVE_REQUEST"}: ${error.message ?? "Dữ liệu đầu vào bộ tối ưu không hợp lệ."}`,
      ],
      catalogVersion: "CONFLICT-CATALOG-1.0.0",
      conflictDetails: [],
      hardConstraintViolations: [],
      objectiveBreakdown: {
        teacherGap: 0,
        compactness: 0,
        dayDistribution: 0,
        undesirableSlots: 0,
        preferredDays: 0,
        fairness: 0,
        weightedTotal: 0,
      },
      runMetrics: { wallTimeMs: 0, bestObjectiveBound: null, objectiveGapPercent: null },
    },
    metadata: {
      solverVersion: "0.1.0",
      contractVersion: "1.0",
      randomSeed,
      timeLimitSeconds,
      traceId,
    },
  };
}

export function runPythonSolver(
  payload: SolveJobRequest | SolverAdapterPayload,
  options: RunPythonSolverOptions = {},
): Promise<SolveJobResult> {
  if (options.signal?.aborted) {
    return Promise.reject(new SolverProcessError("SOLVER_CANCELLED", "Tiến trình bộ tối ưu đã được hủy an toàn."));
  }
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
    let settled = false;
    const abortHandler = () => {
      if (settled) return;
      child.kill();
      settled = true;
      reject(new SolverProcessError("SOLVER_CANCELLED", "Tiến trình bộ tối ưu đã được hủy an toàn."));
    };
    options.signal?.addEventListener("abort", abortHandler, { once: true });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(new SolverProcessError("SOLVER_SYSTEM_ERROR", error.message));
    });
    child.on("close", (code) => {
      options.signal?.removeEventListener("abort", abortHandler);
      if (settled) return;
      if (code !== 0) {
        try {
          const parsed = JSON.parse(stderr.trim()) as {
            error?: { code?: string; message?: string; details?: unknown };
          };
          if (parsed.error?.code?.startsWith("INVALID_")) {
            settled = true;
            resolveResult(invalidResult(payload, parsed.error, options.traceId));
            return;
          }
        } catch {
          // Fall through to the system-error boundary for non-JSON stderr.
        }
        settled = true;
        reject(
          new SolverProcessError("SOLVER_SYSTEM_ERROR", `Python solver exited with code ${code}: ${stderr.trim()}`),
        );
        return;
      }

      try {
        settled = true;
        const result = JSON.parse(stdout.trim()) as SolveJobResult;
        resolveResult({
          ...result,
          metadata: { ...result.metadata, ...(options.traceId ? { traceId: options.traceId } : {}) },
        });
      } catch (error) {
        settled = true;
        reject(
          new SolverProcessError(
            "SOLVER_SYSTEM_ERROR",
            `Bộ tối ưu Python trả về JSON không hợp lệ: ${String(error)}; stdout=${stdout}`,
          ),
        );
      }
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

export function runPythonTeacherAssignmentSolver(
  payload: TeacherAssignmentSolveRequest,
  options: RunPythonSolverOptions = {},
): Promise<TeacherAssignmentSolveResult> {
  if (options.signal?.aborted) {
    return Promise.reject(
      new SolverProcessError("SOLVER_CANCELLED", "Tiến trình phân công giáo viên đã được hủy an toàn."),
    );
  }
  const { python, solverRoot } = getSolverRuntime();

  return new Promise((resolveResult, reject) => {
    const child = spawn(python, ["-m", "timetable_solver.teacher_assignment_main"], {
      cwd: solverRoot,
      env: {
        ...process.env,
        PYTHONPATH: resolve(solverRoot, "src"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const abortHandler = () => {
      if (settled) return;
      child.kill();
      settled = true;
      reject(new SolverProcessError("SOLVER_CANCELLED", "Tiến trình phân công giáo viên đã được hủy an toàn."));
    };
    options.signal?.addEventListener("abort", abortHandler, { once: true });
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(new SolverProcessError("SOLVER_SYSTEM_ERROR", error.message));
    });
    child.on("close", (code) => {
      options.signal?.removeEventListener("abort", abortHandler);
      if (settled) return;
      if (code !== 0) {
        settled = true;
        reject(
          new SolverProcessError(
            "SOLVER_SYSTEM_ERROR",
            `Python teacher assignment solver exited with code ${code}: ${stderr.trim()}`,
          ),
        );
        return;
      }
      try {
        settled = true;
        resolveResult(JSON.parse(stdout.trim()) as TeacherAssignmentSolveResult);
      } catch (error) {
        settled = true;
        reject(
          new SolverProcessError(
            "SOLVER_SYSTEM_ERROR",
            `Bộ phân công Python trả về JSON không hợp lệ: ${String(error)}; stdout=${stdout}`,
          ),
        );
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}
