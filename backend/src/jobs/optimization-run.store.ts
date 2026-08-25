import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";
import { PG_POOL } from "../database/database.module";
import type { SolveJobRequest, SolveJobResult } from "../contracts";
import type { OptimizationRunSnapshot } from "./optimization-job.contract";

export class OptimizationRunConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OptimizationRunConflictError";
  }
}

export interface CreateOptimizationRunInput {
  runId: string;
  jobId: string;
  schoolId: string;
  academicPeriodId?: string;
  request: SolveJobRequest;
  solverPayload: unknown;
  inputChecksum: string;
  adapterContractVersion?: string;
  maxAttempts: number;
  retryKey?: string;
  retryOfRunId?: string;
}

interface OptimizationRunRow {
  id: string;
  job_id: string;
  school_id: string;
  academic_period_id: string | null;
  status: OptimizationRunSnapshot["status"];
  payload_checksum: string;
  output_checksum: string | null;
  payload: OptimizationRunSnapshot["solverPayload"];
  attempts: number;
  max_attempts: number;
  result: SolveJobResult | null;
  last_error: { code: string; message: string } | null;
  requested_at: string | Date;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  progress_stage: OptimizationRunSnapshot["progressStage"];
  heartbeat_at: string | Date | null;
  cancel_requested_at: string | Date | null;
  cancel_reason: string | null;
  retry_key: string | null;
  retry_of_run_id: string | null;
}

@Injectable()
export class OptimizationRunStore {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async createOrGet(input: CreateOptimizationRunInput): Promise<OptimizationRunSnapshot> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (input.retryKey) {
        const existingRetry = await client.query<OptimizationRunRow>(this.selectByRetryKey(), [
          input.schoolId,
          input.retryKey,
        ]);
        if (existingRetry.rows[0]) {
          const current = this.toSnapshot(existingRetry.rows[0]);
          if (current.inputChecksum !== input.inputChecksum) {
            throw new OptimizationRunConflictError(`retry key ${input.retryKey} đã tồn tại với payload khác.`);
          }
          await client.query("COMMIT");
          return current;
        }
      }
      const existing = await client.query<OptimizationRunRow>(this.selectByJobId(), [input.schoolId, input.jobId]);
      if (existing.rows[0]) {
        const current = this.toSnapshot(existing.rows[0]);
        if (current.inputChecksum !== input.inputChecksum) {
          throw new OptimizationRunConflictError(
            `jobId ${input.jobId} đã tồn tại với payload checksum khác; không được ghi đè run.`,
          );
        }
        await client.query("COMMIT");
        return current;
      }

