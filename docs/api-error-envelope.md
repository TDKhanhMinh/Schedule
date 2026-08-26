# Phong bì lỗi API

NestJS là ranh giới lỗi HTTP duy nhất của ứng dụng. Mọi lỗi HTTP được xử lý đều
sử dụng cấu trúc sau:

```json
{
  "statusCode": 400,
  "code": "INVALID_TEMPLATE",
  "message": "File thiếu các cột bắt buộc: Mã lớp",
  "requestId": "qc-2026-08-24-001",
  "timestamp": "2026-08-24T08:00:00.000Z",
  "path": "/api/v1/imports/preview",
  "catalogVersion": "CONFLICT-CATALOG-1.0.0",
  "remediationHint": "Dùng mẫu MVP-0.1.0 và giữ nguyên tên các cột bắt buộc.",
  "entity": "IMPORT",
  "details": {
    "code": "INVALID_TEMPLATE",
    "message": "File thiếu các cột bắt buộc: Mã lớp",
    "missingColumns": ["Mã lớp"]
  }
}
```

NestJS tạo `requestId` khi bên gọi không cung cấp `x-request-id` an toàn; cùng
giá trị đó được trả về trong header phản hồi. Lỗi nội bộ trả về thông báo chung
an toàn và không bao giờ để lộ stack trace hoặc thông tin kết nối.

Các lỗi dữ liệu và ràng buộc đã biết sử dụng danh mục phiên bản trong
[`conflict-catalog.md`](./conflict-catalog.md). The exception boundary removes
`stack`, `stackTrace` và `cause` khỏi chi tiết có cấu trúc trước khi trả về phản hồi.

## Sơ đồ mô-đun NestJS

| Mô-đun             | Phụ trách                                                                     | Bề mặt hiện tại                                                                                                |
| ------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `AuthModule`       | Ranh giới xác thực và phân quyền theo phạm vi trường                          | Khung nền; triển khai xác thực là task riêng                                                                   |
| `MasterDataModule` | Trường, khung năm học, lớp, giáo viên, môn học và phòng                       | Ranh giới nền tảng; dữ liệu chuẩn thuộc PostgreSQL                                                             |
| `ImportsModule`    | Lưu tạm, kiểm tra, xác nhận và nhật ký Excel                                  | `POST /imports/preview`, endpoint xác nhận, lô nhập và nhật ký                                                 |
| `RulesModule`      | Hồ sơ quy tắc phiên bản, nguồn gốc, báo cáo tải và sẵn sàng giáo viên         | Yêu cầu bản chụp đã phê duyệt; sẵn sàng cứng/mạnh/mềm do máy chủ quản lý                                       |
| `TimetableModule`  | Phiên bản thời khóa biểu, rà soát/chỉnh sửa, phê duyệt, khóa, công bố và xuất | Ranh giới nền tảng; năng lực workflow theo các task MVP                                                        |
| `JobsModule`       | Kiểm tra trước, xếp hàng/trạng thái BullMQ và ranh giới tác vụ tối ưu         | `POST /optimization-jobs/preflight`, `POST/GET /optimization-jobs`; lỗi chứng minh được không đưa vào hàng đợi |
| `HealthModule`     | Bề mặt kiểm tra hoạt động                                                     | `GET /health`                                                                                                  |
| `DatabaseModule`   | Pool và vòng đời PostgreSQL                                                   | Nhà cung cấp hạ tầng dùng chung                                                                                |

Tiền tố API được cấu hình bởi `API_PREFIX` và mặc định là `api/v1`. Giao diện,
Redis/BullMQ và bộ tối ưu Python không được bỏ qua ranh giới này.

## Ranh giới tải sổ làm việc an toàn

`POST /imports/preview` chỉ nhận `.xlsx`/`.xlsm` khi tệp vượt qua toàn bộ các
kiểm tra sau trước khi lưu tạm các dòng: chữ ký ZIP/OOXML, giới hạn đầu vào nén
5 MiB, gói sau giải nén 50 MiB, tối đa 10 trang tính, 10.000 dòng và 50 cột mỗi
sổ làm việc, cùng thời gian đọc tối đa năm giây. Ô công thức, hyperlink/liên kết
ngoài và macro VBA bị từ chối bằng lỗi máy đọc được. Giới hạn Multer và giới
hạn cấp dịch vụ đều được áp dụng để lời gọi trực tiếp đến service không thể bỏ qua ranh giới.

| Mã                        | Ý nghĩa                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ |
| `FILE_TOO_LARGE`          | Tải multipart vượt giới hạn đầu vào 5 MiB                                      |
| `INVALID_FILE_SIGNATURE`  | Phần mở rộng giống Excel nhưng dữ liệu byte không phải OOXML/ZIP               |
| `WORKBOOK_TOO_LARGE`      | Đầu vào vượt giới hạn kích thước tệp nén                                       |
| `WORKBOOK_UNSAFE_CONTENT` | Phát hiện rủi ro macro, công thức, hyperlink, liên kết ngoài hoặc giải nén ZIP |
| `WORKBOOK_LIMIT_EXCEEDED` | Số trang tính, dòng hoặc cột vượt giới hạn đã ghi nhận                         |
| `WORKBOOK_PARSE_TIMEOUT`  | Đọc sổ làm việc vượt quá năm giây                                              |
