import { Type } from "class-transformer";
import { IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
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
  @IsNotEmpty()
  schemaVersion!: "1.0";

  @IsString()
  @IsNotEmpty()
  jobId!: string;

  @IsString()
  @IsNotEmpty()
  schoolId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  timeSlots!: TimeSlotDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LessonRequirementDto)
  lessons!: LessonRequirementDto[];

  @ValidateNested()
  @Type(() => SolveJobOptionsDto)
  @IsOptional()
  options?: SolveJobOptionsDto;
}

