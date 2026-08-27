-- P1.3-T08: staged master-data imports and teacher-subject-grade eligibility.
-- This migration is forward-only. No import operation deletes or restores rows implicitly.

CREATE TABLE IF NOT EXISTS teacher_subject_grade_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  school_id UUID NOT NULL,
  academic_period_id UUID NOT NULL,
  teacher_id UUID NOT NULL,
  subject_id UUID NOT NULL,
  grade SMALLINT NOT NULL CHECK (grade BETWEEN 6 AND 12),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  source_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_teacher_subject_grade_period
    UNIQUE (tenant_id, school_id, academic_period_id, teacher_id, subject_id, grade)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_subject_grade_tenant_id
  ON teacher_subject_grade_assignments (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_teacher_subject_grade_lookup
  ON teacher_subject_grade_assignments (tenant_id, school_id, academic_period_id, teacher_id, subject_id, grade)
  WHERE status = 'ACTIVE';

ALTER TABLE teacher_subject_grade_assignments
  ADD CONSTRAINT teacher_subject_grade_school_fk
    FOREIGN KEY (tenant_id, school_id) REFERENCES schools (tenant_id, id),
  ADD CONSTRAINT teacher_subject_grade_period_fk
    FOREIGN KEY (tenant_id, academic_period_id) REFERENCES academic_periods (tenant_id, id),
  ADD CONSTRAINT teacher_subject_grade_teacher_fk
    FOREIGN KEY (tenant_id, teacher_id) REFERENCES teachers (tenant_id, id),
  ADD CONSTRAINT teacher_subject_grade_subject_fk
    FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects (tenant_id, id);

CREATE TABLE IF NOT EXISTS master_data_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  school_id UUID NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('class', 'teacher', 'subject', 'room', 'teacherSubjectGrade', 'homeroom')),
  original_filename TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  template_version TEXT NOT NULL,
  file_checksum TEXT NOT NULL CHECK (file_checksum ~ '^[0-9a-f]{64}$'),
  idempotency_key TEXT,
  status TEXT NOT NULL DEFAULT 'PREVIEWED' CHECK (status IN ('PREVIEWED', 'CONFIRMED', 'REJECTED')),
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  valid_row_count INTEGER NOT NULL DEFAULT 0 CHECK (valid_row_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  create_count INTEGER NOT NULL DEFAULT 0 CHECK (create_count >= 0),
  update_count INTEGER NOT NULL DEFAULT 0 CHECK (update_count >= 0),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  confirmation_result JSONB,
  CONSTRAINT uq_master_data_import_batch_tenant_id UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_data_import_idempotency
  ON master_data_import_batches (tenant_id, school_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_master_data_import_batches_scope
  ON master_data_import_batches (tenant_id, school_id, entity, created_at DESC);

ALTER TABLE master_data_import_batches
  ADD CONSTRAINT master_data_import_batch_school_fk
    FOREIGN KEY (tenant_id, school_id) REFERENCES schools (tenant_id, id);

CREATE TABLE IF NOT EXISTS master_data_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  batch_id UUID NOT NULL,
  row_number INTEGER NOT NULL CHECK (row_number >= 2),
  operation TEXT CHECK (operation IN ('CREATE', 'UPDATE')),
  payload JSONB,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_master_data_import_row_number UNIQUE (tenant_id, batch_id, row_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_master_data_import_row_tenant_id
  ON master_data_import_rows (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_master_data_import_rows_batch
  ON master_data_import_rows (tenant_id, batch_id, row_number);

ALTER TABLE master_data_import_rows
  ADD CONSTRAINT master_data_import_row_batch_fk
    FOREIGN KEY (tenant_id, batch_id) REFERENCES master_data_import_batches (tenant_id, id) ON DELETE CASCADE;

ALTER TABLE teacher_subject_grade_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_teacher_subject_grade_assignments
  ON teacher_subject_grade_assignments
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE master_data_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_master_data_import_batches
  ON master_data_import_batches
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE master_data_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_master_data_import_rows
  ON master_data_import_rows
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
