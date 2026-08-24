# PostgreSQL database

Các migration SQL trong thư mục này là source of truth cho persistence contract của backend. Migration được áp dụng theo thứ tự tăng dần khi môi trường PostgreSQL sẵn sàng.

`001_initial_contract.sql` chỉ tạo baseline cho scope/setup: school, academic period, classes, teachers, subjects, rooms, time slots, lesson requirements, optimization runs và assignments. Nó chưa đại diện cho toàn bộ domain MVP hoặc production authorization/RLS.

 `002_import_workflow.sql` bổ sung staging `import_batches`/`import_rows` và `audit_logs` cho luồng Excel preview → validation → confirm; preview không ghi domain, chỉ confirm mới insert lesson requirements.
