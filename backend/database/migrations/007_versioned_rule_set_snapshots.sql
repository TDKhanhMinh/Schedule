-- P2.1-T01: versioned rule provenance and immutable solve snapshots.
-- Rule profiles remain editable while DRAFT. A snapshot is the exact rule set
-- captured for a solve and must be treated as append-only by the application.

ALTER TABLE rule_profiles
  ADD COLUMN IF NOT EXISTS register_version TEXT NOT NULL DEFAULT 'RULE-REGISTER-0.1.0',
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_locator TEXT,
  ADD COLUMN IF NOT EXISTS scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_state TEXT NOT NULL DEFAULT 'PENDING_STAKEHOLDER',
  ADD COLUMN IF NOT EXISTS approval_reason TEXT;

ALTER TABLE rule_profiles
  ADD CONSTRAINT rule_profiles_scope_object_check
    CHECK (jsonb_typeof(scope) = 'object'),
  ADD CONSTRAINT rule_profiles_approval_state_check
    CHECK (approval_state IN ('PENDING_STAKEHOLDER', 'APPROVED', 'REVOKED')),
  ADD CONSTRAINT rule_profiles_approved_metadata_check
    CHECK (approval_state <> 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  ADD CONSTRAINT rule_profiles_active_metadata_check
    CHECK (status <> 'ACTIVE' OR (source_url IS NOT NULL AND effective_from IS NOT NULL));

ALTER TABLE rule_profiles
  ADD CONSTRAINT rule_profiles_school_id_id_unique UNIQUE (school_id, id);

ALTER TABLE rule_definitions
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_locator TEXT,
  ADD COLUMN IF NOT EXISTS effective_from DATE,
  ADD COLUMN IF NOT EXISTS effective_to DATE,
  ADD COLUMN IF NOT EXISTS scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approval_state TEXT NOT NULL DEFAULT 'PENDING_STAKEHOLDER',
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_reason TEXT;

ALTER TABLE rule_definitions
  ADD CONSTRAINT rule_definitions_scope_object_check
    CHECK (jsonb_typeof(scope) = 'object'),
  ADD CONSTRAINT rule_definitions_effective_range_check
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  ADD CONSTRAINT rule_definitions_approval_state_check
    CHECK (approval_state IN ('PENDING_STAKEHOLDER', 'APPROVED', 'REVOKED')),
  ADD CONSTRAINT rule_definitions_approved_metadata_check
    CHECK (approval_state <> 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  ADD CONSTRAINT rule_definitions_weight_check
    CHECK ((kind = 'HARD' AND weight IS NULL) OR (kind = 'SOFT' AND weight IS NOT NULL AND weight >= 0));

CREATE TABLE IF NOT EXISTS rule_set_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  rule_profile_id UUID NOT NULL REFERENCES rule_profiles(id),
  rule_set_version TEXT NOT NULL,
  profile_version TEXT NOT NULL,
  register_version TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_locator TEXT,
  effective_from DATE NOT NULL,
  effective_to DATE,
  scope JSONB NOT NULL,
  approval_state TEXT NOT NULL
    CHECK (approval_state IN ('PENDING_STAKEHOLDER', 'APPROVED', 'REVOKED')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  approval_reason TEXT,
  rules JSONB NOT NULL,
  snapshot_hash CHAR(64) NOT NULL
    CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_by TEXT NOT NULL,
  UNIQUE (school_id, id),
  UNIQUE (rule_profile_id, rule_set_version, snapshot_hash),
  FOREIGN KEY (school_id, rule_profile_id)
    REFERENCES rule_profiles (school_id, id),
  CHECK (rule_set_version ~ '^RULE-SET-[0-9]+\.[0-9]+\.[0-9]+$'),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (jsonb_typeof(scope) = 'object'),
  CHECK (jsonb_typeof(rules) = 'array'),
  CHECK (approval_state <> 'APPROVED' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

COMMENT ON TABLE rule_set_snapshots IS
  'Append-only canonical rule set captured for one solve; never replace a snapshot used by an optimization run.';

COMMENT ON COLUMN rule_set_snapshots.snapshot_hash IS
  'SHA-256 of the canonical snapshot payload excluding snapshotHash; proves the exact rule set used by a solve.';

CREATE OR REPLACE FUNCTION prevent_rule_set_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'rule_set_snapshots are append-only';
END;
$$;

CREATE TRIGGER rule_set_snapshots_immutable
  BEFORE UPDATE OR DELETE ON rule_set_snapshots
  FOR EACH ROW EXECUTE FUNCTION prevent_rule_set_snapshot_mutation();

ALTER TABLE optimization_runs
  ADD COLUMN IF NOT EXISTS rule_snapshot_id UUID,
  ADD COLUMN IF NOT EXISTS rule_set_version TEXT,
  ADD COLUMN IF NOT EXISTS rule_snapshot_hash CHAR(64),
  ADD CONSTRAINT optimization_runs_rule_snapshot_metadata_check
    CHECK (
      (rule_snapshot_id IS NULL AND rule_set_version IS NULL AND rule_snapshot_hash IS NULL)
      OR (
        rule_snapshot_id IS NOT NULL
        AND rule_set_version IS NOT NULL
        AND rule_snapshot_hash IS NOT NULL
        AND rule_set_version ~ '^RULE-SET-[0-9]+\.[0-9]+\.[0-9]+$'
        AND rule_snapshot_hash ~ '^[0-9a-f]{64}$'
      )
    );

ALTER TABLE optimization_runs
  ADD CONSTRAINT optimization_runs_rule_snapshot_school_fk
    FOREIGN KEY (school_id, rule_snapshot_id)
    REFERENCES rule_set_snapshots (school_id, id);

CREATE OR REPLACE FUNCTION validate_optimization_run_rule_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  snapshot_school_id UUID;
  snapshot_version TEXT;
  snapshot_hash CHAR(64);
BEGIN
  IF NEW.rule_snapshot_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT snapshot.school_id, snapshot.rule_set_version, snapshot.snapshot_hash
    INTO snapshot_school_id, snapshot_version, snapshot_hash
    FROM rule_set_snapshots AS snapshot
   WHERE snapshot.id = NEW.rule_snapshot_id;

  IF NEW.school_id <> snapshot_school_id
     OR NEW.rule_set_version <> snapshot_version
     OR NEW.rule_snapshot_hash <> snapshot_hash THEN
    RAISE EXCEPTION 'optimization run rule snapshot metadata does not match snapshot';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER optimization_runs_rule_snapshot_metadata
  BEFORE INSERT OR UPDATE OF rule_snapshot_id, rule_set_version, rule_snapshot_hash
  ON optimization_runs
  FOR EACH ROW EXECUTE FUNCTION validate_optimization_run_rule_snapshot();

CREATE INDEX IF NOT EXISTS idx_rule_profiles_scope_status
  ON rule_profiles (school_id, academic_period_id, status, effective_from, effective_to);

CREATE INDEX IF NOT EXISTS idx_rule_set_snapshots_profile_captured
  ON rule_set_snapshots (rule_profile_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_optimization_runs_rule_snapshot
  ON optimization_runs (rule_snapshot_id);

COMMENT ON COLUMN optimization_runs.rule_snapshot_id IS
  'Immutable rule_set_snapshots row used for this solve; null is retained only for legacy runs.';

COMMENT ON COLUMN optimization_runs.rule_snapshot_hash IS
  'Copied snapshot hash for audit queries and tamper detection.';