      const result = await client.query<OptimizationRunRow>(
        `INSERT INTO optimization_runs
          (id, school_id, academic_period_id, job_id, status, contract_version,
           rule_snapshot_id, rule_set_version, rule_snapshot_hash,
           payload_checksum, payload, adapter_contract_version, max_attempts,
           progress_stage, retry_key, retry_of_run_id)
         VALUES ($1, $2, $3, $4, 'QUEUED', '1.0', $5, $6, $7, $8, $9::jsonb, $10, $11, 'QUEUED', $12, $13)
         RETURNING ${this.selectColumns()}`,
        [
          input.runId,
          input.schoolId,
          input.academicPeriodId ?? null,
          input.jobId,
          input.request.ruleSnapshotId ?? null,
          input.request.ruleSetVersion ?? null,
          input.request.ruleSnapshotHash ?? null,
          input.inputChecksum,
          JSON.stringify(input.solverPayload),
          input.adapterContractVersion ?? null,
          input.maxAttempts,
          input.retryKey ?? null,
          input.retryOfRunId ?? null,
        ],
      );
      await client.query("COMMIT");
      return this.toSnapshot(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof OptimizationRunConflictError) throw error;
      if ((error as { code?: string }).code === "23505") {
        const existing = await this.findByJobId(input.schoolId, input.jobId);
        if (existing && existing.inputChecksum === input.inputChecksum) return existing;
        throw new OptimizationRunConflictError(`jobId ${input.jobId} bị tranh chấp với payload khác.`);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async findByJobId(schoolId: string, jobId: string) {
    const result = await this.pool.query<OptimizationRunRow>(this.selectByJobId(), [schoolId, jobId]);
    return result.rows[0] ? this.toSnapshot(result.rows[0]) : null;
  }

  async findByRetryKey(schoolId: string, retryKey: string) {
    const result = await this.pool.query<OptimizationRunRow>(this.selectByRetryKey(), [schoolId, retryKey]);
    return result.rows[0] ? this.toSnapshot(result.rows[0]) : null;
  }

  async findByRunId(runId: string) {
    const result = await this.pool.query<OptimizationRunRow>(this.selectByRunId(), [runId]);
    return result.rows[0] ? this.toSnapshot(result.rows[0]) : null;
  }

  async markRunning(runId: string, attempt: number) {
    await this.pool.query(
      `UPDATE optimization_runs
          SET status = 'RUNNING', progress_stage = 'SOLVING', attempts = GREATEST(attempts, $2),
              started_at = COALESCE(started_at, now()), heartbeat_at = now(), updated_at = now(), last_error = NULL
        WHERE id = $1 AND status IN ('QUEUED', 'RUNNING') AND cancel_requested_at IS NULL`,
      [runId, attempt],
    );
  }

  async markRetryPending(runId: string, attempt: number, error: Error) {
    await this.pool.query(
      `UPDATE optimization_runs
          SET status = 'QUEUED', progress_stage = 'RETRY_WAITING', attempts = GREATEST(attempts, $2),
              heartbeat_at = NULL, last_error = $3::jsonb, updated_at = now()
        WHERE id = $1 AND status IN ('QUEUED', 'RUNNING') AND cancel_requested_at IS NULL`,
      [runId, attempt, JSON.stringify(this.errorPayload(error))],
    );
  }

  async markFailed(runId: string, attempt: number, error: Error) {
    await this.pool.query(
      `UPDATE optimization_runs
          SET status = 'FAILED', progress_stage = 'FAILED', attempts = GREATEST(attempts, $2), last_error = $3::jsonb,
              heartbeat_at = now(),
              completed_at = COALESCE(completed_at, now()), updated_at = now()
        WHERE id = $1 AND status IN ('QUEUED', 'RUNNING') AND cancel_requested_at IS NULL`,
      [runId, attempt, JSON.stringify(this.errorPayload(error))],
    );
  }

  async touchHeartbeat(runId: string, stage: OptimizationRunSnapshot["progressStage"] = "SOLVING") {
    await this.pool.query(
      `UPDATE optimization_runs
          SET progress_stage = $2, heartbeat_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'RUNNING'`,
      [runId, stage],
    );
  }

  async isCancelRequested(runId: string) {
    const result = await this.pool.query<{ cancel_requested_at: string | Date | null }>(
      `SELECT cancel_requested_at FROM optimization_runs WHERE id = $1`,
      [runId],
    );
    return Boolean(result.rows[0]?.cancel_requested_at);
  }

  async markPersisting(runId: string) {
    await this.pool.query(
      `UPDATE optimization_runs
          SET progress_stage = 'PERSISTING', heartbeat_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'RUNNING' AND cancel_requested_at IS NULL`,
      [runId],
    );
  }

  async requestCancel(runId: string, reason = "User requested cancellation") {
    const result = await this.pool.query<OptimizationRunRow>(
      `UPDATE optimization_runs
          SET cancel_requested_at = COALESCE(cancel_requested_at, now()),
              cancel_reason = COALESCE(cancel_reason, $2),
              status = CASE WHEN status = 'QUEUED' THEN 'CANCELLED' ELSE status END,
              progress_stage = CASE WHEN status = 'QUEUED' THEN 'CANCELLED' ELSE progress_stage END,
              completed_at = CASE WHEN status = 'QUEUED' THEN COALESCE(completed_at, now()) ELSE completed_at END,
              heartbeat_at = CASE WHEN status = 'QUEUED' THEN now() ELSE heartbeat_at END,
              updated_at = now()
        WHERE id = $1 AND status IN ('QUEUED', 'RUNNING')
        RETURNING ${this.selectColumns()}`,
      [runId, this.safeReason(reason)],
    );
    return result.rows[0] ? this.toSnapshot(result.rows[0]) : null;
  }

  async markCancelled(runId: string, attempt: number, reason = "User requested cancellation") {
    const result = await this.pool.query<OptimizationRunRow>(
      `UPDATE optimization_runs
          SET status = 'CANCELLED', progress_stage = 'CANCELLED', attempts = GREATEST(attempts, $2),
              cancel_requested_at = COALESCE(cancel_requested_at, now()), cancel_reason = COALESCE(cancel_reason, $3),
              heartbeat_at = now(), completed_at = COALESCE(completed_at, now()), updated_at = now()
        WHERE id = $1 AND status IN ('QUEUED', 'RUNNING')
        RETURNING ${this.selectColumns()}`,
      [runId, attempt, this.safeReason(reason)],
    );
    return result.rows[0] ? this.toSnapshot(result.rows[0]) : null;
  }

  async persistResult(runId: string, result: SolveJobResult, outputChecksum: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const currentResult = await client.query<OptimizationRunRow>(`${this.selectByRunId()} FOR UPDATE`, [runId]);
      const current = currentResult.rows[0];
      if (!current) throw new Error(`Optimization run ${runId} was not found.`);
      if (current.completed_at && current.output_checksum === outputChecksum) {
        await client.query("COMMIT");
        return this.toSnapshot(current);
      }
      if (current.completed_at || current.status === "CANCELLED") {
        await client.query("COMMIT");
        return this.toSnapshot(current);
      }

      await client.query("DELETE FROM optimization_assignments WHERE run_id = $1", [runId]);
      const assignments = result.assignments.filter(
        (assignment) => this.isUuid(assignment.lessonId) && this.isUuid(assignment.slotId),
      );
      if (assignments.length === result.assignments.length) {
        for (const assignment of assignments) {
          await client.query(
            `INSERT INTO optimization_assignments (run_id, lesson_id, session_index, time_slot_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (run_id, lesson_id, session_index) DO NOTHING`,
            [runId, assignment.lessonId, assignment.sessionIndex, assignment.slotId],
          );
        }
      }

      const updated = await client.query<OptimizationRunRow>(
        `UPDATE optimization_runs
            SET status = $2, progress_stage = 'COMPLETED', heartbeat_at = now(), output_checksum = $3, result = $4::jsonb,
                diagnostics = $5::jsonb, completed_at = now(), updated_at = now(), last_error = NULL
          WHERE id = $1
          RETURNING ${this.selectColumns()}`,
        [
          runId,
          result.status,
          outputChecksum,
          JSON.stringify(result),
          JSON.stringify({ ...result.diagnostics, objectiveValue: result.objectiveValue, metadata: result.metadata }),
        ],
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

  private selectColumns() {
    return `id::text, job_id, school_id::text, academic_period_id::text, status, payload_checksum, output_checksum,
      payload, attempts, max_attempts, result, last_error, requested_at, started_at, completed_at,
      progress_stage, heartbeat_at, cancel_requested_at, cancel_reason, retry_key, retry_of_run_id::text`;
  }

  private selectByJobId() {
    return `SELECT ${this.selectColumns()} FROM optimization_runs WHERE school_id = $1 AND job_id = $2`;
  }

  private selectByRunId() {
    return `SELECT ${this.selectColumns()} FROM optimization_runs WHERE id = $1`;
  }

  private selectByRetryKey() {
    return `SELECT ${this.selectColumns()} FROM optimization_runs WHERE school_id = $1 AND retry_key = $2`;
  }

  private toSnapshot(row: OptimizationRunRow): OptimizationRunSnapshot {
    return {
      id: row.id,
      jobId: row.job_id,
      schoolId: row.school_id,
      academicPeriodId: row.academic_period_id,
      status: row.status,
      inputChecksum: row.payload_checksum,
      outputChecksum: row.output_checksum,
      solverPayload: row.payload,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      result: row.result,
      lastError: row.last_error,
      progressStage: row.progress_stage,
      heartbeatAt: row.heartbeat_at ? new Date(row.heartbeat_at).toISOString() : null,
      cancelRequestedAt: row.cancel_requested_at ? new Date(row.cancel_requested_at).toISOString() : null,
      cancelReason: row.cancel_reason,
      retryKey: row.retry_key,
      retryOfRunId: row.retry_of_run_id,
      requestedAt: new Date(row.requested_at).toISOString(),
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    };
  }

  private errorPayload(error: Error) {
    const errorCode = (error as Error & { code?: string }).code;
    const code =
      errorCode === "SOLVER_CANCELLED" || error.name === "AbortError" ? "SOLVER_CANCELLED" : "JOB_EXECUTION_FAILED";
    return {
      code,
      message: code === "SOLVER_CANCELLED" ? "Solve đã được hủy." : "Solver worker failed; xem execution log nội bộ.",
    };
  }

  private safeReason(reason: string) {
    return reason.trim().slice(0, 500) || "User requested cancellation";
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }
}
