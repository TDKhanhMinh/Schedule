CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS academic_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  grade SMALLINT NOT NULL CHECK (grade BETWEEN 6 AND 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS time_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  day SMALLINT NOT NULL CHECK (day BETWEEN 1 AND 7),
  period SMALLINT NOT NULL CHECK (period >= 1),
  UNIQUE (school_id, day, period)
);

CREATE TABLE IF NOT EXISTS lesson_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  class_id UUID NOT NULL REFERENCES classes(id),
  subject_id UUID NOT NULL REFERENCES subjects(id),
  teacher_id UUID NOT NULL REFERENCES teachers(id),
  required_sessions SMALLINT NOT NULL CHECK (required_sessions > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS optimization_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id),
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'UNKNOWN', 'FAILED')),
  contract_version TEXT NOT NULL DEFAULT '1.0',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  diagnostics JSONB NOT NULL DEFAULT '{"warnings": [], "conflicts": []}'::jsonb
);

CREATE TABLE IF NOT EXISTS optimization_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES optimization_runs(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lesson_requirements(id),
  session_index SMALLINT NOT NULL CHECK (session_index >= 0),
  time_slot_id UUID NOT NULL REFERENCES time_slots(id),
  UNIQUE (run_id, lesson_id, session_index),
  UNIQUE (run_id, time_slot_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_academic_periods_school ON academic_periods (school_id);
CREATE INDEX IF NOT EXISTS idx_lesson_requirements_school ON lesson_requirements (school_id);
CREATE INDEX IF NOT EXISTS idx_optimization_runs_school_status ON optimization_runs (school_id, status);

