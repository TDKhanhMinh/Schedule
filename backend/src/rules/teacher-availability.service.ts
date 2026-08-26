import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Pool, QueryResultRow } from "pg";
import {
  getEffectiveRules,
  TEACHER_AVAILABILITY_CONTRACT_VERSION,
  TEACHER_AVAILABILITY_RULE_PREFIX,
  type RuleDefinition,
  type RuleSetSnapshot,
  type TeacherAvailabilityRule,
  type TeacherAvailabilitySet,
} from "../contracts";
import { PG_POOL } from "../database/database.module";

type JsonObject = Record<string, unknown>;

interface AcademicPeriodRow extends QueryResultRow {
  starts_on: string | Date;
}

interface TimeSlotRow extends QueryResultRow {
  id: string;
  day: number;
  period: number;
  shift_code: string | null;
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

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown, field: string): JsonObject {
  if (!isRecord(value)) {
    throw new BadRequestException({ code: "INVALID_AVAILABILITY_PARAMETERS", message: `${field} phải là object.` });
  }
  return value;
}

@Injectable()
export class TeacherAvailabilityCalculationService {
  calculate(
    input: {
      schoolId: string;
      academicPeriodId: string;
      effectiveAsOf: string;
      teacherId?: string;
    },
    snapshot: RuleSetSnapshot,
    slots: TimeSlotRow[],
  ): TeacherAvailabilitySet {
    if (snapshot.approvalState !== "APPROVED") {
      throw new BadRequestException({
        code: "RULE_SNAPSHOT_NOT_APPROVED",
        message: "Tình trạng sẵn sàng chỉ được đọc từ bản chụp quy tắc đã được phê duyệt.",
      });
    }

    const rules = getEffectiveRules(snapshot, input.effectiveAsOf)
      .filter((rule) => rule.code.startsWith(TEACHER_AVAILABILITY_RULE_PREFIX))
      .filter((rule) => this.matchesScope(rule, input))
      .map((rule) => this.toAvailabilityRule(rule, snapshot, slots));

    return {
      contractVersion: TEACHER_AVAILABILITY_CONTRACT_VERSION,
      schoolId: input.schoolId,
      academicPeriodId: input.academicPeriodId,
      effectiveAsOf: input.effectiveAsOf,
      ruleSnapshotId: snapshot.snapshotId,
      ruleSetVersion: snapshot.ruleSetVersion,
      ruleSnapshotHash: snapshot.snapshotHash,
      rules,
    };
  }

  private matchesScope(
    rule: RuleDefinition,
    input: { schoolId: string; academicPeriodId: string; teacherId?: string },
  ) {
    const scope = rule.scope;
    if (scope.schoolId && scope.schoolId !== input.schoolId) return false;
    if (scope.academicPeriodId && scope.academicPeriodId !== input.academicPeriodId) return false;
    if (scope.actorType && scope.actorType !== "TEACHER") return false;
    if (!scope.actorId) {
      throw new BadRequestException({
        code: "AVAILABILITY_TEACHER_SCOPE_REQUIRED",
        message: `${rule.code} phải giới hạn phạm vi theo teacherId/actorId.`,
      });
    }
    return !input.teacherId || scope.actorId === input.teacherId;
  }

  private toAvailabilityRule(
    rule: RuleDefinition,
    snapshot: RuleSetSnapshot,
    slots: TimeSlotRow[],
  ): TeacherAvailabilityRule {
    const parameters = asRecord(rule.parameters, `${rule.code}.parameters`);
    const teacherId = rule.scope.actorId;
    if (!teacherId) {
      throw new BadRequestException({
        code: "AVAILABILITY_TEACHER_REQUIRED",
        message: `${rule.code} thiếu teacherId.`,
      });
    }

    const dayOfWeek = this.requiredInteger(parameters.dayOfWeek ?? parameters.day, `${rule.code}.dayOfWeek`, 1, 7);
    const shiftCode = this.optionalString(parameters.shiftCode);
    const period = this.optionalInteger(parameters.period, `${rule.code}.period`, 1);
    const slotId = this.optionalString(parameters.slotId);
    const blockedSlotIds = slots
      .filter((slot) => (slotId ? slot.id === slotId : this.matchesSlot(slot, dayOfWeek, shiftCode, period)))
      .map((slot) => slot.id);

    if (slotId && blockedSlotIds.length === 0) {
      throw new BadRequestException({
        code: "AVAILABILITY_SLOT_NOT_FOUND",
        message: `${rule.code} tham chiếu khung tiết không tồn tại trong khung năm học.`,
      });
    }

    const strength = this.strength(rule, parameters);
    const weight = strength === "HARD_UNAVAILABLE" ? null : this.requiredWeight(rule.weight, rule.code);
    return {
      ruleId: rule.code,
      code: rule.code,
      teacherId,
      strength,
      weight,
      dayOfWeek,
      ...(shiftCode ? { shiftCode } : {}),
      ...(period ? { period } : {}),
      blockedSlotIds,
      effectiveFrom: rule.effectiveFrom,
      ...(rule.effectiveTo ? { effectiveTo: rule.effectiveTo } : {}),
      ...(typeof parameters.reason === "string" && parameters.reason.trim()
        ? { reason: parameters.reason.trim() }
        : {}),
      source: {
        sourceUrl: rule.sourceUrl,
        ...(rule.sourceLocator ? { sourceLocator: rule.sourceLocator } : {}),
        ruleSnapshotId: snapshot.snapshotId,
        ruleSetVersion: snapshot.ruleSetVersion,
        ruleSnapshotHash: snapshot.snapshotHash,
      },
    };
  }

