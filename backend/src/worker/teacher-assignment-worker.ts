import type { Job } from "bullmq";
import type { TeacherAssignmentJobData, TeacherAssignmentSolveResult } from "../contracts";
import type { TeacherAssignmentRunStore } from "../teacher-assignment/teacher-assignment-run.store";

export interface TeacherAssignmentWorkerDependencies {
  store: Pick<
    TeacherAssignmentRunStore,
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
    payload: TeacherAssignmentJobData["request"],
    options?: { signal?: AbortSignal; traceId?: string },
  ) => Promise<TeacherAssignmentSolveResult>;
}

export async function processTeacherAssignmentJob(
  job: Pick<Job<TeacherAssignmentJobData>, "data" | "attemptsMade" | "opts">,
  dependencies: TeacherAssignmentWorkerDependencies,
) {
  const attempt = job.attemptsMade + 1;
  const controller = new AbortController();
  const pollCancellation = async () => {
    if (await dependencies.store.isCancelRequested(job.data.runId)) {
      controller.abort();
      return;
    }
    await dependencies.store.touchHeartbeat(job.data.runId);
  };
  const heartbeatTimer = setInterval(() => {
    void pollCancellation().catch(() => undefined);
  }, 500);
  try {
    await dependencies.store.markRunning(job.data.runId, attempt);
    const result = await dependencies.solve(job.data.request, {
      signal: controller.signal,
      traceId: job.data.traceId,
    });
    if (controller.signal.aborted || (await dependencies.store.isCancelRequested(job.data.runId))) {
      await dependencies.store.markCancelled(job.data.runId, attempt, "Yêu cầu hủy trong khi phân công");
      return { cancelled: true, runId: job.data.runId };
    }
    await dependencies.store.markPersisting(job.data.runId);
    await dependencies.store.persistResult(job.data.runId, result);
    return result;
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const cancelled =
      controller.signal.aborted || (await dependencies.store.isCancelRequested(job.data.runId).catch(() => false));
    if (cancelled) {
      await dependencies.store
        .markCancelled(job.data.runId, attempt, "Yêu cầu hủy trong khi phân công")
        .catch(() => undefined);
      return { cancelled: true, runId: job.data.runId };
    }
    const maxAttempts = Number(job.opts.attempts ?? job.data.maxAttempts);
    if (attempt >= maxAttempts) await dependencies.store.markFailed(job.data.runId, attempt, normalized);
    else await dependencies.store.markRetryPending(job.data.runId, attempt, normalized);
    throw normalized;
  } finally {
    clearInterval(heartbeatTimer);
  }
}
