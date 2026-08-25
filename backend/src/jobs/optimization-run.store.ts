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
}

interface OptimizationRunRow {
  id: string;
  job_id: string;
  school_id: string;
  status: OptimizationRunSnapshot["status"];
  payload_checksum: string;
  output_checksum: string | null;
  attempts: number;
  max_attempts: number;
  result: SolveJobResult | null;
  last_error: { code: string; message: string } | null;
  requested_at: string | Date;
  started_at: string | Date | null;
  completed_at: string | Date | null;
}

@Injectable()
export class OptimizationRunStore {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async createOrGet(input: CreateOptimizationRunInput): Promise<OptimizationRunSnapshot> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
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
           payload_checksum, payload, adapter_contract_version, max_attempts)
         VALUES ($1, $2, $3, $4, 'QUEUED', '1.0', $5, $6, $7, $8, $9::jsonb, $10, $11)
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

  async findByRunId(runId: string) {
    const result = await this.pool.query<OptimizationRunRow>(this.selectByRunId(), [runId]);
    return result.rows[0] ? this.toSnapshot(result.rows[0]) : null;
  }

  async markRunning(runId: string, attempt: number) {
    await this.pool.query(
      `UPDATE optimization_runs
          SET status = 'RUNNING', attempts = GREATEST(attempts, $2), started_at = COALESCE(started_at, now()),
              updated_at = now(), last_error = NULL
        WHERE id = $1 AND status IN ('QUEUED', 'RUNNING')`,
      [runId, attempt],
    );
  }

  async markRetryPending(runId: string, attempt: number, error: Error) {
    await this.pool.query(
      `UPDATE optimization_runs
          SET status = 'QUEUED', attempts = GREATEST(attempts, $2), last_error = $3::jsonb, updated_at = now()
        WHERE id = $1 AND status IN ('QUEUED', 'RUNNING')`,
      [runId, attempt, JSON.stringify(this.errorPayload(error))],
    );
  }

  async markFailed(runId: string, attempt: number, error: Error) {
    await this.pool.query(
      `UPDATE optimization_runs
          SET status = 'FAILED', attempts = GREATEST(attempts, $2), last_error = $3::jsonb,
              completed_at = COALESCE(completed_at, now()), updated_at = now()
        WHERE id = $1 AND status IN ('QUEUED', 'RUNNING')`,
      [runId, attempt, JSON.stringify(this.errorPayload(error))],
    );
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
      if (current.completed_at) {
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
            SET status = $2, output_checksum = $3, result = $4::jsonb,
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
    return `id::text, job_id, school_id::text, status, payload_checksum, output_checksum,
      attempts, max_attempts, result, last_error, requested_at, started_at, completed_at`;
  }

  private selectByJobId() {
    return `SELECT ${this.selectColumns()} FROM optimization_runs WHERE school_id = $1 AND job_id = $2`;
  }

  private selectByRunId() {
    return `SELECT ${this.selectColumns()} FROM optimization_runs WHERE id = $1`;
  }

  private toSnapshot(row: OptimizationRunRow): OptimizationRunSnapshot {
    return {
      id: row.id,
      jobId: row.job_id,
      schoolId: row.school_id,
      status: row.status,
      inputChecksum: row.payload_checksum,
      outputChecksum: row.output_checksum,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      result: row.result,
      lastError: row.last_error,
      requestedAt: new Date(row.requested_at).toISOString(),
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    };
  }

  private errorPayload(error: Error) {
    return { code: error.name || "SOLVER_SYSTEM_ERROR", message: error.message.slice(0, 1000) };
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }
}
