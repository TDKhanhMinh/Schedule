# Lộ trình migration nhiều tenant — P4.1-T01

**Plan version:** `TENANT-MIGRATION-1.0.0`
**Scope:** V2.0 design only; migration chưa được apply vào V1 database.

## Các giai đoạn tương thích tiến tới

### Phase A — Introduce and backfill

- Tạo `tenants`/`tenant_memberships`; tạo một tenant legacy và map từng `schools`.
- Thêm nullable `tenant_id` vào tables theo dependency order; backfill từ
  `school_id` bằng batches có checkpoint, không lock toàn bảng.
- Thêm indexes `CONCURRENTLY` với tenant-leading keys; đo bloat/lock/replication.
- Dual-write từ API/worker/import/export; read path vẫn fallback có metric để phát
  hiện record chưa backfill.

### Phase B — Validate and enforce

- Chạy orphan/cross-tenant queries và compare row counts/checksums theo school.
- Thêm composite FKs `NOT VALID`, validate theo table sau khi backfill sạch.
- Chuyển `tenant_id` thành `NOT NULL`; thay unique/index cũ bằng tenant-aware
  versions; bật RLS hoặc database role policy sau khi app scope đã ổn định.
- Bump API/queue/storage contract; replay idempotency và trace tests.

### Phase C — Cutover and cleanup

- Freeze writes trong change window; drain BullMQ; snapshot counts/audit/job queue.
- Bật tenant-resolved read/write bắt buộc, monitor cross-tenant denial và orphan
  metrics; giữ legacy columns/read compatibility trong ít nhất một release.
- Chỉ drop legacy fallback sau sign-off; forward-only migration không xóa migration
  history và không rollback bằng cách sửa SQL đã chạy.

## Khôi phục và rủi ro bảng lớn

- Rollback application về dual-write reader; giữ `tenant_id`/indexes và không drop
  dữ liệu đã backfill.
- Nếu constraint validation fail, dừng cutover, quarantine orphan rows và sửa bằng
  migration forward-only; không `DELETE` hàng loạt để làm đẹp report.
- Large tables (`audit_logs`, `import_rows`, `optimization_assignments`) cần batch
  backfill, `statement_timeout`, lock budget, replica/backup check và rehearsal.
- Backup/restore phải kiểm tra counts theo tenant/school/period; queue drain và
  retry keys phải được snapshot trước cutover.

## Giao diện nhận biết tenant

| Surface      | V2.0 key/namespace                             | Boundary                                    |
| ------------ | ---------------------------------------------- | ------------------------------------------- |
| HTTP/auth    | trusted `tenantId` + membership                | path/body tenant không có quyền quyết định  |
| PostgreSQL   | `tenant_id` leading indexes/composite FKs/RLS  | no unscoped repository method               |
| Redis/BullMQ | `tenant:{tenant}:school:{school}:optimization` | idempotency/retry scoped                    |
| Storage      | `tenant/{tenant}/school/{school}/...`          | signed URL checks tenant + purpose + expiry |
| Metrics/logs | bounded tenant class, hashed job IDs           | no workbook/raw PII/secret                  |
| Admin        | platform vs tenant vs school role              | cross-tenant access audited and explicit    |

## Cổng kết thúc

- ADR and schema inventory approved by architecture/security owner.
- Migration dry-run on copy of largest expected school dataset with lock/RTO report.
- Cross-tenant negative tests, FK/orphan checks, queue/cache namespace tests and
  restore rehearsal pass.
- Tenant admin/platform admin decision, rollout owner, rollback owner and post-cutover
  monitoring window named.

Kết quả hiện tại chỉ là artifact thiết kế. Không tuyên bố đã migration production,
kích hoạt RLS, tạo tenant hoặc chuyển namespace hàng đợi.
