-- P2.3: separate morning/afternoon slots and configure preferred shifts by grade.
-- This migration preserves existing slots as MORNING and does not remove data.

UPDATE time_slots
SET shift_code = 'MORNING'
WHERE shift_code IS NULL;

ALTER TABLE time_slots
  ALTER COLUMN shift_code SET DEFAULT 'MORNING',
  ALTER COLUMN shift_code SET NOT NULL;

ALTER TABLE time_slots
  DROP CONSTRAINT IF EXISTS time_slots_shift_code_check,
  DROP CONSTRAINT IF EXISTS time_slots_period_range_check;

ALTER TABLE time_slots
  ADD CONSTRAINT time_slots_shift_code_check
    CHECK (shift_code IN ('MORNING', 'AFTERNOON')),
  ADD CONSTRAINT time_slots_period_range_check
    CHECK (period BETWEEN 1 AND 5);

ALTER TABLE time_slots
  DROP CONSTRAINT IF EXISTS time_slots_school_id_day_period_key;

DROP INDEX IF EXISTS uq_time_slots_period_day_period;

CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slots_period_day_shift_period
  ON time_slots (academic_period_id, day, shift_code, period);

ALTER TABLE time_slots
  ADD CONSTRAINT time_slots_school_id_id_unique UNIQUE (school_id, id);

CREATE TABLE IF NOT EXISTS academic_period_grade_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  school_id UUID NOT NULL,
  academic_period_id UUID NOT NULL,
  grade SMALLINT NOT NULL CHECK (grade BETWEEN 6 AND 12),
  main_shift_code TEXT NOT NULL CHECK (main_shift_code IN ('MORNING', 'AFTERNOON')),
  secondary_shift_code TEXT NOT NULL CHECK (secondary_shift_code IN ('MORNING', 'AFTERNOON')),
  allow_secondary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT academic_period_grade_shifts_unique
    UNIQUE (tenant_id, school_id, academic_period_id, grade),
  CONSTRAINT academic_period_grade_shifts_distinct_check
    CHECK (main_shift_code <> secondary_shift_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_period_grade_shifts_tenant_id
  ON academic_period_grade_shifts (tenant_id, id);
CREATE INDEX IF NOT EXISTS idx_academic_period_grade_shifts_scope
  ON academic_period_grade_shifts (tenant_id, school_id, academic_period_id, grade);

ALTER TABLE academic_period_grade_shifts
  ADD CONSTRAINT academic_period_grade_shifts_school_fk
    FOREIGN KEY (tenant_id, school_id) REFERENCES schools (tenant_id, id),
  ADD CONSTRAINT academic_period_grade_shifts_period_fk
    FOREIGN KEY (tenant_id, academic_period_id) REFERENCES academic_periods (tenant_id, id);

ALTER TABLE academic_period_grade_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_academic_period_grade_shifts
  ON academic_period_grade_shifts
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE lesson_requirements
  ADD COLUMN IF NOT EXISTS fixed_slot_id UUID,
  ADD COLUMN IF NOT EXISTS activity_type TEXT NOT NULL DEFAULT 'LESSON';

ALTER TABLE lesson_requirements
  DROP CONSTRAINT IF EXISTS lesson_requirements_activity_type_check;

ALTER TABLE lesson_requirements
  ADD CONSTRAINT lesson_requirements_activity_type_check
    CHECK (activity_type IN ('LESSON', 'FLAG_CEREMONY'));

ALTER TABLE lesson_requirements
  ADD CONSTRAINT lesson_requirements_fixed_slot_school_fk
    FOREIGN KEY (school_id, fixed_slot_id) REFERENCES time_slots (school_id, id),
  ADD CONSTRAINT lesson_requirements_fixed_slot_tenant_fk
    FOREIGN KEY (tenant_id, fixed_slot_id) REFERENCES time_slots (tenant_id, id);

CREATE INDEX IF NOT EXISTS idx_lesson_requirements_fixed_slot
  ON lesson_requirements (school_id, academic_period_id, fixed_slot_id)
  WHERE fixed_slot_id IS NOT NULL;

COMMENT ON TABLE academic_period_grade_shifts IS
  'Buổi chính được ưu tiên; buổi phụ được phép khi cần trong từng khối và học kỳ.';
COMMENT ON COLUMN lesson_requirements.fixed_slot_id IS
  'Khung tiết bắt buộc cho hoạt động đặc biệt như Chào cờ.';
