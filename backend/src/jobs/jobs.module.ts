import { Module } from "@nestjs/common";
import { OptimizationJobsController } from "./optimization-jobs.controller";
import { OptimizationQueueService } from "./optimization-queue.service";
import { OptimizationPreflightService } from "./optimization-preflight.service";

@Module({
  controllers: [OptimizationJobsController],
  providers: [OptimizationPreflightService, OptimizationQueueService],
  exports: [OptimizationQueueService],
})
export class JobsModule {}
