import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
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
  @Type(() => SolveJobOptionsDto)
  @IsOptional()
  options?: SolveJobOptionsDto;
}
