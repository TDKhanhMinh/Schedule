import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { ScheduleVersionController } from "./schedule-version.controller";
import { ScheduleVersionService } from "./schedule-version.service";

/** Timetable versions, review/edit, approval, lock, publish and export boundary. */
@Module({
  imports: [DatabaseModule],
  controllers: [ScheduleVersionController],
  providers: [ScheduleVersionService],
  exports: [ScheduleVersionService],
})
export class TimetableModule {}