  private strength(rule: RuleDefinition, parameters: JsonObject) {
    if (rule.kind === "HARD") {
      if (parameters.constraintType !== "UNAVAILABLE" && parameters.availabilityType !== "UNAVAILABLE") {
        throw new BadRequestException({
          code: "INVALID_HARD_AVAILABILITY_RULE",
          message: `${rule.code} phải khai báo constraintType=UNAVAILABLE.`,
        });
      }
      return "HARD_UNAVAILABLE" as const;
    }

    const level = parameters.preferenceLevel ?? parameters.strength ?? "SOFT";
    if (level !== "STRONG" && level !== "SOFT") {
      throw new BadRequestException({
        code: "INVALID_SOFT_AVAILABILITY_RULE",
        message: `${rule.code}.preferenceLevel phải là STRONG hoặc SOFT.`,
      });
    }
    return level === "STRONG" ? ("STRONG_PREFERENCE" as const) : ("SOFT_WISH" as const);
  }

  private matchesSlot(slot: TimeSlotRow, dayOfWeek: number, shiftCode?: string, period?: number) {
    return (
      slot.day === dayOfWeek && (!shiftCode || slot.shift_code === shiftCode) && (!period || slot.period === period)
    );
  }

  private requiredWeight(weight: number | null, code: string) {
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      throw new BadRequestException({ code: "INVALID_AVAILABILITY_WEIGHT", message: `${code} thiếu weight hợp lệ.` });
    }
    return weight;
  }

  private requiredInteger(value: unknown, field: string, min: number, max?: number) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || (max !== undefined && value > max)) {
      throw new BadRequestException({ code: "INVALID_AVAILABILITY_PARAMETERS", message: `${field} không hợp lệ.` });
    }
    return value;
  }

  private optionalInteger(value: unknown, field: string, min: number) {
    if (value === undefined || value === null) return undefined;
    return this.requiredInteger(value, field, min);
  }

  private optionalString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
}

@Injectable()
export class TeacherAvailabilityService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly calculator: TeacherAvailabilityCalculationService,
  ) {}

  async listTeacherAvailability(
    schoolId: string,
    academicPeriodId: string,
    ruleSnapshotId: string,
    teacherId?: string,
  ): Promise<TeacherAvailabilitySet> {
    if (!ruleSnapshotId?.trim()) {
      throw new BadRequestException({
        code: "RULE_SNAPSHOT_REQUIRED",
        message: "Cần ruleSnapshotId đã được phê duyệt.",
      });
    }
    const periodResult = await this.pool.query<AcademicPeriodRow>(
      `SELECT starts_on::text
         FROM academic_periods
        WHERE id = $1 AND school_id = $2`,
      [academicPeriodId, schoolId],
    );
    const period = periodResult.rows[0];
    if (!period) {
      throw new NotFoundException({
        code: "ACADEMIC_PERIOD_NOT_FOUND",
        message: "Khung năm học không tồn tại trong phạm vi trường.",
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
        message: "Bản chụp quy tắc không tồn tại trong phạm vi trường.",
      });
    }
    const slotsResult = await this.pool.query<TimeSlotRow>(
      `SELECT id::text, day, period, shift_code
         FROM time_slots
        WHERE school_id = $1 AND academic_period_id = $2
        ORDER BY day, period, id`,
      [schoolId, academicPeriodId],
    );
    return this.calculator.calculate(
      {
        schoolId,
        academicPeriodId,
        effectiveAsOf: this.dateString(period.starts_on),
        ...(teacherId ? { teacherId } : {}),
      },
      this.toSnapshot(snapshotRow),
      slotsResult.rows,
    );
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
