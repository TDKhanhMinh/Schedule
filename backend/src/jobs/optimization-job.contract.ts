import type { SolveJobRequest, SolveJobResult, SolverAdapterPayload } from "../contracts";

export const OPTIMIZATION_QUEUE_CONTRACT_VERSION = "BULLMQ-OPTIMIZATION-1.0.0" as const;
export const OPTIMIZATION_JOB_STATUS_CONTRACT_VERSION = "OPTIMIZATION-JOB-STATUS-1.0.0" as const;
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
  traceId?: string;
}

export interface OptimizationRunSnapshot {
  id: string;
  jobId: string;
  schoolId: string;
  academicPeriodId: string | null;
  status: "QUEUED" | "RUNNING" | "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN" | "INVALID" | "FAILED" | "CANCELLED";
  inputChecksum: string;
  outputChecksum: string | null;
  solverPayload: OptimizationSolverPayload | null;
  attempts: number;
  maxAttempts: number;
  result: SolveJobResult | null;
  lastError: { code: string; message: string } | null;
  progressStage: "QUEUED" | "SOLVING" | "PERSISTING" | "RETRY_WAITING" | "CANCELLED" | "COMPLETED" | "FAILED";
  heartbeatAt: string | null;
  cancelRequestedAt: string | null;
  cancelReason: string | null;
  retryKey: string | null;
  retryOfRunId: string | null;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}
