import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { OptimizationJobsController } from "./optimization-jobs.controller";
import { OptimizationQueueService } from "./optimization-queue.service";
import { OptimizationPreflightService } from "./optimization-preflight.service";
import { OptimizationRunStore } from "./optimization-run.store";

@Module({
  imports: [DatabaseModule],
  controllers: [OptimizationJobsController],
  providers: [OptimizationPreflightService, OptimizationQueueService, OptimizationRunStore],
  exports: [OptimizationQueueService],
})
export class JobsModule {}
