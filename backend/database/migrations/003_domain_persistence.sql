-- P1.2-T02: forward-only domain persistence foundation.
-- No down migration is provided. Roll back by restoring a database snapshot or
-- applying a later corrective migration after the change has been reviewed.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE schools
SET code = 'SCHOOL-' || right(replace(id::text, '-', ''), 8)
WHERE code IS NULL OR btrim(code) = '';

ALTER TABLE schools
  ALTER COLUMN code SET NOT NULL,
  ADD CONSTRAINT schools_code_not_blank CHECK (btrim(code) <> ''),
  ADD CONSTRAINT schools_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_schools_code ON schools (code);

ALTER TABLE academic_periods
  ADD COLUMN IF NOT EXISTS academic_year TEXT,
  ADD COLUMN IF NOT EXISTS term_code TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE academic_periods
SET academic_year = to_char(starts_on, 'YYYY') || '-' || to_char(ends_on, 'YYYY')
WHERE academic_year IS NULL OR btrim(academic_year) = '';

UPDATE academic_periods
SET term_code = CASE
  WHEN name ~* 'học kỳ\s*(ii|2)' THEN 'TERM_2'
  WHEN name ~* 'học kỳ\s*(iii|3)' THEN 'TERM_3'
  ELSE 'TERM_1'
END
WHERE term_code IS NULL OR btrim(term_code) = '';

