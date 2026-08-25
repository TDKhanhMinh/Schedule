import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Pool, QueryResultRow } from "pg";
import {
  getEffectiveRules,
  getTeacherLoadRuleSource,
  TEACHER_LOAD_CONTRACT_VERSION,
  TEACHER_NORM_RULE_CODE,
  TEACHER_NORM_WEEKS_RULE_CODE,
  TEACHER_REDUCTION_RULE_PREFIX,
  type RuleDefinition,
  type RuleSetSnapshot,
  type TeacherLoadCalculation,
  type TeacherLoadInput,
  type TeacherLoadReduction,
  type TeacherLoadReport,
  type TeacherSchoolLevel,
} from "../contracts";
import { PG_POOL } from "../database/database.module";

type JsonObject = Record<string, unknown>;

interface AcademicPeriodRow extends QueryResultRow {
  starts_on: string | Date;
  ends_on: string | Date;
}

interface RuleSnapshotRow extends QueryResultRow {
  id: string;
  rule_set_version: string;
  profile_version: string;
  register_version: string;
  source_url: string;
  source_locator: string | null;
  effective_from: string | Date;
  effective_to: string | Date | null;
  scope: JsonObject | string;
  approval_state: RuleSetSnapshot["approvalState"];
  approved_by: string | null;
  approved_at: string | Date | null;
  approval_reason: string | null;
  rules: RuleDefinition[] | string;
  snapshot_hash: string;
  captured_at: string | Date;
  captured_by: string;
}

interface TeacherLoadRow extends QueryResultRow {
  teacher_id: string;
  teacher_code: string;
  teacher_name: string;
  assigned_weekly_sessions: number;
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown, field: string): JsonObject {
  if (!isRecord(value)) {
    throw new BadRequestException({ code: "INVALID_RULE_PARAMETERS", message: `${field} phải là object.` });
  }
  return value;
}

