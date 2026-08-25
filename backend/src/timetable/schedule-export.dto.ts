import { IsIn, IsOptional } from "class-validator";
import { SCHEDULE_EXPORT_VIEWS, type ScheduleExportView } from "../contracts";

export class ScheduleExportQueryDto {
  @IsIn(SCHEDULE_EXPORT_VIEWS)
  @IsOptional()
  view: ScheduleExportView = "all";
}
