import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

export class CreateSchoolDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  code?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  timezone?: string;
}

export class UpdateSchoolDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  code?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  timezone?: string;
}

export class CreateAcademicPeriodDto {
  @IsString()
  @Matches(/^\d{4}-\d{4}$/)
  academicYear!: string;

  @IsString()
  @Matches(/^[A-Z0-9_-]+$/)
  termCode!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsDateString()
  startsOn!: string;

  @IsDateString()
  endsOn!: string;
}

export class UpdateAcademicPeriodDto {
  @IsString()
  @Matches(/^\d{4}-\d{4}$/)
  @IsOptional()
  academicYear?: string;

  @IsString()
  @Matches(/^[A-Z0-9_-]+$/)
  @IsOptional()
  termCode?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsDateString()
  @IsOptional()
  startsOn?: string;

  @IsDateString()
  @IsOptional()
  endsOn?: string;
}

export class CreateTimeSlotDto {
  @IsInt()
  @Min(1)
  @Max(7)
  day!: number;

  @IsInt()
  @Min(1)
  period!: number;

  @IsString()
  @IsIn(["MORNING", "AFTERNOON"])
  @Matches(/^[A-Z0-9_-]+$/)
  @IsOptional()
  shiftCode?: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @IsOptional()
  startsAt?: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @IsOptional()
  endsAt?: string;
}

export class UpdateTimeSlotDto {
  @IsInt()
  @Min(1)
  @Max(7)
  @IsOptional()
  day?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  period?: number;

  @IsString()
  @IsIn(["MORNING", "AFTERNOON"])
  @Matches(/^[A-Z0-9_-]+$/)
  @IsOptional()
  shiftCode?: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @IsOptional()
  startsAt?: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  @IsOptional()
  endsAt?: string;
}

export class GradeShiftConfigDto {
  @IsInt()
  @Min(6)
  @Max(12)
  grade!: number;

  @IsIn(["MORNING", "AFTERNOON"])
  mainShiftCode!: "MORNING" | "AFTERNOON";

  @IsIn(["MORNING", "AFTERNOON"])
  secondaryShiftCode!: "MORNING" | "AFTERNOON";

  @IsBoolean()
  @IsOptional()
  allowSecondary?: boolean;
}

export class UpsertGradeShiftConfigsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GradeShiftConfigDto)
  configs!: GradeShiftConfigDto[];
}

export class CreateTeacherDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  code?: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;
}

export class UpdateTeacherDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  code?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  displayName?: string;
}

export class CreateClassDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  code?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(6)
  @Max(12)
  @IsOptional()
  grade?: number;
}

export class UpdateClassDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  code?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsInt()
  @Min(6)
  @Max(12)
  @IsOptional()
  grade?: number;
}

export class AssignHomeroomTeacherDto {
  @IsString()
  @IsNotEmpty()
  teacherId!: string;

  @IsInt()
  @Min(0)
  @Max(10)
  @IsOptional()
  weeklyReductionPeriods?: number;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  ruleCode?: string;
}

export class AssignTeacherSubjectGradeDto {
  @IsString()
  @IsNotEmpty()
  teacherId!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsInt()
  @Min(6)
  @Max(12)
  grade!: number;
}

export class CreateSubjectDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  code?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class UpdateSubjectDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  code?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;
}

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  roomType?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  capacity?: number;
}

export class UpdateRoomDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  code?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  roomType?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  capacity?: number;
}

export class CreateLessonRequirementDto {
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsString()
  @IsNotEmpty()
  teacherId!: string;

  @IsString()
  @IsOptional()
  roomId?: string;

  @IsInt()
  @Min(1)
  requiredSessions!: number;

  @IsString()
  @IsOptional()
  fixedSlotId?: string;

  @IsIn(["LESSON", "FLAG_CEREMONY"])
  @IsOptional()
  activityType?: "LESSON" | "FLAG_CEREMONY";
}

export class UpdateLessonRequirementDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  classId?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  subjectId?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  teacherId?: string;

  @IsString()
  @IsOptional()
  roomId?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  requiredSessions?: number;

  @IsString()
  @IsOptional()
  fixedSlotId?: string;

  @IsIn(["LESSON", "FLAG_CEREMONY"])
  @IsOptional()
  activityType?: "LESSON" | "FLAG_CEREMONY";
}

export type LifecycleStatus = "ACTIVE" | "ARCHIVED";

export const ACADEMIC_PERIOD_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type AcademicPeriodStatus = (typeof ACADEMIC_PERIOD_STATUSES)[number];

export function isAcademicPeriodStatus(value: string): value is AcademicPeriodStatus {
  return (ACADEMIC_PERIOD_STATUSES as readonly string[]).includes(value);
}

export const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";
