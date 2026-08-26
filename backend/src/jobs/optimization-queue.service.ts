import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import {
  buildSolverAdapterPayload,
  OPTIMIZATION_JOB_NAME,
  OPTIMIZATION_QUEUE,
  type SolveJobRequest,
} from "../contracts";
import { parseRedisConnection } from "./redis-connection";
import { OptimizationPreflightService } from "./optimization-preflight.service";
import { computeOptimizationChecksum } from "./optimization-checksum";
import {
  OPTIMIZATION_MAX_ATTEMPTS,
  OPTIMIZATION_JOB_STATUS_CONTRACT_VERSION,
  OPTIMIZATION_QUEUE_CONTRACT_VERSION,
  type OptimizationJobContext,
  type OptimizationJobData,
  type OptimizationSolverPayload,
} from "./optimization-job.contract";
import { OptimizationRunConflictError, OptimizationRunStore } from "./optimization-run.store";
import { randomUUID } from "node:crypto";
import { ObservabilityService } from "../observability/observability.service";
import { TENANT_SCOPE_CONTRACT_VERSION, tenantQueueNamespace } from "../auth/tenant-scope";

const SOLVE_HEARTBEAT_STALE_AFTER_MS = 15_000;
const QUEUE_HEARTBEAT_STALE_AFTER_MS = 60_000;

