-- P1.2-T03: complete the time-slot audit timestamp contract used by CRUD APIs.
-- This is forward-only; no down migration is provided.

ALTER TABLE time_slots
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

