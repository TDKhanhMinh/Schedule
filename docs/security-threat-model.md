# Security, privacy và threat model — P3.3-T02

**Phiên bản review:** `SECURITY-REVIEW-1.0.0`
**Ngày:** 2026-08-26
**Phạm vi:** V1.1 Web MVP: auth/school scope, Excel upload, export, public links, PostgreSQL, Redis/BullMQ và Python solver.

## 1. Data classification và retention

| Class | Dữ liệu                                                                                | Quy tắc xử lý                                                                                   |
| ----- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| C0    | Published read-only schedule đã được trường cho phép công bố                           | Chỉ qua published version/public token; token lưu hash; revoke/expiry phải có hiệu lực.         |
| C1    | IDs, checksums, status, metrics và audit metadata                                      | Không chứa raw workbook/body/secret; route/metric labels phải bounded.                          |
| C2    | Class, teacher display name, subject, room và lịch nội bộ                              | School/academic-period scope ở server; không đưa vào log/metric; export chỉ theo role/status.   |
| C3    | Database/Redis credentials, request headers, public token nguyên bản, raw workbook tạm | Không commit, không log, không đưa vào client; production phải dùng secret manager và rotation. |

Retention của C1/C2/C3 cần được school/legal owner chốt trong production data-retention decision. Code hiện giữ audit/schedule/job history trong PostgreSQL theo lifecycle; không tự đặt thời hạn pháp lý.

## 2. Threat model và abuse cases

| ID      | Abuse case                                                                    | Boundary/evidence                                                                        | Severity | Owner/status                                                                                           |
| ------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| THR-001 | Đọc/ghi chéo school bằng header hoặc path giả                                 | `auth.guard.test.ts`, `master-data.service.test.ts`, `scripts/test-p2-5-t04-runtime.mjs` | P0       | Covered in local/dev; staging identity test remains open.                                              |
| THR-002 | Upload PDF/DOCX, sai template, missing/invalid/unknown rows hoặc file độc hại | import fixtures/specs, file type/size boundary, runtime matrix                           | P0       | Covered in local/dev; production WAF/AV/quota remains open.                                            |
| THR-003 | Formula injection khi export cell chứa `=`, `+`, `-`, `@`                     | `schedule-export.service.test.ts`, `safeWorkbookValue`                                   | P1       | Covered in local/dev; Excel consumer policy remains open.                                              |
| THR-004 | Public link bị đoán, dùng sau expiry/revoke hoặc đọc draft                    | `public-schedule.service.test.ts`, token hash migration                                  | P0       | Covered in local/dev; production rate-limit/monitoring remains open.                                   |
| THR-005 | Queue payload/solver error làm lộ workbook, PII, secret hoặc raw stack        | `P3.3-T01` redaction/trace tests, audit metadata sanitizer                               | P1       | Covered in implementation; centralized log retention/redaction collector remains open.                 |
| THR-006 | Solver resource exhaustion qua payload lớn/time limit hoặc retry storm        | preflight, bounded retry/timeout, BullMQ status tests                                    | P1       | Local controls present; production quota/rate-limit/load gate remains open.                            |
| THR-007 | Dependency advisory trong `exceljs → uuid`                                    | `npm audit --omit=dev` dated 2026-08-26                                                  | P1       | OPEN; Platform owner must evaluate compatible upgrade/override or named risk acceptance with expiry.   |
| THR-008 | Dev compose credentials/ports được dùng ngoài local                           | `docker-compose.yml`, `.env.example`                                                     | P1       | OPEN deployment gate; production must use secret manager, private network and non-default credentials. |
| THR-009 | Metrics endpoint hoặc trace IDs bị expose ngoài internal network              | `ObservabilityController`, runtime metrics 200                                           | P1       | OPEN deployment gate; protect/scope scrape endpoint and configure collector access policy.             |

Không có P0 finding mới được chứng minh là bypassed bởi local automated/runtime evidence. P0/P1 ở trên vẫn là release gates nếu chưa có staging evidence hoặc risk acceptance có approver và expiry.

## 3. Required production controls

1. Chạy authenticated cross-school, malformed upload, archive/expiry/revoke và export formula cases trong staging bằng identity thật.
2. Chốt C2/C3 retention, deletion, backup access và incident response với owner có thẩm quyền.
3. Resolve `THR-007` bằng compatible dependency plan; không tự hạ version ExcelJS trong task review.
4. Loại bỏ credential/port mặc định khỏi production compose; cấu hình secret manager, TLS/private network, Redis auth và DB least privilege.
5. Đặt `/metrics` sau internal network/auth hoặc scrape allow-list; aggregate worker logs/metrics vào collector có retention/access policy.

## 4. Evidence

- Automated security tests: `outputs/P3.3-T02/security-review-report.json`.
- Runtime matrix: `node scripts/test-p2-5-t04-runtime.mjs`.
- Threat/dependency/config sources: `backend/src/auth`, `backend/src/imports`, `backend/src/timetable`, `backend/src/observability`, `docker-compose.yml`, `.env.example`.
- This is a local/dev review and remediation register. It does not grant pilot, staging or production approval.