@Injectable()
export class OptimizationQueueService implements OnModuleDestroy {
  private queue?: Queue<OptimizationJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly preflightService: OptimizationPreflightService,
    private readonly runStore: OptimizationRunStore,
    @Optional() private readonly observability?: ObservabilityService,
  ) {}

  async enqueue(payload: SolveJobRequest & OptimizationJobContext, traceId = payload.jobId, tenantId?: string) {
    const { academicPeriodId, templateVersion, randomSeed, ...request } = payload;
    const report = this.preflightService.check(request);
    if (!report.canSolve) {
      this.observability?.recordQueue("PRECHECK_REJECTED", { traceId, jobId: request.jobId, state: "REJECTED" });
      throw new BadRequestException({
        code: "PRESOLVE_FAILED",
        message: "Dữ liệu chắc chắn vô nghiệm; bộ tối ưu chưa được gọi.",
        details: report,
      });
    }
    const runId = randomUUID();
    const solverPayload = this.buildSolverPayload(request, { academicPeriodId, templateVersion, randomSeed });
    const inputChecksum =
      "inputChecksum" in solverPayload ? solverPayload.inputChecksum : computeOptimizationChecksum(solverPayload);
    let run;
    try {
      run = await this.runStore.createOrGet({
        runId,
        jobId: request.jobId,
        schoolId: request.schoolId,
        academicPeriodId: academicPeriodId ?? request.teacherAvailability?.academicPeriodId,
        request,
        solverPayload,
        inputChecksum,
        adapterContractVersion:
          "adapterContractVersion" in solverPayload ? solverPayload.adapterContractVersion : undefined,
        maxAttempts: OPTIMIZATION_MAX_ATTEMPTS,
      });
    } catch (error) {
      if (error instanceof OptimizationRunConflictError) throw new ConflictException(error.message);
      throw error;
    }

    if (!run.result && run.status !== "FAILED" && run.status !== "INVALID" && run.status !== "CANCELLED") {
      const job = await this.getQueue().add(
        OPTIMIZATION_JOB_NAME,
        {
          queueContractVersion: OPTIMIZATION_QUEUE_CONTRACT_VERSION,
          runId: run.id,
          request,
          solverPayload,
          inputChecksum,
          maxAttempts: OPTIMIZATION_MAX_ATTEMPTS,
          traceId,
          tenantId,
          queueNamespace: tenantQueueNamespace(tenantId, request.schoolId),
          tenantScopeContractVersion: TENANT_SCOPE_CONTRACT_VERSION,
        },
        {
          jobId: request.jobId,
          attempts: OPTIMIZATION_MAX_ATTEMPTS,
          backoff: { type: "exponential", delay: 500 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
      this.observability?.recordQueue("ENQUEUED", { traceId, runId: run.id, jobId: run.jobId, state: run.status });

      return {
        jobId: job.id,
        runId: run.id,
        queue: OPTIMIZATION_QUEUE,
        name: OPTIMIZATION_JOB_NAME,
        state: run.status,
        inputChecksum,
        maxAttempts: OPTIMIZATION_MAX_ATTEMPTS,
        traceId,
        tenantId,
        queueNamespace: tenantQueueNamespace(tenantId, request.schoolId),
        tenantScopeContractVersion: TENANT_SCOPE_CONTRACT_VERSION,
      };
    }

    this.observability?.recordQueue("COMPLETED", { traceId, runId: run.id, jobId: run.jobId, state: run.status });
    return {
      jobId: run.jobId,
      runId: run.id,
      queue: OPTIMIZATION_QUEUE,
      name: OPTIMIZATION_JOB_NAME,
      state: run.status,
      inputChecksum: run.inputChecksum,
      maxAttempts: run.maxAttempts,
      traceId,
    };
  }

  preflight(payload: SolveJobRequest) {
    return this.preflightService.check(payload);
  }

  async getStatus(jobId: string, schoolId: string) {
    const job = await this.getQueue().getJob(jobId);
    const durableRun = job
      ? await this.runStore.findByRunId(job.data.runId)
      : await this.runStore.findByJobId(schoolId, jobId);
    if (!job && !durableRun) throw new NotFoundException(`Không tìm thấy tác vụ tối ưu ${jobId}`);
    if (durableRun && durableRun.schoolId !== schoolId) {
      throw new NotFoundException(`Không tìm thấy tác vụ tối ưu ${jobId}`);
    }

    const state = durableRun?.status ?? (await job!.getState());
    const progressStage = durableRun?.progressStage ?? (state === "completed" ? "COMPLETED" : "QUEUED");
    const isStalled = this.isStalled(durableRun);
    return {
      statusContractVersion: OPTIMIZATION_JOB_STATUS_CONTRACT_VERSION,
      jobId,
      runId: durableRun?.id ?? job?.data.runId ?? null,
      queue: OPTIMIZATION_QUEUE,
      name: job?.name ?? OPTIMIZATION_JOB_NAME,
      state,
      result: durableRun?.result ?? job?.returnvalue ?? null,
      failedReason:
        durableRun?.lastError?.message ?? (job?.failedReason ? "Job failed; xem execution log nội bộ." : null),
      inputChecksum: durableRun?.inputChecksum ?? job?.data.inputChecksum ?? null,
      outputChecksum: durableRun?.outputChecksum ?? null,
      attempts: durableRun?.attempts ?? job?.attemptsMade ?? 0,
      maxAttempts: durableRun?.maxAttempts ?? job?.opts.attempts ?? OPTIMIZATION_MAX_ATTEMPTS,
      requestedAt: durableRun?.requestedAt ?? null,
      startedAt: durableRun?.startedAt ?? null,
      completedAt: durableRun?.completedAt ?? null,
      cancelRequested: Boolean(durableRun?.cancelRequestedAt),
      retryOfRunId: durableRun?.retryOfRunId ?? null,
      progress: {
        stage: progressStage,
        percent: this.progressPercent(state),
        heartbeatAt: durableRun?.heartbeatAt ?? null,
        isStalled,
      },
      canCancel: state === "QUEUED" || state === "RUNNING",
      canRetry: ["FAILED", "CANCELLED", "UNKNOWN"].includes(state),
    };
  }

  async cancel(jobId: string, schoolId: string, reason?: string) {
    const run = await this.runStore.findByJobId(schoolId, jobId);
    if (!run) throw new NotFoundException(`Không tìm thấy tác vụ tối ưu ${jobId}`);
    if (!["QUEUED", "RUNNING"].includes(run.status)) return this.getStatus(jobId, schoolId);

    const updated = await this.runStore.requestCancel(run.id, reason);
    if (updated?.status === "CANCELLED") {
      const job = await this.getQueue().getJob(jobId);
      if (job) {
        try {
          await job.remove();
        } catch {
          // An active worker may own the lock; the durable cancel flag remains authoritative.
        }
      }
    }
    return this.getStatus(jobId, schoolId);
  }

  async retry(jobId: string, schoolId: string, idempotencyKey?: string, traceId = jobId, tenantId?: string) {
    const retryKey = idempotencyKey?.trim();
    if (!retryKey) throw new BadRequestException("Idempotency-Key là bắt buộc khi thử lại tác vụ tối ưu.");
    if (retryKey.length > 200) throw new BadRequestException("Idempotency-Key không được vượt quá 200 ký tự.");

    const source = await this.runStore.findByJobId(schoolId, jobId);
    if (!source) throw new NotFoundException(`Không tìm thấy tác vụ tối ưu ${jobId}`);
    if (!["FAILED", "CANCELLED", "UNKNOWN"].includes(source.status)) {
      throw new ConflictException(
        `Chỉ được retry job ở trạng thái FAILED, CANCELLED hoặc UNKNOWN; hiện tại ${source.status}.`,
      );
    }
    if (!source.solverPayload) {
      throw new ConflictException("Tác vụ cũ không còn dữ liệu bộ tối ưu để thử lại an toàn.");
    }
    const existingRetry = await this.runStore.findByRetryKey(schoolId, retryKey);
    if (existingRetry) {
      if (existingRetry.retryOfRunId !== source.id) {
        throw new ConflictException("Idempotency-Key đã được dùng cho một tác vụ thử lại khác trong phạm vi trường.");
      }
      return this.statusFromRun(existingRetry);
    }

    const newJobId = `${source.jobId}:retry:${randomUUID().slice(0, 8)}`;
    const solverPayload = this.buildRetryPayload(source.solverPayload, newJobId, source.academicPeriodId);
    const request = "input" in solverPayload ? solverPayload.input : solverPayload;
    const inputChecksum =
      "inputChecksum" in solverPayload ? solverPayload.inputChecksum : computeOptimizationChecksum(solverPayload);
    let run;
    try {
      run = await this.runStore.createOrGet({
        runId: randomUUID(),
        jobId: newJobId,
        schoolId,
        academicPeriodId: source.academicPeriodId ?? undefined,
        request,
        solverPayload,
        inputChecksum,
        adapterContractVersion:
          "adapterContractVersion" in solverPayload ? solverPayload.adapterContractVersion : undefined,
        maxAttempts: OPTIMIZATION_MAX_ATTEMPTS,
        retryKey,
        retryOfRunId: source.id,
      });
    } catch (error) {
      if (error instanceof OptimizationRunConflictError) throw new ConflictException(error.message);
      throw error;
    }

    if (run.retryKey === retryKey && run.jobId !== newJobId) return this.statusFromRun(run);
    try {
      const job = await this.getQueue().add(
        OPTIMIZATION_JOB_NAME,
        {
          queueContractVersion: OPTIMIZATION_QUEUE_CONTRACT_VERSION,
          runId: run.id,
          request,
          solverPayload,
          inputChecksum,
          maxAttempts: OPTIMIZATION_MAX_ATTEMPTS,
          traceId,
          tenantId,
          queueNamespace: tenantQueueNamespace(tenantId, schoolId),
          tenantScopeContractVersion: TENANT_SCOPE_CONTRACT_VERSION,
        },
        {
          jobId: run.jobId,
          attempts: OPTIMIZATION_MAX_ATTEMPTS,
          backoff: { type: "exponential", delay: 500 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );
      return {
        statusContractVersion: OPTIMIZATION_JOB_STATUS_CONTRACT_VERSION,
        jobId: job.id,
        runId: run.id,
        retryOfRunId: source.id,
        state: "QUEUED" as const,
        inputChecksum,
        maxAttempts: OPTIMIZATION_MAX_ATTEMPTS,
        canCancel: true,
        canRetry: false,
        traceId,
        tenantId,
        queueNamespace: tenantQueueNamespace(tenantId, schoolId),
        tenantScopeContractVersion: TENANT_SCOPE_CONTRACT_VERSION,
      };
    } catch (error) {
      await this.runStore.markFailed(run.id, 0, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }

  private getQueue() {
    if (!this.queue) {
      this.queue = new Queue<OptimizationJobData>(OPTIMIZATION_QUEUE, {
        connection: parseRedisConnection(this.config.getOrThrow<string>("REDIS_URL")),
      });
    }

    return this.queue;
  }

  private buildSolverPayload(request: SolveJobRequest, context: OptimizationJobContext) {
    if (request.ruleSnapshotId || request.ruleSetVersion || request.ruleSnapshotHash) {
      const periodId = context.academicPeriodId ?? request.teacherAvailability?.academicPeriodId;
      if (!periodId) throw new BadRequestException("academicPeriodId là bắt buộc khi dùng bản chụp quy tắc.");
      return buildSolverAdapterPayload(request, {
        academicPeriodId: periodId,
        templateVersion: context.templateVersion ?? this.config.get<string>("SOLVER_TEMPLATE_VERSION", "MVP-0.1.0"),
        randomSeed: context.randomSeed,
        timeLimitSeconds: request.options?.timeLimitSeconds,
      });
    }
    return request;
  }

  private buildRetryPayload(payload: OptimizationSolverPayload, jobId: string, academicPeriodId: string | null) {
    if ("input" in payload) {
      return buildSolverAdapterPayload(
        { ...payload.input, jobId },
        {
          academicPeriodId: academicPeriodId ?? payload.source.academicPeriodId,
          templateVersion: payload.source.templateVersion,
          randomSeed: payload.reproducibility.randomSeed,
          timeLimitSeconds: payload.reproducibility.timeLimitSeconds,
        },
      );
    }
    return { ...payload, jobId };
  }

  private statusFromRun(
    run: Awaited<ReturnType<OptimizationRunStore["findByJobId"]>> extends infer T ? Exclude<T, null> : never,
  ) {
    const state = run.status;
    return {
      statusContractVersion: OPTIMIZATION_JOB_STATUS_CONTRACT_VERSION,
      jobId: run.jobId,
      runId: run.id,
      retryOfRunId: run.retryOfRunId,
      state,
      result: run.result,
      failedReason: run.lastError?.message ?? null,
      inputChecksum: run.inputChecksum,
      outputChecksum: run.outputChecksum,
      attempts: run.attempts,
      maxAttempts: run.maxAttempts,
      requestedAt: run.requestedAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      cancelRequested: Boolean(run.cancelRequestedAt),
      progress: {
        stage: run.progressStage,
        percent: this.progressPercent(state),
        heartbeatAt: run.heartbeatAt,
        isStalled: this.isStalled(run),
      },
      canCancel: state === "QUEUED" || state === "RUNNING",
      canRetry: ["FAILED", "CANCELLED", "UNKNOWN"].includes(state),
    };
  }

  private progressPercent(state: string) {
    return ["OPTIMAL", "FEASIBLE", "INFEASIBLE", "INVALID", "FAILED", "CANCELLED"].includes(state) ? 100 : null;
  }

  private isStalled(run: Awaited<ReturnType<OptimizationRunStore["findByJobId"]>>) {
    if (!run || !["QUEUED", "RUNNING"].includes(run.status)) return false;
    const reference =
      run.heartbeatAt ?? (run.status === "QUEUED" ? run.requestedAt : (run.startedAt ?? run.requestedAt));
    const ageMs = Date.now() - new Date(reference).getTime();
    return ageMs > (run.status === "QUEUED" ? QUEUE_HEARTBEAT_STALE_AFTER_MS : SOLVE_HEARTBEAT_STALE_AFTER_MS);
  }
}
