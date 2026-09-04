import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import type { Pool, QueryResultRow } from "pg";
import {
  computeTeacherAssignmentChecksum,
  DEFAULT_TEACHER_ASSIGNMENT_TIME_LIMIT_SECONDS,
  TEACHER_ASSIGNMENT_ALGORITHM_VERSION,
  TEACHER_ASSIGNMENT_CONTRACT_VERSION,
  TEACHER_ASSIGNMENT_JOB_NAME,
  TEACHER_ASSIGNMENT_QUEUE,
  TEACHER_ASSIGNMENT_QUEUE_CONTRACT_VERSION,
  type TeacherAssignmentDemand,
  type TeacherAssignmentJobData,
  type TeacherAssignmentPreflightReport,
  type TeacherAssignmentSolveRequest,
} from "../contracts";
import { AuditLogService } from "../auth/audit-log.service";
import type { Role } from "../auth/auth.constants";
import { PG_POOL } from "../database/database.module";
import { parseRedisConnection } from "../jobs/redis-connection";
import { TeacherLoadService } from "../rules/teacher-load.service";
import { RuleManagementService } from "../rules/rule-management.service";
import {
  CreateTeacherAssignmentDemandDto,
  CreateTeacherAssignmentRunDto,
  UpdateTeacherAssignmentDemandDto,
} from "./teacher-assignment.dto";
import { TeacherAssignmentRunStore, type TeacherAssignmentRunSnapshot } from "./teacher-assignment-run.store";

const MAX_ATTEMPTS = 3;
const STALE_AFTER_MS = 15_000;

interface DemandRow extends QueryResultRow {
  id: string;
  school_id: string;
  academic_period_id: string;
  class_id: string;
  class_code: string;
  class_name: string;
  grade: number;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  room_id: string | null;
  fixed_slot_id: string | null;
  required_sessions: number;
  activity_type: "LESSON" | "FLAG_CEREMONY";
  status: "ACTIVE" | "ARCHIVED";
  revision: number;
  current_teacher_id: string | null;
  current_teacher_code: string | null;
  current_teacher_name: string | null;
  current_assignment_source: "MANUAL" | "AUTO" | null;
  current_assignment_locked: boolean | null;
}

interface TeacherRow extends QueryResultRow {
  id: string;
  code: string;
  display_name: string;
}

interface EligibilityRow extends QueryResultRow {
  teacher_id: string;
  subject_id: string;
  grade: number;
}

interface LessonAssignmentRow extends QueryResultRow {
  id: string;
  demand_id: string | null;
  teacher_id: string;
  assignment_source: "MANUAL" | "AUTO";
  assignment_locked: boolean;
}

