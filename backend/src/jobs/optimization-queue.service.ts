import { Injectable, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { OPTIMIZATION_JOB_NAME, OPTIMIZATION_QUEUE, type SolveJobRequest } from "../contracts";
import { parseRedisConnection } from "./redis-connection";

@Injectable()
export class OptimizationQueueService implements OnModuleDestroy {
  private queue?: Queue<SolveJobRequest>;

  constructor(private readonly config: ConfigService) {}

  async enqueue(payload: SolveJobRequest) {
    const job = await this.getQueue().add(OPTIMIZATION_JOB_NAME, payload, {
      removeOnComplete: 100,
      removeOnFail: 100
    });

    return { jobId: job.id, queue: OPTIMIZATION_QUEUE, name: OPTIMIZATION_JOB_NAME };
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
      failedReason: job.failedReason ?? null
    };
  }

  async onModuleDestroy() {
    await this.queue?.close();
  }

  private getQueue() {
    if (!this.queue) {
      this.queue = new Queue<SolveJobRequest>(OPTIMIZATION_QUEUE, {
        connection: parseRedisConnection(this.config.getOrThrow<string>("REDIS_URL"))
      });
    }

    return this.queue;
  }
}
