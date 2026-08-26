# Yêu cầu sản phẩm và tiêu chí nghiệm thu MVP

**Sản phẩm:** Bộ tối ưu thời khóa biểu trường học
**Version:** PRD-MVP-0.1.0  
**Scope:** Một trường THCS hoặc THPT; web-first; V0.1  
**Trạng thái:** Đường cơ sở sản phẩm sẵn sàng triển khai; đang chờ phê duyệt bên liên quan/thí điểm
**Updated:** 2026-08-24

Tài liệu này chuyển scope, domain glossary và legal/rule register thành hợp đồng
sản phẩm có thể triển khai và nghiệm thu. Đây là PRD mục tiêu của MVP, không
phải tuyên bố rằng mọi capability đã có trong code hiện tại. Trạng thái thực tế
được ghi ở cột Implementation evidence và acceptance matrix.

## 1. Vấn đề và kết quả

Người phụ trách thời khóa biểu cần biến dữ liệu lớp–môn–giáo viên–phòng và các
quy tắc của trường thành một thời khóa biểu không có xung đột cứng, có thể giải
thích, chỉnh sửa, phê duyệt và công bố. MVP phải làm rõ dữ liệu đầu vào lỗi ở
đâu, solver đang chạy đến trạng thái nào, vì sao một phương án không khả thi và
ai đã thay đổi/công bố lịch.

### Kết quả thành công

- Một trường THCS/THPT có thể tạo một khung năm học và quản lý dữ liệu lịch
  trong một không gian làm việc độc lập.
- Dữ liệu Excel chỉ được ghi vào domain sau preview, validation và confirmation
  thành công; dữ liệu nhập tay dùng cùng validation rules.
- Một request solve chạy bất đồng bộ qua NestJS → Redis/BullMQ → Python
  OR-Tools, trả OPTIMAL, FEASIBLE, INFEASIBLE hoặc UNKNOWN cùng diagnostics.
- Người dùng xem được lịch theo lớp, giáo viên và phòng; chỉnh sửa không tạo
  xung đột cứng ẩn.
- Một phương án có thể được lưu thành ScheduleVersion, đưa qua approval,
  khóa, công bố và xuất báo cáo có audit trail.

## 2. Người dùng và quyền quyết định

| Persona                        | Công việc cần hoàn thành                                     | Quyền/khả năng trong MVP                                                                  |
| ------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Người phụ trách thời khóa biểu | Chuẩn hóa dữ liệu, chạy bộ tối ưu, sửa và chuẩn bị phương án | Nhập/xử lý thủ công, kiểm tra, tối ưu, rà soát, chỉnh sửa, tạo phiên bản nháp             |
| Ban giám hiệu/người phê duyệt  | Đánh giá phương án và quyết định công bố                     | Xem chẩn đoán, phê duyệt/từ chối, khóa, công bố, xuất                                     |
| Giáo viên                      | Cung cấp lịch sẵn sàng/ưu tiên và xem lịch cá nhân           | Gửi dữ liệu theo chính sách trường, xem lịch được cấp quyền                               |
| Quản trị nhà trường            | Quản lý trường, khung năm học, hồ sơ và quyền                | Quản lý không gian làm việc, người dùng/vai trò và hồ sơ quy tắc trong phạm vi được duyệt |

MVP không tự suy ra người phê duyệt. Role cuối cùng, người cụ thể và school
pilot phải được xác nhận trong legal/rule register trước pilot.

## 3. Hàng rào kiểm soát và mục tiêu ngoài phạm vi

### In scope

- THCS/THPT, một trường thí điểm trước khi mở rộng nhiều trường.
- React + TypeScript + Vite; NestJS API/core; PostgreSQL; Redis + BullMQ;
  Python + OR-Tools CP-SAT.
- Xem trước/kiểm tra/xác nhận Excel, nhật ký nhập và nhập/chỉnh sửa thủ công.
- School, academic period, grade, class, subject, teacher, room, shift/time
  slot, lesson requirement, constraints, preferences và schedule version.
- Rà soát theo lớp/giáo viên/phòng, kiểm tra xung đột, phê duyệt, khóa, công bố,
  xuất Excel/PDF và nhật ký kiểm toán.

### Out of scope

