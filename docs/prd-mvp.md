# MVP Product Requirements & Acceptance Criteria

**Product:** School Timetable Optimizer  
**Version:** PRD-MVP-0.1.0  
**Scope:** Một trường THCS hoặc THPT; web-first; V0.1  
**Status:** Implementation-ready product baseline; stakeholder/pilot approval pending  
**Updated:** 2026-08-24

Tài liệu này chuyển scope, domain glossary và legal/rule register thành hợp đồng
sản phẩm có thể triển khai và nghiệm thu. Đây là PRD mục tiêu của MVP, không
phải tuyên bố rằng mọi capability đã có trong code hiện tại. Trạng thái thực tế
được ghi ở cột Implementation evidence và acceptance matrix.

## 1. Problem và outcome

Người phụ trách thời khóa biểu cần biến dữ liệu lớp–môn–giáo viên–phòng và các
quy tắc của trường thành một thời khóa biểu không có xung đột cứng, có thể giải
thích, chỉnh sửa, phê duyệt và công bố. MVP phải làm rõ dữ liệu đầu vào lỗi ở
đâu, solver đang chạy đến trạng thái nào, vì sao một phương án không khả thi và
ai đã thay đổi/công bố lịch.

### Success outcomes

- Một trường THCS/THPT có thể tạo một academic period và quản lý dữ liệu lịch
  trong một workspace độc lập.
- Dữ liệu Excel chỉ được ghi vào domain sau preview, validation và confirmation
  thành công; dữ liệu nhập tay dùng cùng validation rules.
- Một request solve chạy bất đồng bộ qua NestJS → Redis/BullMQ → Python
  OR-Tools, trả OPTIMAL, FEASIBLE, INFEASIBLE hoặc UNKNOWN cùng diagnostics.
- Người dùng xem được lịch theo lớp, giáo viên và phòng; chỉnh sửa không tạo
  xung đột cứng ẩn.
- Một phương án có thể được lưu thành ScheduleVersion, đưa qua approval,
  khóa, công bố và xuất báo cáo có audit trail.

## 2. Users và quyền quyết định

| Persona | Job-to-be-done | Quyền/khả năng trong MVP |
| --- | --- | --- |
| Người phụ trách thời khóa biểu | Chuẩn hóa dữ liệu, chạy solver, sửa và chuẩn bị phương án | Import/nhập tay, validate, solve, review, edit, tạo draft version |
| Ban giám hiệu/người phê duyệt | Đánh giá phương án và quyết định công bố | Xem diagnostics, approve/reject, lock, publish, export |
| Giáo viên | Cung cấp availability/preference và xem lịch cá nhân | Gửi input theo policy của trường, xem lịch được cấp quyền |
| Quản trị nhà trường | Quản lý school, academic period, profile và quyền | Quản lý workspace, user/role và rule profile trong phạm vi được duyệt |

MVP không tự suy ra người phê duyệt. Role cuối cùng, người cụ thể và school
pilot phải được xác nhận trong legal/rule register trước pilot.

## 3. Guardrails và non-goals

### In scope

- THCS/THPT, một trường pilot trước khi mở rộng multi-school.
- React + TypeScript + Vite; NestJS API/core; PostgreSQL; Redis + BullMQ;
  Python + OR-Tools CP-SAT.
- Excel preview/validation/confirmation/import log và nhập/chỉnh sửa thủ công.
- School, academic period, grade, class, subject, teacher, room, shift/time
  slot, lesson requirement, constraints, preferences và schedule version.
- Review theo lớp/giáo viên/phòng, conflict checking, approval, lock, publish,
  Excel/PDF export và audit trail.

### Out of scope

- Tiểu học; lớp ghép/lớp tách; lịch thi/coi thi; điểm, học bạ, chuyên cần.
- Desktop/Tauri production, offline sync, phụ huynh độc lập, thông báo đa kênh.
- Multi-school hoàn chỉnh, billing, marketplace và AI/LLM/ML làm solver lõi.
- FastAPI hoặc HTTP API riêng cho Python worker.
- Tự động kết luận tuân thủ pháp lý hoặc tự phê duyệt thay cho nhà trường.

