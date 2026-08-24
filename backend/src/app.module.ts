import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health/health.controller";
import { OptimizationJobsController } from "./jobs/optimization-jobs.controller";
import { OptimizationQueueService } from "./jobs/optimization-queue.service";
import { ImportsController } from "./imports/imports.controller";
import { ImportsService } from "./imports/imports.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule],
  controllers: [HealthController, OptimizationJobsController, ImportsController],
  providers: [OptimizationQueueService, ImportsService]
})
export class AppModule {}
