import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type { SolveJobRequest } from "../contracts";

export class TimeSlotDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsInt()
  @Min(1)
  day!: number;

  @IsInt()
  @Min(1)
  period!: number;

  @IsString()
  @IsOptional()
  shiftCode?: string;
}

export class LessonRequirementDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsNotEmpty()
  teacherId!: string;

  @IsInt()
  @Min(1)
  requiredSessions!: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedSlotIds?: string[];

  @IsString()
  @IsOptional()
  fixedSlotId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedRoomIds?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  requiredRoomCapabilities?: string[];
}

export class RoomCapabilityDto {
  @IsString()
  @IsNotEmpty()
  id!: string;

  @IsArray()
  @IsString({ each: true })
  capabilities!: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  unavailableSlotIds?: string[];
}

export class TeacherAvailabilityRuleSourceDto {
  @IsString()
  @IsNotEmpty()
  sourceUrl!: string;

  @IsString()
  @IsOptional()
  sourceLocator?: string;

  @IsString()
  @IsNotEmpty()
  ruleSnapshotId!: string;

  @IsString()
  @IsNotEmpty()
  ruleSetVersion!: string;

  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  ruleSnapshotHash!: string;
}

export class TeacherAvailabilityRuleDto {
  @IsString()
  @IsNotEmpty()
  ruleId!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  teacherId!: string;

  @IsIn(["HARD_UNAVAILABLE", "STRONG_PREFERENCE", "SOFT_WISH"])
  strength!: "HARD_UNAVAILABLE" | "STRONG_PREFERENCE" | "SOFT_WISH";

  @IsNumber()
  @Min(0)
  @IsOptional()
  weight!: number | null;

  @IsInt()
  @Min(1)
  dayOfWeek!: number;

  @IsString()
  @IsOptional()
  shiftCode?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  period?: number;

  @IsArray()
  @IsString({ each: true })
  blockedSlotIds!: string[];

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  effectiveTo?: string | null;

  @IsString()
  @IsOptional()
  reason?: string;

  @ValidateNested()
  @Type(() => TeacherAvailabilityRuleSourceDto)
  source!: TeacherAvailabilityRuleSourceDto;
}

export class TeacherAvailabilitySetDto {
  @IsString()
  @IsIn(["TEACHER-AVAILABILITY-1.0.0"])
  contractVersion!: "TEACHER-AVAILABILITY-1.0.0";

  @IsString()
  @IsNotEmpty()
  schoolId!: string;

  @IsString()
  @IsNotEmpty()
  academicPeriodId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveAsOf!: string;

  @IsString()
  @IsNotEmpty()
  ruleSnapshotId!: string;

  @IsString()
  @Matches(/^RULE-SET-[0-9]+\.[0-9]+\.[0-9]+$/)
  ruleSetVersion!: string;

  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  ruleSnapshotHash!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeacherAvailabilityRuleDto)
  rules!: TeacherAvailabilityRuleDto[];
}

export class SolveJobOptionsDto {
  @IsNumber()
  @Min(0.1)
  @IsOptional()
  timeLimitSeconds?: number;
}

export class SolveJobDto implements SolveJobRequest {
  @IsString()
  @IsIn(["1.0"])
  schemaVersion!: "1.0";

  @IsString()
  @IsNotEmpty()
  jobId!: string;

  @IsString()
  @IsNotEmpty()
  schoolId!: string;

  @IsString()
  @IsNotEmpty()
  @ValidateIf((payload) => Boolean(payload.ruleSnapshotId || payload.ruleSetVersion || payload.ruleSnapshotHash))
  @IsDefined()
  ruleSnapshotId?: string;

  @IsString()
  @Matches(/^RULE-SET-[0-9]+\.[0-9]+\.[0-9]+$/)
  @ValidateIf((payload) => Boolean(payload.ruleSnapshotId || payload.ruleSetVersion || payload.ruleSnapshotHash))
  @IsDefined()
  ruleSetVersion?: string;

  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  @ValidateIf((payload) => Boolean(payload.ruleSnapshotId || payload.ruleSetVersion || payload.ruleSnapshotHash))
  @IsDefined()
  ruleSnapshotHash?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  timeSlots!: TimeSlotDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LessonRequirementDto)
  lessons!: LessonRequirementDto[];

  @ValidateNested()
  @Type(() => TeacherAvailabilitySetDto)
  @IsOptional()
  teacherAvailability?: TeacherAvailabilitySetDto;

  @IsObject()
  @IsOptional()
  classUnavailableSlotIds?: Record<string, string[]>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoomCapabilityDto)
  @IsOptional()
  rooms?: RoomCapabilityDto[];

  @ValidateNested()
  @Type(() => SolveJobOptionsDto)
  @IsOptional()
  options?: SolveJobOptionsDto;
}