## 4. Canonical model và boundary

Nguồn chuẩn thuật ngữ là domain-glossary.md; nguồn chuẩn rule là
legal-rule-register.md. Các quy tắc pháp lý chỉ trở thành constraint khi có
rule profile versioned, nguồn, hiệu lực và approval.

| Concept | MVP contract | Ghi chú |
| --- | --- | --- |
| School / schoolId | Domain scope | Một workspace pilot trước; authorization theo school là bắt buộc khi có auth. |
| AcademicPeriod | PostgreSQL baseline; cần bổ sung vào domain API | Không dùng period của TimeSlot để chỉ academic period. |
| LessonRequirement | v1 wire collection lessons[] | Mỗi item gồm class, subject, teacher và requiredSessions. |
| TimeSlot | timeSlots[].{id,day,period} | period là thứ tự tiết; shiftCode chưa có trong contract v1. |
| Assignment | assignments[].{lessonId,sessionIndex,slotId} | roomId chỉ thêm khi room constraint được version hóa. |
| ScheduleSolution | SolveJobResult | Kết quả tạm của một run; chưa tự động là schedule version. |
| ScheduleVersion | Capability mục tiêu | Snapshot có lifecycle draft/approved/locked/published; chưa có persistence API trong baseline. |
| schemaVersion | 1.0 | Breaking change phải cập nhật JSON Schema, TypeScript, Python và test cùng nhau. |

## 5. User journeys

### UJ-01 — Khởi tạo workspace và academic period

1. Admin tạo/chọn school và academic period.
2. Admin chọn school calendar profile: ngày học, shift, số tiết/buổi, thời
   lượng tiết và breaks theo register đã được duyệt.
3. System hiển thị rule profile/version và người phê duyệt.
4. Người phụ trách thời khóa biểu chỉ được import/nhập dữ liệu trong period đó.

Failure: thiếu approver/profile hoặc profile vi phạm rule nguồn → không cho
activate profile; hiển thị blocker, không âm thầm dùng default.

### UJ-02 — Import Excel có kiểm soát

1. User chọn template/profile và upload workbook.
2. System đọc sheet/column mapping, chỉ tạo staging import.
3. System preview số dòng, field mapping, duplicate, missing reference, range
   error, unsupported grade/class type và warning.
4. User sửa file hoặc mapping; system chạy validation lại.
5. User confirmation tạo import log và ghi domain transactionally.
6. User có thể xem/retry lỗi theo import batch; không ghi một phần ngoài policy.

QC acceptance contract for this journey is TC-IMP-01..03, TC-VAL-01..03 and
TC-CFM-01..02. The executable local workflow is exposed at
POST /api/v1/imports/preview → POST /api/v1/imports/{importBatchId}/confirm;
the frontend renders preview, row-level errors, Confirm state and audit result.

### UJ-03 — Nhập tay và kiểm tra domain

User tạo/chỉnh sửa school data, lesson requirements, slots, rooms và profiles
qua form/table. Cùng một canonical validator dùng cho Excel và manual input.
Unknown reference, duplicate natural key, invalid required sessions và invalid
fixed/allowed slot phải bị từ chối trước khi solve.

### UJ-04 — Preflight và chạy tối ưu bất đồng bộ

1. User chọn dataset/profile/rule version và bấm Run optimization.
2. NestJS preflight kiểm tra payload, rule/profile version và authorization.
3. API enqueue optimization.solve qua BullMQ, trả jobId.
4. Worker chuyển nguyên payload canonical sang Python solver.
5. UI poll status: queued/running/completed/failed; không tự retry vô hạn.
6. User nhận solution status, assignments, objective và diagnostics.

### UJ-05 — Review và sửa lịch

User xem theo class/teacher/room, lọc diagnostics và chỉnh một assignment. Mỗi
edit chạy conflict check đồng bộ; hard conflict chặn save, soft violation hiển
thị warning/weight impact. User có thể khóa phần không muốn solver thay đổi và
chạy local repair ở task sau.

### UJ-06 — Duyệt, khóa, công bố và xuất

