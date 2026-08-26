-- P4.1-T05: run application traffic through a non-owner role so RLS is enforced.
-- The local password is a development-only bootstrap value; production deployments
-- must replace DATABASE_URL through the secret manager before cutover.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scheduler_app') THEN
    CREATE ROLE scheduler_app LOGIN PASSWORD 'scheduler_app' NOSUPERUSER NOBYPASSRLS;
  ELSE
    ALTER ROLE scheduler_app LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$do$;

DO $do$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO scheduler_app', current_database());
END
$do$;
GRANT USAGE ON SCHEMA public TO scheduler_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO scheduler_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO scheduler_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO scheduler_app;
ALTER DEFAULT PRIVILEGES FOR ROLE scheduler IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scheduler_app;
ALTER DEFAULT PRIVILEGES FOR ROLE scheduler IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO scheduler_app;

CREATE OR REPLACE FUNCTION public.resolve_public_schedule_tenant(p_token_hash TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
    FROM schedule_public_links
   WHERE token_hash = p_token_hash
   LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.resolve_public_schedule_tenant(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_public_schedule_tenant(TEXT) TO scheduler_app;
