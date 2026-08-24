# MVP Scope — School Timetable Optimizer

**Task:** `[P0.1-T01] Chốt phạm vi, personas và out-of-scope`  
**Version:** `V0.1 — Discovery & Product Contract`  
**Status:** Implementation draft — cần stakeholder xác nhận trước pilot/production.

## Mục tiêu

Giúp một trường THCS hoặc THPT nhập dữ liệu bằng Excel hoặc nhập tay, kiểm tra dữ liệu, chạy xếp lịch bất đồng bộ, xem/chỉnh sửa lịch, lưu phiên bản và xuất bản lịch không có xung đột cứng.

## Personas và use cases

| Persona | Mục tiêu chính | Use cases MVP |
| --- | --- | --- |
| Người phụ trách thời khóa biểu | Tạo và kiểm tra lịch | Quản lý dữ liệu, import Excel, nhập tay, chạy solver, sửa lịch, lưu phiên bản |
| Ban giám hiệu | Phê duyệt và công bố | Xem báo cáo khả thi, duyệt phiên bản, khóa/công bố, xuất Excel/PDF |
| Giáo viên | Cung cấp ràng buộc và kiểm tra lịch | Khai báo thời gian không thể dạy/ưu tiên, xem lịch cá nhân |
| Quản trị nhà trường | Quản lý phạm vi vận hành | Quản lý năm học, học kỳ, người dùng và dữ liệu trường |

## In-scope MVP

- Trường THCS và THPT; một trường pilot trước khi mở rộng multi-school.
- Giao diện web-first bằng React + TypeScript + Vite.
- NestJS là API/core; PostgreSQL là nguồn dữ liệu chính.
- Redis + BullMQ điều phối các job tối ưu bất đồng bộ.
- Python + OR-Tools CP-SAT xử lý bài toán xếp lịch.
- Nhập Excel với preview, validation, xác nhận và import log.
- Nhập/chỉnh sửa thủ công dữ liệu đã import.
- Năm học, học kỳ, khối, lớp, môn, giáo viên, phòng, khung ngày/tiết.
- Phân công giảng dạy, số tiết yêu cầu, tiết cố định, phòng chuyên dụng và ràng buộc giáo viên.
- Phân biệt ràng buộc cứng với ràng buộc mềm có trọng số.
- Xem theo lớp/giáo viên/phòng; chỉnh sửa thủ công có kiểm tra xung đột tức thời.
- Lưu phiên bản, audit trail, khóa, phê duyệt, xuất Excel/PDF và công bố.

## Out-of-scope MVP

- Tiểu học.
- Lớp ghép và lớp tách.
- Ứng dụng desktop/Tauri production và offline sync.
- Lịch thi, coi thi, điểm, học bạ, chuyên cần.
- Ứng dụng phụ huynh độc lập và thông báo đa kênh.
- Multi-school hoàn chỉnh, billing và marketplace.
- AI/LLM hoặc machine learning làm bộ giải lõi.
- FastAPI trong MVP; Python worker không mở thêm HTTP API nếu chưa có nhu cầu.

## Assumptions cần xác nhận

1. Trường pilot và người phụ trách nghiệp vụ chưa được chỉ định trong task này.
2. Mẫu Excel thật, lịch 5/6 ngày, một/hai buổi và quy tắc phân bố môn chưa được chốt.
3. Chỉ tiêu thời gian giải, kích thước bộ dữ liệu chuẩn và mô hình triển khai cloud/máy chủ trường cần được benchmark/chốt ở các task sau.
4. Quy tắc pháp lý/nghiệp vụ phải có version, nguồn, ngày hiệu lực và được tái kiểm tra trước pilot/production; không hard-code vĩnh viễn trong solver.
5. `schemaVersion: "1.0"` là contract khởi đầu của job tối ưu; thay đổi breaking phải tăng version và cập nhật cả NestJS lẫn Python.

## Quyết định kiến trúc cho setup này

- API chỉ nhận contract canonical và enqueue job `optimization.solve`; worker bridge chạy Python solver qua BullMQ.
- Python solver nhận cùng payload canonical qua JSON runner; CP-SAT trả `OPTIMAL`, `FEASIBLE`, `INFEASIBLE` hoặc `UNKNOWN` cùng diagnostics.
- JSON Schema trong `backend/contracts/schemas` là nguồn kiểm tra hình dạng payload; TypeScript và Pydantic là hai adapter cùng bám schema.
- `docs/domain-glossary.md` là nguồn chuẩn cho thuật ngữ và mapping giữa business domain, NestJS, PostgreSQL và Python; các field v1 chưa hỗ trợ phải được ghi rõ thay vì suy diễn.
- `docs/legal-rule-register.md` là register nguồn cho rule pháp lý/vận hành; chỉ rule đã có profile và phê duyệt mới được chuyển thành constraint versioned trong solver.
- `docs/prd-mvp.md` là PRD target cho user journeys, functional/non-functional requirements và acceptance matrix của MVP.
- Persistence kết quả solver, authorization, retries/observability và deployment production cần được hoàn thiện ở task backend/solver kế tiếp; local runtime flow đã được smoke test.

## Acceptance mapping

- Phạm vi/personas/in-out: tài liệu này.
- PRD và acceptance criteria: `docs/prd-mvp.md`.
- Contract đồng bộ NestJS/Python: `backend/src/contracts`, `backend/contracts/schemas` và `backend/solver/src/timetable_solver/contracts.py`.
- Evidence local: build/typecheck/test commands recorded in task notes after validation.
- Runtime/pilot/business approval: còn mở cho stakeholder và các task phụ thuộc.
