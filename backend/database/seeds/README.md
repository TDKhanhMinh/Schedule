# Demo seed

`001_demo_school.sql` tạo dữ liệu mẫu idempotent cho local test. Seed không xóa dữ liệu hiện có và chỉ dùng các UUID namespace `00000000-0000-0000-0000-0000000000xx`.

Apply:

```powershell
Get-Content -Raw .\backend\database\seeds\001_demo_school.sql | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U scheduler -d scheduler
```