1. Scheduler tạo draft ScheduleVersion từ solution.
2. Approver xem rule version, diagnostics, audit changes và export preview.
3. Approver approve hoặc reject với reason.
4. Approved version được lock trước publish; publish tạo event/audit record.
5. Export Excel/PDF phải ghi version, period, generatedAt và người phát hành.

## 6. Functional requirements

| ID | Requirement | Acceptance reference | Implementation evidence |
| --- | --- | --- | --- |
| FR-001 | Workspace phải giới hạn theo School và AcademicPeriod; không trộn dữ liệu giữa period/school. | AT-01, AT-12 | OPEN — persistence/auth domain chưa hoàn tất. |
| FR-002 | Excel template/profile phải có mapping version và preview trước khi ghi. | AT-02 | PARTIAL — local ExcelJS parser, template version 1.0 and staging preview pass; pilot template/profile still open. |
| FR-003 | Excel và manual input dùng cùng canonical validation cho references, ranges, duplicates và required fields. | AT-02, AT-03 | PARTIAL — required fields, number type and master references pass for Excel; manual parity, ranges and full duplicate policy remain open. |
| FR-004 | Import confirmation phải idempotent theo import batch và tạo import log/audit. | AT-02, AT-11 | PARTIAL — PostgreSQL staging, confirm guard, domain insert and basic audit pass locally; retry/observability policy remains open. |
| FR-005 | User quản lý class, subject, teacher, room, slots và lesson requirements theo glossary. | AT-03 | PARTIAL — PostgreSQL baseline/seed có; CRUD/auth chưa có. |
| FR-006 | Rule profile phải reference register version, source, effective date, applicability và approval. | AT-01, AT-10 | PARTIAL — register có; rule profile schema/approval workflow chưa có. |
| FR-007 | Preflight phải phát hiện invalid payload, missing references, impossible required sessions và invalid fixed/allowed slots trước enqueue. | AT-03, AT-04 | PARTIAL — DTO/Pydantic/solver có một phần; preflight domain chưa có. |
| FR-008 | API enqueue job optimization.solve, trả jobId và cung cấp status/result endpoint. | AT-05, AT-06 | PASS(local) — NestJS/BullMQ bridge đã smoke/E2E test. |
| FR-009 | Solver phải enforce hard constraints class/teacher, fixed/allowed slots và trả diagnostics khi infeasible. | AT-07, AT-08 | PASS(local) — Python CP-SAT v1; room/legal/preference rules chưa enforce. |
| FR-010 | Soft constraints/preferences phải có weight, source, rule version và giải thích vi phạm. | AT-09, AT-10 | OPEN — chờ rule model/availability tasks. |
| FR-011 | Review UI hiển thị theo class/teacher/room, solution status, diagnostics và objective. | AT-06, AT-09 | OPEN — frontend hiện là architecture/health scaffold. |
| FR-012 | Manual edit phải chạy conflict check trước save; hard conflict chặn, soft conflict cảnh báo. | AT-09 | OPEN — schedule version/edit domain chưa có. |
| FR-013 | Draft/approved/locked/published version phải có immutable history, actor, timestamp và reason. | AT-10, AT-11 | OPEN — persistence/audit/auth follow-up. |
| FR-014 | Export Excel/PDF phải chỉ xuất version được phép và chứa period/version/generatedBy metadata. | AT-10 | OPEN — export chưa có. |
| FR-015 | Auth, tenant isolation, audit và redacted diagnostics phải được enforce ở API, không giao cho frontend/solver. | AT-11, AT-12 | OPEN — authorization/observability follow-up. |

## 7. Constraint policy

### Hard constraints — must not be violated

- requiredSessions phải được thỏa đủ hoặc result là INFEASIBLE/UNKNOWN có
  diagnostics.
- Một class và một teacher không thể có hai assignments trong cùng TimeSlot.
- fixedSlotId phải tồn tại; allowedSlotIds chỉ tham chiếu slot tồn tại.
- Khi room được đưa vào solver profile, một room không thể chứa hai assignment
  trong cùng TimeSlot.
- Availability được trường phê duyệt là cannot teach phải là hard; preference
  thông thường không được tự nâng thành hard.
