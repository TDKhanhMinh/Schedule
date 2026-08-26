# Backup, restore and release runbook — P2.5-T06

Ngày cập nhật: 2026-08-26  
Phạm vi: Web MVP local/dev và staging handoff; tài liệu này không tự cấp production approval.

## 1. Nguyên tắc và mục tiêu phục hồi

- PostgreSQL là source of truth. Migration là forward-only; không rollback bằng cách
  sửa/xóa migration đã áp dụng.
- Backup phải được mã hóa khi lưu trữ, checksum trước khi chuyển, phân quyền theo
  least privilege và không commit vào Git. Production backup phải nằm trong object
  storage/backup service do tổ chức phê duyệt, với secret lấy từ **secret manager**.
- Mục tiêu **RPO ≤ 24 giờ** cho MVP khi chạy backup hằng ngày. Mục tiêu **RTO ≤ 60
  phút** cho một lần khôi phục database đơn lẻ. Đây là mục tiêu vận hành, chưa phải
  cam kết production cho tới khi có staging/UAT/security/restore evidence.
- Backup/restore rehearsal phải ghi ngày giờ, kích thước, SHA-256, database tạm,
  số migration đã khôi phục và kết quả. Không dùng dữ liệu production thật trong
  local/dev rehearsal.

## 2. Pre-flight trước migration hoặc release

1. Kiểm tra working tree và secret: `.env`, password, token và dump không được đưa
   vào commit hoặc artifact công khai.
2. Chạy `npm run check:migrations` để xác nhận sequence migration forward-only.
3. Với database có dữ liệu, tạo backup trước khi `npm run db:migrate` hoặc deploy.
4. Xác nhận API, worker và Python solver dùng cùng `schemaVersion`/contract version.
   Thay đổi xuyên NestJS–Python phải cập nhật schema, adapter, fixture, tests và
   version trong cùng một change set.

## 3. Backup và restore rehearsal an toàn

Docker local/staging template dùng PostgreSQL service tên `postgres`. Sau khi stack
đã healthy, chạy:

```text
node scripts/rehearse-postgres-backup.mjs --output outputs/P2.5-T06/scheduler-rehearsal.dump
```

Script sẽ:

1. chạy `pg_dump -Fc --no-owner --no-privileges`;
2. ghi dump và tính SHA-256;
3. kiểm tra catalog bằng `pg_restore --list`;
4. tạo một database tạm có tên duy nhất;
5. restore vào database tạm, kiểm tra `schema_migrations` có ít nhất một row;
6. ghi `outputs/P2.5-T06/restore-rehearsal-report.json` và xóa đúng database tạm.

Dump là artifact nhạy cảm, chỉ giữ trong storage đã được phê duyệt và xóa theo
retention policy. Report rehearsal có thể commit nếu đã loại bỏ secret; dump không
được commit.

Production restore cần change window và approver xác nhận. Quy trình tối thiểu:

1. freeze import/edit/solve, drain BullMQ worker và ghi incident/correlation id;
2. xác minh backup object, checksum, thời điểm backup và quyền truy cập;
3. restore sang database cô lập trước, chạy migration check, health/readiness,
   API contract tests và solver smoke;
4. kiểm tra row counts, `schema_migrations`, audit trail và một workflow E2E;
5. chuyển traffic sau khi approver ký xác nhận; giữ database cũ ở trạng thái
   read-only theo retention policy;
6. nếu restore rehearsal hoặc kiểm tra integrity thất bại, không chuyển traffic;
   mở incident và xử lý bằng migration forward-only/backup khác.

## 4. Incident runbook

### API hoặc readiness lỗi

- Kiểm tra `docker compose ps`, API `/api/v1/health/ready`, PostgreSQL health và
  Redis health.
- Không restart mù khi đang có job; xem log API/worker theo correlation id.
- Nếu database chưa sẵn sàng, dừng release, giữ worker drain và kiểm tra migration
  ledger trước khi retry.

### Job solve bị kẹt hoặc retry bất thường

- Kiểm tra queue/attempt/heartbeat và worker log; giữ nguyên input checksum,
  rule snapshot hash và solver contract version.
- Không sửa trực tiếp assignment hoặc snapshot đã publish. Cancel/retry qua API có
  idempotency key và audit log.
- Nếu nghi ngờ dữ liệu, freeze workflow, backup trước điều tra và đối chiếu audit.

### Import hoặc publish sai dữ liệu

- Dừng confirm/publish tiếp theo; không xóa audit trail.
- Ghi nhận batch id, file checksum, actor, school/academic period và thời điểm.
- Khôi phục từ snapshot chỉ sau khi approver phê duyệt; sau đó chạy validation,
  hard-constraint check và workflow E2E trước khi mở lại.

## 5. Release checklist và bằng chứng

| Gate | Dev/Test complete | Production approved |
| --- | --- | --- |
| Source/contract | CI local, schema và NestJS–Python version consistency | Release SHA được review và signed/tagged |
| Database | migration check, backup/restore rehearsal report | staging restore và integrity evidence |
| Runtime | Docker readiness, API/worker/solver smoke | staging/UAT, monitoring, alert và rollback drill |
| Security | auth/scope/header tests, threat model | security review, secret rotation và production identity |
| Workflow | automated tests và browser/pilot evidence nếu có | approver + stakeholder sign-off, workbook chính thức |
| Operations | runbook, owner, RPO/RTO, incident steps | on-call, retention, access review và change approval |

Chỉ chuyển task/phase sang **Done** khi các acceptance criteria có evidence liên
kết. “CI pass”, “Docker chạy được” hoặc “local restore rehearsal” chỉ là
Dev/Test evidence; không được ghi là **production approved**. Các gate staging,
UAT, security review, restore evidence và stakeholder approval phải được đánh dấu
riêng cho đến khi có người chịu trách nhiệm xác nhận.

## 6. Handoff record tối thiểu

Lưu các trường sau trong Execution Notes hoặc release record:

- commit SHA và thời điểm;
- backup timestamp, object/key, bytes, SHA-256 và retention class;
- restore target, migration count, elapsed time và người thực hiện;
- RPO/RTO mục tiêu và số đo thực tế;
- test/build/runtime evidence;
- blocker, known limitation, risk accepted và approver/stakeholder sign-off.
