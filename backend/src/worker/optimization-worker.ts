import type { Job } from "bullmq";
import type { SolveJobResult } from "../contracts";
import { computeOptimizationChecksum } from "../jobs/optimization-checksum";
import type { OptimizationJobData } from "../jobs/optimization-job.contract";
import type { OptimizationRunStore } from "../jobs/optimization-run.store";

export interface OptimizationWorkerSolveOptions {
  signal?: AbortSignal;
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
}

export async function processOptimizationJob(
  job: Pick<Job<OptimizationJobData>, "data" | "attemptsMade" | "opts">,
  dependencies: OptimizationWorkerDependencies,
) {
  const attempt = job.attemptsMade + 1;
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
      return { cancelled: true, runId: job.data.runId } satisfies OptimizationWorkerCancelledResult;
    }
    heartbeatTimer = setInterval(() => {
      void pollCancellation().catch(() => undefined);
    }, 500);
    const result = await dependencies.solve(job.data.solverPayload, { signal: controller.signal });
    if (controller.signal.aborted || (await dependencies.store.isCancelRequested(job.data.runId))) {
      await dependencies.store.markCancelled(job.data.runId, attempt);
      return { cancelled: true, runId: job.data.runId } satisfies OptimizationWorkerCancelledResult;
    }
    await dependencies.store.markPersisting(job.data.runId);
    const outputChecksum = computeOptimizationChecksum(result);
    await dependencies.store.persistResult(job.data.runId, result, outputChecksum);
    return { ...result, provenance: { runId: job.data.runId, inputChecksum: job.data.inputChecksum, outputChecksum } };
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const cancellationRequested = await dependencies.store.isCancelRequested(job.data.runId).catch(() => false);
    const cancellationCode = (error as { code?: string }).code;
    if (controller.signal.aborted || cancellationRequested || cancellationCode === "SOLVER_CANCELLED") {
      await dependencies.store.markCancelled(job.data.runId, attempt, "User requested cancellation");
      return { cancelled: true, runId: job.data.runId } satisfies OptimizationWorkerCancelledResult;
    }
    const maxAttempts = Number(job.opts.attempts ?? job.data.maxAttempts);
    if (attempt >= maxAttempts) {
      await dependencies.store.markFailed(job.data.runId, attempt, normalized);
    } else {
      await dependencies.store.markRetryPending(job.data.runId, attempt, normalized);
    }
    throw normalized;
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  }
}
