import { Module } from "@nestjs/common";
import { OptimizationJobsController } from "./optimization-jobs.controller";
import { OptimizationQueueService } from "./optimization-queue.service";

@Module({
  controllers: [OptimizationJobsController],
  providers: [OptimizationQueueService],
  exports: [OptimizationQueueService],
})
export class JobsModule {}
