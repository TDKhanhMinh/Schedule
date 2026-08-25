import { IsIn, IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";
import { SCHEDULE_VERSION_STATUSES, type ScheduleVersionStatus } from "./schedule-version.types";

export class CreateScheduleVersionDto {
  @IsString()
  @IsNotEmpty()
  academicPeriodId!: string;

  @IsString()
  @IsOptional()
  sourceRunId?: string;

  @IsString()
  @IsOptional()
  ruleSnapshotId?: string;

  @IsString()
  @Matches(/^RULE-SET-[0-9]+\.[0-9]+\.[0-9]+$/)
  @IsOptional()
  ruleSetVersion?: string;

  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  @IsOptional()
  ruleSnapshotHash?: string;

  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  @IsOptional()
  inputSnapshotHash?: string;

  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  @IsOptional()
  scheduleSnapshotHash?: string;
}

export class TransitionScheduleVersionDto {
  @IsIn(SCHEDULE_VERSION_STATUSES)
  toStatus!: ScheduleVersionStatus;

  @IsString()
  @IsOptional()
  reason?: string;
}
