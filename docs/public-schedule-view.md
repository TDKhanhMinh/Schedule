# Thời khóa biểu công khai chỉ đọc — P2.4-T05

## Hợp đồng và route

- `SCHEDULE-PUBLIC-LINK-1.0.0`: phản hồi tạo liên kết có thể hết hạn/thu hồi.
- `SCHEDULE-PUBLIC-VIEW-1.0.0`: payload JSON chỉ đọc an toàn; không để lộ ID
  nội bộ của tiết học, phòng và phân công thời khóa biểu.
- `SCHEDULE-PDF-1.0.0`: hợp đồng siêu dữ liệu và watermark PDF có thể in.

Authenticated link management:

```text
POST /api/v1/schools/:schoolId/schedule-versions/:versionId/public-links
POST /api/v1/schools/:schoolId/schedule-versions/:versionId/public-links/:linkId/revoke
```

Chỉ `ADMIN` và `REVIEWER` có thể tạo/thu hồi liên kết, và chỉ phiên bản
`PUBLISHED` mới nhận được liên kết công khai. Cơ sở dữ liệu chỉ lưu mã băm token
SHA-256. Thời hạn mặc định là 168 giờ và API giới hạn tối đa 720 giờ.

Các route chỉ đọc không cần xác thực:

```text
GET /api/v1/public/schedules/:token?view=all|class|teacher|room&resource=...
GET /api/v1/public/schedules/:token.pdf?view=all|class|teacher|room&resource=...
```

Liên kết hết hạn/thu hồi trả `410`; liên kết không xác định trả `404`. Nếu phiên
bản liên kết không còn `PUBLISHED`, chế độ xem công khai không khả dụng. Route
React `/public/schedules/:token` có bộ lọc, thao tác in và liên kết PDF nhưng
không có điều khiển chỉnh sửa/khóa/phê duyệt/công bố.

## PDF và ranh giới bảo mật

NestJS tạo PDF A4 ngang với font Unicode nhúng nếu có, cột tài nguyên/thời gian
gọn, footer siêu dữ liệu lặp lại, đánh số trang và watermark `CHỈ ĐỌC CÔNG KHAI`.
Máy chủ kiểm tra token, vòng đời liên kết và bản chụp đã công bố trước khi xuất
JSON hoặc PDF; việc hiển thị trên giao diện không phải ranh giới bảo mật.

Bằng chứng thời gian chạy cục bộ tách biệt với staging/production, thí điểm và
phê duyệt bên liên quan. PDF đầu ra phải được render và kiểm tra trực quan trước
khi kết luận cổng bố cục đã đạt.