ALTER TABLE academic_periods
  ALTER COLUMN academic_year SET NOT NULL,
  ALTER COLUMN term_code SET NOT NULL,
  ADD CONSTRAINT academic_periods_year_not_blank CHECK (btrim(academic_year) <> ''),
  ADD CONSTRAINT academic_periods_term_not_blank CHECK (btrim(term_code) <> ''),
  ADD CONSTRAINT academic_periods_status_check CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
  ADD CONSTRAINT uq_academic_periods_school_id UNIQUE (school_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_periods_school_year_term
  ON academic_periods (school_id, academic_year, term_code);

ALTER TABLE classes
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE classes
SET code = 'CLASS-' || right(replace(id::text, '-', ''), 8)
WHERE code IS NULL OR btrim(code) = '';

ALTER TABLE classes
  ALTER COLUMN code SET NOT NULL,
  ADD CONSTRAINT classes_code_not_blank CHECK (btrim(code) <> ''),
  ADD CONSTRAINT classes_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  ADD CONSTRAINT uq_classes_school_id UNIQUE (school_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_school_code ON classes (school_id, code);

ALTER TABLE teachers
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE teachers
SET code = 'TEACHER-' || right(replace(id::text, '-', ''), 8)
WHERE code IS NULL OR btrim(code) = '';

ALTER TABLE teachers
  ALTER COLUMN code SET NOT NULL,
  ADD CONSTRAINT teachers_code_not_blank CHECK (btrim(code) <> ''),
  ADD CONSTRAINT teachers_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  ADD CONSTRAINT uq_teachers_school_id UNIQUE (school_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_school_code ON teachers (school_id, code);

ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE subjects
SET code = 'SUBJECT-' || right(replace(id::text, '-', ''), 8)
WHERE code IS NULL OR btrim(code) = '';

ALTER TABLE subjects
  ALTER COLUMN code SET NOT NULL,
  ADD CONSTRAINT subjects_code_not_blank CHECK (btrim(code) <> ''),
  ADD CONSTRAINT subjects_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  ADD CONSTRAINT uq_subjects_school_id UNIQUE (school_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_school_code ON subjects (school_id, code);

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS room_type TEXT,
  ADD COLUMN IF NOT EXISTS capacity INTEGER,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE rooms
SET code = 'ROOM-' || right(replace(id::text, '-', ''), 8)
WHERE code IS NULL OR btrim(code) = '';

ALTER TABLE rooms
  ALTER COLUMN code SET NOT NULL,
  ADD CONSTRAINT rooms_code_not_blank CHECK (btrim(code) <> ''),
  ADD CONSTRAINT rooms_capacity_positive CHECK (capacity IS NULL OR capacity > 0),
  ADD CONSTRAINT rooms_status_check CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  ADD CONSTRAINT uq_rooms_school_id UNIQUE (school_id, id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_school_code ON rooms (school_id, code);

ALTER TABLE time_slots
  ADD COLUMN IF NOT EXISTS academic_period_id UUID,
  ADD COLUMN IF NOT EXISTS shift_code TEXT,
  ADD COLUMN IF NOT EXISTS starts_at TIME,
  ADD COLUMN IF NOT EXISTS ends_at TIME,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE time_slots AS slot
SET academic_period_id = (
  SELECT period.id
  FROM academic_periods AS period
  WHERE period.school_id = slot.school_id
  ORDER BY period.starts_on, period.id
  LIMIT 1
)
WHERE slot.academic_period_id IS NULL;

ALTER TABLE time_slots
  ADD CONSTRAINT time_slots_period_fk
    FOREIGN KEY (school_id, academic_period_id)
    REFERENCES academic_periods (school_id, id),
  ADD CONSTRAINT time_slots_clock_order_check
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slots_period_day_period
  ON time_slots (academic_period_id, day, period);

ALTER TABLE lesson_requirements
  ADD COLUMN IF NOT EXISTS academic_period_id UUID,
  ADD COLUMN IF NOT EXISTS room_id UUID,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE lesson_requirements AS lesson
SET academic_period_id = (
  SELECT period.id
  FROM academic_periods AS period
  WHERE period.school_id = lesson.school_id
  ORDER BY period.starts_on, period.id
  LIMIT 1
)
WHERE lesson.academic_period_id IS NULL;

ALTER TABLE lesson_requirements
  ADD CONSTRAINT lesson_requirements_period_fk
    FOREIGN KEY (school_id, academic_period_id)
    REFERENCES academic_periods (school_id, id),
  ADD CONSTRAINT lesson_requirements_class_fk
    FOREIGN KEY (school_id, class_id)
    REFERENCES classes (school_id, id),
  ADD CONSTRAINT lesson_requirements_subject_fk
    FOREIGN KEY (school_id, subject_id)
    REFERENCES subjects (school_id, id),
  ADD CONSTRAINT lesson_requirements_teacher_fk
    FOREIGN KEY (school_id, teacher_id)
    REFERENCES teachers (school_id, id),
  ADD CONSTRAINT lesson_requirements_room_fk
    FOREIGN KEY (school_id, room_id)
    REFERENCES rooms (school_id, id),
  ADD CONSTRAINT lesson_requirements_status_check
    CHECK (status IN ('ACTIVE', 'ARCHIVED'));

CREATE INDEX IF NOT EXISTS idx_lesson_requirements_period_natural_key
  ON lesson_requirements (academic_period_id, class_id, subject_id, teacher_id);

ALTER TABLE optimization_runs
  ADD COLUMN IF NOT EXISTS academic_period_id UUID,
  ADD COLUMN IF NOT EXISTS job_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE optimization_runs AS run
SET academic_period_id = (
  SELECT period.id
  FROM academic_periods AS period
  WHERE period.school_id = run.school_id
  ORDER BY period.starts_on, period.id
  LIMIT 1
)
WHERE run.academic_period_id IS NULL;

ALTER TABLE optimization_runs
  ADD CONSTRAINT optimization_runs_period_fk
    FOREIGN KEY (school_id, academic_period_id)
    REFERENCES academic_periods (school_id, id);

CREATE INDEX IF NOT EXISTS idx_optimization_runs_period_requested
  ON optimization_runs (academic_period_id, requested_at DESC);

ALTER TABLE import_batches
  ADD COLUMN IF NOT EXISTS academic_period_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE import_batches AS batch
SET academic_period_id = (
  SELECT period.id
  FROM academic_periods AS period
  WHERE period.school_id = batch.school_id
  ORDER BY period.starts_on, period.id
  LIMIT 1
)
WHERE batch.academic_period_id IS NULL;

ALTER TABLE import_batches
  ADD CONSTRAINT import_batches_period_fk
    FOREIGN KEY (school_id, academic_period_id)
    REFERENCES academic_periods (school_id, id);

CREATE INDEX IF NOT EXISTS idx_import_batches_period_created
  ON import_batches (academic_period_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rule_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  academic_period_id UUID NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  source_ref TEXT,
  effective_from DATE,
  effective_to DATE,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academic_period_id, version),
  FOREIGN KEY (school_id, academic_period_id)
    REFERENCES academic_periods (school_id, id),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS rule_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_profile_id UUID NOT NULL REFERENCES rule_profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('HARD', 'SOFT')),
  weight NUMERIC(12, 3),
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rule_profile_id, code),
  CHECK (kind = 'HARD' OR weight IS NULL OR weight >= 0)
);

CREATE TABLE IF NOT EXISTS schedule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  academic_period_id UUID NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'APPROVED', 'LOCKED', 'PUBLISHED')),
  source_run_id UUID REFERENCES optimization_runs(id),
  created_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academic_period_id, version_number),
  FOREIGN KEY (school_id, academic_period_id)
    REFERENCES academic_periods (school_id, id),
  CHECK (status <> 'APPROVED' OR approved_at IS NOT NULL),
  CHECK (status <> 'LOCKED' OR locked_at IS NOT NULL),
  CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS schedule_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_version_id UUID NOT NULL REFERENCES schedule_versions(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lesson_requirements(id),
  session_index SMALLINT NOT NULL CHECK (session_index >= 0),
  time_slot_id UUID NOT NULL REFERENCES time_slots(id),
  room_id UUID REFERENCES rooms(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_version_id, lesson_id, session_index),
  UNIQUE (schedule_version_id, time_slot_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_versions_period_status
  ON schedule_versions (academic_period_id, status);

CREATE INDEX IF NOT EXISTS idx_schedule_assignments_version_slot
  ON schedule_assignments (schedule_version_id, time_slot_id);

COMMENT ON COLUMN lesson_requirements.academic_period_id IS
  'Nullable during the transition from the schemaVersion 1.0 import API; CRUD/import period selection must make it mandatory before production.';

COMMENT ON INDEX idx_lesson_requirements_period_natural_key IS
  'Diagnostic natural-key index; uniqueness across re-import batches is deferred until the approved idempotency policy is implemented.';
