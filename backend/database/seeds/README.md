# Demo seed

`001_demo_school.sql` tạo dữ liệu mẫu idempotent cho local test: một trường
THCS và một trường THPT giả lập, mỗi trường có academic period, lớp, giáo viên,
môn, phòng, time slot, lesson requirement và rule profile. Seed không xóa dữ
liệu hiện có và chỉ dùng các UUID namespace `00000000-0000-0000-0000-0000000000xx`.

Apply sau khi đã chạy migrations 001–004:

```powershell
Get-Content -Raw .\backend\database\seeds\001_demo_school.sql | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U scheduler -d scheduler
```

Có thể chạy lại cùng lệnh để kiểm tra idempotency; các fixture dùng `ON CONFLICT
(id) DO UPDATE`, không tạo row trùng và không xóa dữ liệu khác.
