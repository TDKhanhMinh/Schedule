# Ranh giới thời gian chạy theo tenant — P4.1-T02

**Contract:** `TENANT-SCOPE-1.0.0`
**Ngày:** 2026-08-26

## Đã triển khai

- `AuthGuard` accepts an optional trusted `x-tenant-id` only for the existing
  non-production test/dev identity path; production still fails closed until a
  real identity provider is configured.
- If a request carries `tenantId` in path/body, it must match the trusted identity;
  a payload cannot introduce a tenant when identity has no tenant context.
- Optimization job envelope carries tenant context, contract version and a
  tenant/school queue namespace. The solver payload itself is not silently changed
  before the V2 contract/schema migration.
- Tenant scope tests cover missing identity, mismatch, opaque ID validation and
  queue namespace propagation.

## Chưa hoàn tất một cách rõ ràng

Các bảng database V1 chưa có `tenant_id`; vì vậy repository, xuất, liên kết công
khai, kho khóa Redis và RLS chưa thể tuyên bố cô lập tenant đầy đủ. Triển khai hiện
là ranh giới/khung nền fail-closed tương thích V1. P4.1-T03 phải thêm migration
tiến tới và phạm vi repository; P4.1-T05 phải chạy kiểm thử tích hợp/migration
chéo tenant trước khi dùng production.

Bằng chứng: `outputs/P4.1-T02/tenant-scope-report.json` và
`npm run tenant:evidence`.
