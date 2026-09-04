import { Inject, Injectable } from "@nestjs/common";
import type { Pool, QueryResultRow } from "pg";
import {
  computeTeacherAssignmentChecksum,
  type TeacherAssignmentJobData,
  type TeacherAssignmentProposal,
  type TeacherAssignmentRunStatus,
  type TeacherAssignmentSolveResult,
} from "../contracts";
import { PG_POOL } from "../database/database.module";

interface TeacherAssignmentRunRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  school_id: string;
  academic_period_id: string;
  job_id: string;
  status: TeacherAssignmentRunStatus;
  progress_stage: "QUEUED" | "RUNNING" | "PERSISTING" | "COMPLETED" | "FAILED" | "CANCELLED";
  contract_version: string;
  algorithm_version: string;
  random_seed: number;
  input_checksum: string;
  output_checksum: string | null;
  payload: TeacherAssignmentJobData["request"];
  result: TeacherAssignmentSolveResult | null;
  diagnostics: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  last_error: { code: string; message: string } | null;
  requested_by: string;
  confirmed_by: string | null;
  confirmed_at: string | Date | null;
  cancel_requested_at: string | Date | null;
  cancel_reason: string | null;
  retry_key: string | null;
  retry_of_run_id: string | null;
  requested_at: string | Date;
  started_at: string | Date | null;
  heartbeat_at: string | Date | null;
  completed_at: string | Date | null;
  updated_at: string | Date;
}

interface CreateRunInput {
  runId: string;
  jobId: string;
  schoolId: string;
  academicPeriodId: string;
  inputChecksum: string;
  payload: TeacherAssignmentJobData["request"];
  randomSeed: number;
  requestedBy: string;
  maxAttempts: number;
}

export interface TeacherAssignmentRunSnapshot {
  id: string;
  tenantId: string;
  schoolId: string;
  academicPeriodId: string;
  jobId: string;
  status: TeacherAssignmentRunStatus;
  progressStage: "QUEUED" | "RUNNING" | "PERSISTING" | "COMPLETED" | "FAILED" | "CANCELLED";
  contractVersion: string;
  algorithmVersion: string;
  randomSeed: number;
  inputChecksum: string;
  outputChecksum: string | null;
  payload: TeacherAssignmentJobData["request"];
  result: TeacherAssignmentSolveResult | null;
  diagnostics: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  lastError: { code: string; message: string } | null;
  requestedBy: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  cancelRequestedAt: string | null;
  cancelReason: string | null;
  retryKey: string | null;
  retryOfRunId: string | null;
  requestedAt: string;
  startedAt: string | null;
  heartbeatAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

@Injectable()
export class TeacherAssignmentRunStore {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(input: CreateRunInput): Promise<TeacherAssignmentRunSnapshot> {
    const result = await this.pool.query<TeacherAssignmentRunRow>(
      `INSERT INTO teacher_assignment_runs
         (tenant_id, id, school_id, academic_period_id, job_id, status, progress_stage,
          contract_version, algorithm_version, random_seed, input_checksum, payload,
          requested_by, max_attempts)
       SELECT school.tenant_id, $1, $2, $3, $4, 'QUEUED', 'QUEUED',
              'TEACHER-ASSIGNMENT-1.0.0', 'TEACHER-ASSIGNMENT-1.0.0', $5, $6, $7::jsonb,
              $8, $9
         FROM schools AS school
        WHERE school.id = $2
       RETURNING ${this.selectColumns()}`,
      [
        input.runId,
        input.schoolId,
        input.academicPeriodId,
        input.jobId,
        input.randomSeed,
        input.inputChecksum,
        JSON.stringify(input.payload),
        input.requestedBy,
        input.maxAttempts,
      ],
    );
    if (!result.rows[0]) throw new Error("Không thể tạo lần chạy phân công giáo viên trong phạm vi trường.");
    return this.toSnapshot(result.rows[0]);
  }

  async findById(schoolId: string, periodId: string, runId: string): Promise<TeacherAssignmentRunSnapshot | null> {
    const result = await this.pool.query<TeacherAssignmentRunRow>(
      `SELECT ${this.selectColumns()}
         FROM teacher_assignment_runs
        WHERE id = $1 AND school_id = $2 AND academic_period_id = $3`,
      [runId, schoolId, periodId],
    );
    return result.rows[0] ? this.toSnapshot(result.rows[0]) : null;
  }

  async findByRetryKey(schoolId: string, retryKey: string): Promise<TeacherAssignmentRunSnapshot | null> {
    const result = await this.pool.query<TeacherAssignmentRunRow>(
      `SELECT ${this.selectColumns()}
         FROM teacher_assignment_runs
        WHERE school_id = $1 AND retry_key = $2`,
      [schoolId, retryKey],
    );
    return result.rows[0] ? this.toSnapshot(result.rows[0]) : null;
  }

