import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleDestroy } from "@nestjs/common";
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
  OPTIMIZATION_QUEUE_CONTRACT_VERSION,
  type OptimizationJobContext,
  type OptimizationJobData,
} from "./optimization-job.contract";
import { OptimizationRunConflictError, OptimizationRunStore } from "./optimization-run.store";
import { randomUUID } from "node:crypto";

@Injectable()
export class OptimizationQueueService implements OnModuleDestroy {
  private queue?: Queue<OptimizationJobData>;

  constructor(
    private readonly config: ConfigService,
    private readonly preflightService: OptimizationPreflightService,
    private readonly runStore: OptimizationRunStore,
  ) {}

  async enqueue(payload: SolveJobRequest & OptimizationJobContext) {
    const { academicPeriodId, templateVersion, randomSeed, ...request } = payload;
    const report = this.preflightService.check(request);
    if (!report.canSolve) {
      throw new BadRequestException({
        code: "PRESOLVE_FAILED",
        message: "Dữ liệu chắc chắn vô nghiệm; solver chưa được gọi.",
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

    if (!run.result && run.status !== "FAILED" && run.status !== "INVALID") {
      const job = await this.getQueue().add(
        OPTIMIZATION_JOB_NAME,
        {
          queueContractVersion: OPTIMIZATION_QUEUE_CONTRACT_VERSION,
          runId: run.id,
          request,
          solverPayload,
          inputChecksum,
          maxAttempts: OPTIMIZATION_MAX_ATTEMPTS,
        },
        {
          jobId: request.jobId,
          attempts: OPTIMIZATION_MAX_ATTEMPTS,
          backoff: { type: "exponential", delay: 500 },
          removeOnComplete: 100,
          removeOnFail: 100,
        },
      );

      return {
        jobId: job.id,
        runId: run.id,
        queue: OPTIMIZATION_QUEUE,
        name: OPTIMIZATION_JOB_NAME,
        state: run.status,
        inputChecksum,
        maxAttempts: OPTIMIZATION_MAX_ATTEMPTS,
      };
    }

    return {
      jobId: run.jobId,
      runId: run.id,
      queue: OPTIMIZATION_QUEUE,
      name: OPTIMIZATION_JOB_NAME,
      state: run.status,
      inputChecksum: run.inputChecksum,
      maxAttempts: run.maxAttempts,
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
    if (!job && !durableRun) throw new NotFoundException(`Optimization job ${jobId} was not found`);
    if (durableRun && durableRun.schoolId !== schoolId) {
      throw new NotFoundException(`Optimization job ${jobId} was not found`);
    }

    return {
      jobId,
      runId: durableRun?.id ?? job?.data.runId ?? null,
      queue: OPTIMIZATION_QUEUE,
      name: job?.name ?? OPTIMIZATION_JOB_NAME,
      state: durableRun?.status ?? (await job!.getState()),
      result: durableRun?.result ?? job?.returnvalue ?? null,
      failedReason: durableRun?.lastError?.message ?? job?.failedReason ?? null,
      inputChecksum: durableRun?.inputChecksum ?? job?.data.inputChecksum ?? null,
      outputChecksum: durableRun?.outputChecksum ?? null,
      attempts: durableRun?.attempts ?? job?.attemptsMade ?? 0,
      maxAttempts: durableRun?.maxAttempts ?? job?.opts.attempts ?? OPTIMIZATION_MAX_ATTEMPTS,
      requestedAt: durableRun?.requestedAt ?? null,
      startedAt: durableRun?.startedAt ?? null,
      completedAt: durableRun?.completedAt ?? null,
    };
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
      if (!periodId) throw new BadRequestException("academicPeriodId là bắt buộc khi dùng rule snapshot.");
      return buildSolverAdapterPayload(request, {
        academicPeriodId: periodId,
        templateVersion: context.templateVersion ?? this.config.get<string>("SOLVER_TEMPLATE_VERSION", "MVP-0.1.0"),
        randomSeed: context.randomSeed,
        timeLimitSeconds: request.options?.timeLimitSeconds,
      });
    }
    return request;
  }
}
