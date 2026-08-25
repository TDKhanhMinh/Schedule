import type { SolveJobRequest, SolveJobResult, SolverAdapterPayload } from "../contracts";

export const OPTIMIZATION_QUEUE_CONTRACT_VERSION = "BULLMQ-OPTIMIZATION-1.0.0" as const;
export const OPTIMIZATION_MAX_ATTEMPTS = 3;

export interface OptimizationJobContext {
  academicPeriodId?: string;
  templateVersion?: string;
  randomSeed?: number;
}

export type OptimizationSolverPayload = SolveJobRequest | SolverAdapterPayload;

export interface OptimizationJobData {
  queueContractVersion: typeof OPTIMIZATION_QUEUE_CONTRACT_VERSION;
  runId: string;
  request: SolveJobRequest;
  solverPayload: OptimizationSolverPayload;
  inputChecksum: string;
  maxAttempts: number;
}

export interface OptimizationRunSnapshot {
  id: string;
  jobId: string;
  schoolId: string;
  status: "QUEUED" | "RUNNING" | "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN" | "INVALID" | "FAILED";
  inputChecksum: string;
  outputChecksum: string | null;
  attempts: number;
  maxAttempts: number;
  result: SolveJobResult | null;
  lastError: { code: string; message: string } | null;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}
