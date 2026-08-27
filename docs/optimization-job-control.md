# Điều khiển tác vụ tối ưu — P2.5-T02

## Hợp đồng

API cung cấp `OPTIMIZATION-JOB-STATUS-1.0.0` từ `GET /api/v1/optimization-jobs/:jobId`.
PostgreSQL `optimization_runs` là nguồn chuẩn bền vững; trạng thái BullMQ chỉ dùng
làm dự phòng khi đang tìm dòng kế thừa.

Phản hồi báo cáo:

- `state`: `QUEUED`, `RUNNING`, a terminal solver result, `FAILED`, or `CANCELLED`.
- `progress.stage`: `QUEUED`, `SOLVING`, `PERSISTING`, `RETRY_WAITING`, `CANCELLED`, `COMPLETED`, or `FAILED`.
- `progress.heartbeatAt` and `progress.isStalled`: a running job is considered stalled after 15 seconds without heartbeat; a queued job after 60 seconds without heartbeat.
- `canCancel` and `canRetry`: server-derived controls, not UI permissions. The auth guard still requires the `SOLVE` permission and school scope.

## Hủy

`POST /api/v1/optimization-jobs/:jobId/cancel` accepts an optional `{ "reason": "..." }` body. A queued job is durably moved to `CANCELLED` and its BullMQ entry is removed when possible. A running job stores a cancellation request; the worker heartbeat observes it, aborts the Python child process, and records `CANCELLED`. Repeating the request is safe and returns the same durable state.

## Thử lại

`POST /api/v1/optimization-jobs/:jobId/retry` requires an `Idempotency-Key` header. Only `FAILED`, `CANCELLED`, and `UNKNOWN` runs can be retried. The server rebuilds the versioned solver envelope with a new job ID, preserves the original payload and provenance, links `retryOfRunId`, and enqueues at most one run per `(school_id, retry_key)`. Solver errors returned by the status API are redacted to safe messages; detailed process output remains an internal execution concern.

## Hành vi giao diện

Màn hình thời khóa biểu hỏi API trạng thái mỗi hai giây, lưu `jobId` đang theo dõi
trong URL, hiển thị giai đoạn/lần thử/nhịp hoạt động bền vững, cảnh báo tác vụ bị
treo và vô hiệu hóa điều khiển theo phản hồi máy chủ. Giao diện không quyết định
phân quyền, tính đúng của hủy, thử lại hoặc tính hợp lệ của đầu ra bộ tối ưu.

Khi đã có khung tiết và nhu cầu tiết ACTIVE, nút `Kiểm tra và xếp TKB` gọi
`POST /optimization-jobs/preflight` trước. Chỉ khi không có lỗi cứng giao diện
mới gọi `POST /optimization-jobs`, theo dõi job và hiển thị phương án
`OPTIMAL`/`FEASIBLE` như bản xem trước tạm thời. Phương án xem trước không ghi đè
`schedule_version`; người dùng vẫn phải review và thực hiện bước phát hành theo
lifecycle của phiên bản lịch.

## Ranh giới kiểm chứng

Kiểm thử tự động và kiểm tra thời gian chạy cục bộ bao phủ hợp đồng API/worker,
luồng nhịp hoạt động/hủy, idempotency thử lại và build giao diện. Staging,
production, thí điểm và phê duyệt bên liên quan vẫn là các cổng phát hành riêng
cho đến khi đính kèm bằng chứng.