@Injectable()
export class TeacherAssignmentService implements OnModuleDestroy {
  private queue?: Queue<TeacherAssignmentJobData>;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly config: ConfigService,
    private readonly runStore: TeacherAssignmentRunStore,
    private readonly teacherLoad: TeacherLoadService,
    private readonly ruleManagement: RuleManagementService,
    private readonly auditLogs: AuditLogService,
  ) {}

  async onModuleDestroy() {
    await this.queue?.close();
  }

  async listDemands(schoolId: string, periodId: string) {
    await this.ensurePeriod(schoolId, periodId);
    const result = await this.pool.query<DemandRow>(
      `SELECT demand.id::text,
              demand.school_id::text,
              demand.academic_period_id::text,
              demand.class_id::text,
              class.code AS class_code,
              class.name AS class_name,
              class.grade,
              demand.subject_id::text,
              subject.code AS subject_code,
              subject.name AS subject_name,
              demand.room_id::text,
              demand.fixed_slot_id::text,
              demand.required_sessions,
              demand.activity_type,
              demand.status,
              demand.revision,
              current_assignment.teacher_id::text AS current_teacher_id,
              current_assignment.teacher_code AS current_teacher_code,
              current_assignment.teacher_name AS current_teacher_name,
              current_assignment.assignment_source AS current_assignment_source,
              current_assignment.assignment_locked AS current_assignment_locked
         FROM class_subject_demands AS demand
         JOIN classes AS class
           ON class.tenant_id = demand.tenant_id
          AND class.id = demand.class_id
         JOIN subjects AS subject
           ON subject.tenant_id = demand.tenant_id
          AND subject.id = demand.subject_id
         LEFT JOIN LATERAL (
           SELECT lesson.teacher_id,
                  teacher.code AS teacher_code,
                  teacher.display_name AS teacher_name,
                  lesson.assignment_source,
                  lesson.assignment_locked
             FROM lesson_requirements AS lesson
             LEFT JOIN teachers AS teacher
               ON teacher.tenant_id = lesson.tenant_id
              AND teacher.id = lesson.teacher_id
            WHERE lesson.tenant_id = demand.tenant_id
              AND lesson.demand_id = demand.id
              AND lesson.status = 'ACTIVE'
            ORDER BY lesson.assignment_locked DESC, lesson.updated_at DESC, lesson.id DESC
            LIMIT 1
         ) AS current_assignment ON TRUE
        WHERE demand.school_id = $1
          AND demand.academic_period_id = $2
        ORDER BY class.code, subject.code, demand.id`,
      [schoolId, periodId],
    );
    return result.rows.map((row) => this.toDemand(row));
  }

  async createDemand(schoolId: string, periodId: string, dto: CreateTeacherAssignmentDemandDto) {
    const period = await this.ensurePeriod(schoolId, periodId);
    if (period.status === "ARCHIVED") {
      throw new ConflictException({
        code: "ACADEMIC_PERIOD_ARCHIVED",
        message: "Không thể thêm nhu cầu vào khung năm học đã lưu trữ.",
      });
    }
    const classRow = await this.ensureActiveReference("classes", dto.classId, schoolId, "Lớp");
    await this.ensureActiveReference("subjects", dto.subjectId, schoolId, "Môn học");
    if (dto.roomId) await this.ensureActiveReference("rooms", dto.roomId, schoolId, "Phòng học");
    if (dto.fixedSlotId) await this.ensureSlot(schoolId, periodId, dto.fixedSlotId);
    try {
      const result = await this.pool.query<DemandRow>(
        `INSERT INTO class_subject_demands
           (tenant_id, school_id, academic_period_id, class_id, subject_id, room_id, fixed_slot_id,
            required_sessions, activity_type, source_ref)
         SELECT period.tenant_id, $1, $2, $3, $4, $5, $6, $7, $8, 'MANUAL_UI'
           FROM academic_periods AS period
          WHERE period.id = $2 AND period.school_id = $1
         RETURNING id::text, school_id::text, academic_period_id::text, class_id::text,
                   '' AS class_code, '' AS class_name, $9::int AS grade, subject_id::text,
                   '' AS subject_code, '' AS subject_name, room_id::text, fixed_slot_id::text,
                   required_sessions, activity_type, status, revision,
                   NULL::text AS current_teacher_id, NULL::text AS current_teacher_code,
                   NULL::text AS current_teacher_name, NULL::text AS current_assignment_source,
                   FALSE AS current_assignment_locked`,
        [
          schoolId,
          periodId,
          dto.classId,
          dto.subjectId,
          dto.roomId ?? null,
          dto.fixedSlotId ?? null,
          dto.requiredSessions,
          dto.activityType ?? "LESSON",
          classRow.grade,
        ],
      );
      if (!result.rows[0]) throw new NotFoundException("Không thể tạo nhu cầu môn học cho lớp.");
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ConflictException({
          code: "DUPLICATE_CLASS_SUBJECT_DEMAND",
          message: "Nhu cầu môn học của lớp đã tồn tại trong kỳ học.",
        });
      }
      throw error;
    }
    const demands = await this.listDemands(schoolId, periodId);
    return demands.find(
      (demand) =>
        demand.classId === dto.classId &&
        demand.subjectId === dto.subjectId &&
        demand.activityType === (dto.activityType ?? "LESSON"),
    );
  }

  async updateDemand(schoolId: string, periodId: string, demandId: string, dto: UpdateTeacherAssignmentDemandDto) {
    await this.ensurePeriod(schoolId, periodId);
    const current = await this.getDemandRow(schoolId, periodId, demandId);
    if (current.status === "ARCHIVED") throw new ConflictException("Không thể sửa nhu cầu đã lưu trữ.");
    if (dto.roomId) await this.ensureActiveReference("rooms", dto.roomId, schoolId, "Phòng học");
    if (dto.fixedSlotId) await this.ensureSlot(schoolId, periodId, dto.fixedSlotId);
    const values: unknown[] = [];
    const updates: string[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };
    if (dto.requiredSessions !== undefined) add("required_sessions", dto.requiredSessions);
    if (dto.roomId !== undefined) add("room_id", dto.roomId ?? null);
    if (dto.fixedSlotId !== undefined) add("fixed_slot_id", dto.fixedSlotId ?? null);
    if (!updates.length)
      throw new BadRequestException({ code: "NO_FIELDS_TO_UPDATE", message: "Không có trường để cập nhật." });
    updates.push("revision = revision + 1", "updated_at = now()");
    values.push(demandId, schoolId, periodId);
    await this.pool.query(
      `UPDATE class_subject_demands
          SET ${updates.join(", ")}
        WHERE id = $${values.length - 2} AND school_id = $${values.length - 1} AND academic_period_id = $${values.length}`,
      values,
    );
    return (await this.listDemands(schoolId, periodId)).find((demand) => demand.id === demandId);
  }

  async archiveDemand(schoolId: string, periodId: string, demandId: string) {
    await this.ensurePeriod(schoolId, periodId);
    const result = await this.pool.query<{ id: string }>(
      `UPDATE class_subject_demands
          SET status = 'ARCHIVED', revision = revision + 1, updated_at = now()
        WHERE id = $1 AND school_id = $2 AND academic_period_id = $3 AND status = 'ACTIVE'
      RETURNING id::text`,
      [demandId, schoolId, periodId],
    );
    if (!result.rows[0]) throw new NotFoundException("Nhu cầu lớp-môn không tồn tại hoặc đã lưu trữ.");
    return { id: result.rows[0].id, archived: true };
  }

  async preflight(schoolId: string, periodId: string) {
    const demands = await this.listDemands(schoolId, periodId);
    const eligibility = await this.listEligibility(schoolId, periodId);
    const activeTeachers = await this.listTeachers(schoolId);
    const teacherIds = new Set(activeTeachers.map((teacher) => teacher.id));
    const eligibilityKeys = new Set(eligibility.map((item) => `${item.teacher_id}|${item.subject_id}|${item.grade}`));
    const issues: TeacherAssignmentPreflightReport["issues"] = [];
    let candidatePairCount = 0;
    const demandsWithoutCandidate: string[] = [];
    let lockedAssignmentCount = 0;
    for (const demand of demands) {
      if (demand.currentAssignmentLocked && demand.currentTeacherId) {
        lockedAssignmentCount += 1;
        if (!teacherIds.has(demand.currentTeacherId)) {
          issues.push({
            code: "LOCKED_TEACHER_NOT_ACTIVE",
            severity: "ERROR",
            demandId: demand.id,
            teacherId: demand.currentTeacherId,
            message: `Phân công đã khóa của nhu cầu ${demand.classCode} - ${demand.subjectCode} trỏ đến giáo viên không còn hoạt động.`,
          });
        }
        continue;
      }
      const candidateCount = eligibility.filter(
        (item) =>
          item.subject_id === demand.subjectId && item.grade === demand.grade && teacherIds.has(item.teacher_id),
      ).length;
      candidatePairCount += candidateCount;
      if (!candidateCount) {
        demandsWithoutCandidate.push(demand.id);
        issues.push({
          code: "NO_ELIGIBLE_TEACHER",
          severity: "WARNING",
          demandId: demand.id,
          message: `Chưa có giáo viên phù hợp để dạy ${demand.subjectCode} cho ${demand.classCode} (khối ${demand.grade}).`,
        });
      }
      if (
        demand.currentTeacherId &&
        !eligibilityKeys.has(`${demand.currentTeacherId}|${demand.subjectId}|${demand.grade}`)
      ) {
        issues.push({
          code: "CURRENT_ASSIGNMENT_NOT_ELIGIBLE",
          severity: "WARNING",
          demandId: demand.id,
          teacherId: demand.currentTeacherId,
          message: `Phân công hiện tại của ${demand.classCode} - ${demand.subjectCode} chưa có mapping môn-khối tương ứng.`,
        });
      }
    }
    if (!demands.length) {
      issues.push({
        code: "NO_TEACHING_DEMANDS",
        severity: "ERROR",
        message: "Chưa có nhu cầu lớp-môn để tự động phân công giáo viên.",
      });
    }
    return {
      contractVersion: TEACHER_ASSIGNMENT_CONTRACT_VERSION,
      canRun: demands.length > 0 && issues.every((issue) => issue.severity !== "ERROR"),
      totalDemandCount: demands.length,
      lockedAssignmentCount,
      candidatePairCount,
      demandsWithoutCandidate,
      issues,
      warnings: issues.filter((issue) => issue.severity === "WARNING").map((issue) => issue.message),
    } satisfies TeacherAssignmentPreflightReport;
  }

  async enqueue(
    schoolId: string,
    periodId: string,
    dto: CreateTeacherAssignmentRunDto,
    actorId: string,
    tenantId: string | undefined,
    traceId?: string,
  ) {
    const request = await this.buildRequest(
      schoolId,
      periodId,
      `teacher-assignment-${Date.now()}-${randomUUID().slice(0, 8)}`,
      dto,
    );
    const report = await this.preflight(schoolId, periodId);
    if (!report.canRun) {
      throw new BadRequestException({
        code: "TEACHER_ASSIGNMENT_PREFLIGHT_FAILED",
        message: "Dữ liệu chưa đủ để tự động phân công.",
        details: report,
      });
    }
    const runId = randomUUID();
    const inputChecksum = this.requestChecksum(request);
    const run = await this.runStore.create({
      runId,
      jobId: request.jobId,
      schoolId,
      academicPeriodId: periodId,
      inputChecksum,
      payload: request,
      randomSeed: request.randomSeed,
      requestedBy: actorId,
      maxAttempts: MAX_ATTEMPTS,
    });
    const job = await this.getQueue().add(
      TEACHER_ASSIGNMENT_JOB_NAME,
      {
        queueContractVersion: TEACHER_ASSIGNMENT_QUEUE_CONTRACT_VERSION,
        runId,
        request,
        inputChecksum,
        maxAttempts: MAX_ATTEMPTS,
        traceId: traceId ?? request.jobId,
        tenantId,
      },
      {
        jobId: request.jobId,
        attempts: MAX_ATTEMPTS,
        backoff: { type: "exponential", delay: 500 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    return { runId: run.id, jobId: job.id, state: run.status, inputChecksum, queue: TEACHER_ASSIGNMENT_QUEUE };
  }

  async getStatus(schoolId: string, periodId: string, runId: string) {
    const run = await this.runStore.findById(schoolId, periodId, runId);
    if (!run) throw new NotFoundException("Không tìm thấy lần chạy phân công giáo viên.");
    const proposals = await this.runStore.listProposals(runId);
    const unassignedCount = proposals.filter(
      (proposal) => proposal.status === "UNASSIGNED" || !proposal.teacherId,
    ).length;
    return {
      ...run,
      proposals,
      unassignedCount,
      canConfirm: ["OPTIMAL", "FEASIBLE"].includes(run.status) && unassignedCount === 0 && !run.cancelRequestedAt,
      canCancel: run.status === "QUEUED" || run.status === "RUNNING",
      canRetry: ["FAILED", "CANCELLED", "UNKNOWN", "PARTIAL"].includes(run.status),
      progress: {
        stage: run.progressStage,
        percent: [
          "PROPOSED",
          "PARTIAL",
          "INFEASIBLE",
          "UNKNOWN",
          "CONFIRMED",
          "REJECTED",
          "FAILED",
          "CANCELLED",
        ].includes(run.status)
          ? 100
          : null,
        heartbeatAt: run.heartbeatAt,
        isStalled: this.isStalled(run),
      },
    };
  }

  async cancel(schoolId: string, periodId: string, runId: string, reason = "Yêu cầu từ giao diện") {
    const run = await this.runStore.findById(schoolId, periodId, runId);
    if (!run) throw new NotFoundException("Không tìm thấy lần chạy phân công giáo viên.");
    if (run.status === "QUEUED" || run.status === "RUNNING") {
      await this.runStore.requestCancel(schoolId, periodId, runId, reason);
      const job = await this.getQueue().getJob(run.jobId);
      if (job && run.status === "QUEUED") await job.remove().catch(() => undefined);
    }
    return this.getStatus(schoolId, periodId, runId);
  }

  async retry(
    schoolId: string,
    periodId: string,
    runId: string,
    actorId: string,
    tenantId: string | undefined,
    retryKey?: string,
  ) {
    if (!retryKey?.trim()) throw new BadRequestException("Idempotency-Key là bắt buộc khi thử lại phân công.");
    const source = await this.runStore.findById(schoolId, periodId, runId);
    if (!source) throw new NotFoundException("Không tìm thấy lần chạy phân công giáo viên.");
    if (!["FAILED", "CANCELLED", "UNKNOWN", "PARTIAL"].includes(source.status)) {
      throw new ConflictException("Chỉ được thử lại lần chạy FAILED, CANCELLED, UNKNOWN hoặc PARTIAL.");
    }
    const existing = await this.runStore.findByRetryKey(schoolId, retryKey);
    if (existing) return this.getStatus(schoolId, periodId, existing.id);
    const request = { ...source.payload, jobId: `${source.jobId}:retry:${randomUUID().slice(0, 8)}` };
    const inputChecksum = this.requestChecksum(request);
    const next = await this.runStore.create({
      runId: randomUUID(),
      jobId: request.jobId,
      schoolId,
      academicPeriodId: periodId,
      inputChecksum,
      payload: request,
      randomSeed: request.randomSeed,
      requestedBy: actorId,
      maxAttempts: MAX_ATTEMPTS,
    });
    await this.pool.query(`UPDATE teacher_assignment_runs SET retry_key = $1, retry_of_run_id = $2 WHERE id = $3`, [
      retryKey,
      source.id,
      next.id,
    ]);
    await this.getQueue().add(
      TEACHER_ASSIGNMENT_JOB_NAME,
      {
        queueContractVersion: TEACHER_ASSIGNMENT_QUEUE_CONTRACT_VERSION,
        runId: next.id,
        request,
        inputChecksum,
        maxAttempts: MAX_ATTEMPTS,
        traceId: request.jobId,
        tenantId,
      },
      {
        jobId: request.jobId,
        attempts: MAX_ATTEMPTS,
        backoff: { type: "exponential", delay: 500 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
    return this.getStatus(schoolId, periodId, next.id);
  }

  async reject(schoolId: string, periodId: string, runId: string, actorId: string, actorRole: Role, reason?: string) {
    const run = await this.runStore.findById(schoolId, periodId, runId);
    if (!run) throw new NotFoundException("Không tìm thấy lần chạy phân công giáo viên.");
    if (!["PROPOSED", "OPTIMAL", "FEASIBLE", "PARTIAL", "INFEASIBLE", "UNKNOWN"].includes(run.status)) {
      throw new ConflictException("Lần chạy không ở trạng thái có thể từ chối.");
    }
    await this.pool.query(
      `UPDATE teacher_assignment_runs
          SET status = 'REJECTED', progress_stage = 'COMPLETED', completed_at = COALESCE(completed_at, now()), updated_at = now(),
              last_error = $4::jsonb
        WHERE id = $1 AND school_id = $2 AND academic_period_id = $3`,
      [
        runId,
        schoolId,
        periodId,
        JSON.stringify({ code: "PROPOSAL_REJECTED", message: reason?.trim() || "Proposal bị từ chối." }),
      ],
    );
    await this.auditLogs.record({
      schoolId,
      action: "UPDATE",
      entityType: "teacher_assignment_run",
      entityId: runId,
      actorId,
      actorRole,
      correlationId: `teacher-assignment:${runId}`,
      metadata: { status: "REJECTED", reason: reason?.trim() || null },
    });
    return this.getStatus(schoolId, periodId, runId);
  }

  async confirm(
    schoolId: string,
    periodId: string,
    runId: string,
    actorId: string,
    actorRole: Role,
    idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) throw new BadRequestException("Idempotency-Key là bắt buộc khi xác nhận phân công.");
    const run = await this.runStore.findById(schoolId, periodId, runId);
    if (!run) throw new NotFoundException("Không tìm thấy lần chạy phân công giáo viên.");
    if (run.status === "CONFIRMED") return this.getStatus(schoolId, periodId, runId);
    if (!["PROPOSED", "OPTIMAL", "FEASIBLE"].includes(run.status)) {
      throw new ConflictException("Chỉ proposal đã có kết quả khả thi mới được xác nhận.");
    }
    const proposals = await this.runStore.listProposals(runId);
    if (proposals.some((proposal) => !proposal.teacherId || proposal.status === "UNASSIGNED")) {
      throw new ConflictException("Không thể xác nhận khi còn nhu cầu chưa được gán giáo viên.");
    }
    const currentRequest = await this.buildRequest(
      schoolId,
      periodId,
      run.payload.jobId,
      {
        randomSeed: run.payload.randomSeed,
        options: run.payload.options,
      },
      run.payload.ruleSnapshotId,
    );
    if (this.requestChecksum(currentRequest) !== run.inputChecksum) {
      throw new ConflictException({
        code: "TEACHER_ASSIGNMENT_PROPOSAL_STALE",
        message: "Dữ liệu đã thay đổi sau khi tạo proposal; cần chạy lại auto assignment.",
      });
    }
    const demands = new Map((await this.listDemands(schoolId, periodId)).map((demand) => [demand.id, demand]));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const lockedRun = await client.query<{ status: string; cancel_requested_at: string | null }>(
        `SELECT status, cancel_requested_at FROM teacher_assignment_runs WHERE id = $1 AND school_id = $2 AND academic_period_id = $3 FOR UPDATE`,
        [runId, schoolId, periodId],
      );
      const current = lockedRun.rows[0];
      if (!current) throw new NotFoundException("Không tìm thấy lần chạy phân công giáo viên.");
      if (current.status === "CONFIRMED") {
        await client.query("COMMIT");
        return this.getStatus(schoolId, periodId, runId);
      }
      if (current.cancel_requested_at) throw new ConflictException("Proposal đã có yêu cầu hủy.");
      for (const proposal of proposals) {
        const demand = demands.get(proposal.demandId);
        if (!demand || !proposal.teacherId)
          throw new ConflictException("Proposal tham chiếu nhu cầu không còn tồn tại.");
        const existing = await client.query<LessonAssignmentRow>(
          `SELECT id::text, demand_id::text, teacher_id::text, assignment_source, assignment_locked
             FROM lesson_requirements
            WHERE tenant_id = (SELECT tenant_id FROM teacher_assignment_runs WHERE id = $1)
              AND school_id = $2 AND academic_period_id = $3 AND demand_id = $4 AND status = 'ACTIVE'
            ORDER BY assignment_locked DESC, updated_at DESC, id DESC
            LIMIT 1`,
          [runId, schoolId, periodId, demand.id],
        );
        const existingRow = existing.rows[0];
        if (existingRow?.assignment_locked && existingRow.teacher_id !== proposal.teacherId) {
          throw new ConflictException("Proposal không được ghi đè phân công thủ công đã khóa.");
        }
        if (existingRow) {
          await client.query(
            `UPDATE lesson_requirements
                SET teacher_id = $1, room_id = $2, required_sessions = $3, fixed_slot_id = $4,
                    assignment_source = CASE WHEN assignment_source = 'MANUAL' THEN 'MANUAL' ELSE 'AUTO' END,
                    assignment_locked = CASE WHEN assignment_source = 'MANUAL' THEN assignment_locked ELSE TRUE END,
                    assignment_run_id = CASE WHEN assignment_source = 'MANUAL' THEN assignment_run_id ELSE $5 END,
                    updated_at = now()
              WHERE id = $6`,
            [
              proposal.teacherId,
              demand.roomId ?? null,
              demand.requiredSessions,
              demand.fixedSlotId ?? null,
              runId,
              existingRow.id,
            ],
          );
        } else {
          await client.query(
            `INSERT INTO lesson_requirements
              (tenant_id, school_id, academic_period_id, class_id, subject_id, teacher_id, room_id, required_sessions,
               fixed_slot_id, activity_type, status, demand_id, assignment_source, assignment_locked, assignment_run_id)
             SELECT tenant_id, $1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE', $10, 'AUTO', TRUE, $11
               FROM academic_periods
              WHERE school_id = $1 AND id = $2`,
            [
              schoolId,
              periodId,
              demand.classId,
              demand.subjectId,
              proposal.teacherId,
              demand.roomId ?? null,
              demand.requiredSessions,
              demand.fixedSlotId ?? null,
              demand.activityType,
              demand.id,
              runId,
            ],
          );
        }
      }
      await client.query(
        `UPDATE teacher_assignment_runs
            SET status = 'CONFIRMED', progress_stage = 'COMPLETED', confirmed_by = $2, confirmed_at = now(),
                completed_at = COALESCE(completed_at, now()), updated_at = now()
          WHERE id = $1`,
        [runId, actorId],
      );
      await this.auditLogs.recordInTransaction(client, {
        schoolId,
        action: "SOLVE",
        entityType: "teacher_assignment_run",
        entityId: runId,
        actorId,
        actorRole,
        correlationId: `teacher-assignment:${runId}`,
        metadata: { status: "CONFIRMED", proposalCount: proposals.length, idempotencyKey },
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return this.getStatus(schoolId, periodId, runId);
  }

  async buildRequestForWorker(payload: TeacherAssignmentSolveRequest) {
    return payload;
  }

  private async buildRequest(
    schoolId: string,
    periodId: string,
    jobId: string,
    dto: CreateTeacherAssignmentRunDto,
    snapshotId?: string,
  ): Promise<TeacherAssignmentSolveRequest> {
    const resolution = await this.ruleManagement.resolveForSolve(schoolId, periodId, undefined, snapshotId);
    if (!resolution.resolved) {
      throw new BadRequestException({
        code: "RULE_SNAPSHOT_NOT_APPLICABLE",
        message: "Chưa có rule snapshot đã phê duyệt phù hợp để phân công giáo viên.",
        details: { reason: resolution.reason },
      });
    }
    const [demands, teachers, eligibility, loads] = await Promise.all([
      this.listDemands(schoolId, periodId),
      this.listTeachers(schoolId),
      this.listEligibility(schoolId, periodId),
      this.teacherLoad.listTeacherLoads(schoolId, periodId, resolution.snapshot.snapshotId),
    ]);
    const loadByTeacher = new Map(loads.loads.map((load) => [load.teacherId, load]));
    return {
      contractVersion: TEACHER_ASSIGNMENT_CONTRACT_VERSION,
      algorithmVersion: TEACHER_ASSIGNMENT_ALGORITHM_VERSION,
      jobId,
      schoolId,
      academicPeriodId: periodId,
      ruleSnapshotId: resolution.snapshot.snapshotId,
      ruleSetVersion: resolution.snapshot.ruleSetVersion,
      ruleSnapshotHash: resolution.snapshot.snapshotHash,
      randomSeed: dto.randomSeed ?? 0,
      options: {
        timeLimitSeconds:
          dto.options?.timeLimitSeconds === undefined
            ? DEFAULT_TEACHER_ASSIGNMENT_TIME_LIMIT_SECONDS
            : dto.options.timeLimitSeconds,
      },
      demands: demands
        .filter((demand) => demand.status === "ACTIVE")
        .map((demand) => ({
          id: demand.id,
          classId: demand.classId,
          grade: demand.grade,
          subjectId: demand.subjectId,
          requiredSessions: demand.requiredSessions,
          roomId: demand.roomId ?? null,
          fixedSlotId: demand.fixedSlotId ?? null,
          activityType: demand.activityType,
        })),
      teachers: teachers.map((teacher) => {
        const load = loadByTeacher.get(teacher.id);
        return {
          id: teacher.id,
          code: teacher.code,
          name: teacher.display_name,
          assignedWeeklySessions: load?.assignedAverageWeeklySessions ?? 0,
          adjustedWeeklyTarget: load?.targetAverageWeeklySessions ?? 0,
          hardWeeklyLimitSessions: load?.hardWeeklyLimitSessions ?? null,
        };
      }),
      eligibility: eligibility.map((item) => ({
        teacherId: item.teacher_id,
        subjectId: item.subject_id,
        grade: item.grade,
      })),
      manualAssignments: demands
        .filter((demand) => demand.currentTeacherId && demand.currentAssignmentLocked)
        .map((demand) => ({
          demandId: demand.id,
          teacherId: demand.currentTeacherId!,
          requiredSessions: demand.requiredSessions,
          locked: true,
        })),
    };
  }

  private requestChecksum(request: TeacherAssignmentSolveRequest) {
    const unsigned = Object.fromEntries(Object.entries(request).filter(([key]) => key !== "jobId"));
    return computeTeacherAssignmentChecksum(unsigned);
  }

  private async listTeachers(schoolId: string) {
    const result = await this.pool.query<TeacherRow>(
      `SELECT id::text, code, display_name FROM teachers WHERE school_id = $1 AND status = 'ACTIVE' ORDER BY code`,
      [schoolId],
    );
    return result.rows;
  }

  private async listEligibility(schoolId: string, periodId: string) {
    const result = await this.pool.query<EligibilityRow>(
      `SELECT teacher_id::text, subject_id::text, grade
         FROM teacher_subject_grade_assignments
        WHERE school_id = $1 AND academic_period_id = $2 AND status = 'ACTIVE'
        ORDER BY teacher_id, subject_id, grade`,
      [schoolId, periodId],
    );
    return result.rows;
  }

  private async getDemandRow(schoolId: string, periodId: string, demandId: string) {
    const demands = await this.listDemands(schoolId, periodId);
    const demand = demands.find((item) => item.id === demandId);
    if (!demand) throw new NotFoundException("Nhu cầu lớp-môn không tồn tại trong kỳ học.");
    return demand;
  }

  private async ensurePeriod(schoolId: string, periodId: string) {
    const result = await this.pool.query<{ id: string; tenant_id: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED" }>(
      `SELECT id::text, tenant_id::text, status FROM academic_periods WHERE id = $1 AND school_id = $2`,
      [periodId, schoolId],
    );
    const period = result.rows[0];
    if (!period) throw new NotFoundException("Khung năm học không tồn tại trong phạm vi trường.");
    return period;
  }

  private async ensureActiveReference(
    table: "classes" | "subjects" | "rooms",
    id: string,
    schoolId: string,
    label: string,
  ) {
    const result = await this.pool.query<{ id: string; grade?: number }>(
      `SELECT id::text${table === "classes" ? ", grade" : ""} FROM ${table} WHERE id = $1 AND school_id = $2 AND status = 'ACTIVE'`,
      [id, schoolId],
    );
    if (!result.rows[0]) throw new NotFoundException(`${label} không tồn tại hoặc đã lưu trữ trong phạm vi trường.`);
    return result.rows[0];
  }

  private async ensureSlot(schoolId: string, periodId: string, slotId: string) {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id::text FROM time_slots WHERE id = $1 AND school_id = $2 AND academic_period_id = $3`,
      [slotId, schoolId, periodId],
    );
    if (!result.rows[0]) throw new NotFoundException("Khung tiết không tồn tại trong kỳ học.");
  }

  private toDemand(row: DemandRow): TeacherAssignmentDemand {
    return {
      id: row.id,
      schoolId: row.school_id,
      academicPeriodId: row.academic_period_id,
      classId: row.class_id,
      classCode: row.class_code,
      className: row.class_name,
      grade: Number(row.grade),
      subjectId: row.subject_id,
      subjectCode: row.subject_code,
      subjectName: row.subject_name,
      roomId: row.room_id,
      fixedSlotId: row.fixed_slot_id,
      requiredSessions: Number(row.required_sessions),
      activityType: row.activity_type,
      status: row.status,
      currentTeacherId: row.current_teacher_id,
      currentTeacherCode: row.current_teacher_code,
      currentTeacherName: row.current_teacher_name,
      currentAssignmentSource: row.current_assignment_source,
      currentAssignmentLocked: Boolean(row.current_assignment_locked),
      revision: Number(row.revision),
    };
  }

  private getQueue() {
    if (!this.queue) {
      this.queue = new Queue<TeacherAssignmentJobData>(TEACHER_ASSIGNMENT_QUEUE, {
        connection: parseRedisConnection(this.config.getOrThrow<string>("REDIS_URL")),
      });
    }
    return this.queue;
  }

  private isStalled(run: TeacherAssignmentRunSnapshot) {
    if (!run || !["QUEUED", "RUNNING"].includes(run.status)) return false;
    const reference =
      run.heartbeatAt ?? (run.status === "QUEUED" ? run.requestedAt : (run.startedAt ?? run.requestedAt));
    return Date.now() - new Date(reference).getTime() > STALE_AFTER_MS;
  }
}
