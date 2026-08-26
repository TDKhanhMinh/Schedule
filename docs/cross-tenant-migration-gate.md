# Cross-tenant và migration gate — P4.1-T05

**Gate version:** `CROSS-TENANT-MIGRATION-GATE-1.0.0`
**Ngày:** 2026-08-26

## Test matrix

| Area                      | Test required                                                     | Current result                                              |
| ------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| Identity/payload spoofing | Tenant mismatch and missing trusted context rejected              | PASS — P4.1-T02 policy tests                                |
| Queue/cache namespace     | Tenant + school namespace and retry keys cannot collide           | PASS — namespace policy tests; durable Redis isolation open |
| API repositories          | Same object ID from another tenant returns 403/404                | PASS — two-tenant API read negative matrix (404)            |
| Import/export             | Cross-tenant batch/version/export denied                          | PASS — two-tenant export negative matrix (404)              |
| Public links              | Invalid tenant/token cannot resolve published snapshot            | PASS — token resolver sets tenant context; valid view 200   |
| Migration                 | Large snapshot backfill, checksum/row counts, downtime/throughput | PASS local — 40,000 rows, checksum/counts preserved, 0.748s |
| Rollback/repair           | Forward-only repair and restore drill                             | PLAN ONLY — use ADR-004 and P3.3-T04 runbook                |

## Gate decision

`REQUIRES_SECURITY_ARCHITECTURE_RELEASE_APPROVAL` is the current result. Migrations
013–015, the non-owner application role, and the runtime pool/interceptor now set
`app.tenant_id` per trusted request/job. The two-tenant API, export, and public-link
negative matrix passed. The isolated rehearsal backfilled 40,000 audit rows with
checksum/count preservation and no null tenant IDs. Do not mark tenant rollout GO
or Production Approved until named approvals are complete.

## Required next steps

1. Extend the isolated negative matrix to write/import, cache/queue and solver
   payload cases, then require security/architecture/release approvers.

Evidence: `outputs/P4.1-T05/cross-tenant-gate-report.json`.
