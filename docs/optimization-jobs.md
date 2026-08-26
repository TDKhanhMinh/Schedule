# Tác vụ tối ưu bền vững — P2.5-T01

Ranh giới bất đồng bộ có phiên bản `BULLMQ-OPTIMIZATION-1.0.0`. NestJS vẫn là
cổng phân quyền và kiểm tra trước tối ưu; BullMQ/Redis điều phối công việc;
worker độc lập gọi Python; PostgreSQL là nguồn bền vững cho trạng thái lần chạy
và nguồn gốc kết quả.

## Vòng đời

1. `POST /api/v1/optimization-jobs` chạy kiểm tra trước tối ưu phía máy chủ.
2. API tạo một dòng `optimization_runs` theo phạm vi trường, khóa bởi
   `(school_id, job_id)`, stores the canonical payload checksum and enqueues
   `optimization.solve` with three attempts and exponential backoff.
3. Worker đánh dấu lần chạy `RUNNING`, gọi tiến trình Python và lưu kết quả cùng
   mã băm đầu ra chuẩn trong một transaction PostgreSQL.
4. Thử lại quay về `QUEUED`; lần thất bại thứ ba thành `FAILED` với payload lỗi có
   giới hạn. Lần chạy hoàn tất là idempotent: giao lại với cùng mã băm đầu ra
   không chèn phân công lần nữa.
5. `GET /api/v1/optimization-jobs/:jobId` đọc lần chạy bền vững theo phạm vi
   trường khi có; Redis chỉ dùng cho trường hàng đợi tạm.

`optimization_assignments` is populated only from UUID-backed domain rows. The
current solver v1 has no persisted room column, so room assignment remains
contract-level output and is not written to this table.

## Ranh giới và an toàn

Request có tham chiếu bản chụp quy tắc đầy đủ được bọc trong
`SOLVER-ADAPTER-1.0.0`; worker chuyển phong bì đó cho Python, nơi kiểm tra mã
băm trước CP-SAT. `SolveJobRequest` thô vẫn được hỗ trợ trong thời gian tương
thích. Ràng buộc cứng được NestJS và Python kiểm tra; kiểm tra giao diện không
phải ranh giới đúng đắn hay bảo mật.

## Local validation — 2026-08-25

- Backend: 23 Jest suites / 98 tests, typecheck, lint and build passed.
- Docker runtime: API `3011`, PostgreSQL `15432`, Redis `6379`, and separate
  Python worker were started successfully.
- Runtime success: `p25-t01-runtime-20260825-1627` returned `OPTIMAL`, persisted
  2 assignments, one payload checksum and one output checksum; a repeated POST
  returned the same run ID and did not duplicate assignments.
- Runtime failure: `p25-t01-runtime-20260825-1626` reached `FAILED` at attempt
  3 and retained the database error in `last_error`, proving the bounded retry
  policy. This was a deliberate local persistence fault and is not a staging or
  production incident.

Đây chỉ là bằng chứng cục bộ/dev. Staging, production, thí điểm và phê duyệt bên
liên quan vẫn là các cổng riêng.