  async listProposals(runId: string) {
    const result = await this.pool.query<
      QueryResultRow & {
        demand_id: string;
        teacher_id: string | null;
        required_sessions: number;
        source: "AUTO" | "MANUAL";
        is_locked: boolean;
        status: TeacherAssignmentProposal["status"];
        score: number | null;
        reason_code: string | null;
        reason: string | null;
        load_before: number | null;
        load_after: number | null;
        adjusted_target: number | null;
      }
    >(
      `SELECT demand_id::text, teacher_id::text, required_sessions, source, is_locked, status,
              score, reason_code, reason, load_before, load_after, adjusted_target
         FROM teacher_assignment_proposals
        WHERE run_id = $1
        ORDER BY demand_id`,
      [runId],
    );
    return result.rows.map(
      (row) =>
        ({
          demandId: row.demand_id,
          teacherId: row.teacher_id,
          requiredSessions: Number(row.required_sessions),
          source: row.source,
          isLocked: row.is_locked,
          status: row.status,
          score: row.score === null ? null : Number(row.score),
          reasonCode: row.reason_code,
          reason: row.reason,
          loadBefore: row.load_before === null ? null : Number(row.load_before),
          loadAfter: row.load_after === null ? null : Number(row.load_after),
          adjustedTarget: row.adjusted_target === null ? null : Number(row.adjusted_target),
        }) satisfies TeacherAssignmentProposal,
    );
  }

  async markRunning(runId: string, attempt: number) {
    await this.pool.query(
      `UPDATE teacher_assignment_runs
          SET status = 'RUNNING', progress_stage = 'RUNNING', attempts = GREATEST(attempts, $2),
              started_at = COALESCE(started_at, now()), heartbeat_at = now(), updated_at = now(), last_error = NULL
        WHERE id = $1 AND status IN ('QUEUED', 'RUNNING') AND cancel_requested_at IS NULL`,
      [runId, attempt],
    );
  }

  async touchHeartbeat(runId: string) {
    await this.pool.query(
      `UPDATE teacher_assignment_runs
          SET progress_stage = 'RUNNING', heartbeat_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'RUNNING'`,
      [runId],
    );
  }

  async isCancelRequested(runId: string) {
    const result = await this.pool.query<{ cancel_requested_at: string | Date | null }>(
      `SELECT cancel_requested_at FROM teacher_assignment_runs WHERE id = $1`,
      [runId],
    );
    return Boolean(result.rows[0]?.cancel_requested_at);
  }

  async markPersisting(runId: string) {
    await this.pool.query(
      `UPDATE teacher_assignment_runs
          SET progress_stage = 'PERSISTING', heartbeat_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'RUNNING' AND cancel_requested_at IS NULL`,
      [runId],
    );
  }

