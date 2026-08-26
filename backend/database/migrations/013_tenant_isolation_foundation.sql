-- P4.1-T05: forward-only tenant foundation.
-- Backfills one legacy tenant per school, adds tenant-aware keys/FKs/indexes and
-- RLS policies. The current scheduler DB owner still bypasses RLS until the
-- application role/request transaction sets app.tenant_id in the next cutover.

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (btrim(slug) <> ''),
  CHECK (btrim(name) <> '')
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('PLATFORM_ADMIN', 'TENANT_ADMIN', 'SCHOOL_ADMIN', 'SCHEDULER', 'REVIEWER', 'VIEWER')),
  school_id UUID,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, school_id)
);

ALTER TABLE schools ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE academic_periods ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE time_slots ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE lesson_requirements ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE optimization_runs ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE optimization_assignments ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE import_rows ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE rule_profiles ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE rule_definitions ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE rule_set_snapshots ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE schedule_versions ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE schedule_assignments ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE schedule_version_transitions ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE schedule_public_links ADD COLUMN IF NOT EXISTS tenant_id UUID;

INSERT INTO tenants (slug, name)
SELECT 'legacy-' || lower(code), name
FROM schools
ON CONFLICT (slug) DO NOTHING;

UPDATE schools AS school
SET tenant_id = tenant.id
FROM tenants AS tenant
WHERE tenant.slug = 'legacy-' || lower(school.code)
  AND school.tenant_id IS NULL;

UPDATE academic_periods AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE classes AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE teachers AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE subjects AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE rooms AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE time_slots AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE lesson_requirements AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE optimization_runs AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE import_batches AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE audit_logs AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE rule_profiles AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE rule_set_snapshots AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE schedule_versions AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE schedule_version_transitions AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE schedule_public_links AS item SET tenant_id = school.tenant_id FROM schools AS school WHERE item.school_id = school.id AND item.tenant_id IS NULL;
UPDATE import_rows AS item SET tenant_id = batch.tenant_id FROM import_batches AS batch WHERE item.batch_id = batch.id AND item.tenant_id IS NULL;
UPDATE optimization_assignments AS item SET tenant_id = run.tenant_id FROM optimization_runs AS run WHERE item.run_id = run.id AND item.tenant_id IS NULL;
UPDATE rule_definitions AS item SET tenant_id = profile.tenant_id FROM rule_profiles AS profile WHERE item.rule_profile_id = profile.id AND item.tenant_id IS NULL;
UPDATE schedule_assignments AS item SET tenant_id = version.tenant_id FROM schedule_versions AS version WHERE item.schedule_version_id = version.id AND item.tenant_id IS NULL;