function roundSessions(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

@Injectable()
export class TeacherLoadCalculationService {
  calculate(input: TeacherLoadInput, snapshot: RuleSetSnapshot): TeacherLoadCalculation {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.asOf)) {
      throw new BadRequestException({ code: "INVALID_EFFECTIVE_DATE", message: "asOf phải có dạng YYYY-MM-DD." });
    }
    if (!Number.isInteger(input.assignedWeeklySessions) || input.assignedWeeklySessions < 0) {
      throw new BadRequestException({
        code: "INVALID_ASSIGNED_WEEKLY_SESSIONS",
        message: "assignedWeeklySessions phải là số nguyên không âm.",
      });
    }

    const effectiveRules = getEffectiveRules(snapshot, input.asOf).filter((rule) => this.matchesScope(rule, input));
    const normRule = this.requireRule(effectiveRules, TEACHER_NORM_RULE_CODE);
    const weeksRule = this.requireRule(effectiveRules, TEACHER_NORM_WEEKS_RULE_CODE);
    const normParameters = asRecord(normRule.parameters, `${TEACHER_NORM_RULE_CODE}.parameters`);
    const weeksParameters = asRecord(weeksRule.parameters, `${TEACHER_NORM_WEEKS_RULE_CODE}.parameters`);
    const normsByLevel = asRecord(
      normParameters.weeklyNormBySchoolLevel,
      `${TEACHER_NORM_RULE_CODE}.weeklyNormBySchoolLevel`,
    );
    const weeklyNormSessions = this.requirePositiveNumber(
      normsByLevel[input.schoolLevel] ?? normsByLevel.THCS_THPT,
      `${TEACHER_NORM_RULE_CODE}.weeklyNormBySchoolLevel.${input.schoolLevel}`,
    );
    const teachingWeeksForNorm = this.requirePositiveInteger(
      weeksParameters.teachingWeeksForNorm,
      `${TEACHER_NORM_WEEKS_RULE_CODE}.teachingWeeksForNorm`,
    );

    const reductions = effectiveRules
      .filter(
        (rule) =>
          rule.kind === "HARD" &&
          rule.code.startsWith(TEACHER_REDUCTION_RULE_PREFIX) &&
          rule.scope.actorId === input.teacherId,
      )
      .map((rule) => this.toReduction(rule, snapshot));
    const weeklyReductionSessions = roundSessions(
      reductions.reduce((total, reduction) => total + reduction.reductionSessionsPerWeek, 0),
    );
    const targetAverageWeeklySessions = roundSessions(Math.max(weeklyNormSessions - weeklyReductionSessions, 0));
    const annualNormSessions = roundSessions(weeklyNormSessions * teachingWeeksForNorm);
    const annualReductionSessions = roundSessions(weeklyReductionSessions * teachingWeeksForNorm);
    const annualTargetSessions = roundSessions(targetAverageWeeklySessions * teachingWeeksForNorm);
    const annualAssignedSessions = roundSessions(input.assignedWeeklySessions * teachingWeeksForNorm);
    const weeklyVarianceSessions = roundSessions(input.assignedWeeklySessions - targetAverageWeeklySessions);
    const hardWeeklyLimitSessions = this.optionalNonNegativeNumber(
      normParameters.hardWeeklyLimitSessions,
      `${TEACHER_NORM_RULE_CODE}.hardWeeklyLimitSessions`,
    );
    const warnings: string[] = [];
    if (weeklyReductionSessions > weeklyNormSessions) {
      warnings.push("APPROVED_REDUCTION_EXCEEDS_WEEKLY_NORM");
    }
    if (weeklyVarianceSessions > 0 && hardWeeklyLimitSessions === null) {
      warnings.push("ASSIGNED_LOAD_OVER_AVERAGE_TARGET");
    }
    if (hardWeeklyLimitSessions !== null && input.assignedWeeklySessions > hardWeeklyLimitSessions) {
      warnings.push("ASSIGNED_LOAD_OVER_HARD_WEEKLY_LIMIT");
    }

    return {
      contractVersion: TEACHER_LOAD_CONTRACT_VERSION,
      schoolId: input.schoolId,
      academicPeriodId: input.academicPeriodId,
      teacherId: input.teacherId,
      teacherCode: input.teacherCode,
      teacherName: input.teacherName,
      schoolLevel: input.schoolLevel,
      weeklyNormSessions,
      weeklyReductionSessions,
      targetAverageWeeklySessions,
      assignedAverageWeeklySessions: input.assignedWeeklySessions,
      teachingWeeksForNorm,
      annualNormSessions,
      annualReductionSessions,
      annualTargetSessions,
      annualAssignedSessions,
      weeklyVarianceSessions,
      status: weeklyVarianceSessions < 0 ? "UNDER_TARGET" : weeklyVarianceSessions > 0 ? "OVER_TARGET" : "AT_TARGET",
      enforcement: hardWeeklyLimitSessions === null ? "REPORT_ONLY" : "HARD_CAP",
      hardWeeklyLimitSessions,
      reductions,
      ruleSources: [
        getTeacherLoadRuleSource(snapshot, normRule.code),
        getTeacherLoadRuleSource(snapshot, weeksRule.code),
        ...reductions.map((reduction) => reduction.source),
      ],
      warnings,
    };
  }

  private matchesScope(rule: RuleDefinition, input: TeacherLoadInput) {
    const scope = rule.scope;
    if (scope.schoolId && scope.schoolId !== input.schoolId) return false;
    if (scope.academicPeriodId && scope.academicPeriodId !== input.academicPeriodId) return false;
    if (scope.actorId && scope.actorId !== input.teacherId) return false;
    if (scope.schoolLevel && scope.schoolLevel !== input.schoolLevel && scope.schoolLevel !== "THCS_THPT") return false;
    return true;
  }

  private requireRule(rules: RuleDefinition[], code: string) {
    const rule = rules.find((candidate) => candidate.code === code && candidate.kind === "HARD");
    if (!rule) {
      throw new BadRequestException({
        code: "TEACHER_LOAD_RULE_NOT_EFFECTIVE",
        message: `Rule ${code} không tồn tại, chưa được approve hoặc không có hiệu lực tại ${code}.`,
      });
    }
    return rule;
  }

  private toReduction(rule: RuleDefinition, snapshot: RuleSetSnapshot): TeacherLoadReduction {
    const parameters = asRecord(rule.parameters, `${rule.code}.parameters`);
    const roleCode = parameters.roleCode;
    if (typeof roleCode !== "string" || roleCode.trim() === "") {
      throw new BadRequestException({
        code: "INVALID_TEACHER_REDUCTION_RULE",
        message: `${rule.code} thiếu roleCode.`,
      });
    }
    return {
      code: rule.code,
      roleCode,
      reductionSessionsPerWeek: this.requireNonNegativeNumber(
        parameters.reductionSessionsPerWeek,
        `${rule.code}.reductionSessionsPerWeek`,
      ),
      source: getTeacherLoadRuleSource(snapshot, rule.code),
    };
  }

  private requirePositiveNumber(value: unknown, field: string) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new BadRequestException({ code: "INVALID_RULE_PARAMETERS", message: `${field} phải là số dương.` });
    }
    return value;
  }

  private requirePositiveInteger(value: unknown, field: string) {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      throw new BadRequestException({ code: "INVALID_RULE_PARAMETERS", message: `${field} phải là số nguyên dương.` });
    }
    return value;
  }

  private requireNonNegativeNumber(value: unknown, field: string) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new BadRequestException({ code: "INVALID_RULE_PARAMETERS", message: `${field} phải là số không âm.` });
    }
    return value;
  }

  private optionalNonNegativeNumber(value: unknown, field: string) {
    if (value === undefined || value === null) return null;
    return this.requireNonNegativeNumber(value, field);
  }
}

