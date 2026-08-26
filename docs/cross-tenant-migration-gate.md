# Cross-tenant và migration gate — P4.1-T05

**Gate version:** `CROSS-TENANT-MIGRATION-GATE-1.0.0`
**Ngày:** 2026-08-26

## Test matrix

| Area                      | Test required                                                     | Current result                                              |
| ------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| Identity/payload spoofing | Tenant mismatch and missing trusted context rejected              | PASS — P4.1-T02 policy tests                                |
| Queue/cache namespace     | Tenant + school namespace and retry keys cannot collide           | PASS — namespace policy tests; durable Redis isolation open |
| API repositories          | Same object ID from another tenant returns 403/404                | BLOCKED — app tenant context/repository scope not wired     |
| Import/export             | Cross-tenant batch/version/export denied                          | BLOCKED — app tenant context/repository scope not wired     |
| Public links              | Invalid tenant/token cannot resolve published snapshot            | BLOCKED — app tenant context not wired                      |
| Migration                 | Large snapshot backfill, checksum/row counts, downtime/throughput | PARTIAL — migration 013/RLS policy pass; large-table open   |
| Rollback/repair           | Forward-only repair and restore drill                             | PLAN ONLY — use ADR-004 and P3.3-T04 runbook                |

## Gate decision

`REQUIRES_APPLICATION_TENANT_CONTEXT` is the current result. Migration 013 and a
non-owner RLS policy test prove database policy behavior, but the running API still
uses the scheduler database owner and does not set `app.tenant_id` per trusted
request. Do not mark tenant rollout GO or Production Approved.

## Required next steps

1. Wire trusted request tenant context to a non-owner application role and set
   `app.tenant_id` per transaction; add tenant-aware repository/export/public-link
   queries.
2. Create two synthetic tenants/schools in an isolated database and run read/write,
   import/export, public-link, cache/queue and solver payload negative tests.
3. Run large-table rehearsal with checksum/row counts, lock budget, throughput,
   downtime and forward repair; preserve backup before cutover.
4. Re-run this gate and require security/architecture/release approvers.

Evidence: `outputs/P4.1-T05/cross-tenant-gate-report.json`.
