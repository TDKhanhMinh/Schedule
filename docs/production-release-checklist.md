# Production release checklist và approval record — P3.3-T05

**Checklist version:** `RELEASE-CHECKLIST-1.0.0`
**Ngày:** 2026-08-26
**Decision hiện tại:** `NO-GO — PENDING_GATES`

## Mandatory gates

| Gate                     | Evidence hiện có                                       | Trạng thái                                                 |
| ------------------------ | ------------------------------------------------------ | ---------------------------------------------------------- |
| Source/version/commit    | `scripts/generate-release-record.mjs`, current Git SHA | PASS local                                                 |
| Build/test/migration     | `npm run ci:local`                                     | PASS local                                                 |
| UAT/workbook/stakeholder | `outputs/P3.1-T05/uat-gap-report.json`                 | OPEN: official workbook/approver/sign-off                  |
| Security/privacy         | `outputs/P3.3-T02/security-review-report.json`         | OPEN: 2 moderate dependency findings + deployment controls |
| Performance/capacity     | `outputs/P3.3-T03/load-soak-report.json`               | PASS bounded local; staging/SLO open                       |
| Backup/restore/DR        | `outputs/P3.3-T04/disaster-recovery-report.json`       | PASS isolated local; production storage/access open        |
| Monitoring/alert         | `outputs/P3.3-T01/observability-report.json`           | PASS local trace/alert; collector/paging open              |
| Deployment/post-release  | Release owner checklist                                | OPEN: environment, owner, verification window              |

`Production Approved` chỉ hợp lệ khi mọi mandatory gate pass hoặc có waiver ghi rõ approver, phạm vi ảnh hưởng, owner và expiry. Không dùng local Docker, CI pass hoặc project-owner implementation review để suy ra production approval.

## Release sequence

1. Freeze import/edit/solve/publish và ghi change/correlation ID.
2. Xác nhận official workbook, academic period, rule snapshot, security findings và stakeholder sign-off.
3. Build image từ exact commit; chạy migration forward-only và backup trước change.
4. Deploy API/worker/frontend theo environment config đã review; kiểm tra readiness, metrics, queue, worker và solver smoke.
5. Chạy post-release smoke: upload/validate/confirm, solve, review/edit, approve/lock/publish/export và audit trail.
6. Release owner ký record với timestamp, rollback decision và monitoring owner.

## Rollback

- Dừng traffic ghi và drain BullMQ; không xóa audit/snapshot.
- Giữ database cũ read-only; rollback application image về previous approved SHA.
- Nếu data restore cần thiết, dùng backup đã checksum + restore rehearsal vào DB cô lập trước, đối soát migration/published/audit/import counts rồi mới chuyển traffic.
- Re-run readiness, queue/worker/solver smoke và post-release workflow; mở incident nếu bất kỳ gate nào fail.

## Open approval fields

```text
Release approver: <required>
Security/risk approver: <required if waiver>
Pilot/stakeholder approver: <required>
Deployment owner: <required>
Monitoring/on-call owner: <required>
Decision: NO-GO | GO-WITH-WAIVER | PRODUCTION-APPROVED
Waiver scope/expiry: <required when applicable>
Post-release verification window: <required>
```

Report máy đọc: `outputs/P3.3-T05/release-record.json`. Report này hoàn tất gói quyết định và giữ `pilotApproved=false`, `productionApproved=false` cho tới khi người có thẩm quyền điền các trường trên.