- Tiểu học; lớp ghép/lớp tách; lịch thi/coi thi; điểm, học bạ, chuyên cần.
- Desktop/Tauri production, đồng bộ offline, cổng phụ huynh độc lập, thông báo đa kênh.
- Nhiều trường hoàn chỉnh, thanh toán, marketplace và AI/LLM/ML làm bộ tối ưu lõi.
- FastAPI hoặc HTTP API riêng cho Python worker.
- Tự động kết luận tuân thủ pháp lý hoặc tự phê duyệt thay cho nhà trường.

## 4. Mô hình chuẩn và ranh giới

Nguồn chuẩn thuật ngữ là domain-glossary.md; nguồn chuẩn rule là
legal-rule-register.md. Các quy tắc pháp lý chỉ trở thành constraint khi có
rule profile versioned, nguồn, hiệu lực và approval.

| Khái niệm         | Hợp đồng MVP                                    | Ghi chú                                                                                        |
| ----------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| School / schoolId | Domain scope                                    | Một workspace pilot trước; authorization theo school là bắt buộc khi có auth.                  |
| AcademicPeriod    | PostgreSQL baseline; cần bổ sung vào domain API | Không dùng period của TimeSlot để chỉ academic period.                                         |
| LessonRequirement | v1 wire collection lessons[]                    | Mỗi item gồm class, subject, teacher và requiredSessions.                                      |
| TimeSlot          | timeSlots[].{id,day,period}                     | period là thứ tự tiết; shiftCode chưa có trong contract v1.                                    |
| Assignment        | assignments[].{lessonId,sessionIndex,slotId}    | roomId chỉ thêm khi room constraint được version hóa.                                          |
| ScheduleSolution  | SolveJobResult                                  | Kết quả tạm của một run; chưa tự động là schedule version.                                     |
| ScheduleVersion   | Capability mục tiêu                             | Snapshot có lifecycle draft/approved/locked/published; chưa có persistence API trong baseline. |
| schemaVersion     | 1.0                                             | Breaking change phải cập nhật JSON Schema, TypeScript, Python và test cùng nhau.               |

## 5. Hành trình người dùng

### UJ-01 — Khởi tạo không gian làm việc và khung năm học

1. Quản trị viên tạo/chọn trường và khung năm học.
2. Quản trị viên chọn hồ sơ lịch trường: ngày học, buổi, số tiết/buổi, thời
   lượng tiết và breaks theo register đã được duyệt.
3. Hệ thống hiển thị hồ sơ/phiên bản quy tắc và người phê duyệt.
4. Người phụ trách thời khóa biểu chỉ được nhập dữ liệu trong khung năm học đó.

Thất bại: thiếu người phê duyệt/hồ sơ hoặc hồ sơ vi phạm quy tắc nguồn → không
cho kích hoạt hồ sơ; hiển thị blocker, không âm thầm dùng mặc định.

### UJ-02 — Import Excel có kiểm soát

1. Người dùng chọn mẫu/hồ sơ và tải sổ làm việc lên.
2. Hệ thống đọc ánh xạ trang tính/cột, chỉ tạo dữ liệu nhập tạm.
3. Hệ thống xem trước số dòng, ánh xạ trường, bản ghi trùng, tham chiếu thiếu,
   lỗi phạm vi, loại khối/lớp không hỗ trợ và cảnh báo.
4. Người dùng sửa tệp hoặc ánh xạ; hệ thống kiểm tra lại.
5. Người dùng xác nhận tạo nhật ký nhập và ghi dữ liệu nghiệp vụ trong transaction.
6. Người dùng có thể xem/thử lại lỗi theo lô nhập; không ghi một phần ngoài chính sách.

Hợp đồng nghiệm thu QC cho hành trình này là TC-IMP-01..03, TC-VAL-01..03 và
TC-CFM-01..02. Workflow cục bộ có thể chạy qua
POST /api/v1/imports/preview → POST /api/v1/imports/{importBatchId}/confirm;
giao diện hiển thị xem trước, lỗi theo dòng, trạng thái xác nhận và kết quả nhật ký.

### UJ-03 — Nhập tay và kiểm tra domain

Người dùng tạo/chỉnh sửa dữ liệu trường, yêu cầu tiết học, khung tiết, phòng và
hồ sơ qua biểu mẫu/bảng. Cùng một bộ kiểm tra chuẩn được dùng cho Excel và nhập
thủ công. Tham chiếu không xác định, khóa tự nhiên trùng, số tiết bắt buộc không
hợp lệ và khung tiết cố định/cho phép không hợp lệ phải bị từ chối trước khi tối ưu.

