import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import {
  RULE_SET_VERSION,
  computeRuleSetSnapshotHash,
  ruleDefinitionIdentity,
  type RuleDefinition,
  type RuleScope,
  type RuleSetSnapshot,
  type TeacherAvailabilitySet,
} from "../contracts";
import {
  RULE_CATALOG,
  RULE_CATALOG_SCHEMA_VERSION,
  RULE_CATALOG_VERSION,
  findRuleCatalogEntry,
  isRuleCodeSupported,
  type RuleCatalogEntry,
} from "../contracts/rule-catalog";
import { AuditLogService } from "../auth/audit-log.service";
import type { Role } from "../auth/auth.constants";
import { PG_POOL } from "../database/database.module";
import { TeacherAvailabilityCalculationService } from "./teacher-availability.service";
import type {
  ApproveRuleSnapshotDto,
  CreateRuleDefinitionDto,
  CreateRuleProfileDto,
  RuleScopeDto,
  UpdateRuleDefinitionDto,
  UpdateRuleProfileDto,
} from "./rule-management.dto";

type JsonObject = Record<string, unknown>;
type RuleStatus = "DRAFT" | "ACTIVE" | "RETIRED";
type ApprovalState = "PENDING_STAKEHOLDER" | "APPROVED" | "REVOKED";

interface RuleProfileRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  school_id: string;
  academic_period_id: string;
  version: string;
  name: string;
  status: RuleStatus;
  register_version: string;
  source_url: string | null;
  source_locator: string | null;
  effective_from: string | Date | null;
  effective_to: string | Date | null;
  scope: JsonObject | string;
  approval_state: ApprovalState;
  approved_by: string | null;
  approved_at: string | Date | null;
  approval_reason: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface RuleDefinitionRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  rule_profile_id: string;
  code: string;
  kind: "HARD" | "SOFT";
  weight: number | null;
  source_url: string;
  source_locator: string | null;
  effective_from: string | Date;
  effective_to: string | Date | null;
  scope: JsonObject | string;
  approval_state: ApprovalState;
  approved_by: string | null;
  approved_at: string | Date | null;
  approval_reason: string | null;
  parameters: JsonObject | string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface RuleSnapshotRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  school_id: string;
  rule_profile_id: string;
  rule_set_version: string;
  profile_version: string;
  register_version: string;
  source_url: string;
  source_locator: string | null;
  effective_from: string | Date;
  effective_to: string | Date | null;
  scope: JsonObject | string;
  approval_state: ApprovalState;
  approved_by: string | null;
  approved_at: string | Date | null;
  approval_reason: string | null;
  rules: RuleDefinition[] | string;
  snapshot_hash: string;
  captured_at: string | Date;
  captured_by: string;
}

export interface RuleIssue {
  code: string;
  severity: "ERROR" | "WARNING";
  ruleId?: string;
  ruleCode?: string;
  message: string;
}

interface RuleCandidate {
  code: string;
  kind: "HARD" | "SOFT";
  weight: number | null;
  sourceUrl: string;
  sourceLocator?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  scope: RuleScope;
  parameters: JsonObject;
}

export type RuleSolveResolution =
  | {
      resolved: true;
      schoolId: string;
      academicPeriodId: string;
      effectiveAsOf: string;
      snapshot: RuleSetSnapshot;
      ruleDefinitions: RuleDefinition[];
      teacherAvailability?: TeacherAvailabilitySet;
      appliedRuleCount: number;
      appliedRuleCodes: string[];
    }
  | {
      resolved: false;
      schoolId: string;
      academicPeriodId: string;
      effectiveAsOf: string;
      reason: string;
    };

const RULE_REGISTER_VERSION = "RULE-REGISTER-0.1.0";

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJson<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