- Legal rule profile đã được phê duyệt phải được kiểm tra trước khi publish.

### Soft constraints — optimize and explain

- Teacher preference/avoidance theo weight.
- Phân bố tiết trong tuần, tránh dồn hoặc tránh tiết cuối nếu profile cho phép.
- Cân bằng tải và penalty cho thay đổi so với locked baseline.
- Room preference/specialized-room preference khi không phải hard requirement.

MVP không được nhận soft constraint không có weight, source, effectiveFrom
và owner/approver. Nếu weighted objective chưa có trong contract, chỉ trả
warning/REFERENCE, không giả vờ solver đã tối ưu.

## 8. Non-functional requirements

| ID | Requirement | Acceptance |
| --- | --- | --- |
| NFR-001 Correctness | Không có published version chứa hard conflict; status/diagnostics phải nhất quán giữa API và Python. | Contract tests + infeasible tests + publish guard. |
| NFR-002 Explainability | Mỗi reject/conflict/soft violation có rule code/message và input scope đủ để sửa. | Diagnostics contract test; không log secret/PII không cần thiết. |
| NFR-003 Async safety | Solve chạy ngoài request thread; job có retry policy/backoff/idempotency và terminal state rõ. | Queue/worker tests; timeout/failure test. |
| NFR-004 Performance | Time limit, dataset size và p95 solve target phải được benchmark trên bộ chuẩn trước pilot; chưa tự đặt SLO khi chưa có benchmark. | P0.2 benchmark/rubric tasks. |
| NFR-005 Data safety | Import staging trước commit; transaction, audit, backup/restore policy và no partial import ngoài policy. | Import integration tests + DB migration/restore rehearsal. |
| NFR-006 Authorization | School isolation, role checks và publish/approve permission ở NestJS API. | Auth/API integration + negative tests. |
| NFR-007 Observability | Correlation id cho import/job/run/version; redacted structured logs và metrics queue/solver. | Worker/API observability tests and runbook. |
| NFR-008 Accessibility | Keyboard usable, labels/status announcements, responsive review table và error messages không chỉ dùng màu. | Browser accessibility/E2E at target viewports. |
| NFR-009 Versioning | Contract/rule/template/schedule version độc lập; breaking changes update all adapters and retain audit lineage. | Schema compatibility and migration tests. |

## 9. Acceptance test matrix

| Test ID | Scenario | Given / when | Expected result | Status at PRD creation |
| --- | --- | --- | --- | --- |
| AT-01 | Activate approved school calendar profile | Profile references register version, applicability and approver; admin activates | Missing approval or invalid 45-minute/period profile is blocked; valid profile is versioned | OPEN — rule profile/approver missing |
| AT-02 | Excel preview → validate → confirm | Workbook has valid rows, duplicates, missing references and invalid ranges | Preview shows row/field errors; no domain write before confirmation; confirmed batch is idempotent and audited | PARTIAL — supplied TC-IMP/VAL/CFM cases pass locally; duplicate/range/retry and pilot workbook remain open |
| AT-03 | Manual input parity | User enters same entities/lesson requirement as Excel | Same canonical validation and errors; data is scoped to school/period | OPEN — CRUD/validator not implemented |
| AT-04 | Preflight rejects invalid solve | Payload has unknown slot/fixed slot or impossible required sessions | API returns structured validation/preflight error; no solve job created | PARTIAL — solver detects some cases; API preflight not complete |
| AT-05 | Enqueue job | Valid canonical request submitted by authorized scheduler | API returns job id/name; payload is not silently coerced; job enters queue | PASS(local) — job enqueue observed |
| AT-06 | Complete feasible solve | Demo request passes through API, BullMQ, NestJS worker and Python CP-SAT | Terminal completed, result OPTIMAL/FEASIBLE, expected assignments and diagnostics | PASS(local) — job 7: OPTIMAL, 5 assignments, 0 conflicts |
| AT-07 | Explain infeasible solve | Same teacher/class has incompatible hard slots | Terminal INFEASIBLE or UNKNOWN; no false schedule; diagnostics identify hard conflict | PASS(local) — Python/API infeasible test passed |
| AT-08 | Hard conflict guard | User tries duplicate teacher/class/room slot or invalid fixed slot | Save/publish is blocked and identifies rule/input; no hidden conflict | PARTIAL — class/teacher solver only; edit/publish/room open |
| AT-09 | Review/edit/preferences | Draft has assignments and weighted preferences | Views by class/teacher/room; hard edits blocked; soft impact shown with weight/source | OPEN — UI/rule model open |
| AT-10 | Approve/lock/publish/export | Approver has reviewed diagnostics and rule profile | Approval actor/reason/version recorded; only locked approved version publishes; export metadata correct | OPEN — workflow/export open; T03 approval pending |
| AT-11 | Audit and retry | Import/job/edit/publish succeeds, fails and retries | Correlation/audit records are redacted, idempotent and queryable; retry has bounded policy | PARTIAL — import confirm audit/idempotency pass locally; cross-workflow audit and bounded retry remain open |
| AT-12 | Authorization/tenant isolation | User from school A requests school B data or publish | API denies; frontend/solver cannot bypass; no cross-school data leak | OPEN — auth not implemented |

