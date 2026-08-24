# School Timetable Optimizer

Nền tảng web-first cho trường THCS/THPT Việt Nam, với phạm vi MVP được chốt trong task `[P0.1-T01]`.

## Kiến trúc

- `frontend`: React + TypeScript + Vite.
- `backend`: NestJS API/core, PostgreSQL là nguồn dữ liệu, BullMQ là cổng điều phối job và Python + OR-Tools CP-SAT là solver.
- `backend/src/contracts` và `backend/contracts/schemas`: contract versioned dùng chung giữa API, frontend và solver.
- `docs/domain-glossary.md`: thuật ngữ canonical và mapping giữa nghiệp vụ, API, PostgreSQL và Python.
- `docs/legal-rule-register.md`: legal/rule register có nguồn, hiệu lực, phân loại và trạng thái phê duyệt.
- `docs/prd-mvp.md`: PRD MVP, user journeys, yêu cầu chức năng/phi chức năng và acceptance matrix có traceability.
- `docs/architecture-decision-records/ADR-001-repository-and-module-boundaries.md`: ADR/cây module, data ownership, security boundary và quyết định FastAPI/Tauri.
- `docs/api-error-envelope.md`: module map NestJS, request ID và canonical HTTP error envelope.
- `docs/ux/p0.2-t04-user-journey-wireframes.md`: user journey và wireframe low-fidelity end-to-end, kèm state/feedback/API alignment.
- `docs/solver-benchmark-rubric.md`: rubric pass/fail, runtime/optimality/seed stability và cách ghi report hồi quy cho solver.
- `backend/database/migrations`: persistence contract PostgreSQL theo migration tiến về phía trước.
- `backend/solver`: Python + OR-Tools CP-SAT, chạy độc lập theo contract JSON.
- `docker-compose.yml`: PostgreSQL và Redis cho môi trường local.
- `backend/src/imports`: upload Excel, preview/validation, confirm import và audit log.
- `docs/excel-workbook-contract.md` và `outputs/P1.3-T01/school-timetable-mvp-0.1.0-template-v1.0.xlsx`: workbook contract v1.0 và template chuẩn có version/changelog cho import lesson requirements.

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

Quality gate local:

```powershell
npm ci
npm run ci:local
```

`ci:local` chạy format check, lint, typecheck, frontend/backend tests, migration
sequence check, Python solver tests và build. Khi một bước fail, script ghi
`outputs/ci/last-failure.json` để dùng làm artifact chẩn đoán. Hosted CI tách
riêng frontend, NestJS/PostgreSQL/Redis và Python solver jobs trong
`.github/workflows/ci.yml`.

API health check: `GET http://localhost:3000/api/v1/health`.
Optimization flow: `POST /api/v1/optimization-jobs` → `GET /api/v1/optimization-jobs/:jobId`.
Excel flow: `POST /api/v1/imports/preview` → `POST /api/v1/imports/:importBatchId/confirm` → `GET /api/v1/imports/:importBatchId/audit`.

Local note: PostgreSQL Docker được publish ở cổng `55432` để tránh xung đột với PostgreSQL cài sẵn trên máy; `.env` đã trỏ tới cổng này.

## Validation boundary

Các lệnh build/typecheck/test chỉ chứng minh scaffold và contract ở local. Chưa coi là production approval, pilot approval, dữ liệu Excel thật, kiểm chứng pháp lý hoặc runtime E2E hoàn chỉnh.

 PRD MVP là hợp đồng triển khai/nghiệm thu của P0.1-T04; các gate pilot, dữ liệu Excel thật, stakeholder approval và production vẫn được theo dõi riêng.
