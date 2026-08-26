# Kế hoạch chuẩn bị production — Web MVP

**Phạm vi:** MVP ưu tiên web đến bản ứng viên phát hành hiện tại. Tauri/offline
nằm ngoài phạm vi vì P4.2-T01 vẫn là `NO-GO_PENDING_EVIDENCE`.

**Quyết định hiện tại:** `NO-GO_PENDING_GATES` trong
`outputs/P3.3-T05/release-record.json`.

## Trình tự các cổng

### 0. Đóng băng phạm vi phát hành

- Đóng băng phiên bản Web MVP, PRD/tiêu chí nghiệm thu, persona và sổ làm việc
  chính thức/phiên bản/mã băm.
- Ghi nhận Tauri/offline không thuộc bản phát hành này.
- Tạo bản ứng viên phát hành từ một commit chính xác và giữ tham chiếu image để
  khôi phục.

Điều kiện ra: biên bản đóng băng phạm vi và bản ứng viên phát hành đã ký.

### 1. Thí điểm và bên liên quan ký xác nhận

- Chạy sổ làm việc chính thức qua Tải lên → Kiểm tra → Xác nhận → Tối ưu →
  Rà soát/Chỉnh sửa → Phê duyệt → Khóa → Công bố → Xuất.
- Ghi nhận người thực hiện, thời điểm, mã băm sổ làm việc, bản chụp quy tắc và
  liên kết bằng chứng.
- Có phê duyệt của bên liên quan được nêu tên cho phạm vi, persona và tiêu chí
  nghiệm thu.

Điều kiện ra: `officialWorkbookAndStakeholder=true` và `pilotApproved=true` với
bằng chứng phê duyệt bền vững.

### 2. Đóng các điểm mở về bảo mật

- Xử lý cảnh báo dependency đang mở hoặc ghi nhận chấp nhận rủi ro có người chịu
  trách nhiệm, phạm vi, biện pháp giảm thiểu và thời hạn.
- Kiểm tra nhà cung cấp danh tính production, RBAC, thành viên tenant, RLS và
  hành vi nhật ký trong staging với danh tính đã xác thực.
- Rà soát hạn mức tải lên/chính sách AV-WAF, giới hạn tốc độ liên kết công khai,
  quyền truy cập chỉ số, lưu giữ dữ liệu và xử lý sự cố.

Điều kiện ra: `securityP1ClosedOrAccepted=true` với phê duyệt bảo mật.

### 3. Môi trường production và an toàn dữ liệu

- Cấp phát PostgreSQL/Redis qua dịch vụ được quản lý và trình quản lý bí mật.
- Dùng vai trò ứng dụng không phải owner, `TENANT_DB_ENFORCEMENT=true`, TLS và
  mạng riêng.
- Sao lưu trước migration; áp dụng migration 001–016 theo hướng tiến tới; kiểm
  tra sổ migration, cột tenant, RLS và ngữ cảnh ứng dụng.
- Diễn tập khôi phục cô lập và giữ image đã phê duyệt trước đó.

Điều kiện ra: `productionSecretsAndEnvironment=true` và có bằng chứng migration/
khôi phục staging.

### 4. Giám sát và vận hành

- Cấu hình bộ thu production cho chỉ số API, hàng đợi, worker và bộ tối ưu.
- Cấu hình ngưỡng cảnh báo, nơi gửi phân trang, người trực và runbook.
- Kiểm thử cảnh báo cho một lỗi API, lỗi hàng đợi và lỗi worker/bộ tối ưu.

Điều kiện ra: `productionCollectorAndPaging=true` với bằng chứng cảnh báo/phân trang.

### 5. Kiểm chứng phát hành staging

- Triển khai đúng image phát hành lên staging.
- Chạy E2E trình duyệt có xác thực, ma trận âm hai tenant, nhập/tối ưu/xuất sổ
  làm việc chính thức, đồng thời kiểm tra đồng thời, hủy/thử lại và smoke test.
- Chạy kiểm thử tải/năng lực theo SLO đã thống nhất, sao lưu/khôi phục và diễn
  tập khôi phục phiên bản.

Điều kiện ra: báo cáo staging/UAT không còn blocker P0/P1 chưa xử lý.

### 6. Quyết định go/no-go và chuyển phiên bản

- Người phê duyệt phát hành, phê duyệt bảo mật, bên liên quan thí điểm, owner
  triển khai, owner giám sát và owner sau phát hành ký biên bản.
- Đặt khung phát hành, owner khôi phục và thời gian theo dõi tăng cường.
- Đóng băng ghi dữ liệu, sao lưu, migration, triển khai, chạy smoke sau phát
  hành và giám sát.

Chỉ khi đó biên bản phát hành mới được chuyển thành:

```json
{
  "decision": "GO",
  "pilotApproved": true,
  "productionApproved": true,
  "openGates": []
}
```

Không script hoặc kiểm thử cục bộ nào được đặt các giá trị này nếu thiếu bằng
chứng trực tiếp tương ứng và phê duyệt được nêu tên.
