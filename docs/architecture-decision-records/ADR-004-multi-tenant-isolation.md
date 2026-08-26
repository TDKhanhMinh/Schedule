# ADR-004 — Multi-tenant isolation và migration path

**Status:** Proposed for V2.0 design review  
**Date:** 2026-08-26  
**Decision version:** `TENANT-ISOLATION-1.0.0`

## Context

V1.1 dùng `school_id` làm boundary ở API/PostgreSQL, nhưng chưa có tenant
organization, membership hoặc platform-admin boundary. Một tenant có thể quản lý
nhiều school trong V2.0; vì vậy chỉ đưa `tenant_id` vào JWT/UI là không đủ. Server,
database foreign key, queue namespace và storage key đều phải bind cùng scope.

## Decision

1. Thêm `tenants(id, slug, status, created_at, updated_at)` và
   `tenant_memberships(tenant_id, user_id, role, school_id nullable, status,
created_at)`. Một `school` thuộc đúng một tenant.
2. Thêm `tenant_id` vào mọi table business có đường dẫn tới school hoặc tenant:
   `schools`, `academic_periods`, `classes`, `teachers`, `subjects`, `rooms`,
   `time_slots`, `lesson_requirements`, `import_batches`, `import_rows`,
   `rule_profiles`, `rule_definitions`, `rule_set_snapshots`, `optimization_runs`,
   `optimization_assignments`, `schedule_versions`, `schedule_assignments`,
   `schedule_version_transitions`, `schedule_public_links`, `audit_logs` và
   related job/event tables.
3. Giữ `school_id` như business child key. Mọi cross-reference dùng composite FK
   `(tenant_id, school_id, id)` hoặc `(tenant_id, id)` tương ứng; cấm một tenant
   tham chiếu resource của tenant khác.
4. Unique/index keys thêm tenant ở đầu: `(tenant_id, school_id, code)`,
   `(tenant_id, academic_period_id, version_number)`, `(tenant_id, job_id)` và
   `(tenant_id, token_hash)`. Query index bắt đầu bằng `tenant_id` để tránh
   accidental unscoped scans.
5. Auth resolver lấy tenant/membership từ trusted session/server lookup. Không tin
   `tenantId` do browser gửi; `schoolId` trên path chỉ là requested child scope và
   phải khớp membership.
6. Queue namespace là `tenant:{tenantId}:school:{schoolId}:optimization`;
   idempotency/retry key, metrics labels và trace context không được cross tenant.
   Storage prefix là `tenant/{tenantId}/school/{schoolId}/imports|exports|backups`.
7. Platform admin là role riêng, audit bắt buộc và không mặc định có quyền đọc
   school data; tenant admin chỉ quản lý membership/school trong tenant; scheduler,
   reviewer, viewer vẫn bị giới hạn trong school/period.

## Alternatives rejected

- Dùng `school_id` làm tenant vĩnh viễn: không hỗ trợ organization nhiều school và
  làm mơ hồ platform-admin.
- Chỉ RLS mà không có composite FK/index: giảm lỗi app nhưng không ngăn reference
  sai hoặc job/storage namespace bị trộn.
- Tạo database/schema riêng cho mỗi tenant ở V2.0: isolation mạnh hơn nhưng tăng
  migration/backup/connection cost; chỉ xem lại khi tenant scale yêu cầu.

## Security invariants

- Không có object business nào thiếu tenant scope.
- Không có FK chéo tenant dù `id` là UUID hợp lệ.
- Mọi read/write/list/export/audit/job query đều nhận server-resolved tenant.
- Public token chỉ resolve tới published version cùng tenant/school; token hash
  không tiết lộ tenant khi invalid.
- Cache/queue key phải có tenant prefix; cache hit không được trả data tenant khác.
