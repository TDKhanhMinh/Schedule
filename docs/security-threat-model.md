# Bảo mật, riêng tư và mô hình mối đe dọa — P3.3-T02

**Phiên bản review:** `SECURITY-REVIEW-1.0.0`
**Ngày:** 2026-08-26
**Phạm vi:** V1.1 Web MVP: xác thực/phạm vi trường, tải Excel, xuất, liên kết công khai, PostgreSQL, Redis/BullMQ và bộ tối ưu Python.

## 1. Phân loại dữ liệu và lưu giữ

| Mức | Dữ liệu                                                                                        | Quy tắc xử lý                                                                                          |
| --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| C0  | Thời khóa biểu chỉ đọc đã công bố và được trường cho phép                                      | Chỉ qua phiên bản đã công bố/token công khai; token lưu mã băm; thu hồi/hết hạn phải có hiệu lực.      |
| C1  | ID, mã kiểm tra, trạng thái, chỉ số và siêu dữ liệu nhật ký                                    | Không chứa sổ làm việc/thân request/bí mật thô; nhãn route/chỉ số phải có giới hạn.                    |
| C2  | Lớp, tên hiển thị giáo viên, môn, phòng và lịch nội bộ                                         | Phạm vi trường/khung năm học ở máy chủ; không đưa vào log/chỉ số; xuất theo vai trò/trạng thái.        |
| C3  | Thông tin xác thực database/Redis, header request, token công khai nguyên bản, sổ làm việc tạm | Không commit, không log, không đưa vào client; production phải dùng trình quản lý bí mật và xoay vòng. |

Retention của C1/C2/C3 cần được school/legal owner chốt trong production data-retention decision. Code hiện giữ audit/schedule/job history trong PostgreSQL theo lifecycle; không tự đặt thời hạn pháp lý.

## 2. Mô hình mối đe dọa và trường hợp lạm dụng

| ID      | Trường hợp lạm dụng                                                            | Ranh giới/bằng chứng                                                                     | Mức độ | Owner/trạng thái                                                                                        |
| ------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| THR-001 | Đọc/ghi chéo trường bằng header hoặc path giả                                  | `auth.guard.test.ts`, `master-data.service.test.ts`, `scripts/test-p2-5-t04-runtime.mjs` | P0     | Đã bao phủ cục bộ/dev; kiểm thử danh tính staging còn mở.                                               |
| THR-002 | Tải PDF/DOCX, sai mẫu, dòng thiếu/không hợp lệ/không xác định hoặc tệp độc hại | fixture nhập, ranh giới kiểu/kích thước tệp, ma trận thời gian chạy                      | P0     | Đã bao phủ cục bộ/dev; WAF/AV/hạn mức production còn mở.                                                |
| THR-003 | Chèn công thức khi xuất ô chứa `=`, `+`, `-`, `@`                              | `schedule-export.service.test.ts`, `safeWorkbookValue`                                   | P1     | Đã bao phủ cục bộ/dev; chính sách bên dùng Excel còn mở.                                                |
| THR-004 | Liên kết công khai bị đoán, dùng sau hết hạn/thu hồi hoặc đọc bản nháp         | `public-schedule.service.test.ts`, migration mã băm token                                | P0     | Đã bao phủ cục bộ/dev; giới hạn tốc độ/giám sát production còn mở.                                      |
| THR-005 | Payload hàng đợi/lỗi bộ tối ưu làm lộ sổ làm việc, PII, bí mật hoặc stack thô  | Kiểm thử che/trace `P3.3-T01`, bộ làm sạch siêu dữ liệu nhật ký                          | P1     | Đã có trong triển khai; bộ thu lưu giữ/che log tập trung còn mở.                                        |
| THR-006 | Cạn tài nguyên bộ tối ưu qua payload lớn/giới hạn thời gian hoặc bão thử lại   | kiểm tra trước, thử lại/timeout có giới hạn, kiểm thử trạng thái BullMQ                  | P1     | Có kiểm soát cục bộ; hạn mức/giới hạn tốc độ/cổng tải production còn mở.                                |
| THR-007 | Cảnh báo dependency trong `exceljs → uuid`                                     | `npm audit --omit=dev` ngày 2026-08-26                                                   | P1     | MỞ; owner nền tảng phải đánh giá nâng cấp/override tương thích hoặc chấp nhận rủi ro có hạn.            |
| THR-008 | Credential/cổng compose dev được dùng ngoài cục bộ                             | `docker-compose.yml`, `.env.example`                                                     | P1     | MỞ cổng triển khai; production phải dùng trình quản lý bí mật, mạng riêng và credential không mặc định. |
| THR-009 | Endpoint chỉ số hoặc ID trace bị lộ ngoài mạng nội bộ                          | `ObservabilityController`, chỉ số thời gian chạy 200                                     | P1     | MỞ cổng triển khai; bảo vệ/giới hạn endpoint scrape và cấu hình chính sách truy cập bộ thu.             |

Không có P0 finding mới được chứng minh là bypassed bởi local automated/runtime evidence. P0/P1 ở trên vẫn là release gates nếu chưa có staging evidence hoặc risk acceptance có approver và expiry.

## 3. Kiểm soát production bắt buộc

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
