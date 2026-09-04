import { Type } from "class-transformer";
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class TeacherAssignmentOptionsDto {
  @IsNumber()
  @Min(0.1)
  @IsOptional()
  timeLimitSeconds?: number | null;
}

export class CreateTeacherAssignmentDemandDto {
  @IsString()
  @IsNotEmpty()
  classId!: string;

  @IsString()
  @IsNotEmpty()
  subjectId!: string;

  @IsInt()
  @Min(1)
  requiredSessions!: number;

  @IsString()
  @IsOptional()
  roomId?: string | null;

  @IsString()
  @IsOptional()
  fixedSlotId?: string | null;

  @IsIn(["LESSON", "FLAG_CEREMONY"])
  @IsOptional()
  activityType?: "LESSON" | "FLAG_CEREMONY";
}

export class UpdateTeacherAssignmentDemandDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  requiredSessions?: number;

  @IsString()
  @IsOptional()
  roomId?: string | null;

  @IsString()
  @IsOptional()
  fixedSlotId?: string | null;
}

export class CreateTeacherAssignmentRunDto {
  @IsInt()
  @IsOptional()
  randomSeed?: number;

  @ValidateNested()
  @Type(() => TeacherAssignmentOptionsDto)
  @IsOptional()
  options?: TeacherAssignmentOptionsDto;
}

export class TeacherAssignmentDecisionDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
