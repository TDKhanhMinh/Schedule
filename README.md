# Bộ tối ưu thời khóa biểu trường học

Nền tảng web-first cho trường THCS/THPT Việt Nam, với phạm vi MVP được chốt trong task `[P0.1-T01]`.

## Kiến trúc

- `frontend`: React + TypeScript + Vite.
- `backend`: NestJS API/lõi, PostgreSQL là nguồn dữ liệu, BullMQ là cổng điều phối tác vụ và Python + OR-Tools CP-SAT là bộ tối ưu.
- `backend/src/contracts` và `backend/contracts/schemas`: hợp đồng phiên bản dùng chung giữa API, giao diện và bộ tối ưu.
- `docs/domain-glossary.md`: thuật ngữ chuẩn và ánh xạ giữa nghiệp vụ, API, PostgreSQL và Python.
- `docs/legal-rule-register.md`: sổ đăng ký pháp lý/quy tắc có nguồn, hiệu lực, phân loại và trạng thái phê duyệt.
- `docs/prd-mvp.md`: PRD MVP, hành trình người dùng, yêu cầu chức năng/phi chức năng và ma trận nghiệm thu có truy xuất.
- `docs/architecture-decision-records/ADR-001-repository-and-module-boundaries.md`: ADR/cây mô-đun, quyền sở hữu dữ liệu, ranh giới bảo mật và quyết định FastAPI/Tauri.
- `docs/api-error-envelope.md`: sơ đồ mô-đun NestJS, mã yêu cầu và phong bì lỗi HTTP chuẩn.
- `docs/ux/p0.2-t04-user-journey-wireframes.md`: hành trình người dùng và khung dây độ trung thực thấp từ đầu đến cuối, kèm căn chỉnh trạng thái/phản hồi/API.
- `docs/solver-benchmark-rubric.md`: tiêu chí đạt/trượt, thời gian chạy/tính tối ưu/độ ổn định hạt giống và cách ghi báo cáo hồi quy cho bộ tối ưu.
- `backend/database/migrations`: hợp đồng lưu trữ PostgreSQL theo migration tiến về phía trước.
- `backend/solver`: Python + OR-Tools CP-SAT, chạy độc lập theo hợp đồng JSON.
- `docker-compose.yml`: PostgreSQL và Redis cho môi trường local.
- `backend/src/imports`: tải Excel, xem trước/kiểm tra, xác nhận nhập dữ liệu và nhật ký kiểm toán.
- `docs/excel-workbook-contract.md` và `outputs/P1.3-T01/school-timetable-mvp-0.1.0-template-v1.0.xlsx`: hợp đồng sổ làm việc v1.0 và mẫu chuẩn có phiên bản/lịch sử thay đổi cho việc nhập yêu cầu tiết học.

## Phạm vi MVP

MVP chỉ phục vụ THCS/THPT, web-first, bắt buộc có Excel và nhập tay, không hỗ trợ lớp ghép/lớp tách. Tiểu học, desktop/offline, lịch thi, multi-school hoàn chỉnh và AI/ML solver nằm ngoài phạm vi hiện tại. Chi tiết nằm ở [`docs/scope.md`](docs/scope.md).

## Chạy local

1. Sao chép `.env.example` thành `.env`.
2. Khởi động hạ tầng: `docker compose up -d`.
3. Cài dependency Node: `npm install`.
4. Build backend: `npm run build:backend`.
5. Chạy API: `npm run dev:backend`.
6. Chạy solver worker ở terminal khác: `npm run worker --workspace @schedule/backend`.
7. Chạy web ở terminal khác: `npm run dev:frontend`.
8. Cài solver theo [`backend/solver/README.md`](backend/solver/README.md).

Cổng chất lượng cục bộ:

```powershell
npm ci
npm run ci:local
```

`ci:local` chạy kiểm tra định dạng, lint, kiểm tra kiểu, kiểm thử giao diện/lõi, kiểm tra
thứ tự migration, kiểm thử bộ tối ưu Python và build. Khi một bước thất bại, script ghi
`outputs/ci/last-failure.json` để dùng làm artifact chẩn đoán. CI được lưu trữ tách
riêng các tác vụ giao diện, NestJS/PostgreSQL/Redis và bộ tối ưu Python trong
`.github/workflows/ci.yml`.

API health check: `GET http://localhost:3000/api/v1/health`.
Luồng tối ưu: `POST /api/v1/optimization-jobs` → `GET /api/v1/optimization-jobs/:jobId`.
Luồng Excel: `POST /api/v1/imports/preview` → `POST /api/v1/imports/:importBatchId/confirm` → `GET /api/v1/imports/:importBatchId/audit`.

Lưu ý cục bộ: PostgreSQL Docker được mở ở cổng `55432` để tránh xung đột với PostgreSQL cài sẵn trên máy; `.env` đã trỏ tới cổng này.

## Ranh giới kiểm chứng

Các lệnh build/typecheck/test chỉ chứng minh khung nền và hợp đồng ở môi trường cục bộ. Chưa được coi là phê duyệt production, phê duyệt thí điểm, dữ liệu Excel thật, kiểm chứng pháp lý hoặc kiểm thử E2E thời gian chạy hoàn chỉnh.

PRD MVP là hợp đồng triển khai/nghiệm thu của P0.1-T04; các cổng thí điểm, dữ liệu Excel thật, phê duyệt bên liên quan và production vẫn được theo dõi riêng.
