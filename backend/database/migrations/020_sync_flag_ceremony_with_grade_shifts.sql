-- Keep existing Chào cờ requirements aligned with the configured main shift.
-- Main shift MORNING uses Monday period 1; AFTERNOON uses Monday period 5.

UPDATE lesson_requirements AS lesson
   SET fixed_slot_id = slot.id,
       updated_at = now()
  FROM classes AS klass
  JOIN academic_period_grade_shifts AS preference
    ON preference.tenant_id = klass.tenant_id
   AND preference.school_id = klass.school_id
   AND preference.grade = klass.grade
  JOIN time_slots AS slot
    ON slot.tenant_id = preference.tenant_id
   AND slot.school_id = preference.school_id
   AND slot.academic_period_id = preference.academic_period_id
   AND slot.day = 1
   AND slot.shift_code = preference.main_shift_code
   AND slot.period = CASE
     WHEN preference.main_shift_code = 'AFTERNOON' THEN 5
     ELSE 1
   END
 WHERE lesson.tenant_id = preference.tenant_id
   AND lesson.school_id = klass.school_id
   AND lesson.class_id = klass.id
   AND lesson.academic_period_id = preference.academic_period_id
   AND lesson.activity_type = 'FLAG_CEREMONY'
   AND lesson.status = 'ACTIVE';
