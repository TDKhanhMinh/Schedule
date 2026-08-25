# PostgreSQL database

Các migration SQL trong thư mục này là source of truth cho persistence contract của backend. Migration được áp dụng theo thứ tự tăng dần khi môi trường PostgreSQL sẵn sàng.

Schema proposal, ERD, khóa tự nhiên, tenant boundary và lifecycle của domain
được ghi tại [`docs/database-domain-model.md`](../../docs/database-domain-model.md).
P1.2-T01 chỉ chốt thiết kế; chỉ P1.2-T02 mới chuyển phần đã duyệt thành
migration forward-only và seed fixture.

`001_initial_contract.sql` chỉ tạo baseline cho scope/setup: school, academic period, classes, teachers, subjects, rooms, time slots, lesson requirements, optimization runs và assignments. Nó chưa đại diện cho toàn bộ domain MVP hoặc production authorization/RLS.

`002_import_workflow.sql` bổ sung staging `import_batches`/`import_rows` và `audit_logs` cho luồng Excel preview → validation → confirm; preview không ghi domain, chỉ confirm mới insert lesson requirements.

`003_domain_persistence.sql` bổ sung stable code/status/timezone, academic-period
scope, same-school foreign keys, rule profiles/definitions và schedule
version/assignment tables. Các cột `academic_period_id` trên đường import/run
được giữ nullable trong giai đoạn chuyển tiếp để không phá vỡ API `schemaVersion
1.0`; task CRUD kế tiếp phải yêu cầu period rõ ràng trước pilot/production.

`004_master_data_timestamps.sql` bổ sung `time_slots.created_at` để CRUD
master-data trả về audit timestamps nhất quán với các domain table còn lại.

`005_rbac_audit_foundation.sql` mở rộng audit log thành append-only event
stream có `correlation_id`, `actor_role` và `entity_key`; bỏ unique constraint
theo entity/action để giữ được nhiều lần create/update/delete. Identity header
adapter và permission matrix do NestJS sở hữu; production IdP vẫn là gate riêng.

`007_versioned_rule_set_snapshots.sql` chuẩn hóa metadata nguồn, phạm vi, ngày
hiệu lực và trạng thái phê duyệt của `rule_profiles`/`rule_definitions`, tạo
snapshot bất biến `rule_set_snapshots` có hash SHA-256, và liên kết snapshot
đã dùng vào `optimization_runs`. Snapshot là bản tái dựng chính xác của rule
set tại thời điểm solve; việc thực thi các loại rule mới trong solver thuộc
P2.1-T02.

`008_schedule_version_lifecycle.sql` bổ sung lifecycle `DRAFT → IN_REVIEW →
APPROVED → LOCKED → PUBLISHED → ARCHIVED`, rule/input/result snapshot hashes,
chính sách một bản `PUBLISHED` hiện hành cho mỗi school/academic period, bảng
transition audit append-only và trigger chặn sửa payload/assignment sau khi
publish. `APPROVED` và `LOCKED` được giữ làm trạng thái trung gian để các task
approval/lock kế tiếp dùng cùng một state machine.

Migration là forward-only: không có down migration. Trước khi migrate môi
trường có dữ liệu, tạo backup/snapshot; nếu cần quay lại thì restore snapshot
hoặc viết migration sửa tiếp theo. Không xóa hay gộp các row legacy/import QC
đang có duplicate natural key.

Trước khi chạy migration, dùng `npm run check:migrations`. Check này yêu cầu
tên file theo thứ tự `NNN_name.sql`, sequence liên tục bắt đầu từ `001`, câu
lệnh kết thúc hợp lệ và không thêm migration baseline có `DROP`, `TRUNCATE` hay
`DELETE FROM`. CI chạy check này cùng backend quality gate.
