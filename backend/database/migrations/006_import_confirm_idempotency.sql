-- P1.3-T04: durable import confirmation identity, checksum and result.
-- The import batch remains the transaction boundary; the idempotency key is
-- scoped to a school so retries cannot create a second confirmed batch.

ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS file_checksum TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_result JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS uq_import_batches_school_idempotency_key
  ON import_batches (school_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_import_batches_school_checksum
  ON import_batches (school_id, file_checksum);

COMMENT ON COLUMN import_batches.file_checksum IS
  'SHA-256 checksum of the uploaded workbook bytes for import traceability.';

COMMENT ON COLUMN import_batches.idempotency_key IS
  'Opaque preview token accepted as Idempotency-Key for atomic confirm retries.';

COMMENT ON COLUMN import_batches.confirmation_result IS
  'The successful confirm response persisted for deterministic idempotent retries.';
