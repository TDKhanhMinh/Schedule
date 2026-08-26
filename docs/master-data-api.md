# API dữ liệu danh mục — P1.2-T03

API NestJS cung cấp CRUD theo phạm vi trường cho dữ liệu danh mục cần trong
workflow thời khóa biểu. Tiền tố API chung là `/api/v1`.

## Route

| Phương thức              | Route                                                                         | Vòng đời                                            |
| ------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| `GET`, `POST`            | `/schools`                                                                    | List or create schools                              |
| `GET`, `PATCH`, `DELETE` | `/schools/:schoolId`                                                          | Read, edit, or archive a school                     |
| `GET`, `POST`            | `/schools/:schoolId/teachers`                                                 | List or create teachers                             |
| `GET`, `PATCH`, `DELETE` | `/schools/:schoolId/teachers/:teacherId`                                      | Read, edit, or archive a teacher                    |
| `GET`, `POST`            | `/schools/:schoolId/classes`                                                  | List or create classes                              |
| `GET`, `PATCH`, `DELETE` | `/schools/:schoolId/classes/:classId`                                         | Read, edit, or archive a class                      |
| `GET`, `POST`            | `/schools/:schoolId/subjects`                                                 | List or create subjects                             |
| `GET`, `PATCH`, `DELETE` | `/schools/:schoolId/subjects/:subjectId`                                      | Read, edit, or archive a subject                    |
| `GET`, `POST`            | `/schools/:schoolId/rooms`                                                    | List or create rooms and capabilities               |
| `GET`, `PATCH`, `DELETE` | `/schools/:schoolId/rooms/:roomId`                                            | Read, edit, or archive a room                       |
| `GET`, `POST`            | `/schools/:schoolId/academic-periods`                                         | List or create periods                              |
| `GET`, `PATCH`, `DELETE` | `/schools/:schoolId/academic-periods/:periodId`                               | Read, edit, or archive a period                     |
| `GET`, `POST`            | `/schools/:schoolId/academic-periods/:periodId/time-slots`                    | List or create slots                                |
| `PATCH`, `DELETE`        | `/schools/:schoolId/academic-periods/:periodId/time-slots/:slotId`            | Edit or delete a slot                               |
| `GET`, `POST`            | `/schools/:schoolId/academic-periods/:periodId/lesson-requirements`           | List or create teaching assignments / weekly demand |
| `GET`, `PATCH`, `DELETE` | `/schools/:schoolId/academic-periods/:periodId/lesson-requirements/:lessonId` | Read, edit, or archive a teaching assignment        |

`DELETE` trên trường hoặc khung năm học là chuyển sang lưu trữ. Khung tiết chỉ bị
xóa vật lý khi không có tham chiếu `optimization_assignments` hoặc
`schedule_assignments`; khung đang được tham chiếu trả `409 RESOURCE_REFERENCED`.

## Kiểm tra và phạm vi

- Múi giờ trường phải là múi giờ IANA hợp lệ; mặc định cục bộ là
  `Asia/Ho_Chi_Minh`.
- Năm học dùng `YYYY-YYYY`, ngày là chuỗi ISO và `endsOn` không được
  not precede `startsOn`.
- `day` của khung tiết là `1..7`, `period` ít nhất `1` và `endsAt` phải
  later than `startsAt` when both are supplied.
- Query khung năm học và khung tiết luôn gồm phạm vi trường cha. Dòng từ trường
  khác trả về không tìm thấy thay vì rò rỉ qua ranh giới tenant.
- Khung năm học đã lưu trữ không nhận khung tiết mới.
- Phân công giảng dạy phải tham chiếu lớp, môn, giáo viên ACTIVE và nếu có thì
  phòng cùng trường. `requiredSessions` là nhu cầu tiết tuần hiện tại; định mức
  chính thức vẫn là cổng thí điểm/quy tắc nghiệp vụ và không hard-code vào hợp đồng bộ tối ưu.
- Khóa tự nhiên hoạt động của phân công giảng dạy là
  `(academicPeriodId, classId, subjectId, teacherId)`. Duplicate active demand
  is rejected with `409 DUPLICATE_LESSON_REQUIREMENT`.
- `roomType` và `capacity` dương của phòng được lưu như siêu dữ liệu năng lực;
  ràng buộc va chạm phòng vẫn nằm ngoài `schemaVersion: "1.0"` của bộ tối ưu Python.

API trả trường camelCase trong khi PostgreSQL vẫn dùng `snake_case`. Ranh giới
CRUD không thay đổi hợp đồng truyền bộ tối ưu Python `schemaVersion: "1.0"`;
xác thực/RBAC, phê duyệt thí điểm và sẵn sàng production vẫn là các cổng riêng.
