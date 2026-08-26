-- Preserve the public-link contract: an identified but expired/revoked token is
-- resolved to its tenant and then reported as 410 by the scoped snapshot query.
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