@Injectable()
export class TeacherLoadService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly calculator: TeacherLoadCalculationService,
  ) {}

  async listTeacherLoads(
    schoolId: string,
    academicPeriodId: string,
    ruleSnapshotId: string,
  ): Promise<TeacherLoadReport> {
    if (!ruleSnapshotId?.trim()) {
      throw new BadRequestException({ code: "RULE_SNAPSHOT_REQUIRED", message: "Cần ruleSnapshotId đã được approve." });
    }
    const periodResult = await this.pool.query<AcademicPeriodRow>(
      `SELECT starts_on::text, ends_on::text
         FROM academic_periods
        WHERE id = $1 AND school_id = $2`,
      [academicPeriodId, schoolId],
    );
    const period = periodResult.rows[0];
    if (!period) {
      throw new NotFoundException({
        code: "ACADEMIC_PERIOD_NOT_FOUND",
        message: "Academic period không tồn tại trong school scope.",
      });
    }
    const snapshotResult = await this.pool.query<RuleSnapshotRow>(
      `SELECT id::text, rule_set_version, profile_version, register_version,
              source_url, source_locator, effective_from::text, effective_to::text,
              scope, approval_state, approved_by, approved_at, approval_reason,
              rules, snapshot_hash, captured_at, captured_by
         FROM rule_set_snapshots
        WHERE id = $1 AND school_id = $2`,
      [ruleSnapshotId, schoolId],
    );
    const snapshotRow = snapshotResult.rows[0];
    if (!snapshotRow) {
      throw new NotFoundException({
        code: "RULE_SNAPSHOT_NOT_FOUND",
        message: "Rule snapshot không tồn tại trong school scope.",
      });
    }
    const snapshot = this.toSnapshot(snapshotRow);
    const teacherResult = await this.pool.query<TeacherLoadRow>(
      `SELECT teacher.id::text AS teacher_id,
              teacher.code AS teacher_code,
              teacher.display_name AS teacher_name,
              COALESCE(SUM(lesson.required_sessions), 0)::int AS assigned_weekly_sessions
         FROM teachers AS teacher
         LEFT JOIN lesson_requirements AS lesson
           ON lesson.teacher_id = teacher.id
          AND lesson.school_id = teacher.school_id
          AND lesson.academic_period_id = $2
          AND lesson.status = 'ACTIVE'
        WHERE teacher.school_id = $1 AND teacher.status = 'ACTIVE'
        GROUP BY teacher.id, teacher.code, teacher.display_name
        ORDER BY teacher.code`,
      [schoolId, academicPeriodId],
    );
    const schoolLevel = this.schoolLevel(snapshot.scope);
    const loads = teacherResult.rows.map((teacher) =>
      this.calculator.calculate(
        {
          schoolId,
          academicPeriodId,
          teacherId: teacher.teacher_id,
          teacherCode: teacher.teacher_code,
          teacherName: teacher.teacher_name,
          schoolLevel,
          assignedWeeklySessions: Number(teacher.assigned_weekly_sessions),
          asOf: this.dateString(period.starts_on),
        },
        snapshot,
      ),
    );
    return {
      contractVersion: TEACHER_LOAD_CONTRACT_VERSION,
      schoolId,
      academicPeriodId,
      effectiveAsOf: this.dateString(period.starts_on),
      ruleSnapshotId: snapshot.snapshotId,
      ruleSetVersion: snapshot.ruleSetVersion,
      ruleSnapshotHash: snapshot.snapshotHash,
      loads,
    };
  }

  private toSnapshot(row: RuleSnapshotRow): RuleSetSnapshot {
    return {
      snapshotId: row.id,
      ruleSetVersion: row.rule_set_version,
      profileVersion: row.profile_version,
      registerVersion: row.register_version,
      sourceUrl: row.source_url,
      ...(row.source_locator ? { sourceLocator: row.source_locator } : {}),
      effectiveFrom: this.dateString(row.effective_from),
      effectiveTo: row.effective_to ? this.dateString(row.effective_to) : null,
      scope: this.parseJson(row.scope),
      approvalState: row.approval_state,
      ...(row.approved_by ? { approvedBy: row.approved_by } : {}),
      ...(row.approved_at ? { approvedAt: this.timestampString(row.approved_at) } : {}),
      ...(row.approval_reason ? { approvalReason: row.approval_reason } : {}),
      rules: this.parseJson(row.rules),
      snapshotHash: row.snapshot_hash.trim(),
      capturedAt: this.timestampString(row.captured_at),
      capturedBy: row.captured_by,
    };
  }

  private schoolLevel(scope: RuleSetSnapshot["scope"]): TeacherSchoolLevel {
    if (scope.schoolLevel === "THCS" || scope.schoolLevel === "THPT" || scope.schoolLevel === "THCS_THPT") {
      return scope.schoolLevel;
    }
    throw new BadRequestException({
      code: "RULE_SCOPE_SCHOOL_LEVEL_REQUIRED",
      message: "Rule snapshot phải chỉ rõ scope.schoolLevel để tính định mức giáo viên.",
    });
  }

  private parseJson<T>(value: T | string): T {
    return typeof value === "string" ? (JSON.parse(value) as T) : value;
  }

  private dateString(value: string | Date) {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  }

  private timestampString(value: string | Date) {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }
}
