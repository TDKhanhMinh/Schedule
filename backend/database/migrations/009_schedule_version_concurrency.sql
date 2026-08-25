-- P2.3-T05: optimistic concurrency for server-side timetable edits.
-- This migration is forward-only. The revision is the durable version token
-- used to derive the HTTP ETag for a schedule version.

ALTER TABLE schedule_versions
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1,
  ADD CONSTRAINT schedule_versions_revision_positive CHECK (revision > 0);

CREATE INDEX IF NOT EXISTS idx_schedule_versions_school_revision
  ON schedule_versions (school_id, id, revision);

COMMENT ON COLUMN schedule_versions.revision IS
  'Monotonic optimistic-concurrency token; every accepted schedule edit increments it.';

