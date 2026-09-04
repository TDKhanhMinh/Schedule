-- P2.2-T08: automatic teacher-to-class assignment proposals.
-- Manual lesson requirements remain the trusted assignment source. Automatic
-- results are staged and must be reviewed before they are materialized.

CREATE TABLE IF NOT EXISTS class_subject_demands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  school_id UUID NOT NULL,
  academic_period_id UUID NOT NULL,
  class_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  room_id UUID,
  fixed_slot_id UUID,
  required_sessions SMALLINT NOT NULL CHECK (required_sessions > 0),
  activity_type TEXT NOT NULL DEFAULT 'LESSON'
    CHECK (activity_type IN ('LESSON', 'FLAG_CEREMONY')),
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  source_ref TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_class_subject_demand
    UNIQUE (tenant_id, school_id, academic_period_id, class_id, subject_id, activity_type),
  CONSTRAINT class_subject_demands_school_fk
    FOREIGN KEY (tenant_id, school_id) REFERENCES schools (tenant_id, id),
  CONSTRAINT class_subject_demands_period_fk
    FOREIGN KEY (tenant_id, academic_period_id) REFERENCES academic_periods (tenant_id, id),
  CONSTRAINT class_subject_demands_class_fk
    FOREIGN KEY (tenant_id, class_id) REFERENCES classes (tenant_id, id),
  CONSTRAINT class_subject_demands_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects (tenant_id, id),
  CONSTRAINT class_subject_demands_room_fk
    FOREIGN KEY (tenant_id, room_id) REFERENCES rooms (tenant_id, id),
  CONSTRAINT class_subject_demands_fixed_slot_fk
    FOREIGN KEY (tenant_id, fixed_slot_id) REFERENCES time_slots (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_subject_demands_tenant_id
  ON class_subject_demands (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_class_subject_demands_scope
  ON class_subject_demands (tenant_id, school_id, academic_period_id, status, class_id, subject_id);

ALTER TABLE class_subject_demands ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_class_subject_demands
  ON class_subject_demands
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS teacher_assignment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  school_id UUID NOT NULL,
  academic_period_id UUID NOT NULL,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'RUNNING', 'OPTIMAL', 'FEASIBLE', 'PROPOSED', 'PARTIAL', 'INFEASIBLE', 'UNKNOWN', 'CONFIRMED', 'REJECTED', 'FAILED', 'CANCELLED')),
  progress_stage TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (progress_stage IN ('QUEUED', 'RUNNING', 'PERSISTING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  contract_version TEXT NOT NULL DEFAULT 'TEACHER-ASSIGNMENT-1.0.0',
  algorithm_version TEXT NOT NULL DEFAULT 'TEACHER-ASSIGNMENT-1.0.0',
  random_seed INTEGER NOT NULL DEFAULT 0,
  input_checksum CHAR(64) NOT NULL CHECK (input_checksum ~ '^[0-9a-f]{64}$'),
  output_checksum CHAR(64) CHECK (output_checksum IS NULL OR output_checksum ~ '^[0-9a-f]{64}$'),
  payload JSONB NOT NULL,
  result JSONB,
  diagnostics JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  last_error JSONB,
  requested_by TEXT NOT NULL,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  cancel_requested_at TIMESTAMPTZ,
  cancel_reason TEXT,
  retry_key TEXT,
  retry_of_run_id UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_teacher_assignment_run_job UNIQUE (tenant_id, school_id, job_id),
  CONSTRAINT uq_teacher_assignment_run_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT teacher_assignment_runs_school_fk
    FOREIGN KEY (tenant_id, school_id) REFERENCES schools (tenant_id, id),
  CONSTRAINT teacher_assignment_runs_period_fk
    FOREIGN KEY (tenant_id, academic_period_id) REFERENCES academic_periods (tenant_id, id),
  CONSTRAINT teacher_assignment_runs_retry_fk
    FOREIGN KEY (tenant_id, retry_of_run_id) REFERENCES teacher_assignment_runs (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_assignment_run_retry_key
  ON teacher_assignment_runs (tenant_id, school_id, retry_key)
  WHERE retry_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_teacher_assignment_runs_scope
  ON teacher_assignment_runs (tenant_id, school_id, academic_period_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_assignment_runs_status
  ON teacher_assignment_runs (tenant_id, status, progress_stage, heartbeat_at);

ALTER TABLE teacher_assignment_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_teacher_assignment_runs
  ON teacher_assignment_runs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE TABLE IF NOT EXISTS teacher_assignment_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  run_id UUID NOT NULL,
  demand_id UUID NOT NULL,
  teacher_id UUID,
  required_sessions SMALLINT NOT NULL CHECK (required_sessions > 0),
  source TEXT NOT NULL DEFAULT 'AUTO' CHECK (source IN ('AUTO', 'MANUAL')),
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'PROPOSED'
    CHECK (status IN ('PROPOSED', 'ACCEPTED', 'REJECTED', 'UNASSIGNED')),
  score NUMERIC(14, 4),
  reason_code TEXT,
  reason TEXT,
  load_before NUMERIC(12, 3),
  load_after NUMERIC(12, 3),
  adjusted_target NUMERIC(12, 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_teacher_assignment_proposal UNIQUE (tenant_id, run_id, demand_id),
  CONSTRAINT uq_teacher_assignment_proposal_tenant_id UNIQUE (tenant_id, id),
  CONSTRAINT teacher_assignment_proposals_run_fk
    FOREIGN KEY (tenant_id, run_id) REFERENCES teacher_assignment_runs (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT teacher_assignment_proposals_demand_fk
    FOREIGN KEY (tenant_id, demand_id) REFERENCES class_subject_demands (tenant_id, id),
  CONSTRAINT teacher_assignment_proposals_teacher_fk
    FOREIGN KEY (tenant_id, teacher_id) REFERENCES teachers (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_assignment_proposals_run
  ON teacher_assignment_proposals (tenant_id, run_id, status, demand_id);

ALTER TABLE teacher_assignment_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_teacher_assignment_proposals
  ON teacher_assignment_proposals
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE lesson_requirements
  ADD COLUMN IF NOT EXISTS demand_id UUID,
  ADD COLUMN IF NOT EXISTS assignment_source TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS assignment_locked BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS assignment_run_id UUID;

ALTER TABLE lesson_requirements
  ADD CONSTRAINT lesson_requirements_assignment_source_check
    CHECK (assignment_source IN ('MANUAL', 'AUTO')),
  ADD CONSTRAINT lesson_requirements_demand_fk
    FOREIGN KEY (tenant_id, demand_id) REFERENCES class_subject_demands (tenant_id, id),
  ADD CONSTRAINT lesson_requirements_assignment_run_fk
    FOREIGN KEY (tenant_id, assignment_run_id) REFERENCES teacher_assignment_runs (tenant_id, id);

INSERT INTO class_subject_demands
  (tenant_id, school_id, academic_period_id, class_id, subject_id, room_id, fixed_slot_id,
   required_sessions, activity_type, status, source_ref)
SELECT DISTINCT ON (lesson.tenant_id, lesson.school_id, lesson.academic_period_id, lesson.class_id, lesson.subject_id, lesson.activity_type)
       lesson.tenant_id,
       lesson.school_id,
       lesson.academic_period_id,
       lesson.class_id,
       lesson.subject_id,
       lesson.room_id,
       lesson.fixed_slot_id,
       lesson.required_sessions,
       lesson.activity_type,
       lesson.status,
       'LESSON_REQUIREMENT_BACKFILL'
  FROM lesson_requirements AS lesson
 WHERE lesson.academic_period_id IS NOT NULL
 ORDER BY lesson.tenant_id, lesson.school_id, lesson.academic_period_id,
          lesson.class_id, lesson.subject_id, lesson.activity_type,
          lesson.updated_at DESC, lesson.id DESC
ON CONFLICT (tenant_id, school_id, academic_period_id, class_id, subject_id, activity_type) DO NOTHING;

UPDATE lesson_requirements AS lesson
   SET demand_id = demand.id,
       assignment_source = 'MANUAL',
       assignment_locked = TRUE
  FROM class_subject_demands AS demand
 WHERE lesson.demand_id IS NULL
   AND lesson.tenant_id = demand.tenant_id
   AND lesson.school_id = demand.school_id
   AND lesson.academic_period_id = demand.academic_period_id
   AND lesson.class_id = demand.class_id
   AND lesson.subject_id = demand.subject_id
   AND lesson.activity_type = demand.activity_type;

CREATE INDEX IF NOT EXISTS idx_lesson_requirements_demand
  ON lesson_requirements (tenant_id, demand_id, assignment_locked, status);

COMMENT ON TABLE class_subject_demands IS
  'Canonical class-subject weekly demand before teacher assignment; proposals are reviewed before materialization.';
COMMENT ON COLUMN lesson_requirements.assignment_locked IS
  'Manual or explicitly confirmed assignment is protected from automatic teacher allocation.';
