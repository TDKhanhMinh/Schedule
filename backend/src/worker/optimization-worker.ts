import type { Job } from "bullmq";
import type { SolveJobResult } from "../contracts";
import { computeOptimizationChecksum } from "../jobs/optimization-checksum";
import type { OptimizationJobData } from "../jobs/optimization-job.contract";
import type { OptimizationRunStore } from "../jobs/optimization-run.store";

export interface OptimizationWorkerDependencies {
  store: Pick<OptimizationRunStore, "markRunning" | "markRetryPending" | "markFailed" | "persistResult">;
  solve: (payload: OptimizationJobData["solverPayload"]) => Promise<SolveJobResult>;
}

export async function processOptimizationJob(
  job: Pick<Job<OptimizationJobData>, "data" | "attemptsMade" | "opts">,
  dependencies: OptimizationWorkerDependencies,
) {
  const attempt = job.attemptsMade + 1;
  await dependencies.store.markRunning(job.data.runId, attempt);
  try {
    const result = await dependencies.solve(job.data.solverPayload);
    const outputChecksum = computeOptimizationChecksum(result);
    await dependencies.store.persistResult(job.data.runId, result, outputChecksum);
    return { ...result, provenance: { runId: job.data.runId, inputChecksum: job.data.inputChecksum, outputChecksum } };
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const maxAttempts = Number(job.opts.attempts ?? job.data.maxAttempts);
    if (attempt >= maxAttempts) {
      await dependencies.store.markFailed(job.data.runId, attempt, normalized);
    } else {
      await dependencies.store.markRetryPending(job.data.runId, attempt, normalized);
    }
    throw normalized;
  }
}
