import type { Job } from "bullmq";
import type { SolveJobResult } from "../contracts";
import { computeOptimizationChecksum } from "../jobs/optimization-checksum";
import type { OptimizationJobData } from "../jobs/optimization-job.contract";
import type { OptimizationRunStore } from "../jobs/optimization-run.store";

export interface OptimizationWorkerSolveOptions {
  signal?: AbortSignal;
  traceId?: string;
}

export interface OptimizationWorkerObservability {
  recordQueue: (
    event: "DEQUEUED" | "PERSISTING" | "COMPLETED" | "FAILED" | "CANCELLED",
    details?: { traceId?: string; runId?: string; jobId?: string; state?: string },
  ) => void;
  recordSolver: (
    status: string,
    durationMs: number,
    details?: { traceId?: string; runId?: string; errorCode?: string },
  ) => void;
}

export interface OptimizationWorkerCancelledResult {
  cancelled: true;
  runId: string;
}

export interface OptimizationWorkerDependencies {
  store: Pick<
    OptimizationRunStore,
    | "markRunning"
    | "markRetryPending"
    | "markFailed"
    | "persistResult"
    | "touchHeartbeat"
    | "isCancelRequested"
    | "markPersisting"
    | "markCancelled"
  >;
  solve: (
    payload: OptimizationJobData["solverPayload"],
    options?: OptimizationWorkerSolveOptions,
  ) => Promise<SolveJobResult>;
  observability?: OptimizationWorkerObservability;
}

export async function processOptimizationJob(
  job: Pick<Job<OptimizationJobData>, "data" | "attemptsMade" | "opts">,
  dependencies: OptimizationWorkerDependencies,
) {
  const attempt = job.attemptsMade + 1;
  const traceId = job.data.traceId ?? job.data.runId;
  const solveStartedAt = Date.now();
  dependencies.observability?.recordQueue("DEQUEUED", {
    traceId,
    runId: job.data.runId,
    jobId: job.data.request.jobId,
    state: "RUNNING",
  });
  await dependencies.store.markRunning(job.data.runId, attempt);
  const controller = new AbortController();
  const pollCancellation = async () => {
    if (await dependencies.store.isCancelRequested(job.data.runId)) {
      controller.abort();
      return;
    }
    await dependencies.store.touchHeartbeat(job.data.runId, "SOLVING");
  };
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  try {
    if (await dependencies.store.isCancelRequested(job.data.runId)) {
      await dependencies.store.markCancelled(job.data.runId, attempt);
      dependencies.observability?.recordQueue("CANCELLED", { traceId, runId: job.data.runId, state: "CANCELLED" });
      return { cancelled: true, runId: job.data.runId } satisfies OptimizationWorkerCancelledResult;
    }
    heartbeatTimer = setInterval(() => {
      void pollCancellation().catch(() => undefined);
    }, 500);
    const result = await dependencies.solve(job.data.solverPayload, { signal: controller.signal, traceId });
    dependencies.observability?.recordSolver(result.status, Date.now() - solveStartedAt, {
      traceId,
      runId: job.data.runId,
    });
    if (controller.signal.aborted || (await dependencies.store.isCancelRequested(job.data.runId))) {
      await dependencies.store.markCancelled(job.data.runId, attempt);
      dependencies.observability?.recordQueue("CANCELLED", { traceId, runId: job.data.runId, state: "CANCELLED" });
      return { cancelled: true, runId: job.data.runId } satisfies OptimizationWorkerCancelledResult;
    }
    await dependencies.store.markPersisting(job.data.runId);
    dependencies.observability?.recordQueue("PERSISTING", { traceId, runId: job.data.runId, state: "PERSISTING" });
    const outputChecksum = computeOptimizationChecksum(result);
    await dependencies.store.persistResult(job.data.runId, result, outputChecksum);
    dependencies.observability?.recordQueue("COMPLETED", { traceId, runId: job.data.runId, state: result.status });
    return { ...result, provenance: { runId: job.data.runId, inputChecksum: job.data.inputChecksum, outputChecksum } };
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const cancellationRequested = await dependencies.store.isCancelRequested(job.data.runId).catch(() => false);
    const cancellationCode = (error as { code?: string }).code;
    if (controller.signal.aborted || cancellationRequested || cancellationCode === "SOLVER_CANCELLED") {
      await dependencies.store.markCancelled(job.data.runId, attempt, "User requested cancellation");
      dependencies.observability?.recordQueue("CANCELLED", { traceId, runId: job.data.runId, state: "CANCELLED" });
      return { cancelled: true, runId: job.data.runId } satisfies OptimizationWorkerCancelledResult;
    }
    const maxAttempts = Number(job.opts.attempts ?? job.data.maxAttempts);
    if (attempt >= maxAttempts) {
      await dependencies.store.markFailed(job.data.runId, attempt, normalized);
      dependencies.observability?.recordQueue("FAILED", { traceId, runId: job.data.runId, state: "FAILED" });
    } else {
      await dependencies.store.markRetryPending(job.data.runId, attempt, normalized);
      dependencies.observability?.recordQueue("FAILED", { traceId, runId: job.data.runId, state: "RETRY_WAITING" });
    }
    dependencies.observability?.recordSolver("ERROR", Date.now() - solveStartedAt, {
      traceId,
      runId: job.data.runId,
      errorCode: cancellationCode,
    });
    throw normalized;
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  }
}
