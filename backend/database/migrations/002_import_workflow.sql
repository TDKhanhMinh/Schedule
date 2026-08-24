CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id),
  original_filename TEXT NOT NULL,
  template_version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL CHECK (status IN ('PREVIEWED', 'CONFIRMED', 'REJECTED')),
  row_count INTEGER NOT NULL CHECK (row_count >= 0),
  valid_row_count INTEGER NOT NULL CHECK (valid_row_count >= 0),
  error_count INTEGER NOT NULL CHECK (error_count >= 0),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS import_rows (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number >= 2),
  payload JSONB NOT NULL,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (batch_id, row_number)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  actor_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, action)
);

CREATE INDEX IF NOT EXISTS idx_import_batches_school_created
  ON import_batches (school_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_rows_batch
  ON import_rows (batch_id, row_number);

CREATE INDEX IF NOT EXISTS idx_audit_logs_school_created
  ON audit_logs (school_id, created_at DESC);
