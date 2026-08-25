-- P2.4-T01: draft/review/approval/lock/publish/archive lifecycle.
-- This migration is forward-only. Schedule versions and their assignments are
-- snapshots; once published, their business payload cannot be edited in place.

ALTER TABLE schedule_versions
  ADD COLUMN IF NOT EXISTS rule_snapshot_id UUID,
  ADD COLUMN IF NOT EXISTS rule_set_version TEXT,
  ADD COLUMN IF NOT EXISTS rule_snapshot_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS input_snapshot_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS schedule_snapshot_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_by TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_reason TEXT;

UPDATE schedule_versions
   SET status_changed_by = COALESCE(status_changed_by, created_by),
       status_changed_at = COALESCE(status_changed_at, created_at)
 WHERE status_changed_by IS NULL OR status_changed_at IS NULL;

ALTER TABLE schedule_versions
  DROP CONSTRAINT IF EXISTS schedule_versions_status_check,
  ADD CONSTRAINT schedule_versions_status_check
    CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'LOCKED', 'PUBLISHED', 'ARCHIVED')),
  ADD CONSTRAINT schedule_versions_rule_snapshot_metadata_check
    CHECK (
      (rule_snapshot_id IS NULL AND rule_set_version IS NULL AND rule_snapshot_hash IS NULL)
      OR (
        rule_snapshot_id IS NOT NULL
        AND rule_set_version IS NOT NULL
        AND rule_snapshot_hash IS NOT NULL
        AND rule_set_version ~ '^RULE-SET-[0-9]+\\.[0-9]+\\.[0-9]+$'
        AND rule_snapshot_hash ~ '^[0-9a-f]{64}$'
      )
    ),
  ADD CONSTRAINT schedule_versions_input_snapshot_hash_check
    CHECK (input_snapshot_hash IS NULL OR input_snapshot_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT schedule_versions_schedule_snapshot_hash_check
    CHECK (schedule_snapshot_hash IS NULL OR schedule_snapshot_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT schedule_versions_archived_metadata_check
    CHECK (status <> 'ARCHIVED' OR archived_at IS NOT NULL),
  ALTER COLUMN status_changed_by SET NOT NULL,
  ALTER COLUMN status_changed_at SET NOT NULL;

ALTER TABLE schedule_versions
  ADD CONSTRAINT schedule_versions_school_id_id_unique UNIQUE (school_id, id),
  ADD CONSTRAINT schedule_versions_rule_snapshot_school_fk
    FOREIGN KEY (school_id, rule_snapshot_id)
    REFERENCES rule_set_snapshots (school_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_versions_current_published
  ON schedule_versions (school_id, academic_period_id)
  WHERE status = 'PUBLISHED';

CREATE INDEX IF NOT EXISTS idx_schedule_versions_period_version
  ON schedule_versions (school_id, academic_period_id, version_number DESC);

CREATE TABLE IF NOT EXISTS schedule_version_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  schedule_version_id UUID NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, schedule_version_id)
    REFERENCES schedule_versions (school_id, id),
  CHECK (from_status IS NULL OR from_status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'LOCKED', 'PUBLISHED', 'ARCHIVED')),
  CHECK (to_status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'LOCKED', 'PUBLISHED', 'ARCHIVED')),
  CHECK (from_status IS NULL OR from_status <> to_status)
);

CREATE INDEX IF NOT EXISTS idx_schedule_version_transitions_version_created
  ON schedule_version_transitions (schedule_version_id, created_at DESC);

CREATE OR REPLACE FUNCTION validate_schedule_version_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'DRAFT' AND NEW.status = 'IN_REVIEW')
    OR (OLD.status = 'IN_REVIEW' AND NEW.status IN ('DRAFT', 'APPROVED'))
    OR (OLD.status = 'APPROVED' AND NEW.status = 'LOCKED')
    OR (OLD.status = 'LOCKED' AND NEW.status = 'PUBLISHED')
    OR (OLD.status = 'PUBLISHED' AND NEW.status = 'ARCHIVED')
  ) THEN
    RAISE EXCEPTION 'invalid schedule version transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status_changed_by IS NULL OR btrim(NEW.status_changed_by) = '' THEN
    RAISE EXCEPTION 'schedule version transition actor is required'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_schedule_version_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('PUBLISHED', 'ARCHIVED') AND (
    NEW.school_id IS DISTINCT FROM OLD.school_id
    OR NEW.academic_period_id IS DISTINCT FROM OLD.academic_period_id
    OR NEW.version_number IS DISTINCT FROM OLD.version_number
    OR NEW.source_run_id IS DISTINCT FROM OLD.source_run_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.rule_snapshot_id IS DISTINCT FROM OLD.rule_snapshot_id
    OR NEW.rule_set_version IS DISTINCT FROM OLD.rule_set_version
    OR NEW.rule_snapshot_hash IS DISTINCT FROM OLD.rule_snapshot_hash
    OR NEW.input_snapshot_hash IS DISTINCT FROM OLD.input_snapshot_hash
    OR NEW.schedule_snapshot_hash IS DISTINCT FROM OLD.schedule_snapshot_hash
  ) THEN
    RAISE EXCEPTION 'published or archived schedule version snapshot is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'ARCHIVED' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'archived schedule version cannot transition again'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION record_schedule_version_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO schedule_version_transitions
      (school_id, schedule_version_id, from_status, to_status, actor_id, reason)
    VALUES
      (NEW.school_id, NEW.id, NULL, NEW.status, NEW.status_changed_by, NEW.status_reason);
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO schedule_version_transitions
      (school_id, schedule_version_id, from_status, to_status, actor_id, reason)
    VALUES
      (NEW.school_id, NEW.id, OLD.status, NEW.status, NEW.status_changed_by, NEW.status_reason);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_published_schedule_assignment_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_status TEXT;
  version_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    version_id := OLD.schedule_version_id;
  ELSE
    version_id := NEW.schedule_version_id;
  END IF;

  SELECT status INTO version_status
    FROM schedule_versions
   WHERE id = version_id;

  IF version_status IN ('PUBLISHED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'published or archived schedule assignments are immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schedule_versions_validate_transition ON schedule_versions;
CREATE TRIGGER schedule_versions_validate_transition
  BEFORE UPDATE OF status ON schedule_versions
  FOR EACH ROW EXECUTE FUNCTION validate_schedule_version_transition();

DROP TRIGGER IF EXISTS schedule_versions_immutable_snapshot ON schedule_versions;
CREATE TRIGGER schedule_versions_immutable_snapshot
  BEFORE UPDATE ON schedule_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_schedule_version_snapshot_mutation();

DROP TRIGGER IF EXISTS schedule_versions_transition_audit ON schedule_versions;
CREATE TRIGGER schedule_versions_transition_audit
  AFTER INSERT OR UPDATE OF status ON schedule_versions
  FOR EACH ROW EXECUTE FUNCTION record_schedule_version_transition();

DROP TRIGGER IF EXISTS schedule_assignments_immutable_published ON schedule_assignments;
CREATE TRIGGER schedule_assignments_immutable_published
  BEFORE INSERT OR UPDATE OR DELETE ON schedule_assignments
  FOR EACH ROW EXECUTE FUNCTION prevent_published_schedule_assignment_mutation();

COMMENT ON TABLE schedule_version_transitions IS
  'Append-only lifecycle audit for schedule versions; initial DRAFT creation is recorded with a null from_status.';

COMMENT ON COLUMN schedule_versions.schedule_snapshot_hash IS
  'SHA-256 of the canonical schedule assignments snapshot; published and archived versions retain this exact payload.';
