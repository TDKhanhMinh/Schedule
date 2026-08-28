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

## Dữ liệu công khai THCS Bình Phú

`scripts/seed-binh-phu-public-data.cjs` nạp bộ dữ liệu kiểm thử từ cổng thông tin
công khai của Trường THCS Bình Phú: 55 lớp/GVCN, danh mục môn/phòng và các ô
thời khóa biểu của 5 lớp đại diện. Script dùng các mã mặc định của frontend và
chỉ thay thế phạm vi school/period/version riêng của seed khi chạy lại.

Chạy từ máy host sau khi đã chạy migration:

```powershell
node .\scripts\seed-binh-phu-public-data.cjs
```

Các ô buổi chiều trên nguồn không được nạp vì schema hiện tại đang ràng buộc
duy nhất theo `(academic_period_id, day, period)`; seed giữ đúng dữ liệu buổi
sáng có giáo viên xác định và để FE tiếp tục hiển thị các ô buổi chiều rỗng.

Để nạp đầy đủ danh mục giáo viên và phân công môn–khối từ toàn bộ các trang lớp
công khai, dùng script refresh:

```powershell
node .\scripts\refresh-binh-phu-live-data.cjs
```

Script đọc 55 trang lớp, chuẩn hóa các tên môn theo chương trình THCS hiện tại,
giữ 55 phân công GVCN và tạo nhu cầu tiết ACTIVE cho solver. Các tên giáo viên
viết tắt trong ô thời khóa biểu được ánh xạ về hồ sơ giáo viên đầy đủ tương ứng
khi đối chiếu được với danh sách GVCN; các tên không đủ căn cứ vẫn giữ riêng để
không tự suy đoán danh tính. Script chỉ làm mới phạm vi trường/kỳ/phiên bản kiểm
thử cố định; phiên bản phải ở trạng thái DRAFT.
