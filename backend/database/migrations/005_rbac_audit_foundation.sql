-- P1.2-T05: authorization/audit foundation.
-- Identity is still supplied by the local NestJS adapter; production IdP binding
-- and credential lifecycle are intentionally outside this migration.

ALTER TABLE audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_entity_type_entity_id_action_key,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS actor_role TEXT,
  ADD COLUMN IF NOT EXISTS entity_key TEXT;

ALTER TABLE audit_logs
  ALTER COLUMN entity_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_school_correlation
  ON audit_logs (school_id, correlation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_key
  ON audit_logs (entity_type, entity_key, created_at DESC);

