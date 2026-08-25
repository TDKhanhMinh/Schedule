import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { PG_POOL } from "../database/database.module";
import { AuditLogService } from "../auth/audit-log.service";
import type { Role } from "../auth/auth.constants";
import {
  SCHEDULE_VERSION_OPERATIONS_CONTRACT_VERSION,
  type ScheduleVersionCompareResult,
  type ScheduleVersionDiffAssignment,
  type ScheduleVersionDiffEntry,
} from "../contracts";
import {
  canTransitionScheduleVersion,
  isScheduleVersionStatus,
  type ScheduleVersionStatus,
} from "./schedule-version.types";
import type {
  CloneScheduleVersionDto,
  CreateScheduleVersionDto,
  RollbackScheduleVersionDto,
  TransitionScheduleVersionDto,
} from "./schedule-version.dto";
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

interface ComparisonAssignmentRow extends AssignmentRow {
  subject_label: string;
  class_label: string;
  teacher_label: string;
  room_label: string | null;
  slot_label: string;
}

interface OptimizationDiagnosticsRow {
  diagnostics: Record<string, unknown> | null;
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

  async compare(schoolId: string, fromVersionId: string, toVersionId: string): Promise<ScheduleVersionCompareResult> {
    if (fromVersionId === toVersionId) {
      throw new BadRequestException({
        code: "SCHEDULE_VERSION_COMPARE_SAME_VERSION",
        message: "Không thể compare một schedule version với chính nó.",
      });
    }

    const [from, to] = await Promise.all([this.getRow(schoolId, fromVersionId), this.getRow(schoolId, toVersionId)]);
    if (from.academic_period_id !== to.academic_period_id) {
      throw new ConflictException({
        code: "SCHEDULE_VERSION_COMPARE_PERIOD_MISMATCH",
        message: "Chỉ compare được các version trong cùng academic period.",
      });
    }

    const [fromAssignments, toAssignments, fromScore, toScore] = await Promise.all([
      this.listComparisonAssignments(this.pool, schoolId, fromVersionId),
      this.listComparisonAssignments(this.pool, schoolId, toVersionId),
      this.qualityScore(schoolId, from.source_run_id),
      this.qualityScore(schoolId, to.source_run_id),
    ]);
    const fromByKey = new Map(fromAssignments.map((assignment) => [this.assignmentKey(assignment), assignment]));
    const toByKey = new Map(toAssignments.map((assignment) => [this.assignmentKey(assignment), assignment]));
    const keys = [...new Set([...fromByKey.keys(), ...toByKey.keys()])].sort();
    const diffs: ScheduleVersionDiffEntry[] = [];

    for (const key of keys) {
      const before = fromByKey.get(key);
      const after = toByKey.get(key);
      if (!before && after) {
        diffs.push({
          operation: "ADD",
          lessonId: after.lesson_id,
          sessionIndex: after.session_index,
          before: null,
          after: this.toDiffAssignment(after),
        });
      } else if (before && !after) {
        diffs.push({
          operation: "REMOVE",
          lessonId: before.lesson_id,
          sessionIndex: before.session_index,
          before: this.toDiffAssignment(before),
          after: null,
        });
      } else if (
        before &&
        after &&
        (before.time_slot_id !== after.time_slot_id || (before.room_id ?? null) !== (after.room_id ?? null))
      ) {
        diffs.push({
          operation: "MOVE",
          lessonId: after.lesson_id,
          sessionIndex: after.session_index,
          before: this.toDiffAssignment(before),
          after: this.toDiffAssignment(after),
        });
      }
    }

    const scoreAvailable = fromScore !== null && toScore !== null;
    return {
      contractVersion: SCHEDULE_VERSION_OPERATIONS_CONTRACT_VERSION,
      fromVersion: this.compareVersion(from),
      toVersion: this.compareVersion(to),
      summary: {
        moves: diffs.filter((diff) => diff.operation === "MOVE").length,
        additions: diffs.filter((diff) => diff.operation === "ADD").length,
        removals: diffs.filter((diff) => diff.operation === "REMOVE").length,
        changedAssignments: diffs.length,
      },
      score: {
        from: fromScore,
        to: toScore,
        delta: scoreAvailable ? Number((toScore! - fromScore!).toFixed(6)) : null,
        available: scoreAvailable,
        lowerIsBetter: true,
      },
      diffs: diffs.map((diff) => ({
        ...diff,
        before: diff.before,
        after: diff.after,
      })),
    };
  }

