# Business case và go/no-go Tauri/offline — P4.2-T01

**Decision version:** `TAURI-OFFLINE-DECISION-1.0.0`
**Ngày:** 2026-08-26
**Decision hiện tại:** `NO-GO_PENDING_EVIDENCE`

## Decision principle

Không mặc định desktop/offline tốt hơn web. Tauri chỉ đáng triển khai khi pain
thực tế của pilot đủ lớn để bù chi phí sync/conflict, signed update, local secret
protection, support và threat surface mới.

## Evidence matrix

| Criterion      | Quantified gate                                                                            | Evidence hiện có                                                       | Result |
| -------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------ |
| Network pain   | 4 tuần telemetry hoặc ≥3 stakeholder interviews có outage minutes/session                  | Chưa có school network log/interview được xác nhận                     | OPEN   |
| Offline value  | ≥20% pilot sessions bị chặn bởi network hoặc business-critical offline workflow            | UAT local/dev không đo outage/offline workflow                         | OPEN   |
| Sync safety    | Conflict model, source-of-truth, replay/idempotency và recovery drill pass                 | Chưa có offline sync contract; PostgreSQL web source-of-truth hiện tại | NO-GO  |
| Security       | Threat model, encrypted local store, token expiry/revocation, signed update và device wipe | P3.3-T02 chỉ cover web/local; offline threat model chưa có             | NO-GO  |
| Update/support | Signed update, rollback, version skew policy và support owner được chứng minh              | Chưa có packaging/update/support evidence                              | OPEN   |
| TCO            | 3-year build + maintenance + support ≤ approved web baseline với owner/budget              | Chưa có budget/TCO/stakeholder approval                                | OPEN   |
| Web baseline   | Auth/scope, UAT, monitoring, restore và release evidence đủ để so sánh                     | Local/dev evidence có; pilot/production gates còn mở                   | OPEN   |

## Options

| Option              | Value                                                                | Cost/risk                                                           | Decision                            |
| ------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| Web-first           | Một source of truth, update/rollback tập trung, phù hợp MVP hiện tại | Phụ thuộc network; cần evidence outage thực tế                      | Recommended interim                 |
| PWA/cache read-only | Giảm outage đọc lịch, không tạo local write conflict                 | Vẫn cần cache/privacy/expiry review                                 | Explore only after network evidence |
| Tauri full offline  | Có thể solve/review khi mất mạng                                     | Local DB/sync conflict, signed update, device security, support/TCO | No-go pending evidence              |

## GO criteria cho Tauri discovery

Chỉ chuyển sang discovery/PoC khi có network evidence + stakeholder pain evidence,
TCO owner/budget, offline threat model owner, sync conflict contract, update
rollback plan và tiêu chí pilot đo được. PoC không được coi là production-ready.

## Next actions và owner

1. Product/school coordinator: thu thập 4 tuần network availability và ≥3 phỏng vấn.
2. Finance/operations owner: lập 3-year TCO so với web baseline.
3. Security owner: threat model local storage/device/token/update.
4. Architecture owner: design sync/source-of-truth/conflict replay và benchmark.
5. Release owner: quyết định GO/NO-GO có approver, scope và expiry nếu waiver.

## Evidence boundary

Report máy đọc: `outputs/P4.2-T01/tauri-offline-decision-report.json`. Đây là
decision brief dựa trên evidence hiện có; không tạo Tauri code, không thay đổi
React/NestJS/PostgreSQL/Redis/Python runtime và không cấp production approval.
