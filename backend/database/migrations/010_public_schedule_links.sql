-- P2.4-T05: expiring/revocable public read-only links for published snapshots.
-- This migration is forward-only. Tokens are stored only as SHA-256 hashes.

CREATE TABLE IF NOT EXISTS schedule_public_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL,
  schedule_version_id UUID NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id, schedule_version_id)
    REFERENCES schedule_versions (school_id, id),
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX IF NOT EXISTS idx_schedule_public_links_active
  ON schedule_public_links (token_hash, expires_at)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_public_links_version
  ON schedule_public_links (school_id, schedule_version_id, created_at DESC);