ALTER TABLE schools ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE academic_periods ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE classes ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE teachers ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE subjects ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE rooms ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE time_slots ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE lesson_requirements ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE optimization_runs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE optimization_assignments ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE import_batches ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE import_rows ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE rule_profiles ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE rule_definitions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE rule_set_snapshots ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE schedule_versions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE schedule_assignments ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE schedule_version_transitions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE schedule_public_links ALTER COLUMN tenant_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_schools_tenant_id ON schools (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_academic_periods_tenant_id ON academic_periods (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_tenant_id ON classes (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_teachers_tenant_id ON teachers (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_tenant_id ON subjects (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_tenant_id ON rooms (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_time_slots_tenant_id ON time_slots (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lessons_tenant_id ON lesson_requirements (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_runs_tenant_id ON optimization_runs (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_import_batches_tenant_id ON import_batches (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_profiles_tenant_id ON rule_profiles (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_rule_snapshots_tenant_id ON rule_set_snapshots (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_versions_tenant_id ON schedule_versions (tenant_id, id);

ALTER TABLE schools ADD CONSTRAINT schools_tenant_fk FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE tenant_memberships ADD CONSTRAINT tenant_memberships_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE academic_periods ADD CONSTRAINT academic_periods_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE classes ADD CONSTRAINT classes_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE teachers ADD CONSTRAINT teachers_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE subjects ADD CONSTRAINT subjects_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE rooms ADD CONSTRAINT rooms_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE time_slots ADD CONSTRAINT time_slots_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE lesson_requirements ADD CONSTRAINT lessons_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE lesson_requirements ADD CONSTRAINT lessons_tenant_period_fk FOREIGN KEY (tenant_id, academic_period_id) REFERENCES academic_periods(tenant_id, id);
ALTER TABLE lesson_requirements ADD CONSTRAINT lessons_tenant_class_fk FOREIGN KEY (tenant_id, class_id) REFERENCES classes(tenant_id, id);
ALTER TABLE lesson_requirements ADD CONSTRAINT lessons_tenant_subject_fk FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id);
ALTER TABLE lesson_requirements ADD CONSTRAINT lessons_tenant_teacher_fk FOREIGN KEY (tenant_id, teacher_id) REFERENCES teachers(tenant_id, id);
ALTER TABLE lesson_requirements ADD CONSTRAINT lessons_tenant_room_fk FOREIGN KEY (tenant_id, room_id) REFERENCES rooms(tenant_id, id);
ALTER TABLE time_slots ADD CONSTRAINT time_slots_tenant_period_fk FOREIGN KEY (tenant_id, academic_period_id) REFERENCES academic_periods(tenant_id, id);
ALTER TABLE optimization_runs ADD CONSTRAINT runs_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE optimization_runs ADD CONSTRAINT runs_tenant_period_fk FOREIGN KEY (tenant_id, academic_period_id) REFERENCES academic_periods(tenant_id, id);
ALTER TABLE optimization_assignments ADD CONSTRAINT optimization_assignments_tenant_run_fk FOREIGN KEY (tenant_id, run_id) REFERENCES optimization_runs(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE optimization_assignments ADD CONSTRAINT optimization_assignments_tenant_lesson_fk FOREIGN KEY (tenant_id, lesson_id) REFERENCES lesson_requirements(tenant_id, id);
ALTER TABLE optimization_assignments ADD CONSTRAINT optimization_assignments_tenant_slot_fk FOREIGN KEY (tenant_id, time_slot_id) REFERENCES time_slots(tenant_id, id);
ALTER TABLE import_batches ADD CONSTRAINT import_batches_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE import_batches ADD CONSTRAINT import_batches_tenant_period_fk FOREIGN KEY (tenant_id, academic_period_id) REFERENCES academic_periods(tenant_id, id);
ALTER TABLE import_rows ADD CONSTRAINT import_rows_tenant_batch_fk FOREIGN KEY (tenant_id, batch_id) REFERENCES import_batches(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE rule_profiles ADD CONSTRAINT rule_profiles_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE rule_profiles ADD CONSTRAINT rule_profiles_tenant_period_fk FOREIGN KEY (tenant_id, academic_period_id) REFERENCES academic_periods(tenant_id, id);
ALTER TABLE rule_definitions ADD CONSTRAINT rule_definitions_tenant_profile_fk FOREIGN KEY (tenant_id, rule_profile_id) REFERENCES rule_profiles(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE rule_set_snapshots ADD CONSTRAINT rule_snapshots_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE rule_set_snapshots ADD CONSTRAINT rule_snapshots_tenant_profile_fk FOREIGN KEY (tenant_id, rule_profile_id) REFERENCES rule_profiles(tenant_id, id);
ALTER TABLE schedule_versions ADD CONSTRAINT schedule_versions_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE schedule_versions ADD CONSTRAINT schedule_versions_tenant_period_fk FOREIGN KEY (tenant_id, academic_period_id) REFERENCES academic_periods(tenant_id, id);
ALTER TABLE schedule_assignments ADD CONSTRAINT schedule_assignments_tenant_version_fk FOREIGN KEY (tenant_id, schedule_version_id) REFERENCES schedule_versions(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE schedule_assignments ADD CONSTRAINT schedule_assignments_tenant_lesson_fk FOREIGN KEY (tenant_id, lesson_id) REFERENCES lesson_requirements(tenant_id, id);
ALTER TABLE schedule_assignments ADD CONSTRAINT schedule_assignments_tenant_slot_fk FOREIGN KEY (tenant_id, time_slot_id) REFERENCES time_slots(tenant_id, id);
ALTER TABLE schedule_assignments ADD CONSTRAINT schedule_assignments_tenant_room_fk FOREIGN KEY (tenant_id, room_id) REFERENCES rooms(tenant_id, id);
ALTER TABLE schedule_version_transitions ADD CONSTRAINT schedule_transitions_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE schedule_version_transitions ADD CONSTRAINT schedule_transitions_tenant_version_fk FOREIGN KEY (tenant_id, schedule_version_id) REFERENCES schedule_versions(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE schedule_public_links ADD CONSTRAINT public_links_tenant_school_fk FOREIGN KEY (tenant_id, school_id) REFERENCES schools(tenant_id, id);
ALTER TABLE schedule_public_links ADD CONSTRAINT public_links_tenant_version_fk FOREIGN KEY (tenant_id, schedule_version_id) REFERENCES schedule_versions(tenant_id, id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_academic_periods_tenant ON academic_periods (tenant_id, school_id, starts_on);
CREATE INDEX IF NOT EXISTS idx_lesson_requirements_tenant ON lesson_requirements (tenant_id, school_id, academic_period_id);
CREATE INDEX IF NOT EXISTS idx_optimization_runs_tenant ON optimization_runs (tenant_id, school_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_batches_tenant ON import_batches (tenant_id, school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs (tenant_id, school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_versions_tenant ON schedule_versions (tenant_id, school_id, academic_period_id, status);
CREATE INDEX IF NOT EXISTS idx_public_links_tenant ON schedule_public_links (tenant_id, school_id, schedule_version_id, created_at DESC);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['schools','academic_periods','classes','teachers','subjects','rooms','time_slots','lesson_requirements','optimization_runs','optimization_assignments','import_batches','import_rows','audit_logs','rule_profiles','rule_definitions','rule_set_snapshots','schedule_versions','schedule_assignments','schedule_version_transitions','schedule_public_links','tenant_memberships'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I USING (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.tenant_id'', true), '''')::uuid)', 'tenant_isolation_' || table_name, table_name);
  END LOOP;
END $$;