### UJ-04 — Preflight và chạy tối ưu bất đồng bộ

1. Người dùng chọn tập dữ liệu/hồ sơ/phiên bản quy tắc và bấm Chạy tối ưu.
2. Kiểm tra trước NestJS kiểm tra payload, phiên bản quy tắc/hồ sơ và quyền.
3. API xếp optimization.solve qua BullMQ, trả jobId.
4. Worker chuyển nguyên payload chuẩn sang bộ tối ưu Python.
5. Giao diện hỏi trạng thái: queued/running/completed/failed; không tự thử lại vô hạn.
6. Người dùng nhận trạng thái phương án, phân công, mục tiêu và chẩn đoán.

### UJ-05 — Review và sửa lịch

Người dùng xem theo lớp/giáo viên/phòng, lọc chẩn đoán và chỉnh một phân công. Mỗi
chỉnh sửa chạy kiểm tra xung đột đồng bộ; xung đột cứng chặn lưu, vi phạm mềm hiển
thị cảnh báo/tác động trọng số. Người dùng có thể khóa phần không muốn bộ tối ưu
thay đổi và chạy sửa cục bộ ở task sau.

### UJ-06 — Phê duyệt, khóa, công bố và xuất

1. Người lập lịch tạo bản nháp ScheduleVersion từ phương án.
2. Người phê duyệt xem phiên bản quy tắc, chẩn đoán, thay đổi nhật ký và bản xem trước xuất.
3. Người phê duyệt chấp thuận hoặc từ chối kèm lý do.
4. Phiên bản đã phê duyệt được khóa trước khi công bố; công bố tạo sự kiện/nhật ký.
5. Xuất Excel/PDF phải ghi phiên bản, khung năm học, generatedAt và người phát hành.

## 6. Functional requirements

