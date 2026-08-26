# Danh mục xung đột

**Contract:** `CONFLICT-CATALOG-1.0.0`

Danh mục là hợp đồng giải thích dùng chung cho lỗi nhập sổ làm việc, phản hồi
kiểm tra trước tối ưu của NestJS và chẩn đoán của bộ tối ưu Python. Nguồn chuẩn
là `backend/src/contracts/conflict-catalog.ts`; bản sao Python là
`backend/solver/src/timetable_solver/conflict_catalog.py`. Lược đồ JSON và ví dụ
đã công bố nằm trong `backend/contracts/schemas/` và `backend/contracts/examples/`.

Mỗi chẩn đoán gồm:

- `code`: mã ổn định, máy đọc được;
- `severity`: `ERROR`, `WARNING` hoặc `INFO`;
- `entity`: thực thể nghiệp vụ bị ảnh hưởng;
- `message`: giải thích tiếng Việt cho người dùng;
- `remediationHint`: hành động tiếp theo bằng tiếng Việt;
- `entityReferences`: chỉ gồm tham chiếu không diễn giải tới tiết học/tài nguyên/dòng.

`ImportIssue` gồm phiên bản danh mục, thực thể và hướng xử lý. Báo cáo kiểm tra
trước tối ưu gồm các trường tương tự cho từng vấn đề; bộ tối ưu trả về
`diagnostics.catalogVersion` và `diagnostics.conflictDetails`, đồng thời giữ lại
chuỗi `warnings[]` và `conflicts[]` gốc để tương thích.

## Ánh xạ theo ranh giới workflow

| Ranh giới                 | Mã ví dụ                                                                                                            | Hành vi giao diện/API                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Xem trước Excel           | `REQUIRED`, `INVALID_NUMBER`, `UNKNOWN_REFERENCE`, `DUPLICATE`                                                      | Tô nổi bật dòng/ô nguồn, hiển thị thông báo và hướng xử lý, giữ nút xác nhận bị vô hiệu hóa khi là `ERROR`. |
| Kiểm tra trước tối ưu API | `TOTAL_SLOT_CAPACITY_EXCEEDED`, `CLASS_SLOT_CAPACITY_EXCEEDED`, `UNKNOWN_FIXED_SLOT`, `ROOM_CAPABILITY_UNSATISFIED` | Hiển thị danh sách xung đột có cấu trúc; không xếp tác vụ BullMQ khi `canSolve=false`.                      |
| Tối ưu Python             | `NO_FEASIBLE_ASSIGNMENT`, `HARD_AVAILABILITY_CONFLICT`, `PREFERENCE_VIOLATED`                                       | Hiển thị xung đột cứng như chẩn đoán chặn workflow và vi phạm ưu tiên mềm như cảnh báo.                     |

Giao diện chỉ hiển thị hợp đồng này. Ràng buộc cứng vẫn được kiểm tra bởi bước
kiểm tra trước của NestJS và bộ tối ưu Python; giao diện bị ẩn hoặc sửa đổi không
thể biến lịch không hợp lệ thành hợp lệ. Lỗi HTTP được bộ lọc ngoại lệ NestJS
chuẩn hóa, loại bỏ trường stack/cause và chỉ trả về hướng xử lý của danh mục cùng
chi tiết an toàn.

Thêm hoặc thay đổi mã yêu cầu phiên bản danh mục mới và kiểm thử NestJS/Python
được đồng bộ. Các trường `code`, `message`, `warnings[]` và `conflicts[]` hiện
vẫn được duy trì trong thời gian tương thích v1.
