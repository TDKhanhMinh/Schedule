import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Pool } from "pg";
import { PG_POOL } from "../database/database.module";
import {
  canTransitionScheduleVersion,
  isScheduleVersionStatus,
  type ScheduleVersionStatus,
} from "./schedule-version.types";
import type { CreateScheduleVersionDto, TransitionScheduleVersionDto } from "./schedule-version.dto";

interface ScheduleVersionRow {
  id: string;
  school_id: string;
  academic_period_id: string;
  version_number: number;
  status: ScheduleVersionStatus;
  source_run_id: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | Date | null;
  locked_at: string | Date | null;
  published_at: string | Date | null;
  archived_at: string | Date | null;
  rule_snapshot_id: string | null;
  rule_set_version: string | null;
  rule_snapshot_hash: string | null;
  input_snapshot_hash: string | null;
  schedule_snapshot_hash: string | null;
  status_changed_by: string;
  status_changed_at: string | Date;
  status_reason: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface TransitionRow {
  id: string;
  school_id: string;
  schedule_version_id: string;
  from_status: ScheduleVersionStatus | null;
  to_status: ScheduleVersionStatus;
  actor_id: string;
  reason: string | null;
  correlation_id: string | null;
  created_at: string | Date;
}

@Injectable()
export class ScheduleVersionService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(schoolId: string, actorId: string, dto: CreateScheduleVersionDto) {
    this.validateRuleSnapshotMetadata(dto);

    const result = await this.pool.query<ScheduleVersionRow>(
      `WITH next_version AS (
         SELECT COALESCE(MAX(version_number), 0) + 1 AS version_number
           FROM schedule_versions
          WHERE school_id = $1 AND academic_period_id = $2
       )
       INSERT INTO schedule_versions
         (school_id, academic_period_id, version_number, status, source_run_id,
          created_by, rule_snapshot_id, rule_set_version, rule_snapshot_hash,
          input_snapshot_hash, schedule_snapshot_hash, status_changed_by,
          status_changed_at)
       SELECT $1, $2, next_version.version_number, 'DRAFT', $3, $4, $5, $6, $7,
              $8, $9, $4, now()
         FROM next_version
        WHERE EXISTS (
          SELECT 1 FROM academic_periods
           WHERE id = $2 AND school_id = $1
        )
       RETURNING id::text, school_id::text, academic_period_id::text, version_number,
                 status, source_run_id::text, created_by, approved_by, approved_at,
                 locked_at, published_at, archived_at, rule_snapshot_id::text,
                 rule_set_version, rule_snapshot_hash, input_snapshot_hash,
                 schedule_snapshot_hash, status_changed_by, status_changed_at,
                 status_reason, created_at, updated_at`,
      [
        schoolId,
        dto.academicPeriodId,
        dto.sourceRunId ?? null,
        actorId,
        dto.ruleSnapshotId ?? null,
        dto.ruleSetVersion ?? null,
        dto.ruleSnapshotHash ?? null,
        dto.inputSnapshotHash ?? null,
        dto.scheduleSnapshotHash ?? null,
      ],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException({
        code: "ACADEMIC_PERIOD_NOT_FOUND",
        message: "Academic period không tồn tại trong school scope.",
      });
    }

    return this.toScheduleVersion(result.rows[0]);
  }

  async list(schoolId: string, academicPeriodId: string) {
    const result = await this.pool.query<ScheduleVersionRow>(
      `SELECT id::text, school_id::text, academic_period_id::text, version_number,
              status, source_run_id::text, created_by, approved_by, approved_at,
              locked_at, published_at, archived_at, rule_snapshot_id::text,
              rule_set_version, rule_snapshot_hash, input_snapshot_hash,
              schedule_snapshot_hash, status_changed_by, status_changed_at,
              status_reason, created_at, updated_at
         FROM schedule_versions
        WHERE school_id = $1 AND academic_period_id = $2
        ORDER BY version_number DESC`,
      [schoolId, academicPeriodId],
    );
    return result.rows.map((row) => this.toScheduleVersion(row));
  }