  async persistResult(runId: string, result: TeacherAssignmentSolveResult) {
    const outputChecksum = computeTeacherAssignmentChecksum(result);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query<TeacherAssignmentRunRow>(
        `SELECT ${this.selectColumns()} FROM teacher_assignment_runs WHERE id = $1 FOR UPDATE`,
        [runId],
      );
      const current = currentResult.rows[0];
      if (!current) throw new Error(`Không tìm thấy lần chạy phân công giáo viên ${runId}.`);
      if (current.completed_at && current.output_checksum === outputChecksum) {
        await client.query("COMMIT");
        return this.toSnapshot(current);
      }
      if (current.completed_at || current.status === "CANCELLED") {
        await client.query("COMMIT");
        return this.toSnapshot(current);
      }

      await client.query("DELETE FROM teacher_assignment_proposals WHERE run_id = $1", [runId]);
      for (const proposal of result.proposals) {
        await client.query(
          `INSERT INTO teacher_assignment_proposals
             (tenant_id, run_id, demand_id, teacher_id, required_sessions, source, is_locked, status,
              score, reason_code, reason, load_before, load_after, adjusted_target)
           VALUES ((SELECT tenant_id FROM teacher_assignment_runs WHERE id = $1), $1, $2, $3, $4, $5, $6, $7,
                   $8, $9, $10, $11, $12, $13)`,
          [
            runId,
            proposal.demandId,
            proposal.teacherId,
            proposal.requiredSessions,
            proposal.source,
            proposal.isLocked,
            proposal.status,
            proposal.score,
            proposal.reasonCode,
            proposal.reason,
            proposal.loadBefore,
            proposal.loadAfter,
            proposal.adjustedTarget,
          ],
        );
      }

      const updated = await client.query<TeacherAssignmentRunRow>(
        `UPDATE teacher_assignment_runs
            SET status = $2, progress_stage = 'COMPLETED', heartbeat_at = now(), output_checksum = $3,
                result = $4::jsonb, diagnostics = $5::jsonb, completed_at = now(), updated_at = now(), last_error = NULL
          WHERE id = $1
          RETURNING ${this.selectColumns()}`,
        [runId, result.status, outputChecksum, JSON.stringify(result), JSON.stringify(result.diagnostics)],
      );
      await client.query("COMMIT");
      return this.toSnapshot(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async markFailed(runId: string, attempt: number, error: Error) {
    await this.pool.query(
      `UPDATE teacher_assignment_runs
          SET status = 'FAILED', progress_stage = 'FAILED', attempts = GREATEST(attempts, $2),
              last_error = $3::jsonb, heartbeat_at = now(), completed_at = COALESCE(completed_at, now()), updated_at = now()
        WHERE id = $1 AND status IN ('QUEUED', 'RUNNING') AND cancel_requested_at IS NULL`,
      [runId, attempt, JSON.stringify({ code: "TEACHER_ASSIGNMENT_FAILED", message: error.message })],
    );
  }

  async markRetryPending(runId: string, attempt: number, error: Error) {
    await this.pool.query(
      `UPDATE teacher_assignment_runs
          SET status = 'QUEUED', progress_stage = 'QUEUED', attempts = GREATEST(attempts, $2),
              last_error = $3::jsonb, heartbeat_at = NULL, updated_at = now()
        WHERE id = $1 AND status IN ('QUEUED', 'RUNNING') AND cancel_requested_at IS NULL`,
      [runId, attempt, JSON.stringify({ code: "TEACHER_ASSIGNMENT_RETRYING", message: error.message })],
    );
  }

  async requestCancel(schoolId: string, periodId: string, runId: string, reason: string) {
    const result = await this.pool.query<TeacherAssignmentRunRow>(
      `UPDATE teacher_assignment_runs
          SET cancel_requested_at = COALESCE(cancel_requested_at, now()),
              cancel_reason = COALESCE(cancel_reason, $4),
              status = CASE WHEN status = 'QUEUED' THEN 'CANCELLED' ELSE status END,
              progress_stage = CASE WHEN status = 'QUEUED' THEN 'CANCELLED' ELSE progress_stage END,
              completed_at = CASE WHEN status = 'QUEUED' THEN COALESCE(completed_at, now()) ELSE completed_at END,
              heartbeat_at = CASE WHEN status = 'QUEUED' THEN now() ELSE heartbeat_at END,
              updated_at = now()
        WHERE id = $1 AND school_id = $2 AND academic_period_id = $3 AND status IN ('QUEUED', 'RUNNING')
        RETURNING ${this.selectColumns()}`,
      [runId, schoolId, periodId, reason.trim().slice(0, 500) || "Yêu cầu hủy phân công tự động"],
    );
    return result.rows[0] ? this.toSnapshot(result.rows[0]) : null;
  }

  async markCancelled(runId: string, attempt: number, reason = "Yêu cầu hủy trong khi phân công") {
    const result = await this.pool.query<TeacherAssignmentRunRow>(
      `UPDATE teacher_assignment_runs
          SET status = 'CANCELLED', progress_stage = 'CANCELLED', attempts = GREATEST(attempts, $2),
              cancel_requested_at = COALESCE(cancel_requested_at, now()), cancel_reason = COALESCE(cancel_reason, $3),
              heartbeat_at = now(), completed_at = COALESCE(completed_at, now()), updated_at = now()
        WHERE id = $1 AND status IN ('QUEUED', 'RUNNING')
        RETURNING ${this.selectColumns()}`,
      [runId, attempt, reason.trim().slice(0, 500)],
    );
    return result.rows[0] ? this.toSnapshot(result.rows[0]) : null;
  }

  private selectColumns() {
    return `id::text, tenant_id::text, school_id::text, academic_period_id::text, job_id, status,
      progress_stage, contract_version, algorithm_version, random_seed, input_checksum, output_checksum,
      payload, result, diagnostics, attempts, max_attempts, last_error, requested_by, confirmed_by,
      confirmed_at, cancel_requested_at, cancel_reason, retry_key, retry_of_run_id::text,
      requested_at, started_at, heartbeat_at, completed_at, updated_at`;
  }

  private toSnapshot(row: TeacherAssignmentRunRow): TeacherAssignmentRunSnapshot {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      schoolId: row.school_id,
      academicPeriodId: row.academic_period_id,
      jobId: row.job_id,
      status: row.status,
      progressStage: row.progress_stage,
      contractVersion: row.contract_version,
      algorithmVersion: row.algorithm_version,
      randomSeed: row.random_seed,
      inputChecksum: row.input_checksum,
      outputChecksum: row.output_checksum,
      payload: row.payload,
      result: row.result,
      diagnostics: row.diagnostics,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      lastError: row.last_error,
      requestedBy: row.requested_by,
      confirmedBy: row.confirmed_by,
      confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
      cancelRequestedAt: row.cancel_requested_at ? new Date(row.cancel_requested_at).toISOString() : null,
      cancelReason: row.cancel_reason,
      retryKey: row.retry_key,
      retryOfRunId: row.retry_of_run_id,
      requestedAt: new Date(row.requested_at).toISOString(),
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      heartbeatAt: row.heartbeat_at ? new Date(row.heartbeat_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
