import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { Pool } from "pg";
import { PG_POOL } from "../database/database.module";
import { AuditLogService } from "../auth/audit-log.service";
import type { Role } from "../auth/auth.constants";
import {
  canTransitionScheduleVersion,
  isScheduleVersionStatus,
  type ScheduleVersionStatus,
} from "./schedule-version.types";
import type { CreateScheduleVersionDto, TransitionScheduleVersionDto } from "./schedule-version.dto";
import type { UpdateScheduleAssignmentDto } from "./schedule-edit.dto";
import {
  SCHEDULE_EDIT_CONTRACT_VERSION,
  type ScheduleAssignmentSnapshot,
  type ScheduleVersionSnapshot,
} from "./schedule-edit.types";

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
  revision?: number | string;
}

interface AssignmentRow {
  id: string;
  lesson_id: string;
  session_index: number;
  time_slot_id: string;
  room_id: string | null;
}

interface AssignmentValidationRow extends AssignmentRow {
  class_id: string;
  teacher_id: string;
}

type Queryable = Pick<Pool, "query">;

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
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Optional() private readonly auditLogs?: AuditLogService,
  ) {}

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
                 revision, status_reason, created_at, updated_at`,
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
              revision, status_reason, created_at, updated_at
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
              revision, status_reason, created_at, updated_at
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

  async getSnapshot(schoolId: string, versionId: string): Promise<ScheduleVersionSnapshot> {
    const current = await this.getRow(schoolId, versionId);
    return this.toSnapshot(current, await this.listAssignments(this.pool, schoolId, versionId));
  }

  async updateAssignment(
    schoolId: string,
    versionId: string,
    lessonId: string,
    sessionIndex: number,
    actorId: string,
    dto: UpdateScheduleAssignmentDto,
    ifMatch: string | undefined,
    actorRole: Role = "SCHEDULER",
    correlationId = "unknown",
  ): Promise<ScheduleVersionSnapshot> {
    if (!Number.isInteger(sessionIndex) || sessionIndex < 0) {
      throw new BadRequestException({
        code: "SCHEDULE_ASSIGNMENT_SESSION_INVALID",
        message: "sessionIndex phải là số nguyên không âm.",
      });
    }
    const expectedEtag = this.requireEtag(ifMatch);
    const client = await this.pool.connect();
    let inTransaction = false;
    try {
      await client.query("BEGIN");
      inTransaction = true;
      const current = await this.selectVersionForUpdate(client, schoolId, versionId);
      const currentSnapshot = await this.snapshotFromClient(client, current);
      if (currentSnapshot.etag !== expectedEtag) {
        throw this.concurrentConflict(expectedEtag, currentSnapshot);
      }
      if (!(current.status === "DRAFT" || current.status === "IN_REVIEW")) {
        throw new ConflictException({
          code: "SCHEDULE_VERSION_NOT_EDITABLE",
          message: `Không thể chỉnh schedule version ở trạng thái ${current.status}.`,
          currentSnapshot,
        });
      }

      const targetResult = await client.query<AssignmentValidationRow>(
        `SELECT a.id::text, a.lesson_id::text, a.session_index, a.time_slot_id::text,
                a.room_id::text, lesson.class_id::text, lesson.teacher_id::text
           FROM schedule_assignments a
           JOIN lesson_requirements lesson
             ON lesson.id = a.lesson_id
            AND lesson.school_id = $1
            AND lesson.academic_period_id = $2
          WHERE a.schedule_version_id = $3
            AND a.lesson_id = $4
            AND a.session_index = $5
          FOR UPDATE OF a`,
        [schoolId, current.academic_period_id, versionId, lessonId, sessionIndex],
      );
      if (targetResult.rows.length === 0) {
        throw new NotFoundException({
          code: "SCHEDULE_ASSIGNMENT_NOT_FOUND",
          message: "Assignment không tồn tại trong schedule version.",
        });
      }
      const target = targetResult.rows[0];
      const nextRoomId = dto.roomId === undefined ? target.room_id : dto.roomId;

      await this.assertSlotAndRoomScope(client, schoolId, current.academic_period_id, dto.timeSlotId, nextRoomId);
      const conflictResult = await client.query<AssignmentRow>(
        `SELECT a.id::text, a.lesson_id::text, a.session_index, a.time_slot_id::text, a.room_id::text
           FROM schedule_assignments a
           JOIN lesson_requirements lesson
             ON lesson.id = a.lesson_id
            AND lesson.school_id = $1
            AND lesson.academic_period_id = $2
          WHERE a.schedule_version_id = $3
            AND a.id <> $4
            AND a.time_slot_id = $5
            AND (lesson.class_id = $6 OR lesson.teacher_id = $7 OR ($8::uuid IS NOT NULL AND a.room_id = $8))
          FOR UPDATE OF a`,
        [
          schoolId,
          current.academic_period_id,
          versionId,
          target.id,
          dto.timeSlotId,
          target.class_id,
          target.teacher_id,
          nextRoomId,
        ],
      );
      if (conflictResult.rows.length > 0) {
        throw new ConflictException({
          code: "SCHEDULE_ASSIGNMENT_HARD_CONFLICT",
          message: "Thay đổi vi phạm hard constraint lớp, giáo viên hoặc phòng tại slot đích.",
          conflicts: conflictResult.rows.map((row) => ({
            assignmentId: row.id,
            lessonId: row.lesson_id,
            sessionIndex: row.session_index,
          })),
          currentSnapshot,
        });
      }

      const isNoop = target.time_slot_id === dto.timeSlotId && (target.room_id ?? null) === (nextRoomId ?? null);
      if (!isNoop) {
        await client.query(
          `UPDATE schedule_assignments
              SET time_slot_id = $3, room_id = $4
            WHERE id = $1 AND schedule_version_id = $2`,
          [target.id, versionId, dto.timeSlotId, nextRoomId],
        );
        await client.query(
          `UPDATE schedule_versions
              SET revision = revision + 1, updated_at = now(), status_changed_by = $3
            WHERE id = $1 AND school_id = $2`,
          [versionId, schoolId, actorId],
        );
      }

      const updated = await this.selectVersionForUpdate(client, schoolId, versionId);
      const snapshot = await this.snapshotFromClient(client, updated);
      if (!isNoop && this.auditLogs) {
        await this.auditLogs.recordInTransaction(client, {
          schoolId,
          action: "UPDATE",
          entityType: "schedule_assignment",
          entityId: target.id,
          entityKey: versionId,
          actorId,
          actorRole,
          correlationId,
          metadata: {
            manualEdit: true,
            scheduleVersionId: versionId,
            assignmentId: target.id,
            lessonId: target.lesson_id,
            sessionIndex,
            fromTimeSlotId: target.time_slot_id,
            toTimeSlotId: dto.timeSlotId,
            fromRoomId: target.room_id,
            toRoomId: nextRoomId,
            fromRevision: this.revisionOf(current),
            toRevision: this.revisionOf(updated),
            expectedEtag,
            currentEtag: snapshot.etag,
          },
        });
      }
      await client.query("COMMIT");
      inTransaction = false;
      return snapshot;
    } catch (error) {
      if (inTransaction) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
              updated_at = now(),
              revision = revision + 1
        WHERE id = $1 AND school_id = $2 AND status = $6
       RETURNING id::text, school_id::text, academic_period_id::text, version_number,
                 status, source_run_id::text, created_by, approved_by, approved_at,
                 locked_at, published_at, archived_at, rule_snapshot_id::text,
                 rule_set_version, rule_snapshot_hash, input_snapshot_hash,
                 schedule_snapshot_hash, status_changed_by, status_changed_at,
                 revision, status_reason, created_at, updated_at`,
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
              revision, status_reason, created_at, updated_at
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

  private async selectVersionForUpdate(client: Queryable, schoolId: string, versionId: string) {
    const result = await client.query<ScheduleVersionRow>(
      `SELECT id::text, school_id::text, academic_period_id::text, version_number,
              status, source_run_id::text, created_by, approved_by, approved_at,
              locked_at, published_at, archived_at, rule_snapshot_id::text,
              rule_set_version, rule_snapshot_hash, input_snapshot_hash,
              schedule_snapshot_hash, status_changed_by, status_changed_at,
              revision, status_reason, created_at, updated_at
         FROM schedule_versions
        WHERE id = $1 AND school_id = $2
        FOR UPDATE`,
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

  private async snapshotFromClient(client: Queryable, row: ScheduleVersionRow): Promise<ScheduleVersionSnapshot> {
    return this.toSnapshot(row, await this.listAssignments(client, row.school_id, row.id));
  }

  private async listAssignments(client: Queryable, schoolId: string, versionId: string) {
    const result = await client.query<AssignmentRow>(
      `SELECT a.id::text, a.lesson_id::text, a.session_index,
              a.time_slot_id::text, a.room_id::text
         FROM schedule_assignments a
         JOIN schedule_versions version ON version.id = a.schedule_version_id
        WHERE a.schedule_version_id = $1 AND version.school_id = $2
        ORDER BY a.lesson_id, a.session_index`,
      [versionId, schoolId],
    );
    return result.rows.map((row) => this.toAssignmentSnapshot(row));
  }

  private toSnapshot(row: ScheduleVersionRow, assignments: ScheduleAssignmentSnapshot[]): ScheduleVersionSnapshot {
    return {
      contractVersion: SCHEDULE_EDIT_CONTRACT_VERSION,
      id: row.id,
      schoolId: row.school_id,
      academicPeriodId: row.academic_period_id,
      revision: this.revisionOf(row),
      etag: this.etagOf(row),
      status: row.status,
      assignments,
    };
  }

  private toAssignmentSnapshot(row: AssignmentRow): ScheduleAssignmentSnapshot {
    return {
      id: row.id,
      lessonId: row.lesson_id,
      sessionIndex: row.session_index,
      timeSlotId: row.time_slot_id,
      roomId: row.room_id,
    };
  }

  private async assertSlotAndRoomScope(
    client: Queryable,
    schoolId: string,
    academicPeriodId: string,
    timeSlotId: string,
    roomId: string | null,
  ) {
    const slot = await client.query(
      `SELECT id FROM time_slots
        WHERE id = $1 AND school_id = $2 AND academic_period_id = $3`,
      [timeSlotId, schoolId, academicPeriodId],
    );
    if (slot.rows.length === 0) {
      throw new ConflictException({
        code: "SCHEDULE_ASSIGNMENT_SLOT_OUT_OF_SCOPE",
        message: "Slot đích không thuộc school và academic period của schedule version.",
      });
    }
    if (roomId) {
      const room = await client.query(`SELECT id FROM rooms WHERE id = $1 AND school_id = $2`, [roomId, schoolId]);
      if (room.rows.length === 0) {
        throw new ConflictException({
          code: "SCHEDULE_ASSIGNMENT_ROOM_OUT_OF_SCOPE",
          message: "Phòng đích không thuộc school scope.",
        });
      }
    }
  }

  private requireEtag(ifMatch: string | undefined) {
    if (!ifMatch?.trim()) {
      throw new HttpException(
        {
          code: "SCHEDULE_VERSION_ETAG_REQUIRED",
          message: "Thao tác chỉnh lịch yêu cầu If-Match của snapshot hiện tại.",
        },
        HttpStatus.PRECONDITION_REQUIRED,
      );
    }
    return ifMatch.trim();
  }

  private concurrentConflict(expectedEtag: string, currentSnapshot: ScheduleVersionSnapshot) {
    return new ConflictException({
      code: "SCHEDULE_VERSION_CONCURRENT_UPDATE",
      message: "Schedule version đã thay đổi; hãy tải snapshot mới rồi reapply thay đổi.",
      expectedEtag,
      currentSnapshot,
    });
  }

  private revisionOf(row: ScheduleVersionRow) {
    const revision = Number(row.revision ?? 1);
    return Number.isSafeInteger(revision) && revision > 0 ? revision : 1;
  }

  private etagOf(row: ScheduleVersionRow) {
    return `"schedule-version:${row.id}:${this.revisionOf(row)}"`;
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
      revision: this.revisionOf(row),
      etag: this.etagOf(row),
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