### 9.1 Supplied Excel QC cases

| QC ID | Case | Local evidence | Result |
| --- | --- | --- | --- |
| TC-IMP-01 | Upload valid Excel | `valid.xlsx` → preview 3/3 rows, 0 errors, `canConfirm=true` | PASS(local + UI) |
| TC-IMP-02 | Reject PDF/DOCX | `invalid.pdf`, `invalid.docx` → HTTP 400 `INVALID_FILE_TYPE` | PASS(local) |
| TC-IMP-03 | Reject missing template column | `missing-required-column.xlsx` → HTTP 400 `INVALID_TEMPLATE`, missing `Mã giáo viên` | PASS(local) |
| TC-VAL-01 | Required value missing | `missing-value.xlsx` → row-level `REQUIRED`, Confirm disabled/blocked | PASS(local) |
| TC-VAL-02 | Wrong data type | `wrong-number.xlsx` → row-level `INVALID_NUMBER`, Confirm disabled/blocked | PASS(local) |
| TC-VAL-03 | Unknown master data | `unknown-master-data.xlsx` → row-level teacher/room reference errors | PASS(local) |
| TC-CFM-01 | Confirm valid import | Valid batch → `CONFIRMED`, 3 domain rows inserted | PASS(local + UI) |
| TC-CFM-02 | Audit after import | `GET /api/v1/imports/{importBatchId}/audit` → `IMPORT_CONFIRMED`, actor and timestamp | PASS(local + UI) |

## 10. Traceability and delivery gates

| Artifact/decision | Source of truth | Downstream work |
| --- | --- | --- |
| Scope, personas, in/out | scope.md | All product/engineering tasks |
| Canonical names and field mapping | domain-glossary.md | API, DB, Excel mapping, solver |
| Legal/rule provenance | legal-rule-register.md | Rule model, availability, load and preflight |
| Request/result shape | backend/contracts/schemas + TS/Pydantic adapters | NestJS, worker, Python tests |
| PRD requirement/acceptance | This document | P0.2/P1.1/P1.2/P2.x implementation tasks |

### Gate separation

1. **PRD/dev gate:** requirements, matrix, contract mapping and local evidence
   are complete and internally consistent.
2. **Pilot gate:** real Excel, identified school approver, approved rule/calendar
   profile, benchmark and browser/E2E evidence are required.
3. **Production gate:** authorization, durable persistence, retry/observability,
   backup/restore, deployment and operational sign-off are required.

T04 can finish the PRD/dev gate without claiming pilot or production approval;
the unresolved T03 approver/profile gate remains visible in this document.

## 11. Open decisions

- Pilot school, timetable coordinator and final approver.
- Five or six school days; one or two shifts; break/start/end times.
- Actual Excel workbook, sheet/column mapping and import error policy.
- Rule profile for special school types and teacher exceptions.
- Benchmark dataset, solve-time target and deployment topology.
- Auth role matrix and retention/audit period.
