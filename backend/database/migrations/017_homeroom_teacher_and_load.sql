-- Assign homeroom teachers per school and academic period, and persist the
-- reduction rule used by the teacher-load summary.
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS education_level TEXT NOT NULL DEFAULT 'LOWER_SECONDARY';

UPDATE schools
SET education_level = CASE
  WHEN code ~* 'THPT' THEN 'UPPER_SECONDARY'
  WHEN code ~* 'TIỂU|TIEU|PRIMARY' THEN 'PRIMARY'
  ELSE 'LOWER_SECONDARY'
END
WHERE education_level IS NULL OR btrim(education_level) = '' OR education_level = 'LOWER_SECONDARY';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schools_education_level_check'
  ) THEN
    ALTER TABLE schools
      ADD CONSTRAINT schools_education_level_check
      CHECK (education_level IN ('PRIMARY', 'LOWER_SECONDARY', 'UPPER_SECONDARY', 'MULTI_LEVEL'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS class_homeroom_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  school_id UUID NOT NULL,
  academic_period_id UUID NOT NULL,
  class_id UUID NOT NULL,
  teacher_id UUID NOT NULL,
  weekly_reduction_periods SMALLINT NOT NULL DEFAULT 4
    CHECK (weekly_reduction_periods BETWEEN 0 AND 10),
  rule_code TEXT NOT NULL DEFAULT 'TT_05_2025_D9_1'
    CHECK (btrim(rule_code) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_class_homeroom_period UNIQUE (tenant_id, school_id, academic_period_id, class_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_class_homeroom_tenant_id
  ON class_homeroom_assignments (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_class_homeroom_period
  ON class_homeroom_assignments (tenant_id, school_id, academic_period_id, class_id);

ALTER TABLE class_homeroom_assignments
  ADD CONSTRAINT class_homeroom_school_fk
    FOREIGN KEY (tenant_id, school_id) REFERENCES schools (tenant_id, id),
  ADD CONSTRAINT class_homeroom_period_fk
    FOREIGN KEY (tenant_id, academic_period_id) REFERENCES academic_periods (tenant_id, id),
  ADD CONSTRAINT class_homeroom_class_fk
    FOREIGN KEY (tenant_id, class_id) REFERENCES classes (tenant_id, id),
  ADD CONSTRAINT class_homeroom_teacher_fk
    FOREIGN KEY (tenant_id, teacher_id) REFERENCES teachers (tenant_id, id);

ALTER TABLE class_homeroom_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_class_homeroom_assignments
  ON class_homeroom_assignments
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