  async get(schoolId: string, versionId: string) {
    const result = await this.pool.query<ScheduleVersionRow>(
      `SELECT id::text, school_id::text, academic_period_id::text, version_number,
              status, source_run_id::text, created_by, approved_by, approved_at,
              locked_at, published_at, archived_at, rule_snapshot_id::text,
              rule_set_version, rule_snapshot_hash, input_snapshot_hash,
              schedule_snapshot_hash, status_changed_by, status_changed_at,
              status_reason, created_at, updated_at
         FROM schedule_versions
        WHERE id = $1 AND school_id = $2`,
      [versionId, schoolId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException({
        code: "SCHEDULE_VERSION_NOT_FOUND",
        message: "Schedule version không tồn tại trong school scope.",
      });
    }
    return this.toScheduleVersion(result.rows[0]);
  }

  async transition(schoolId: string, versionId: string, actorId: string, dto: TransitionScheduleVersionDto) {
    const current = await this.getRow(schoolId, versionId);
    if (!isScheduleVersionStatus(dto.toStatus)) {
      throw new BadRequestException({
        code: "SCHEDULE_VERSION_STATUS_INVALID",
        message: "Trạng thái schedule version không hợp lệ.",
      });
    }
    if (!canTransitionScheduleVersion(current.status, dto.toStatus)) {
      throw new ConflictException({
        code: "SCHEDULE_VERSION_TRANSITION_INVALID",
        message: `Không thể chuyển schedule version từ ${current.status} sang ${dto.toStatus}.`,
        fromStatus: current.status,
        toStatus: dto.toStatus,
      });
    }

    const result = await this.pool.query<ScheduleVersionRow>(
      `UPDATE schedule_versions
          SET status = $3,
              status_changed_by = $4,
              status_changed_at = now(),
              status_reason = $5,
              approved_by = CASE WHEN $3 = 'APPROVED' THEN $4 ELSE approved_by END,
              approved_at = CASE WHEN $3 = 'APPROVED' THEN now() ELSE approved_at END,
              locked_at = CASE WHEN $3 = 'LOCKED' THEN now() ELSE locked_at END,
              published_at = CASE WHEN $3 = 'PUBLISHED' THEN now() ELSE published_at END,
              archived_at = CASE WHEN $3 = 'ARCHIVED' THEN now() ELSE archived_at END,
              updated_at = now()
        WHERE id = $1 AND school_id = $2 AND status = $6
       RETURNING id::text, school_id::text, academic_period_id::text, version_number,
                 status, source_run_id::text, created_by, approved_by, approved_at,
                 locked_at, published_at, archived_at, rule_snapshot_id::text,
                 rule_set_version, rule_snapshot_hash, input_snapshot_hash,
                 schedule_snapshot_hash, status_changed_by, status_changed_at,
                 status_reason, created_at, updated_at`,
      [versionId, schoolId, dto.toStatus, actorId, dto.reason ?? null, current.status],
    );

    if (result.rows.length === 0) {
      throw new ConflictException({
        code: "SCHEDULE_VERSION_CONCURRENT_UPDATE",
        message: "Schedule version đã thay đổi; hãy tải lại trước khi chuyển trạng thái.",
      });
    }
    return this.toScheduleVersion(result.rows[0]);
  }

  async listTransitions(schoolId: string, versionId: string) {
    await this.get(schoolId, versionId);
    const result = await this.pool.query<TransitionRow>(
      `SELECT id::text, school_id::text, schedule_version_id::text, from_status,
              to_status, actor_id, reason, correlation_id, created_at
         FROM schedule_version_transitions
        WHERE school_id = $1 AND schedule_version_id = $2
        ORDER BY created_at ASC, id ASC`,
      [schoolId, versionId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      schoolId: row.school_id,
      scheduleVersionId: row.schedule_version_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      actorId: row.actor_id,
      reason: row.reason,
      correlationId: row.correlation_id,
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  private async getRow(schoolId: string, versionId: string) {
    const result = await this.pool.query<ScheduleVersionRow>(
      `SELECT id::text, school_id::text, academic_period_id::text, version_number,
              status, source_run_id::text, created_by, approved_by, approved_at,
              locked_at, published_at, archived_at, rule_snapshot_id::text,
              rule_set_version, rule_snapshot_hash, input_snapshot_hash,
              schedule_snapshot_hash, status_changed_by, status_changed_at,
              status_reason, created_at, updated_at
         FROM schedule_versions
        WHERE id = $1 AND school_id = $2`,
      [versionId, schoolId],
    );
    if (result.rows.length === 0) {
      throw new NotFoundException({
        code: "SCHEDULE_VERSION_NOT_FOUND",
        message: "Schedule version không tồn tại trong school scope.",
      });
    }
    return result.rows[0];
  }

  private validateRuleSnapshotMetadata(dto: CreateScheduleVersionDto) {
    const values = [dto.ruleSnapshotId, dto.ruleSetVersion, dto.ruleSnapshotHash];
    if (values.some((value) => value !== undefined) && values.some((value) => value === undefined)) {
      throw new BadRequestException({
        code: "SCHEDULE_VERSION_RULE_SNAPSHOT_INCOMPLETE",
        message: "ruleSnapshotId, ruleSetVersion và ruleSnapshotHash phải đi cùng nhau.",
      });
    }
  }

  private toScheduleVersion(row: ScheduleVersionRow) {
    return {
      id: row.id,
      schoolId: row.school_id,
      academicPeriodId: row.academic_period_id,
      versionNumber: row.version_number,
      status: row.status,
      sourceRunId: row.source_run_id,
      createdBy: row.created_by,
      approvedBy: row.approved_by,
      approvedAt: this.toIso(row.approved_at),
      lockedAt: this.toIso(row.locked_at),
      publishedAt: this.toIso(row.published_at),
      archivedAt: this.toIso(row.archived_at),
      ruleSnapshotId: row.rule_snapshot_id,
      ruleSetVersion: row.rule_set_version,
      ruleSnapshotHash: row.rule_snapshot_hash,
      inputSnapshotHash: row.input_snapshot_hash,
      scheduleSnapshotHash: row.schedule_snapshot_hash,
      statusChangedBy: row.status_changed_by,
      statusChangedAt: this.toIso(row.status_changed_at),
      statusReason: row.status_reason,
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  private toIso(value: string | Date | null) {
    return value ? new Date(value).toISOString() : null;
  }
}
