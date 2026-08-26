-- P4.1-T05: keep lifecycle transition trigger compatible with tenant_id NOT NULL.
CREATE OR REPLACE FUNCTION record_schedule_version_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO schedule_version_transitions
      (tenant_id, school_id, schedule_version_id, from_status, to_status, actor_id, reason)
    VALUES
      (NEW.tenant_id, NEW.school_id, NEW.id, NULL, NEW.status, NEW.status_changed_by, NEW.status_reason);
  ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO schedule_version_transitions
      (tenant_id, school_id, schedule_version_id, from_status, to_status, actor_id, reason)
    VALUES
      (NEW.tenant_id, NEW.school_id, NEW.id, OLD.status, NEW.status, NEW.status_changed_by, NEW.status_reason);
  END IF;
  RETURN NEW;
END;
$$;
