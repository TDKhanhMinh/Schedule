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
  Max,
  MaxLength,
  Matches,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import type { ClassShiftPolicy, RuleScope, SolveJobRequest } from "../contracts";

export class CancelOptimizationJobDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}

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

export class TeacherSubjectGradeAssignmentDto {
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

export class SolverObjectiveWeightsDto {
  @IsNumber()
  @Min(0)
  teacherGap!: number;

  @IsNumber()
  @Min(0)
  compactness!: number;

  @IsNumber()
  @Min(0)
  dayDistribution!: number;

  @IsNumber()
  @Min(0)
  undesirableSlots!: number;

  @IsNumber()
  @Min(0)
  preferredDays!: number;

  @IsNumber()
  @Min(0)
  fairness!: number;
}

export class SolverObjectiveDto {
  @IsString()
  @IsIn(["SOLVER-OBJECTIVE-1.0.0"])
  contractVersion!: "SOLVER-OBJECTIVE-1.0.0";

  @ValidateNested()
  @Type(() => SolverObjectiveWeightsDto)
  weights!: SolverObjectiveWeightsDto;
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

export class SolveRuleDefinitionDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_.-]+$/)
  code!: string;

  @IsIn(["HARD", "SOFT"])
  kind!: "HARD" | "SOFT";

  @IsNumber()
  @Min(0)
  @IsOptional()
  weight!: number | null;

  @IsString()
  @IsNotEmpty()
  sourceUrl!: string;

  @IsString()
  @IsOptional()
  sourceLocator?: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsOptional()
  effectiveTo?: string | null;

  @IsObject()
  scope!: RuleScope;

  @IsIn(["PENDING_STAKEHOLDER", "APPROVED", "REVOKED"])
  approvalState!: "PENDING_STAKEHOLDER" | "APPROVED" | "REVOKED";

  @IsString()
  @IsOptional()
  approvedBy?: string;

  @IsString()
  @IsOptional()
  approvedAt?: string;

  @IsString()
  @IsOptional()
  approvalReason?: string;

  @IsObject()
  parameters!: Record<string, unknown>;
}

export class SolveJobOptionsDto {
  @IsNumber()
  @Min(0.1)
  @IsOptional()
  timeLimitSeconds?: number;
}

export class LocalRepairAssignmentDto {
  @IsString()
  @IsNotEmpty()
  lessonId!: string;

  @IsInt()
  @Min(0)
  sessionIndex!: number;

  @IsString()
  @IsNotEmpty()
  slotId!: string;

  @IsString()
  @IsOptional()
  roomId?: string | null;
}

export class LocalRepairDto {
  @IsString()
  @IsIn(["LOCAL-REPAIR-1.0.0"])
  contractVersion!: "LOCAL-REPAIR-1.0.0";

  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  baselineSnapshotHash!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocalRepairAssignmentDto)
  baselineAssignments!: LocalRepairAssignmentDto[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  affectedAssignmentKeys!: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  frozenAssignmentKeys?: string[];
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
  @IsOptional()
  academicPeriodId?: string;

  @IsString()
  @IsOptional()
  templateVersion?: string;

  @IsInt()
  @IsOptional()
  randomSeed?: number;

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SolveRuleDefinitionDto)
  @IsOptional()
  ruleDefinitions?: SolveRuleDefinitionDto[];

  @IsObject()
  @IsOptional()
  classUnavailableSlotIds?: Record<string, string[]>;

  @IsObject()
  @IsOptional()
  classGrades?: Record<string, number>;

  @IsObject()
  @IsOptional()
  classShiftPolicies?: Record<string, ClassShiftPolicy>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeacherSubjectGradeAssignmentDto)
  @IsOptional()
  teacherSubjectGradeAssignments?: TeacherSubjectGradeAssignmentDto[];

  @IsIn(["OFF", "WARNING", "HARD"])
  @IsOptional()
  teacherSubjectGradeEnforcement?: "OFF" | "WARNING" | "HARD";

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoomCapabilityDto)
  @IsOptional()
  rooms?: RoomCapabilityDto[];

  @ValidateNested()
  @Type(() => SolveJobOptionsDto)
  @IsOptional()
  options?: SolveJobOptionsDto;

  @ValidateNested()
  @Type(() => SolverObjectiveDto)
  @IsOptional()
  objective?: SolverObjectiveDto;

  @ValidateNested()
  @Type(() => LocalRepairDto)
  @IsOptional()
  localRepair?: LocalRepairDto;
}
