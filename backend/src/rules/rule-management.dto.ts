import { IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, Matches, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class RuleScopeDto {
  @IsString()
  @IsOptional()
  schoolId?: string;

  @IsString()
  @IsOptional()
  academicPeriodId?: string;

  @IsIn(["THCS", "THPT", "THCS_THPT"])
  @IsOptional()
  schoolLevel?: "THCS" | "THPT" | "THCS_THPT";

  @IsIn(["SYSTEM", "SCHOOL", "TEACHER"])
  @IsOptional()
  actorType?: "SYSTEM" | "SCHOOL" | "TEACHER";

  @IsString()
  @IsOptional()
  actorId?: string;

  @IsIn(["SCHOOL", "TEACHER", "CLASS", "SUBJECT", "ROOM"])
  @IsOptional()
  resourceType?: "SCHOOL" | "TEACHER" | "CLASS" | "SUBJECT" | "ROOM";

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  resourceIds?: string[];
}

export class CreateRuleProfileDto {
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/)
  version!: string;

  @IsString()
  name!: string;

  @IsString()
  sourceUrl!: string;

  @IsString()
  @IsOptional()
  sourceLocator?: string;

  @IsString()
  @Matches(DATE_PATTERN)
  effectiveFrom!: string;

  @IsString()
  @Matches(DATE_PATTERN)
  @IsOptional()
  effectiveTo?: string | null;

  @IsString()
  @IsOptional()
  registerVersion?: string;

  @ValidateNested()
  @Type(() => RuleScopeDto)
  @IsOptional()
  scope?: RuleScopeDto;
}

export class UpdateRuleProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  sourceUrl?: string;

  @IsString()
  @IsOptional()
  sourceLocator?: string;

  @IsString()
  @Matches(DATE_PATTERN)
  @IsOptional()
  effectiveFrom?: string;

  @IsString()
  @Matches(DATE_PATTERN)
  @IsOptional()
  effectiveTo?: string | null;

  @ValidateNested()
  @Type(() => RuleScopeDto)
  @IsOptional()
  scope?: RuleScopeDto;
}

export class CreateRuleDefinitionDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_.-]+$/)
  code!: string;

  @IsIn(["HARD", "SOFT"])
  kind!: "HARD" | "SOFT";

  @IsNumber()
  @Min(0)
  @IsOptional()
  weight?: number | null;

  @IsString()
  sourceUrl!: string;

  @IsString()
  @IsOptional()
  sourceLocator?: string;

  @IsString()
  @Matches(DATE_PATTERN)
  effectiveFrom!: string;

  @IsString()
  @Matches(DATE_PATTERN)
  @IsOptional()
  effectiveTo?: string | null;

  @ValidateNested()
  @Type(() => RuleScopeDto)
  scope!: RuleScopeDto;

  @IsObject()
  parameters!: Record<string, unknown>;
}

export class UpdateRuleDefinitionDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_.-]+$/)
  @IsOptional()
  code?: string;

  @IsIn(["HARD", "SOFT"])
  @IsOptional()
  kind?: "HARD" | "SOFT";

  @IsNumber()
  @Min(0)
  @IsOptional()
  weight?: number | null;

  @IsString()
  @IsOptional()
  sourceUrl?: string;

  @IsString()
  @IsOptional()
  sourceLocator?: string;

  @IsString()
  @Matches(DATE_PATTERN)
  @IsOptional()
  effectiveFrom?: string;

  @IsString()
  @Matches(DATE_PATTERN)
  @IsOptional()
  effectiveTo?: string | null;

  @ValidateNested()
  @Type(() => RuleScopeDto)
  @IsOptional()
  scope?: RuleScopeDto;

  @IsObject()
  @IsOptional()
  parameters?: Record<string, unknown>;
}

export class ApproveRuleSnapshotDto {
  @IsString()
  @IsOptional()
  approvalReason?: string;
}

export class ResolveRuleSnapshotQueryDto {
  @IsString()
  @Matches(DATE_PATTERN)
  @IsOptional()
  asOf?: string;
}
