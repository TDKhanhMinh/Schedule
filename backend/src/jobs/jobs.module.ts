import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { MasterDataModule } from "../master-data/master-data.module";
import { OptimizationJobsController } from "./optimization-jobs.controller";
import { OptimizationQueueService } from "./optimization-queue.service";
import { OptimizationPreflightService } from "./optimization-preflight.service";
import { OptimizationRunStore } from "./optimization-run.store";
import { RulesModule } from "../rules/rules.module";

@Module({
  imports: [DatabaseModule, MasterDataModule, RulesModule],
  controllers: [OptimizationJobsController],
  providers: [OptimizationPreflightService, OptimizationQueueService, OptimizationRunStore],
  exports: [OptimizationQueueService],
})
export class JobsModule {}