  async clone(
    schoolId: string,
    sourceVersionId: string,
    actorId: string,
    dto: CloneScheduleVersionDto,
    actorRole: Role = "SCHEDULER",
    correlationId = "unknown",
  ) {
    return this.copyVersion(
      schoolId,
      sourceVersionId,
      actorId,
      dto.reason?.trim() || null,
      "CLONE",
      actorRole,
      correlationId,
    );
  }

  async rollback(
    schoolId: string,
    targetVersionId: string,
    actorId: string,
    dto: RollbackScheduleVersionDto,
    actorRole: Role = "SCHEDULER",
    correlationId = "unknown",
  ) {
    if (targetVersionId === dto.sourceVersionId) {
      throw new BadRequestException({
        code: "SCHEDULE_VERSION_ROLLBACK_SAME_VERSION",
        message: "Rollback cần một source version khác target version.",
      });
    }
    await this.get(schoolId, targetVersionId);
    return this.copyVersion(
      schoolId,
      dto.sourceVersionId,
      actorId,
      dto.reason.trim(),
      "ROLLBACK",
      actorRole,
      correlationId,
      targetVersionId,
    );
  }

  private async copyVersion(
    schoolId: string,
    sourceVersionId: string,
    actorId: string,
    reason: string | null,
    operation: "CLONE" | "ROLLBACK",
    actorRole: Role,
    correlationId: string,
    rollbackTargetVersionId?: string,
  ) {
    const client = await this.pool.connect();
    let inTransaction = false;
    try {
      await client.query("BEGIN");
      inTransaction = true;
      const source = await this.selectVersionForUpdate(client, schoolId, sourceVersionId);
      const assignments = await this.listAssignments(client, schoolId, sourceVersionId);
      const nextVersionNumber = await this.nextVersionNumber(client, schoolId, source.academic_period_id);
      const scheduleSnapshotHash = this.hashAssignments(assignments);
      const result = await client.query<ScheduleVersionRow>(
        `INSERT INTO schedule_versions
          (school_id, academic_period_id, version_number, status, source_run_id,
           created_by, rule_snapshot_id, rule_set_version, rule_snapshot_hash,
           input_snapshot_hash, schedule_snapshot_hash, status_changed_by,
           status_changed_at, status_reason)
         VALUES ($1, $2, $3, 'DRAFT', $4, $5, $6, $7, $8, $9, $10, $5, now(), $11)
         RETURNING id::text, school_id::text, academic_period_id::text, version_number,
                   status, source_run_id::text, created_by, approved_by, approved_at,
                   locked_at, published_at, archived_at, rule_snapshot_id::text,
                   rule_set_version, rule_snapshot_hash, input_snapshot_hash,
                   schedule_snapshot_hash, status_changed_by, status_changed_at,
                   revision, status_reason, created_at, updated_at`,
        [
          schoolId,
          source.academic_period_id,
          nextVersionNumber,
          source.source_run_id,
          actorId,
          source.rule_snapshot_id,
          source.rule_set_version,
          source.rule_snapshot_hash,
          source.input_snapshot_hash,
          scheduleSnapshotHash,
          reason,
        ],
      );
      if (result.rows.length === 0) {
        throw new ConflictException({
          code: "SCHEDULE_VERSION_COPY_FAILED",
          message: "Không thể tạo draft từ snapshot nguồn.",
        });
      }
      const created = result.rows[0];
      await client.query(
        `INSERT INTO schedule_assignments (schedule_version_id, lesson_id, session_index, time_slot_id, room_id)
         SELECT $1, lesson_id, session_index, time_slot_id, room_id
           FROM schedule_assignments
          WHERE schedule_version_id = $2
          ORDER BY lesson_id, session_index`,
        [created.id, sourceVersionId],
      );
      if (this.auditLogs) {
        await this.auditLogs.recordInTransaction(client, {
          schoolId,
          action: "CREATE",
          entityType: "schedule_version",
          entityId: created.id,
          entityKey: created.id,
          actorId,
          actorRole,
          correlationId,
          metadata: {
            operation,
            sourceVersionId,
            sourceVersionNumber: source.version_number,
            createdVersionId: created.id,
            createdVersionNumber: created.version_number,
            rollbackTargetVersionId: rollbackTargetVersionId ?? null,
            reason,
            assignmentCount: assignments.length,
            scheduleSnapshotHash,
          },
        });
      }
      const snapshot = await this.snapshotFromClient(client, created);
      await client.query("COMMIT");
      inTransaction = false;
      return {
        contractVersion: SCHEDULE_VERSION_OPERATIONS_CONTRACT_VERSION,
        operation,
        sourceVersionId,
        rollbackTargetVersionId: rollbackTargetVersionId ?? null,
        reason,
        version: this.toScheduleVersion(created),
        snapshot,
      };
    } catch (error) {
      if (inTransaction) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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

  async transition(
    schoolId: string,
    versionId: string,
    actorId: string,
    dto: TransitionScheduleVersionDto,
    actorRole: Role = "SCHEDULER",
    correlationId = "unknown",
  ) {
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
    this.assertTransitionPolicy(dto.toStatus, actorRole);
    if (["APPROVED", "PUBLISHED"].includes(dto.toStatus) && !dto.reason?.trim()) {
      throw new BadRequestException({
        code: "SCHEDULE_VERSION_REASON_REQUIRED",
        message: "Approval và publish phải có reason để audit.",
      });
    }
    if (dto.toStatus === "APPROVED" || dto.toStatus === "PUBLISHED") {
      return this.transitionWithApprovalOrPublishGate(
        schoolId,
        versionId,
        actorId,
        actorRole,
        correlationId,
        current,
        dto,
      );
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

  private async transitionWithApprovalOrPublishGate(
    schoolId: string,
    versionId: string,
    actorId: string,
    actorRole: Role,
    correlationId: string,
    current: ScheduleVersionRow,
    dto: TransitionScheduleVersionDto,
  ) {
    const client = await this.pool.connect();
    let inTransaction = false;
    try {
      await client.query("BEGIN");
      inTransaction = true;
      const locked = await this.selectVersionForUpdate(client, schoolId, versionId);
      if (locked.status !== current.status || !canTransitionScheduleVersion(locked.status, dto.toStatus)) {
        throw new ConflictException({
          code: "SCHEDULE_VERSION_CONCURRENT_UPDATE",
          message: "Schedule version đã thay đổi; hãy tải lại trước khi approval/publish.",
        });
      }

      const publishGate =
        dto.toStatus === "PUBLISHED" ? await this.validatePublishGate(client, schoolId, versionId, locked) : null;
      const result = await client.query<ScheduleVersionRow>(
        `UPDATE schedule_versions
            SET status = $3,
                status_changed_by = $4,
                status_changed_at = now(),
                status_reason = $5,
                approved_by = CASE WHEN $3 = 'APPROVED' THEN $4 ELSE approved_by END,
                approved_at = CASE WHEN $3 = 'APPROVED' THEN now() ELSE approved_at END,
                published_at = CASE WHEN $3 = 'PUBLISHED' THEN now() ELSE published_at END,
                schedule_snapshot_hash = COALESCE($7, schedule_snapshot_hash),
                updated_at = now(),
                revision = revision + 1
          WHERE id = $1 AND school_id = $2 AND status = $6
         RETURNING id::text, school_id::text, academic_period_id::text, version_number,
                   status, source_run_id::text, created_by, approved_by, approved_at,
                   locked_at, published_at, archived_at, rule_snapshot_id::text,
                   rule_set_version, rule_snapshot_hash, input_snapshot_hash,
                   schedule_snapshot_hash, status_changed_by, status_changed_at,
                   revision, status_reason, created_at, updated_at`,
        [
          versionId,
          schoolId,
          dto.toStatus,
          actorId,
          dto.reason!.trim(),
          locked.status,
          publishGate?.scheduleSnapshotHash ?? null,
        ],
      );
      if (result.rows.length === 0) {
        throw new ConflictException({
          code: "SCHEDULE_VERSION_CONCURRENT_UPDATE",
          message: "Schedule version đã thay đổi; hãy tải lại trước khi approval/publish.",
        });
      }
      if (this.auditLogs) {
        await this.auditLogs.recordInTransaction(client, {
          schoolId,
          action: dto.toStatus === "APPROVED" ? "APPROVE" : "PUBLISH",
          entityType: "schedule_version",
          entityId: versionId,
          entityKey: versionId,
          actorId,
          actorRole,
          correlationId,
          metadata: {
            approval: dto.toStatus === "APPROVED",
            publish: dto.toStatus === "PUBLISHED",
            fromStatus: locked.status,
            toStatus: dto.toStatus,
            reason: dto.reason!.trim(),
            hardValidation: dto.toStatus === "PUBLISHED",
            expectedAssignments: publishGate?.expectedAssignments ?? null,
            actualAssignments: publishGate?.actualAssignments ?? null,
            scheduleSnapshotHash: publishGate?.scheduleSnapshotHash ?? null,
          },
        });
      }
      await client.query("COMMIT");
      inTransaction = false;
      return this.toScheduleVersion(result.rows[0]);
    } catch (error) {
      if (inTransaction) await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private assertTransitionPolicy(toStatus: ScheduleVersionStatus, actorRole: Role) {
    if (["APPROVED", "PUBLISHED", "ARCHIVED"].includes(toStatus) && !["ADMIN", "REVIEWER"].includes(actorRole)) {
      throw new ForbiddenException({
        code: "SCHEDULE_VERSION_APPROVAL_ROLE_REQUIRED",
        message: "Chỉ ADMIN hoặc REVIEWER được approval/publish/archive schedule version.",
        requiredRoles: ["ADMIN", "REVIEWER"],
      });
    }
  }

  private async validatePublishGate(
    client: Queryable,
    schoolId: string,
    versionId: string,
    version: ScheduleVersionRow,
  ) {
    const completeness = await client.query<{
      expected_assignments: number | string;
      actual_assignments: number | string;
    }>(
      `SELECT COALESCE(SUM(lesson.required_sessions), 0)::int AS expected_assignments,
              COUNT(a.id)::int AS actual_assignments
         FROM lesson_requirements lesson
         LEFT JOIN schedule_assignments a
           ON a.lesson_id = lesson.id AND a.schedule_version_id = $3
        WHERE lesson.school_id = $1 AND lesson.academic_period_id = $2`,
      [schoolId, version.academic_period_id, versionId],
    );
    const expectedAssignments = Number(completeness.rows[0]?.expected_assignments ?? 0);
    const actualAssignments = Number(completeness.rows[0]?.actual_assignments ?? 0);
    if (expectedAssignments !== actualAssignments) {
      throw new ConflictException({
        code: "SCHEDULE_VERSION_PUBLISH_GATE_FAILED",
        gate: "COMPLETENESS",
        message: "Không thể publish khi số assignment chưa đủ theo lesson requirement.",
        expectedAssignments,
        actualAssignments,
      });
    }

    const outOfScope = await client.query<{ invalid_count: number | string }>(
      `SELECT COUNT(*)::int AS invalid_count
         FROM schedule_assignments a
         JOIN lesson_requirements lesson ON lesson.id = a.lesson_id
         LEFT JOIN time_slots slot
           ON slot.id = a.time_slot_id
          AND slot.school_id = $1
          AND slot.academic_period_id = $2
         LEFT JOIN rooms room ON room.id = a.room_id AND room.school_id = $1
        WHERE a.schedule_version_id = $3
          AND (lesson.school_id <> $1 OR lesson.academic_period_id <> $2
               OR slot.id IS NULL OR (a.room_id IS NOT NULL AND room.id IS NULL))`,
      [schoolId, version.academic_period_id, versionId],
    );
    const invalidCount = Number(outOfScope.rows[0]?.invalid_count ?? 0);
    if (invalidCount > 0) {
      throw new ConflictException({
        code: "SCHEDULE_VERSION_PUBLISH_GATE_FAILED",
        gate: "SCOPE",
        message: "Assignment hoặc resource nằm ngoài school/academic period scope.",
        invalidCount,
      });
    }

    const conflicts = await client.query<{
      kind: string;
      time_slot_id: string;
      resource_id: string;
      occurrences: number | string;
    }>(
      `SELECT 'CLASS' AS kind, a.time_slot_id::text AS time_slot_id,
              lesson.class_id::text AS resource_id, COUNT(*)::int AS occurrences
         FROM schedule_assignments a
         JOIN lesson_requirements lesson ON lesson.id = a.lesson_id
        WHERE a.schedule_version_id = $1
        GROUP BY a.time_slot_id, lesson.class_id
       HAVING COUNT(*) > 1
        UNION ALL
       SELECT 'TEACHER' AS kind, a.time_slot_id::text, lesson.teacher_id::text, COUNT(*)::int
         FROM schedule_assignments a
         JOIN lesson_requirements lesson ON lesson.id = a.lesson_id
        WHERE a.schedule_version_id = $1
        GROUP BY a.time_slot_id, lesson.teacher_id
       HAVING COUNT(*) > 1
        UNION ALL
       SELECT 'ROOM' AS kind, a.time_slot_id::text, a.room_id::text, COUNT(*)::int
         FROM schedule_assignments a
        WHERE a.schedule_version_id = $1 AND a.room_id IS NOT NULL
        GROUP BY a.time_slot_id, a.room_id
       HAVING COUNT(*) > 1`,
      [versionId],
    );
    if (conflicts.rows.length > 0) {
      throw new ConflictException({
        code: "SCHEDULE_VERSION_PUBLISH_GATE_FAILED",
        gate: "HARD_CONSTRAINTS",
        message: "Không thể publish khi còn xung đột lớp, giáo viên hoặc phòng.",
        conflicts: conflicts.rows,
      });
    }

    const assignments = await this.listAssignments(client, schoolId, versionId);
    return {
      expectedAssignments,
      actualAssignments,
      scheduleSnapshotHash: this.hashAssignments(assignments),
    };
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

  private async listComparisonAssignments(client: Queryable, schoolId: string, versionId: string) {
    const result = await client.query<ComparisonAssignmentRow>(
      `SELECT a.id::text, a.lesson_id::text, a.session_index, a.time_slot_id::text,
              a.room_id::text, subject.name AS subject_label, class.name AS class_label,
              teacher.display_name AS teacher_label, room.name AS room_label,
              ('day-' || slot.day::text || '-period-' || slot.period::text) AS slot_label
         FROM schedule_assignments a
         JOIN lesson_requirements lesson ON lesson.id = a.lesson_id
          AND lesson.school_id = $1
         JOIN subjects subject ON subject.id = lesson.subject_id
          AND subject.school_id = $1
         JOIN classes class ON class.id = lesson.class_id
          AND class.school_id = $1
         JOIN teachers teacher ON teacher.id = lesson.teacher_id
          AND teacher.school_id = $1
         LEFT JOIN rooms room ON room.id = a.room_id
          AND room.school_id = $1
         JOIN time_slots slot ON slot.id = a.time_slot_id
          AND slot.school_id = $1
        WHERE a.schedule_version_id = $2
        ORDER BY a.lesson_id, a.session_index`,
      [schoolId, versionId],
    );
    return result.rows;
  }

  private async qualityScore(schoolId: string, sourceRunId: string | null) {
    if (!sourceRunId) return null;
    const result = await this.pool.query<OptimizationDiagnosticsRow>(
      `SELECT diagnostics
         FROM optimization_runs
        WHERE id = $1 AND school_id = $2`,
      [sourceRunId, schoolId],
    );
    const diagnostics = result.rows[0]?.diagnostics;
    if (!diagnostics) return null;
    const objectiveValue = diagnostics.objectiveValue;
    if (typeof objectiveValue === "number" && Number.isFinite(objectiveValue)) return objectiveValue;
    const breakdown = diagnostics.objectiveBreakdown;
    if (!breakdown || typeof breakdown !== "object") return null;
    const weightedTotal = (breakdown as Record<string, unknown>).weightedTotal;
    return typeof weightedTotal === "number" && Number.isFinite(weightedTotal) ? weightedTotal : null;
  }

  private assignmentKey(assignment: AssignmentRow) {
    return `${assignment.lesson_id}:${assignment.session_index}`;
  }

  private toDiffAssignment(assignment: ComparisonAssignmentRow): ScheduleVersionDiffAssignment {
    return {
      id: assignment.id,
      lessonId: assignment.lesson_id,
      sessionIndex: assignment.session_index,
      timeSlotId: assignment.time_slot_id,
      roomId: assignment.room_id,
      subjectLabel: assignment.subject_label,
      classLabel: assignment.class_label,
      teacherLabel: assignment.teacher_label,
      roomLabel: assignment.room_label,
      slotLabel: assignment.slot_label,
    };
  }

  private compareVersion(row: ScheduleVersionRow) {
    return {
      id: row.id,
      versionNumber: row.version_number,
      status: row.status,
      revision: this.revisionOf(row),
      etag: this.etagOf(row),
    };
  }

  private async nextVersionNumber(client: Queryable, schoolId: string, academicPeriodId: string) {
    await client.query(
      `SELECT id FROM academic_periods
        WHERE id = $1 AND school_id = $2
        FOR UPDATE`,
      [academicPeriodId, schoolId],
    );
    const result = await client.query<{ next_version_number: number }>(
      `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version_number
         FROM schedule_versions
        WHERE school_id = $1 AND academic_period_id = $2`,
      [schoolId, academicPeriodId],
    );
    return Number(result.rows[0]?.next_version_number ?? 1);
  }

  private hashAssignments(assignments: ScheduleAssignmentSnapshot[]) {
    const canonical = assignments.map((assignment) => ({
      lessonId: assignment.lessonId,
      sessionIndex: assignment.sessionIndex,
      timeSlotId: assignment.timeSlotId,
      roomId: assignment.roomId,
    }));
    return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
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
