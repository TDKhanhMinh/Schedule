-- P2.5-T01: durable BullMQ/Python solve lifecycle and provenance.
-- Queue state is ephemeral coordination; PostgreSQL is the durable run source.

ALTER TABLE optimization_runs
  DROP CONSTRAINT IF EXISTS optimization_runs_status_check;

ALTER TABLE optimization_runs
  ADD CONSTRAINT optimization_runs_status_check
    CHECK (status IN ('QUEUED', 'RUNNING', 'OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'UNKNOWN', 'INVALID', 'FAILED')),
  ADD COLUMN IF NOT EXISTS payload_checksum CHAR(64),
  ADD COLUMN IF NOT EXISTS output_checksum CHAR(64),
  ADD COLUMN IF NOT EXISTS payload JSONB,
  ADD COLUMN IF NOT EXISTS result JSONB,
  ADD COLUMN IF NOT EXISTS adapter_contract_version TEXT,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_error JSONB,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

ALTER TABLE optimization_runs
  ADD CONSTRAINT optimization_runs_payload_checksum_format
    CHECK (payload_checksum IS NULL OR payload_checksum ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT optimization_runs_output_checksum_format
    CHECK (output_checksum IS NULL OR output_checksum ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT optimization_runs_attempts_bounds
    CHECK (attempts >= 0 AND max_attempts BETWEEN 1 AND 10);

CREATE UNIQUE INDEX IF NOT EXISTS uq_optimization_runs_school_job
  ON optimization_runs (school_id, job_id)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_optimization_runs_queue_status
  ON optimization_runs (status, requested_at);

COMMENT ON COLUMN optimization_runs.payload_checksum IS
  'SHA-256 checksum of the canonical NestJS-to-worker payload stored for this run.';
COMMENT ON COLUMN optimization_runs.output_checksum IS
  'SHA-256 checksum of the canonical SolveJobResult stored for this run.';
COMMENT ON COLUMN optimization_runs.payload IS
  'Immutable solver input envelope; PostgreSQL stores it for retry and provenance, Python never queries the database.';
