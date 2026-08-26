# Cross-tenant và migration gate — P4.1-T05

**Gate version:** `CROSS-TENANT-MIGRATION-GATE-1.0.0`
**Ngày:** 2026-08-26

## Test matrix

| Area                      | Test required                                                     | Current result                                              |
| ------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| Identity/payload spoofing | Tenant mismatch and missing trusted context rejected              | PASS — P4.1-T02 policy tests                                |
| Queue/cache namespace     | Tenant + school namespace and retry keys cannot collide           | PASS — namespace policy tests; durable Redis isolation open |
| API repositories          | Same object ID from another tenant returns 403/404                | BLOCKED — V1 tables have no tenant_id/RLS                   |
| Import/export             | Cross-tenant batch/version/export denied                          | BLOCKED — requires tenant-aware repository/FK migration     |
| Public links              | Invalid tenant/token cannot resolve published snapshot            | BLOCKED — public-link tenant key not migrated               |
| Migration                 | Large snapshot backfill, checksum/row counts, downtime/throughput | BLOCKED — no V2 migration applied                           |
| Rollback/repair           | Forward-only repair and restore drill                             | PLAN ONLY — use ADR-004 and P3.3-T04 runbook                |

## Gate decision

`BLOCKED_MIGRATION_NOT_APPLIED` is the correct result. Policy tests prove only the
identity/queue boundary; they do not prove database isolation. Do not mark tenant
rollout GO or Production Approved.

## Required next steps

1. Implement tenant migration/repository scope with nullable backfill, composite
   FKs, indexes and RLS/least-privilege review.
2. Create two synthetic tenants/schools in an isolated database and run read/write,
   import/export, public-link, cache/queue and solver payload negative tests.
3. Run large-table rehearsal with checksum/row counts, lock budget, throughput,
   downtime and forward repair; preserve backup before cutover.
4. Re-run this gate and require security/architecture/release approvers.

Evidence: `outputs/P4.1-T05/cross-tenant-gate-report.json`.
