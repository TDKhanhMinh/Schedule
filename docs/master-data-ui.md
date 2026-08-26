# Hợp đồng giao diện dữ liệu danh mục

P1.3-T05 bổ sung route React `/master-data` để bảo trì trực tiếp dữ liệu chuẩn
dùng cho kiểm tra nhập và dữ liệu đầu vào bộ tối ưu Python.

## Phạm vi

Màn hình cung cấp tạo, sửa, lưu trữ/xóa, liệt kê và lọc phía client cho:

- trường;
- khung năm học và khung tiết;
- giáo viên, lớp, môn học và phòng;
- yêu cầu tiết học (dữ liệu đầu vào phân công lớp/môn/giáo viên/phòng).

Trường đang hoạt động được cấu hình qua `VITE_SCHOOL_ID`; không có mã trường mặc định.
Khung tiết và yêu cầu tiết học thuộc phạm vi khung năm học đã chọn.

## Ranh giới API

Giao diện dùng lại các endpoint NestJS hiện có dưới `/api/v1/schools`. Tên payload
không đổi và khớp `backend/src/master-data/master-data.dto.ts`:

| Thực thể           | Trường tạo/cập nhật                                               | Phạm vi API                                                         |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| School             | `code`, `name`, `timezone`                                        | `/schools`                                                          |
| Academic period    | `academicYear`, `termCode`, `name`, `startsOn`, `endsOn`          | `/schools/:schoolId/academic-periods`                               |
| Time slot          | `day`, `period`, `shiftCode`, `startsAt`, `endsAt`                | `/schools/:schoolId/academic-periods/:periodId/time-slots`          |
| Teacher            | `code`, `displayName`                                             | `/schools/:schoolId/teachers`                                       |
| Class              | `code`, `name`, `grade`                                           | `/schools/:schoolId/classes`                                        |
| Subject            | `code`, `name`                                                    | `/schools/:schoolId/subjects`                                       |
| Room               | `code`, `name`, `roomType`, `capacity`                            | `/schools/:schoolId/rooms`                                          |
| Lesson requirement | `classId`, `subjectId`, `teacherId`, `roomId`, `requiredSessions` | `/schools/:schoolId/academic-periods/:periodId/lesson-requirements` |

Backend vẫn là nguồn chuẩn cho phân quyền, phạm vi trường, tính duy nhất, toàn vẹn
tham chiếu, trạng thái vòng đời và lưu trữ phục vụ bộ tối ưu. Giao diện không sao
chép quy tắc Python/OR-Tools.

## Quyền và hành vi lỗi

`ADMIN` và `SCHEDULER` thấy điều khiển ghi; `REVIEWER` và `VIEWER` vẫn chỉ đọc.
`AuthGuard` NestJS vẫn thực thi `WRITE` và trả lỗi có thẩm quyền khi vai trò giao
diện không được phép. Mảng kiểm tra và lỗi nghiệp vụ hiển thị trong cảnh báo biểu
mẫu, đồng thời tô trường khi thông báo máy chủ xác định được trường.

Thao tác “Kiểm tra dữ liệu” cố ý ở mức cơ bản: kiểm tra giá trị bắt buộc, phạm vi
khối, số dương và thứ tự thời gian/ngày cho danh sách đang lọc. Đây là kiểm tra
tiện ích, không thay thế kiểm tra NestJS.

Sau mỗi thay đổi thành công, giao diện tải lại danh sách bị ảnh hưởng từ API. Vì
vậy lần xem trước Excel và request bộ tối ưu tiếp theo dùng cùng dữ liệu danh mục
được PostgreSQL lưu trữ.

## Bằng chứng kiểm chứng

- Kiểm tra kiểu giao diện, lint, build production và smoke test phải đạt.
- Kiểm thử đơn vị dữ liệu danh mục backend và kiểm tra CI gốc phải đạt.
- Thời gian chạy HTTP cục bộ phải bao phủ đọc, tạo/cập nhật/xóa, từ chối quyền và
  lỗi kiểm tra máy chủ trước khi nghiệm thu task.
- Trình duyệt trực quan/E2E, dữ liệu thí điểm thật và phê duyệt bên liên quan là
  các cổng riêng.
