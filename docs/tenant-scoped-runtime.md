# Tenant-scoped runtime boundary — P4.1-T02

**Contract:** `TENANT-SCOPE-1.0.0`
**Ngày:** 2026-08-26

## Implemented now

- `AuthGuard` accepts an optional trusted `x-tenant-id` only for the existing
  non-production test/dev identity path; production still fails closed until a
  real identity provider is configured.
- If a request carries `tenantId` in path/body, it must match the trusted identity;
  a payload cannot introduce a tenant when identity has no tenant context.
- Optimization job envelope carries tenant context, contract version and a
  tenant/school queue namespace. The solver payload itself is not silently changed
  before the V2 contract/schema migration.
- Tenant scope tests cover missing identity, mismatch, opaque ID validation and
  queue namespace propagation.

## Explicitly not complete

V1 database tables do not yet have `tenant_id`; repositories, exports, public links,
Redis key stores and RLS therefore cannot claim full cross-tenant isolation. The
implementation is a fail-closed boundary/scaffolding compatible with V1. P4.1-T03
must add the forward migration and repository scope; P4.1-T05 must run cross-tenant
integration/migration tests before production use.

Evidence: `outputs/P4.1-T02/tenant-scope-report.json` and
`npm run tenant:evidence`.
