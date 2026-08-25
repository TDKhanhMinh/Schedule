import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ScheduleVersionController } from "./schedule-version.controller";
import { ScheduleExportService } from "./schedule-export.service";
import { PublicScheduleController } from "./public-schedule.controller";
import { PublicScheduleService } from "./public-schedule.service";
import { ScheduleVersionService } from "./schedule-version.service";

/** Timetable versions, review/edit, approval, lock, publish and export boundary. */
@Module({
  imports: [DatabaseModule],
  controllers: [ScheduleVersionController, PublicScheduleController],
  providers: [ScheduleVersionService, ScheduleExportService, PublicScheduleService],
  exports: [ScheduleVersionService, ScheduleExportService, PublicScheduleService],
})
export class TimetableModule {}