@Injectable()
export class RuleManagementService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly auditLogs: AuditLogService,
    @Optional() private readonly availabilityCalculator?: TeacherAvailabilityCalculationService,
  ) {}

  getCatalog() {
    return {
      catalogVersion: RULE_CATALOG_VERSION,
      schemaVersion: RULE_CATALOG_SCHEMA_VERSION,
      ruleTypes: RULE_CATALOG.ruleTypes,
    };
  }

  async listProfiles(schoolId: string, academicPeriodId: string) {
    await this.ensureAcademicPeriod(schoolId, academicPeriodId);
    const profiles = await this.pool.query<RuleProfileRow>(
      this.profileSelect() +
        " WHERE profile.school_id = $1 AND profile.academic_period_id = $2 AND profile.status <> 'RETIRED' ORDER BY profile.version",
      [schoolId, academicPeriodId],
    );
    const rules = await this.pool.query<RuleDefinitionRow>(
      this.ruleSelect() +
        " WHERE profile.school_id = $1 AND profile.academic_period_id = $2 AND profile.status <> 'RETIRED' ORDER BY rule.code",
      [schoolId, academicPeriodId],
    );
    return this.mapProfiles(profiles.rows, rules.rows);
  }

  async getProfile(schoolId: string, profileId: string) {
    const profile = await this.getProfileRow(schoolId, profileId);
    const rules = await this.pool.query<RuleDefinitionRow>(
      this.ruleSelect() + " WHERE rule.rule_profile_id = $1 AND rule.tenant_id = $2 ORDER BY rule.code",
      [profileId, profile.tenant_id],
    );
    return this.toProfile(profile, rules.rows);
  }

  async createProfile(schoolId: string, academicPeriodId: string, dto: CreateRuleProfileDto) {
    await this.ensureAcademicPeriod(schoolId, academicPeriodId);
    this.validateDateRange(dto.effectiveFrom, dto.effectiveTo);
    const scope = this.normalizeScope(dto.scope, schoolId, academicPeriodId);
    try {
      const result = await this.pool.query<RuleProfileRow>(
        `INSERT INTO rule_profiles
           (tenant_id, school_id, academic_period_id, version, name, status,
            register_version, source_url, source_locator, effective_from, effective_to,
            scope, approval_state)
         SELECT tenant_id, $1, $2, $3, $4, 'DRAFT', $5, $6, $7, $8, $9, $10::jsonb,
                'PENDING_STAKEHOLDER'
           FROM academic_periods
          WHERE school_id = $1 AND id = $2
         RETURNING id::text, tenant_id::text, school_id::text, academic_period_id::text,
                   version, name, status, register_version, source_url, source_locator,
                   effective_from::text, effective_to::text, scope, approval_state,
                   approved_by, approved_at, approval_reason, created_at, updated_at`,
        [
          schoolId,
          academicPeriodId,
          this.requiredText(dto.version, "version"),
          this.requiredText(dto.name, "name"),
          this.optionalText(dto.registerVersion) ?? RULE_REGISTER_VERSION,
          this.requiredText(dto.sourceUrl, "sourceUrl"),
          this.optionalText(dto.sourceLocator),
          dto.effectiveFrom,
          dto.effectiveTo ?? null,
          JSON.stringify(scope),
        ],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException("Không thể tạo rule profile trong school scope.");
      return this.toProfile(row, []);
    } catch (error) {
      throw this.translateDatabaseError(error, "Rule profile đã tồn tại trong kỳ học.");
    }
  }

  async updateProfile(schoolId: string, profileId: string, dto: UpdateRuleProfileDto) {
    const current = await this.getProfileRow(schoolId, profileId);
    this.ensureDraftProfile(current);
    const effectiveFrom = dto.effectiveFrom ?? this.dateString(current.effective_from) ?? "";
    const effectiveTo = dto.effectiveTo === undefined ? this.dateString(current.effective_to) : dto.effectiveTo;
    this.validateDateRange(effectiveFrom, effectiveTo);
    if (
      dto.name === undefined &&
      dto.sourceUrl === undefined &&
      dto.sourceLocator === undefined &&
      dto.effectiveFrom === undefined &&
      dto.effectiveTo === undefined &&
      dto.scope === undefined
    ) {
      throw new BadRequestException({
        code: "NO_FIELDS_TO_UPDATE",
        message: "Không có trường hợp lệ để cập nhật rule profile.",
      });
    }
    const scope = dto.scope
      ? this.normalizeScope(dto.scope, schoolId, current.academic_period_id)
      : parseJson<RuleScope>(current.scope);
    try {
      const result = await this.pool.query<RuleProfileRow>(
        `UPDATE rule_profiles
            SET name = $1,
                source_url = $2,
                source_locator = $3,
                effective_from = $4,
                effective_to = $5,
                scope = $6::jsonb,
                approval_state = 'PENDING_STAKEHOLDER',
                approved_by = NULL,
                approved_at = NULL,
                approval_reason = NULL,
                updated_at = now()
          WHERE id = $7 AND school_id = $8 AND status = 'DRAFT'
        RETURNING id::text, tenant_id::text, school_id::text, academic_period_id::text,
                  version, name, status, register_version, source_url, source_locator,
                  effective_from::text, effective_to::text, scope, approval_state,
                  approved_by, approved_at, approval_reason, created_at, updated_at`,
        [
          dto.name === undefined ? current.name : this.requiredText(dto.name, "name"),
          dto.sourceUrl === undefined ? current.source_url : this.requiredText(dto.sourceUrl, "sourceUrl"),
          dto.sourceLocator === undefined ? current.source_locator : this.optionalText(dto.sourceLocator),
          effectiveFrom,
          effectiveTo ?? null,
          JSON.stringify(scope),
          profileId,
          schoolId,
        ],
      );
      const row = result.rows[0];
      if (!row) throw new NotFoundException("Rule profile không tồn tại hoặc không còn ở trạng thái DRAFT.");
      const rules = await this.pool.query<RuleDefinitionRow>(
        this.ruleSelect() + " WHERE rule.rule_profile_id = $1 AND rule.tenant_id = $2 ORDER BY rule.code",
        [profileId, current.tenant_id],
      );
      return this.toProfile(row, rules.rows);
    } catch (error) {
      throw this.translateDatabaseError(error, "Không thể cập nhật rule profile.");
    }
  }

  async createRule(schoolId: string, profileId: string, dto: CreateRuleDefinitionDto) {
    const profile = await this.getProfileRow(schoolId, profileId);
    this.ensureDraftProfile(profile);
    const candidate = this.candidateFromCreate(dto, schoolId, profile.academic_period_id);
    this.validateRuleCandidate(candidate);
    try {
      const result = await this.pool.query<RuleDefinitionRow>(
        `INSERT INTO rule_definitions
           (tenant_id, rule_profile_id, code, kind, weight, source_url, source_locator,
            effective_from, effective_to, scope, approval_state, parameters)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'PENDING_STAKEHOLDER', $11::jsonb)
         RETURNING id::text, tenant_id::text, rule_profile_id::text, code, kind, weight,
                   source_url, source_locator, effective_from::text, effective_to::text,
                   scope, approval_state, approved_by, approved_at, approval_reason,
                   parameters, created_at, updated_at`,
        [
          profile.tenant_id,
          profileId,
          candidate.code,
          candidate.kind,
          candidate.weight,
          candidate.sourceUrl,
          candidate.sourceLocator ?? null,
          candidate.effectiveFrom,
          candidate.effectiveTo ?? null,
          JSON.stringify(candidate.scope),
          JSON.stringify(candidate.parameters),
        ],
      );
      return this.toRule(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Rule có cùng mã đã tồn tại trong profile.");
    }
  }

  async updateRule(schoolId: string, profileId: string, ruleId: string, dto: UpdateRuleDefinitionDto) {
    const profile = await this.getProfileRow(schoolId, profileId);
    this.ensureDraftProfile(profile);
    const current = await this.getRuleRow(schoolId, profileId, ruleId);
    const candidate: RuleCandidate = {
      code: dto.code ?? current.code,
      kind: dto.kind ?? current.kind,
      weight: dto.weight === undefined ? current.weight : dto.weight,
      sourceUrl: dto.sourceUrl === undefined ? (current.source_url ?? "") : dto.sourceUrl,
      sourceLocator: dto.sourceLocator === undefined ? (current.source_locator ?? undefined) : dto.sourceLocator,
      effectiveFrom: dto.effectiveFrom ?? this.dateString(current.effective_from) ?? "",
      effectiveTo: dto.effectiveTo === undefined ? this.dateString(current.effective_to) : dto.effectiveTo,
      scope: dto.scope
        ? this.normalizeScope(dto.scope, schoolId, profile.academic_period_id)
        : parseJson<RuleScope>(current.scope),
      parameters: dto.parameters ?? parseJson<JsonObject>(current.parameters),
    };
    this.validateRuleCandidate(candidate);
    try {
      const result = await this.pool.query<RuleDefinitionRow>(
        `UPDATE rule_definitions
            SET code = $1, kind = $2, weight = $3, source_url = $4, source_locator = $5,
                effective_from = $6, effective_to = $7, scope = $8::jsonb,
                parameters = $9::jsonb, approval_state = 'PENDING_STAKEHOLDER',
                approved_by = NULL, approved_at = NULL, approval_reason = NULL, updated_at = now()
          WHERE id = $10 AND rule_profile_id = $11 AND tenant_id = $12
        RETURNING id::text, tenant_id::text, rule_profile_id::text, code, kind, weight,
                  source_url, source_locator, effective_from::text, effective_to::text,
                  scope, approval_state, approved_by, approved_at, approval_reason,
                  parameters, created_at, updated_at`,
        [
          candidate.code,
          candidate.kind,
          candidate.weight,
          candidate.sourceUrl,
          candidate.sourceLocator ?? null,
          candidate.effectiveFrom,
          candidate.effectiveTo ?? null,
          JSON.stringify(candidate.scope),
          JSON.stringify(candidate.parameters),
          ruleId,
          profileId,
          profile.tenant_id,
        ],
      );
      if (!result.rows[0]) throw new NotFoundException("Rule không tồn tại trong rule profile.");
      return this.toRule(result.rows[0]);
    } catch (error) {
      throw this.translateDatabaseError(error, "Rule có cùng mã đã tồn tại trong profile.");
    }
  }

  async deleteRule(schoolId: string, profileId: string, ruleId: string) {
    const profile = await this.getProfileRow(schoolId, profileId);
    this.ensureDraftProfile(profile);
    const result = await this.pool.query<{ id: string }>(
      `DELETE FROM rule_definitions
        WHERE id = $1 AND rule_profile_id = $2 AND tenant_id = $3
      RETURNING id::text`,
      [ruleId, profileId, profile.tenant_id],
    );
    if (!result.rows[0]) throw new NotFoundException("Rule không tồn tại trong rule profile.");
    return { id: result.rows[0].id, deleted: true };
  }

  async validateProfile(schoolId: string, profileId: string) {
    const profile = await this.getProfileRow(schoolId, profileId);
    const rules = await this.listRuleRows(schoolId, profileId, profile.tenant_id);
    const issues: RuleIssue[] = [];
    if (rules.length === 0) {
      issues.push({ code: "RULE_PROFILE_EMPTY", severity: "ERROR", message: "Rule profile phải có ít nhất một rule." });
    }
    const seenRuleIdentities = new Set<string>();
    for (const rule of rules) {
      const identity = ruleDefinitionIdentity({ code: rule.code, scope: parseJson<RuleScope>(rule.scope) });
      if (seenRuleIdentities.has(identity)) {
        issues.push({
          code: "DUPLICATE_RULE_CODE",
          severity: "ERROR",
          ruleId: rule.id,
          ruleCode: rule.code,
          message: `Mã rule ${rule.code} bị lặp trong profile.`,
        });
      }
      seenRuleIdentities.add(identity);
      try {
        const candidate = this.candidateFromRow(rule);
        this.validateRuleCandidate(candidate);
        if (!isRuleCodeSupported(rule.code)) {
          issues.push({
            code: "RULE_NOT_SUPPORTED",
            severity: "ERROR",
            ruleId: rule.id,
            ruleCode: rule.code,
            message: `Rule ${rule.code} đã đăng ký nhưng chưa có compiler được hỗ trợ.`,
          });
        }
      } catch (error) {
        issues.push({
          code: this.errorCode(error, "INVALID_RULE"),
          severity: "ERROR",
          ruleId: rule.id,
          ruleCode: rule.code,
          message: this.errorMessage(error),
        });
      }
    }
    const hardCount = rules.filter((rule) => rule.kind === "HARD").length;
    const softCount = rules.length - hardCount;
    return {
      profileId,
      profileVersion: profile.version,
      valid: issues.every((issue) => issue.severity !== "ERROR"),
      canCreateSnapshot: issues.every((issue) => issue.severity !== "ERROR"),
      counts: {
        total: rules.length,
        hard: hardCount,
        soft: softCount,
        supported: rules.filter((rule) => isRuleCodeSupported(rule.code)).length,
      },
      issues,
    };
  }

  async createSnapshot(schoolId: string, profileId: string, actorId: string) {
    const profile = await this.getProfileRow(schoolId, profileId);
    const validation = await this.validateProfile(schoolId, profileId);
    if (!validation.canCreateSnapshot) {
      throw new BadRequestException({
        code: "RULE_PROFILE_INVALID",
        message: "Rule profile chưa đủ điều kiện tạo snapshot.",
        details: validation,
      });
    }
    if (!profile.source_url || !profile.effective_from) {
      throw new BadRequestException({
        code: "RULE_PROFILE_PROVENANCE_REQUIRED",
        message: "Rule profile phải có sourceUrl và effectiveFrom.",
      });
    }
    const rules = await this.listRuleRows(schoolId, profileId, profile.tenant_id);
    const snapshot = this.buildSnapshot(
      profile,
      rules.map((rule) => this.toRuleDefinition(rule)),
      "PENDING_STAKEHOLDER",
      actorId,
    );
    const result = await this.pool.query<RuleSnapshotRow>(
      `INSERT INTO rule_set_snapshots
         (tenant_id, school_id, rule_profile_id, rule_set_version, profile_version,
          register_version, source_url, source_locator, effective_from, effective_to,
          scope, approval_state, rules, snapshot_hash, captured_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13::jsonb, $14, $15)
       RETURNING id::text, tenant_id::text, school_id::text, rule_profile_id::text,
                 rule_set_version, profile_version, register_version, source_url,
                 source_locator, effective_from::text, effective_to::text, scope,
                 approval_state, approved_by, approved_at, approval_reason, rules,
                 snapshot_hash, captured_at, captured_by`,
      [
        profile.tenant_id,
        schoolId,
        profileId,
        snapshot.ruleSetVersion,
        snapshot.profileVersion,
        snapshot.registerVersion,
        snapshot.sourceUrl,
        snapshot.sourceLocator ?? null,
        snapshot.effectiveFrom,
        snapshot.effectiveTo ?? null,
        JSON.stringify(snapshot.scope),
        snapshot.approvalState,
        JSON.stringify(snapshot.rules),
        snapshot.snapshotHash,
        actorId,
      ],
    );
    return this.toSnapshot(result.rows[0]);
  }

  async approveSnapshot(
    schoolId: string,
    snapshotId: string,
    actorId: string,
    actorRole: Role,
    dto: ApproveRuleSnapshotDto,
  ) {
    const pending = await this.getSnapshotRow(schoolId, snapshotId);
    if (pending.approval_state === "APPROVED") return this.toSnapshot(pending);
    if (pending.approval_state !== "PENDING_STAKEHOLDER") {
      throw new ConflictException({
        code: "RULE_SNAPSHOT_NOT_APPROVABLE",
        message: "Chỉ snapshot đang chờ phê duyệt mới được approve.",
      });
    }
    const approvedAt = new Date().toISOString();
    const approvalReason =
      this.optionalText(dto.approvalReason) ?? "Đã phê duyệt bộ quy tắc để áp dụng vào xếp thời khóa biểu.";
    const source = this.toSnapshot(pending);
    const approvedRules = source.rules.map((rule) => ({
      ...rule,
      approvalState: "APPROVED" as const,
      approvedBy: actorId,
      approvedAt,
      approvalReason,
    }));
    const approvedSnapshot: RuleSetSnapshot = {
      ...source,
      snapshotId: randomUUID(),
      approvalState: "APPROVED",
      approvedBy: actorId,
      approvedAt,
      approvalReason,
      rules: approvedRules,
      capturedAt: approvedAt,
      capturedBy: actorId,
      snapshotHash: "",
    };
    approvedSnapshot.snapshotHash = computeRuleSetSnapshotHash(approvedSnapshot);

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO rule_set_snapshots
           (id, tenant_id, school_id, rule_profile_id, rule_set_version, profile_version,
            register_version, source_url, source_locator, effective_from, effective_to,
            scope, approval_state, approved_by, approved_at, approval_reason, rules,
            snapshot_hash, captured_at, captured_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13,
                 $14, $15, $16, $17::jsonb, $18, $19, $20)`,
        [
          approvedSnapshot.snapshotId,
          pending.tenant_id,
          schoolId,
          pending.rule_profile_id,
          approvedSnapshot.ruleSetVersion,
          approvedSnapshot.profileVersion,
          approvedSnapshot.registerVersion,
          approvedSnapshot.sourceUrl,
          approvedSnapshot.sourceLocator ?? null,
          approvedSnapshot.effectiveFrom,
          approvedSnapshot.effectiveTo ?? null,
          JSON.stringify(approvedSnapshot.scope),
          approvedSnapshot.approvalState,
          approvedSnapshot.approvedBy,
          approvedSnapshot.approvedAt,
          approvedSnapshot.approvalReason,
          JSON.stringify(approvedSnapshot.rules),
          approvedSnapshot.snapshotHash,
          approvedSnapshot.capturedAt,
          approvedSnapshot.capturedBy,
        ],
      );
      await client.query(
        `UPDATE rule_profiles
            SET status = 'ACTIVE', approval_state = 'APPROVED', approved_by = $1,
                approved_at = $2, approval_reason = $3, updated_at = now()
          WHERE id = $4 AND tenant_id = $5 AND school_id = $6`,
        [actorId, approvedAt, approvalReason, pending.rule_profile_id, pending.tenant_id, schoolId],
      );
      await this.auditLogs.recordInTransaction(client, {
        schoolId,
        action: "APPROVE",
        entityType: "rule_snapshot",
        entityId: approvedSnapshot.snapshotId,
        actorId,
        actorRole,
        correlationId: `rule-snapshot:${approvedSnapshot.snapshotId}`,
        metadata: {
          pendingSnapshotId: snapshotId,
          ruleProfileId: pending.rule_profile_id,
          ruleSetVersion: approvedSnapshot.ruleSetVersion,
          snapshotHash: approvedSnapshot.snapshotHash,
          ruleCount: approvedSnapshot.rules.length,
        },
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw this.translateDatabaseError(error, "Không thể phê duyệt rule snapshot.");
    } finally {
      client.release();
    }
    return approvedSnapshot;
  }

  async listSnapshots(schoolId: string, academicPeriodId: string) {
    await this.ensureAcademicPeriod(schoolId, academicPeriodId);
    const result = await this.pool.query<RuleSnapshotRow>(
      this.snapshotSelect() +
        ` JOIN rule_profiles profile ON profile.id = snapshot.rule_profile_id AND profile.tenant_id = snapshot.tenant_id
          WHERE snapshot.school_id = $1 AND profile.academic_period_id = $2
            AND profile.status <> 'RETIRED'
          ORDER BY snapshot.captured_at DESC, snapshot.id DESC`,
      [schoolId, academicPeriodId],
    );
    return result.rows.map((row) => this.toSnapshot(row));
  }

  async getSnapshot(schoolId: string, snapshotId: string) {
    return this.toSnapshot(await this.getSnapshotRow(schoolId, snapshotId));
  }

  async resolveActiveSnapshot(
    schoolId: string,
    academicPeriodId: string,
    asOf?: string,
  ): Promise<
    | {
        resolved: true;
        schoolId: string;
        academicPeriodId: string;
        effectiveAsOf: string;
        snapshot: RuleSetSnapshot;
      }
    | {
        resolved: false;
        schoolId: string;
        academicPeriodId: string;
        effectiveAsOf: string;
        reason: "NO_APPROVED_SNAPSHOT";
      }
  > {
    const period = await this.ensureAcademicPeriod(schoolId, academicPeriodId);
    const effectiveAsOf = asOf ?? this.dateString(period.starts_on) ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveAsOf)) {
      throw new BadRequestException({ code: "INVALID_EFFECTIVE_DATE", message: "asOf phải có dạng YYYY-MM-DD." });
    }
    const result = await this.pool.query<RuleSnapshotRow>(
      this.snapshotSelect() +
        ` JOIN rule_profiles profile ON profile.id = snapshot.rule_profile_id AND profile.tenant_id = snapshot.tenant_id
          WHERE snapshot.school_id = $1
            AND profile.academic_period_id = $2
            AND profile.status = 'ACTIVE'
            AND profile.approval_state = 'APPROVED'
            AND snapshot.approval_state = 'APPROVED'
            AND snapshot.effective_from <= $3
            AND (snapshot.effective_to IS NULL OR $3 <= snapshot.effective_to)
          ORDER BY snapshot.captured_at DESC, snapshot.id DESC
          LIMIT 1`,
      [schoolId, academicPeriodId, effectiveAsOf],
    );
    const row = result.rows[0];
    if (!row) {
      return {
        schoolId,
        academicPeriodId,
        effectiveAsOf,
        resolved: false as const,
        reason: "NO_APPROVED_SNAPSHOT" as const,
      };
    }
    return { schoolId, academicPeriodId, effectiveAsOf, resolved: true as const, snapshot: this.toSnapshot(row) };
  }

  async resolveForSolve(
    schoolId: string,
    academicPeriodId: string,
    asOf?: string,
    snapshotId?: string,
  ): Promise<RuleSolveResolution> {
    const period = await this.ensureAcademicPeriod(schoolId, academicPeriodId);
    const effectiveAsOf = asOf ?? this.dateString(period.starts_on) ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveAsOf)) {
      throw new BadRequestException({ code: "INVALID_EFFECTIVE_DATE", message: "asOf phải có dạng YYYY-MM-DD." });
    }

    let snapshot: RuleSetSnapshot | undefined;
    if (snapshotId) {
      const row = await this.getSnapshotRow(schoolId, snapshotId);
      const profile = await this.getProfileRow(schoolId, row.rule_profile_id);
      if (profile.academic_period_id !== academicPeriodId) {
        throw new BadRequestException({
          code: "RULE_SNAPSHOT_PERIOD_MISMATCH",
          message: "Rule snapshot không thuộc kỳ học đang được xếp thời khóa biểu.",
        });
      }
      if (profile.status !== "ACTIVE" || profile.approval_state !== "APPROVED") {
        return {
          schoolId,
          academicPeriodId,
          effectiveAsOf,
          resolved: false,
          reason: "SNAPSHOT_PROFILE_NOT_ACTIVE",
        };
      }
      snapshot = this.toSnapshot(row);
      if (snapshot.approvalState !== "APPROVED") {
        return { schoolId, academicPeriodId, effectiveAsOf, resolved: false, reason: "SNAPSHOT_NOT_APPROVED" };
      }
      if (effectiveAsOf < snapshot.effectiveFrom || (snapshot.effectiveTo && effectiveAsOf > snapshot.effectiveTo)) {
        return {
          schoolId,
          academicPeriodId,
          effectiveAsOf,
          resolved: false,
          reason: "SNAPSHOT_OUTSIDE_EFFECTIVE_WINDOW",
        };
      }
    } else {
      const resolution = await this.resolveActiveSnapshot(schoolId, academicPeriodId, effectiveAsOf);
      if (!resolution.resolved) return resolution;
      snapshot = resolution.snapshot;
    }

    if (!snapshot) {
      throw new NotFoundException("Không thể xác định rule snapshot để xếp thời khóa biểu.");
    }

    const slotsResult = await this.pool.query<{ id: string; day: number; period: number; shift_code: string | null }>(
      `SELECT id::text, day, period, shift_code
         FROM time_slots
        WHERE school_id = $1 AND academic_period_id = $2
        ORDER BY day, period, id`,
      [schoolId, academicPeriodId],
    );
    const teacherAvailability = this.availabilityCalculator
      ? this.availabilityCalculator.calculate({ schoolId, academicPeriodId, effectiveAsOf }, snapshot, slotsResult.rows)
      : undefined;
    return {
      schoolId,
      academicPeriodId,
      effectiveAsOf,
      resolved: true as const,
      snapshot,
      ruleDefinitions: snapshot.rules,
      ...(teacherAvailability ? { teacherAvailability } : {}),
      appliedRuleCount: snapshot.rules.length,
      appliedRuleCodes: snapshot.rules.map((rule) => rule.code),
    };
  }

  private async ensureAcademicPeriod(schoolId: string, academicPeriodId: string) {
    const result = await this.pool.query<{ id: string; tenant_id: string; starts_on: string | Date }>(
      `SELECT id::text, tenant_id::text, starts_on::text
         FROM academic_periods
        WHERE id = $1 AND school_id = $2`,
      [academicPeriodId, schoolId],
    );
    const period = result.rows[0];
    if (!period) throw new NotFoundException("Khung năm học không tồn tại trong phạm vi trường.");
    return period;
  }

  private async getProfileRow(schoolId: string, profileId: string) {
    const result = await this.pool.query<RuleProfileRow>(
      this.profileSelect() + " WHERE profile.id = $1 AND profile.school_id = $2",
      [profileId, schoolId],
    );
    const profile = result.rows[0];
    if (!profile) throw new NotFoundException("Rule profile không tồn tại trong phạm vi trường.");
    return profile;
  }

  private async getRuleRow(schoolId: string, profileId: string, ruleId: string) {
    const result = await this.pool.query<RuleDefinitionRow>(
      this.ruleSelect() + " WHERE rule.id = $1 AND rule.rule_profile_id = $2 AND profile.school_id = $3",
      [ruleId, profileId, schoolId],
    );
    const rule = result.rows[0];
    if (!rule) throw new NotFoundException("Rule không tồn tại trong rule profile.");
    return rule;
  }

  private async listRuleRows(schoolId: string, profileId: string, tenantId: string) {
    const result = await this.pool.query<RuleDefinitionRow>(
      this.ruleSelect() +
        " WHERE rule.rule_profile_id = $1 AND rule.tenant_id = $2 AND profile.school_id = $3 ORDER BY rule.code",
      [profileId, tenantId, schoolId],
    );
    return result.rows;
  }

  private async getSnapshotRow(schoolId: string, snapshotId: string) {
    const result = await this.pool.query<RuleSnapshotRow>(
      this.snapshotSelect() + " WHERE snapshot.id = $1 AND snapshot.school_id = $2",
      [snapshotId, schoolId],
    );
    const snapshot = result.rows[0];
    if (!snapshot) throw new NotFoundException("Rule snapshot không tồn tại trong phạm vi trường.");
    return snapshot;
  }

  private profileSelect() {
    return `SELECT profile.id::text, profile.tenant_id::text, profile.school_id::text,
                   profile.academic_period_id::text, profile.version, profile.name,
                   profile.status, profile.register_version, profile.source_url,
                   profile.source_locator, profile.effective_from::text,
                   profile.effective_to::text, profile.scope, profile.approval_state,
                   profile.approved_by, profile.approved_at, profile.approval_reason,
                   profile.created_at, profile.updated_at
              FROM rule_profiles profile`;
  }

  private ruleSelect() {
    return `SELECT rule.id::text, rule.tenant_id::text, rule.rule_profile_id::text,
                   rule.code, rule.kind, rule.weight::double precision AS weight, rule.source_url, rule.source_locator,
                   rule.effective_from::text, rule.effective_to::text, rule.scope,
                   rule.approval_state, rule.approved_by, rule.approved_at,
                   rule.approval_reason, rule.parameters, rule.created_at, rule.updated_at
              FROM rule_definitions rule
              JOIN rule_profiles profile ON profile.id = rule.rule_profile_id
                                          AND profile.tenant_id = rule.tenant_id`;
  }

  private snapshotSelect() {
    return `SELECT snapshot.id::text, snapshot.tenant_id::text, snapshot.school_id::text,
                   snapshot.rule_profile_id::text, snapshot.rule_set_version,
                   snapshot.profile_version, snapshot.register_version, snapshot.source_url,
                   snapshot.source_locator, snapshot.effective_from::text,
                   snapshot.effective_to::text, snapshot.scope, snapshot.approval_state,
                   snapshot.approved_by, snapshot.approved_at, snapshot.approval_reason,
                   snapshot.rules, snapshot.snapshot_hash, snapshot.captured_at,
                   snapshot.captured_by
              FROM rule_set_snapshots snapshot`;
  }

  private mapProfiles(profiles: RuleProfileRow[], rules: RuleDefinitionRow[]) {
    const rulesByProfile = new Map<string, RuleDefinitionRow[]>();
    for (const rule of rules)
      rulesByProfile.set(rule.rule_profile_id, [...(rulesByProfile.get(rule.rule_profile_id) ?? []), rule]);
    return profiles.map((profile) => this.toProfile(profile, rulesByProfile.get(profile.id) ?? []));
  }

  private toProfile(row: RuleProfileRow, rules: RuleDefinitionRow[]) {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      schoolId: row.school_id,
      academicPeriodId: row.academic_period_id,
      version: row.version,
      name: row.name,
      status: row.status,
      registerVersion: row.register_version,
      sourceUrl: row.source_url,
      sourceLocator: row.source_locator,
      effectiveFrom: this.dateString(row.effective_from),
      effectiveTo: this.dateString(row.effective_to),
      scope: parseJson<RuleScope>(row.scope),
      approvalState: row.approval_state,
      approvedBy: row.approved_by,
      approvedAt: this.timestampString(row.approved_at),
      approvalReason: row.approval_reason,
      rules: rules.map((rule) => this.toRule(rule)),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toRule(row: RuleDefinitionRow) {
    return {
      id: row.id,
      ruleProfileId: row.rule_profile_id,
      code: row.code,
      kind: row.kind,
      weight: row.weight,
      sourceUrl: row.source_url,
      sourceLocator: row.source_locator,
      effectiveFrom: this.dateString(row.effective_from),
      effectiveTo: this.dateString(row.effective_to),
      scope: parseJson<RuleScope>(row.scope),
      approvalState: row.approval_state,
      approvedBy: row.approved_by,
      approvedAt: this.timestampString(row.approved_at),
      approvalReason: row.approval_reason,
      parameters: parseJson<JsonObject>(row.parameters),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private toRuleDefinition(row: RuleDefinitionRow): RuleDefinition {
    return {
      code: row.code,
      kind: row.kind,
      weight: row.weight,
      sourceUrl: row.source_url,
      ...(row.source_locator ? { sourceLocator: row.source_locator } : {}),
      effectiveFrom: this.dateString(row.effective_from)!,
      ...(row.effective_to ? { effectiveTo: this.dateString(row.effective_to) } : {}),
      scope: parseJson<RuleScope>(row.scope),
      approvalState: row.approval_state,
      ...(row.approved_by ? { approvedBy: row.approved_by } : {}),
      ...(row.approved_at ? { approvedAt: this.timestampString(row.approved_at)! } : {}),
      ...(row.approval_reason ? { approvalReason: row.approval_reason } : {}),
      parameters: parseJson<JsonObject>(row.parameters),
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
      effectiveFrom: this.dateString(row.effective_from)!,
      ...(row.effective_to ? { effectiveTo: this.dateString(row.effective_to) } : {}),
      scope: parseJson<RuleScope>(row.scope),
      approvalState: row.approval_state,
      ...(row.approved_by ? { approvedBy: row.approved_by } : {}),
      ...(row.approved_at ? { approvedAt: this.timestampString(row.approved_at)! } : {}),
      ...(row.approval_reason ? { approvalReason: row.approval_reason } : {}),
      rules: parseJson<RuleDefinition[]>(row.rules),
      snapshotHash: row.snapshot_hash,
      capturedAt: this.timestampString(row.captured_at)!,
      capturedBy: row.captured_by,
    };
  }

  private buildSnapshot(
    profile: RuleProfileRow,
    rules: RuleDefinition[],
    approvalState: ApprovalState,
    capturedBy: string,
  ): RuleSetSnapshot {
    const snapshot: RuleSetSnapshot = {
      snapshotId: randomUUID(),
      ruleSetVersion: RULE_SET_VERSION,
      profileVersion: profile.version,
      registerVersion: profile.register_version,
      sourceUrl: profile.source_url!,
      ...(profile.source_locator ? { sourceLocator: profile.source_locator } : {}),
      effectiveFrom: this.dateString(profile.effective_from)!,
      ...(profile.effective_to ? { effectiveTo: this.dateString(profile.effective_to) } : {}),
      scope: parseJson<RuleScope>(profile.scope),
      approvalState,
      rules,
      snapshotHash: "",
      capturedAt: new Date().toISOString(),
      capturedBy,
    };
    snapshot.snapshotHash = computeRuleSetSnapshotHash(snapshot);
    return snapshot;
  }

  private candidateFromCreate(dto: CreateRuleDefinitionDto, schoolId: string, academicPeriodId: string): RuleCandidate {
    return {
      code: dto.code,
      kind: dto.kind,
      weight: dto.weight === undefined ? null : dto.weight,
      sourceUrl: dto.sourceUrl,
      sourceLocator: dto.sourceLocator,
      effectiveFrom: dto.effectiveFrom,
      effectiveTo: dto.effectiveTo,
      scope: this.normalizeScope(dto.scope, schoolId, academicPeriodId),
      parameters: dto.parameters,
    };
  }

  private candidateFromRow(row: RuleDefinitionRow): RuleCandidate {
    return {
      code: row.code,
      kind: row.kind,
      weight: row.weight,
      sourceUrl: row.source_url,
      sourceLocator: row.source_locator ?? undefined,
      effectiveFrom: this.dateString(row.effective_from) ?? "",
      effectiveTo: this.dateString(row.effective_to),
      scope: parseJson<RuleScope>(row.scope),
      parameters: parseJson<JsonObject>(row.parameters),
    };
  }

  private validateRuleCandidate(candidate: RuleCandidate) {
    const entry = findRuleCatalogEntry(candidate.code);
    if (!entry)
      throw new BadRequestException({
        code: "UNKNOWN_RULE_CODE",
        message: `Mã quy tắc chưa được đăng ký: ${candidate.code}.`,
      });
    if (!entry.supportedKinds.includes(candidate.kind)) {
      throw new BadRequestException({
        code: "RULE_KIND_NOT_SUPPORTED",
        message: `Rule ${candidate.code} không hỗ trợ kind ${candidate.kind}.`,
      });
    }
    if (candidate.kind === "HARD" && candidate.weight !== null) {
      throw new BadRequestException({
        code: "HARD_RULE_WEIGHT_FORBIDDEN",
        message: `Rule HARD ${candidate.code} không được có weight.`,
      });
    }
    if (
      candidate.kind === "SOFT" &&
      (candidate.weight === null ||
        candidate.weight === undefined ||
        candidate.weight < 0 ||
        !Number.isFinite(candidate.weight))
    ) {
      throw new BadRequestException({
        code: "SOFT_RULE_WEIGHT_REQUIRED",
        message: `Rule SOFT ${candidate.code} phải có weight không âm.`,
      });
    }
    this.requiredText(candidate.sourceUrl, "sourceUrl");
    this.validateDateRange(candidate.effectiveFrom, candidate.effectiveTo);
    this.validateScope(entry, candidate.scope);
    this.validateParameters(entry, candidate.parameters);
  }

  private validateScope(entry: RuleCatalogEntry, scope: RuleScope) {
    const resourceType = scope.resourceType ?? (scope.actorType === "TEACHER" ? "TEACHER" : undefined);
    if (resourceType && !entry.targetResources.includes(resourceType)) {
      throw new BadRequestException({
        code: "RULE_SCOPE_TARGET_MISMATCH",
        message: `Scope ${resourceType} không hợp lệ cho rule ${entry.code}.`,
      });
    }
    if (
      entry.targetResources.includes("TEACHER") &&
      !scope.actorId &&
      !(resourceType === "TEACHER" && scope.resourceIds?.length)
    ) {
      throw new BadRequestException({
        code: "RULE_TEACHER_SCOPE_REQUIRED",
        message: `Rule ${entry.code} phải giới hạn theo giáo viên.`,
      });
    }
    if (scope.resourceType && scope.resourceIds && scope.resourceIds.length === 0) {
      throw new BadRequestException({
        code: "RULE_SCOPE_IDS_REQUIRED",
        message: "resourceIds không được rỗng khi đã chọn resourceType.",
      });
    }
    if (scope.actorType === "TEACHER" && scope.resourceType && scope.resourceType !== "TEACHER") {
      throw new BadRequestException({
        code: "RULE_SCOPE_ACTOR_MISMATCH",
        message: "actorType TEACHER phải đi cùng resourceType TEACHER hoặc bỏ resourceType.",
      });
    }
  }

  private validateParameters(entry: RuleCatalogEntry, parameters: JsonObject) {
    const definitions = new Map(entry.parameters.map((parameter) => [parameter.key, parameter]));
    for (const key of Object.keys(parameters)) {
      if (!definitions.has(key))
        throw new BadRequestException({
          code: "UNKNOWN_RULE_PARAMETER",
          message: `Tham số ${key} không được hỗ trợ cho rule ${entry.code}.`,
        });
    }
    for (const definition of entry.parameters) {
      const value = parameters[definition.key];
      if (value === undefined || value === null) {
        if (definition.required)
          throw new BadRequestException({
            code: "RULE_PARAMETER_REQUIRED",
            message: `${definition.key} là bắt buộc cho rule ${entry.code}.`,
          });
        continue;
      }
      switch (definition.type) {
        case "BOOLEAN":
          if (typeof value !== "boolean") throw this.invalidParameter(definition.key, entry.code);
          break;
        case "TEXT":
          if (typeof value !== "string" || !value.trim()) throw this.invalidParameter(definition.key, entry.code);
          break;
        case "OBJECT":
          if (!isRecord(value)) throw this.invalidParameter(definition.key, entry.code);
          break;
        case "SHIFT_CODE":
          if (value !== "MORNING" && value !== "AFTERNOON") throw this.invalidParameter(definition.key, entry.code);
          break;
        case "GRANULARITY":
          if (typeof value !== "string" || (definition.options && !definition.options.includes(value)))
            throw this.invalidParameter(definition.key, entry.code);
          break;
        case "SLOT_ID":
          if (typeof value !== "string" || !value.trim()) throw this.invalidParameter(definition.key, entry.code);
          break;
        case "DAY_OF_WEEK":
        case "INTEGER":
        case "PERIOD":
          if (
            typeof value !== "number" ||
            !Number.isInteger(value) ||
            (definition.minimum !== undefined && value < definition.minimum) ||
            (definition.maximum !== undefined && value > definition.maximum)
          )
            throw this.invalidParameter(definition.key, entry.code);
          break;
        case "DAY_OF_WEEK_LIST":
          if (
            !Array.isArray(value) ||
            value.length < (definition.minItems ?? 0) ||
            value.length > (definition.maxItems ?? Number.MAX_SAFE_INTEGER) ||
            new Set(value).size !== value.length ||
            value.some((item) => typeof item !== "number" || !Number.isInteger(item) || item < 1 || item > 7)
          )
            throw this.invalidParameter(definition.key, entry.code);
          break;
      }
    }
  }

  private invalidParameter(key: string, code: string) {
    return new BadRequestException({
      code: "INVALID_RULE_PARAMETER",
      message: `Tham số ${key} không hợp lệ cho rule ${code}.`,
    });
  }

  private normalizeScope(scope: RuleScopeDto | undefined, schoolId: string, academicPeriodId: string): RuleScope {
    return {
      ...(scope?.schoolLevel ? { schoolLevel: scope.schoolLevel } : {}),
      ...(scope?.actorType ? { actorType: scope.actorType } : {}),
      ...(scope?.actorId ? { actorId: this.requiredText(scope.actorId, "actorId") } : {}),
      ...(scope?.resourceType ? { resourceType: scope.resourceType } : {}),
      ...(scope?.resourceIds
        ? { resourceIds: scope.resourceIds.map((value) => this.requiredText(value, "resourceId")) }
        : {}),
      schoolId,
      academicPeriodId,
    };
  }

  private ensureDraftProfile(profile: RuleProfileRow) {
    if (profile.status !== "DRAFT")
      throw new ConflictException({
        code: "RULE_PROFILE_NOT_DRAFT",
        message: "Chỉ rule profile DRAFT mới được chỉnh sửa.",
      });
  }

  private validateDateRange(effectiveFrom: string, effectiveTo?: string | null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom))
      throw new BadRequestException({
        code: "INVALID_EFFECTIVE_DATE",
        message: "effectiveFrom phải có dạng YYYY-MM-DD.",
      });
    if (
      effectiveTo !== undefined &&
      effectiveTo !== null &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo) || effectiveTo < effectiveFrom)
    ) {
      throw new BadRequestException({
        code: "INVALID_EFFECTIVE_RANGE",
        message: "effectiveTo phải cùng định dạng và không sớm hơn effectiveFrom.",
      });
    }
  }

  private requiredText(value: string, field: string) {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException({ code: "REQUIRED_FIELD", message: `${field} là bắt buộc.` });
    return normalized;
  }

  private optionalText(value: string | null | undefined) {
    if (value === undefined || value === null) return null;
    const normalized = value.trim();
    return normalized || null;
  }

  private dateString(value: string | Date | null | undefined) {
    return value ? (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)) : null;
  }

  private timestampString(value: string | Date | null | undefined) {
    return value ? (value instanceof Date ? value.toISOString() : new Date(value).toISOString()) : null;
  }

  private errorCode(error: unknown, fallback: string) {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (isRecord(response) && typeof response.code === "string") return response.code;
    }
    return fallback;
  }

  private errorMessage(error: unknown) {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      if (isRecord(response) && typeof response.message === "string") return response.message;
      if (typeof response === "string") return response;
    }
    return error instanceof Error ? error.message : "Rule không hợp lệ.";
  }

  private translateDatabaseError(error: unknown, duplicateMessage: string) {
    const code = (error as { code?: string }).code;
    if (code === "23505") return new ConflictException({ code: "DUPLICATE_RESOURCE", message: duplicateMessage });
    if (code === "23503")
      return new ConflictException({ code: "RESOURCE_REFERENCED", message: "Dữ liệu đang được tham chiếu." });
    return error;
  }
}