| ID     | Requirement                                                                                                                                                        | Acceptance reference | Implementation evidence                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | Không gian làm việc phải giới hạn theo School và AcademicPeriod; không trộn dữ liệu giữa period/school.                                                            | AT-01, AT-12         | MỞ — miền lưu trữ/quyền chưa hoàn tất.                                                                                                                                                  |
| FR-002 | Mẫu/hồ sơ Excel phải có phiên bản ánh xạ và xem trước trước khi ghi.                                                                                               | AT-02                | MỘT PHẦN — bộ phân tích ExcelJS cục bộ, phiên bản mẫu 1.0 và xem trước lưu tạm đạt; mẫu/hồ sơ thí điểm còn mở.                                                                          |
| FR-003 | Excel và nhập thủ công dùng cùng kiểm tra chuẩn cho tham chiếu, phạm vi, trùng và trường bắt buộc.                                                                 | AT-02, AT-03         | MỘT PHẦN — trường bắt buộc, kiểu số và tham chiếu danh mục của Excel đạt; tương đương nhập thủ công, phạm vi và chính sách trùng đầy đủ còn mở.                                         |
| FR-004 | Xác nhận nhập phải idempotent theo lô nhập và tạo nhật ký nhập/kiểm toán.                                                                                          | AT-02, AT-11         | MỘT PHẦN — lưu tạm PostgreSQL, guard xác nhận, ghi dữ liệu và nhật ký cơ bản đạt cục bộ; chính sách thử lại/quan sát còn mở.                                                            |
| FR-005 | Người dùng quản lý lớp, môn, giáo viên, phòng, khung tiết và yêu cầu tiết học theo bảng thuật ngữ.                                                                 | AT-03                | MỘT PHẦN — PostgreSQL đường cơ sở/seed có; CRUD/quyền còn thiếu.                                                                                                                        |
| FR-006 | Hồ sơ quy tắc phải tham chiếu phiên bản sổ đăng ký, nguồn, ngày hiệu lực, phạm vi áp dụng và phê duyệt.                                                            | AT-01, AT-10         | MỘT PHẦN — schema hồ sơ/định nghĩa/bản chụp phiên bản, siêu dữ liệu nguồn/hiệu lực/phạm vi/phê duyệt và mã băm đã có; workflow phê duyệt và thực thi ở bộ tối ưu còn là cổng tiếp theo. |
| FR-007 | Kiểm tra trước phải phát hiện payload không hợp lệ, tham chiếu thiếu, số tiết bắt buộc bất khả thi và khung tiết cố định/cho phép không hợp lệ trước khi xếp hàng. | AT-03, AT-04         | MỘT PHẦN — DTO/Pydantic/bộ tối ưu có một phần; miền kiểm tra trước chưa có đầy đủ.                                                                                                      |
| FR-008 | API xếp tác vụ optimization.solve, trả jobId và cung cấp endpoint trạng thái/kết quả.                                                                              | AT-05, AT-06         | ĐẠT (cục bộ) — cầu nối NestJS/BullMQ đã được smoke/E2E test.                                                                                                                            |
| FR-009 | Bộ tối ưu phải thực thi ràng buộc cứng lớp/giáo viên, khung tiết cố định/cho phép và trả chẩn đoán khi vô nghiệm.                                                  | AT-07, AT-08         | ĐẠT (cục bộ) — cổng kiểm tra trước API/Python bắt lỗi điều kiện cần trước CP-SAT; CP-SAT vẫn là thẩm quyền ràng buộc cứng cuối; phân phòng còn mở.                                      |
| FR-010 | Ràng buộc/ưu tiên mềm phải có trọng số, nguồn, phiên bản quy tắc và giải thích vi phạm.                                                                            | AT-09, AT-10         | MỘT PHẦN — hợp đồng sẵn sàng phiên bản, lọc cứng, phạt mạnh/mềm có trọng số và chẩn đoán đạt cục bộ; phê duyệt/thí điểm và danh mục quy tắc mở rộng còn mở.                             |
| FR-011 | Giao diện rà soát hiển thị theo lớp/giáo viên/phòng, trạng thái phương án, chẩn đoán và mục tiêu.                                                                  | AT-06, AT-09         | MỞ — giao diện hiện là khung kiến trúc/sức khỏe.                                                                                                                                        |
| FR-012 | Chỉnh sửa thủ công phải kiểm tra xung đột trước khi lưu; xung đột cứng chặn, xung đột mềm cảnh báo.                                                                | AT-09                | MỞ — miền chỉnh sửa/phiên bản thời khóa biểu chưa có.                                                                                                                                   |
| FR-013 | Phiên bản nháp/đã phê duyệt/đã khóa/đã công bố phải có lịch sử bất biến, người thực hiện, thời điểm và lý do.                                                      | AT-10, AT-11         | MỞ — lưu trữ/nhật ký/quyền là phần tiếp theo.                                                                                                                                           |
| FR-014 | Xuất Excel/PDF chỉ được xuất phiên bản được phép và chứa siêu dữ liệu khung năm học/phiên bản/generatedBy.                                                         | AT-10                | MỞ — chức năng xuất chưa có.                                                                                                                                                            |
| FR-015 | Xác thực, cô lập tenant, nhật ký và chẩn đoán đã che phải được thực thi ở API, không giao cho giao diện/bộ tối ưu.                                                 | AT-11, AT-12         | MỞ — phần quyền/quan sát là công việc tiếp theo.                                                                                                                                        |

## 7. Constraint policy

### Ràng buộc cứng — không được vi phạm

- requiredSessions phải được thỏa đủ hoặc result là INFEASIBLE/UNKNOWN có
  diagnostics.
- Một class và một teacher không thể có hai assignments trong cùng TimeSlot.
- fixedSlotId phải tồn tại; allowedSlotIds chỉ tham chiếu slot tồn tại.
- Khi room được đưa vào solver profile, một room không thể chứa hai assignment
  trong cùng TimeSlot.
- Availability được trường phê duyệt là cannot teach phải là hard; preference
  thông thường không được tự nâng thành hard.
- Legal rule profile đã được phê duyệt phải được kiểm tra trước khi publish.

### Ràng buộc mềm — tối ưu và giải thích

- Teacher preference/avoidance theo weight.
- Phân bố tiết trong tuần, tránh dồn hoặc tránh tiết cuối nếu profile cho phép.
- Cân bằng tải và penalty cho thay đổi so với locked baseline.
- Room preference/specialized-room preference khi không phải hard requirement.

MVP không được nhận soft constraint không có weight, source, effectiveFrom
và owner/approver. Nếu weighted objective chưa có trong contract, chỉ trả
warning/REFERENCE, không giả vờ solver đã tối ưu.

## 8. Non-functional requirements

