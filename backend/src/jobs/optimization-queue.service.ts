import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { OPTIMIZATION_JOB_NAME, OPTIMIZATION_QUEUE, type SolveJobRequest } from "../contracts";
import { parseRedisConnection } from "./redis-connection";
import { OptimizationPreflightService } from "./optimization-preflight.service";

@Injectable()
export class OptimizationQueueService implements OnModuleDestroy {
  private queue?: Queue<SolveJobRequest>;

  constructor(
    private readonly config: ConfigService,
    private readonly preflightService: OptimizationPreflightService,
  ) {}

  async enqueue(payload: SolveJobRequest) {
    const report = this.preflightService.check(payload);
    if (!report.canSolve) {
      throw new BadRequestException({
        code: "PRESOLVE_FAILED",
        message: "Dữ liệu chắc chắn vô nghiệm; solver chưa được gọi.",
        details: report,
      });
    }
    const job = await this.getQueue().add(OPTIMIZATION_JOB_NAME, payload, {
      removeOnComplete: 100,
      removeOnFail: 100,
    });

    return {
      jobId: job.id,
      queue: OPTIMIZATION_QUEUE,
      name: OPTIMIZATION_JOB_NAME,
    };
  }

  preflight(payload: SolveJobRequest) {
    return this.preflightService.check(payload);
  }

  async getStatus(jobId: string) {
    const job = await this.getQueue().getJob(jobId);
    if (!job) {
      throw new NotFoundException(`Optimization job ${jobId} was not found`);
    }

    return {
      jobId: job.id,
      queue: OPTIMIZATION_QUEUE,
      name: job.name,
      state: await job.getState(),
      result: job.returnvalue ?? null,
      failedReason: job.failedReason ?? null,
    };
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }

  private getQueue() {
    if (!this.queue) {
      this.queue = new Queue<SolveJobRequest>(OPTIMIZATION_QUEUE, {
        connection: parseRedisConnection(this.config.getOrThrow<string>("REDIS_URL")),
      });
    }

    return this.queue;
  }
}
