-- P2.5-T02: durable progress, cancellation and retry control for optimization runs.
-- PostgreSQL remains the source of truth; BullMQ is only the delivery mechanism.

ALTER TABLE optimization_runs
  DROP CONSTRAINT IF EXISTS optimization_runs_status_check;

ALTER TABLE optimization_runs
  ADD CONSTRAINT optimization_runs_status_check
    CHECK (status IN ('QUEUED', 'RUNNING', 'OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'UNKNOWN', 'INVALID', 'FAILED', 'CANCELLED'));

ALTER TABLE optimization_runs
  ADD COLUMN IF NOT EXISTS progress_stage TEXT NOT NULL DEFAULT 'QUEUED',
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS retry_key TEXT,
  ADD COLUMN IF NOT EXISTS retry_of_run_id UUID REFERENCES optimization_runs(id);

ALTER TABLE optimization_runs
  DROP CONSTRAINT IF EXISTS optimization_runs_progress_stage_check,
  DROP CONSTRAINT IF EXISTS optimization_runs_cancel_reason_length;

ALTER TABLE optimization_runs
  ADD CONSTRAINT optimization_runs_progress_stage_check
    CHECK (progress_stage IN ('QUEUED', 'SOLVING', 'PERSISTING', 'RETRY_WAITING', 'CANCELLED', 'COMPLETED', 'FAILED')),
  ADD CONSTRAINT optimization_runs_cancel_reason_length
    CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 500);

UPDATE optimization_runs
SET progress_stage = CASE
  WHEN status IN ('OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'UNKNOWN', 'INVALID') THEN 'COMPLETED'
  WHEN status = 'FAILED' THEN 'FAILED'
  WHEN status = 'CANCELLED' THEN 'CANCELLED'
  WHEN status = 'QUEUED' AND last_error IS NOT NULL THEN 'RETRY_WAITING'
  ELSE progress_stage
END
WHERE progress_stage = 'QUEUED';

UPDATE optimization_runs
SET last_error = jsonb_build_object(
  'code', 'JOB_EXECUTION_FAILED',
  'message', 'Solver worker failed; xem execution log nội bộ.'
)
WHERE status = 'FAILED' AND last_error IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_optimization_runs_school_retry_key
  ON optimization_runs (school_id, retry_key)
  WHERE retry_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_optimization_runs_progress_heartbeat
  ON optimization_runs (status, progress_stage, heartbeat_at);

COMMENT ON COLUMN optimization_runs.progress_stage IS
  'Durable worker stage; the API may report stalled when heartbeat_at exceeds the configured threshold.';
COMMENT ON COLUMN optimization_runs.heartbeat_at IS
  'Latest worker heartbeat. It is deliberately separate from requested_at so queued and solving stale states are distinguishable.';
COMMENT ON COLUMN optimization_runs.retry_key IS
  'School-scoped idempotency key for a user-requested retry.';
