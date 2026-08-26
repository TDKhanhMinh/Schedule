# Production-readiness execution plan — Web MVP

**Scope:** Web-first MVP through the current release candidate. Tauri/offline is
out of scope because P4.2-T01 remains `NO-GO_PENDING_EVIDENCE`.

**Current decision:** `NO-GO_PENDING_GATES` in
`outputs/P3.3-T05/release-record.json`.

## Gate sequence

### 0. Freeze release scope

- Freeze the Web MVP version, PRD/acceptance criteria, personas and official
  workbook/version/hash.
- Record that Tauri/offline is not part of this release.
- Generate the release candidate from one exact commit and keep the rollback
  image reference.

Exit: signed scope freeze and release candidate record.

### 1. Pilot and stakeholder sign-off

- Run the official workbook through Upload → Validate → Confirm → Solve →
  Review/Edit → Approve → Lock → Publish → Export.
- Capture actor, timestamps, workbook hash, rule snapshot and evidence links.
- Obtain named stakeholder approval for scope, personas and acceptance criteria.

Exit: `officialWorkbookAndStakeholder=true` and `pilotApproved=true` with
durable approver evidence.

### 2. Security closure

- Resolve the open dependency advisory or record a named risk acceptance with
  scope, mitigation and expiry.
- Verify production identity provider, RBAC, tenant membership, RLS and audit
  behavior in staging with authenticated identities.
- Review upload quotas/AV-WAF policy, public-link rate limits, metrics access,
  retention and incident handling.

Exit: `securityP1ClosedOrAccepted=true` with security approver.

### 3. Production environment and data safety

- Provision PostgreSQL/Redis through managed services and secret manager.
- Use the non-owner application role, `TENANT_DB_ENFORCEMENT=true`, TLS and
  private network access.
- Backup before migrations; apply migrations 001–016 forward-only; verify
  ledger, tenant columns, RLS and application context.
- Rehearse isolated restore and keep the previous approved image available.

Exit: `productionSecretsAndEnvironment=true` and staging migration/restore
evidence.

### 4. Monitoring and operations

- Configure the production collector for API, queue, worker and solver metrics.
- Configure alert thresholds, paging destination, on-call owner and runbooks.
- Test one API failure, queue failure and worker/solver failure alert.

Exit: `productionCollectorAndPaging=true` with alert/paging evidence.

### 5. Staging release validation

- Deploy exact release images to staging.
- Run authenticated browser E2E, two-tenant negative matrix, official workbook
  import/solve/export, concurrency, cancel/retry and smoke checks.
- Run capacity/load test against agreed SLOs, backup/restore and rollback drill.

Exit: staging/UAT report has no unresolved P0/P1 blocker.

### 6. Go/no-go and cutover

- Release approver, security approver, pilot stakeholder, deployment owner,
  monitoring owner and post-release owner sign the record.
- Set release window, rollback owner and hypercare window.
- Freeze writes, backup, migrate, deploy, run post-release smoke and monitor.

Only then may the release record become:

```json
{
  "decision": "GO",
  "pilotApproved": true,
  "productionApproved": true,
  "openGates": []
}
```

No script or local test may set these values without the corresponding direct
evidence and named approval.