| ID                          | Yêu cầu                                                                                                                                              | Nghiệm thu                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| NFR-001 Đúng đắn            | Không có phiên bản đã công bố chứa xung đột cứng; trạng thái/chẩn đoán nhất quán giữa API và Python.                                                 | Kiểm thử hợp đồng + kiểm thử vô nghiệm + guard công bố.            |
| NFR-002 Khả năng giải thích | Mỗi từ chối/xung đột/vi phạm mềm có mã/thông báo quy tắc và phạm vi đầu vào đủ để sửa.                                                               | Kiểm thử hợp đồng chẩn đoán; không ghi secret/PII không cần thiết. |
| NFR-003 An toàn bất đồng bộ | Tối ưu chạy ngoài luồng request; tác vụ có chính sách thử lại/backoff/idempotency và trạng thái kết thúc rõ.                                         | Kiểm thử hàng đợi/worker; kiểm thử timeout/thất bại.               |
| NFR-004 Hiệu năng           | Giới hạn thời gian, kích thước tập dữ liệu và mục tiêu p95 phải được benchmark trên bộ chuẩn trước thí điểm; không tự đặt SLO khi chưa có benchmark. | Task benchmark/tiêu chí P0.2.                                      |
| NFR-005 An toàn dữ liệu     | Nhập tạm trước commit; transaction, nhật ký, chính sách sao lưu/khôi phục và không nhập một phần ngoài chính sách.                                   | Kiểm thử tích hợp nhập + diễn tập migration/khôi phục DB.          |
| NFR-006 Phân quyền          | Cô lập trường, kiểm tra vai trò và quyền công bố/phê duyệt tại API NestJS.                                                                           | Tích hợp xác thực/API + kiểm thử âm.                               |
| NFR-007 Khả năng quan sát   | Mã đối soát cho lô nhập/tác vụ/run/phiên bản; log có cấu trúc đã che và chỉ số hàng đợi/bộ tối ưu.                                                   | Kiểm thử quan sát worker/API và runbook.                           |
| NFR-008 Khả năng tiếp cận   | Dùng được bằng bàn phím, thông báo nhãn/trạng thái, bảng rà soát thích ứng và lỗi không chỉ dựa vào màu.                                             | Tiếp cận trình duyệt/E2E ở viewport mục tiêu.                      |
| NFR-009 Phiên bản           | Phiên bản hợp đồng/quy tắc/mẫu/thời khóa biểu độc lập; thay đổi phá vỡ phải cập nhật mọi bộ điều hợp và giữ dòng nhật ký.                            | Tương thích schema và kiểm thử migration.                          |

## 9. Acceptance test matrix

| Test ID | Scenario                                  | Given / when                                                                     | Expected result                                                                                                | Status at PRD creation                                                                                      |
| ------- | ----------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| AT-01   | Activate approved school calendar profile | Profile references register version, applicability and approver; admin activates | Missing approval or invalid 45-minute/period profile is blocked; valid profile is versioned                    | OPEN — rule profile/approver missing                                                                        |
| AT-02   | Excel preview → validate → confirm        | Workbook has valid rows, duplicates, missing references and invalid ranges       | Preview shows row/field errors; no domain write before confirmation; confirmed batch is idempotent and audited | PARTIAL — supplied TC-IMP/VAL/CFM cases pass locally; duplicate/range/retry and pilot workbook remain open  |
| AT-03   | Manual input parity                       | User enters same entities/lesson requirement as Excel                            | Same canonical validation and errors; data is scoped to school/period                                          | OPEN — CRUD/validator not implemented                                                                       |
| AT-04   | Preflight rejects invalid solve           | Payload has unknown slot/fixed slot or impossible required sessions              | API returns structured validation/preflight error; no solve job created                                        | PARTIAL — solver detects some cases; API preflight not complete                                             |
| AT-05   | Enqueue job                               | Valid canonical request submitted by authorized scheduler                        | API returns job id/name; payload is not silently coerced; job enters queue                                     | PASS(local) — job enqueue observed                                                                          |
| AT-06   | Complete feasible solve                   | Demo request passes through API, BullMQ, NestJS worker and Python CP-SAT         | Terminal completed, result OPTIMAL/FEASIBLE, expected assignments and diagnostics                              | PASS(local) — job 7: OPTIMAL, 5 assignments, 0 conflicts                                                    |
| AT-07   | Explain infeasible solve                  | Same teacher/class has incompatible hard slots                                   | Terminal INFEASIBLE or UNKNOWN; no false schedule; diagnostics identify hard conflict                          | PASS(local) — Python/API infeasible test passed                                                             |
| AT-08   | Hard conflict guard                       | User tries duplicate teacher/class/room slot or invalid fixed slot               | Save/publish is blocked and identifies rule/input; no hidden conflict                                          | PARTIAL — class/teacher solver only; edit/publish/room open                                                 |
| AT-09   | Review/edit/preferences                   | Draft has assignments and weighted preferences                                   | Views by class/teacher/room; hard edits blocked; soft impact shown with weight/source                          | OPEN — UI/rule model open                                                                                   |
| AT-10   | Approve/lock/publish/export               | Approver has reviewed diagnostics and rule profile                               | Approval actor/reason/version recorded; only locked approved version publishes; export metadata correct        | OPEN — workflow/export open; T03 approval pending                                                           |
| AT-11   | Audit and retry                           | Import/job/edit/publish succeeds, fails and retries                              | Correlation/audit records are redacted, idempotent and queryable; retry has bounded policy                     | PARTIAL — import confirm audit/idempotency pass locally; cross-workflow audit and bounded retry remain open |
| AT-12   | Authorization/tenant isolation            | User from school A requests school B data or publish                             | API denies; frontend/solver cannot bypass; no cross-school data leak                                           | OPEN — auth not implemented                                                                                 |

### 9.1 Supplied Excel QC cases

| QC ID     | Case                           | Local evidence                                                                        | Result           |
| --------- | ------------------------------ | ------------------------------------------------------------------------------------- | ---------------- |
| TC-IMP-01 | Upload valid Excel             | `valid.xlsx` → preview 3/3 rows, 0 errors, `canConfirm=true`                          | PASS(local + UI) |
| TC-IMP-02 | Reject PDF/DOCX                | `invalid.pdf`, `invalid.docx` → HTTP 400 `INVALID_FILE_TYPE`                          | PASS(local)      |
| TC-IMP-03 | Reject missing template column | `missing-required-column.xlsx` → HTTP 400 `INVALID_TEMPLATE`, missing `Mã giáo viên`  | PASS(local)      |
| TC-VAL-01 | Required value missing         | `missing-value.xlsx` → row-level `REQUIRED`, Confirm disabled/blocked                 | PASS(local)      |
| TC-VAL-02 | Wrong data type                | `wrong-number.xlsx` → row-level `INVALID_NUMBER`, Confirm disabled/blocked            | PASS(local)      |
| TC-VAL-03 | Unknown master data            | `unknown-master-data.xlsx` → row-level teacher/room reference errors                  | PASS(local)      |
| TC-CFM-01 | Confirm valid import           | Valid batch → `CONFIRMED`, 3 domain rows inserted                                     | PASS(local + UI) |
| TC-CFM-02 | Audit after import             | `GET /api/v1/imports/{importBatchId}/audit` → `IMPORT_CONFIRMED`, actor and timestamp | PASS(local + UI) |

## 10. Traceability and delivery gates

| Artifact/decision                 | Source of truth                                  | Downstream work                              |
| --------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| Scope, personas, in/out           | scope.md                                         | All product/engineering tasks                |
| Canonical names and field mapping | domain-glossary.md                               | API, DB, Excel mapping, solver               |
| Legal/rule provenance             | legal-rule-register.md                           | Rule model, availability, load and preflight |
| Request/result shape              | backend/contracts/schemas + TS/Pydantic adapters | NestJS, worker, Python tests                 |
| PRD requirement/acceptance        | This document                                    | P0.2/P1.1/P1.2/P2.x implementation tasks     |

### Gate separation

1. **PRD/dev gate:** requirements, matrix, contract mapping and local evidence
   are complete and internally consistent.
2. **Pilot gate:** real Excel, identified school approver, approved rule/calendar
   profile, benchmark and browser/E2E evidence are required.
3. **Production gate:** authorization, durable persistence, retry/observability,
   backup/restore, deployment and operational sign-off are required.

T04 có thể hoàn tất cổng PRD/dev mà không tuyên bố phê duyệt thí điểm hoặc
production; cổng người phê duyệt/hồ sơ T03 chưa xử lý vẫn hiển thị trong tài liệu.

## 11. Open decisions

- Pilot school, timetable coordinator and final approver.
- Five or six school days; one or two shifts; break/start/end times.
- Actual Excel workbook, sheet/column mapping and import error policy.
- Rule profile for special school types and teacher exceptions.
- Benchmark dataset, solve-time target and deployment topology.
- Auth role matrix and retention/audit period.
