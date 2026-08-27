# Hợp đồng Excel master data và phân công

## Phiên bản

- Contract: `MASTER-DATA-IMPORT-1.0.0`
- Template: `1.0`
- Nguồn dữ liệu thực thi: NestJS API và PostgreSQL.

## Sáu loại template

| Entity | Sheet | Khóa tự nhiên | Cột dữ liệu |
| --- | --- | --- | --- |
| Lớp | `Classes` | Mã lớp | Mã lớp, Tên lớp, Khối |
| Giáo viên | `Teachers` | Mã giáo viên | Mã giáo viên, Tên giáo viên |
| Môn học | `Subjects` | Mã môn | Mã môn, Tên môn |
| Phòng học | `Rooms` | Mã phòng | Mã phòng, Tên phòng, Loại phòng, Sức chứa |
| Phân công chuyên môn | `TeacherSubjectGrades` | Mã giáo viên + Mã môn + Khối + Năm học + Mã học kỳ | Mã giáo viên, Mã môn, Khối, Năm học, Mã học kỳ |
| Phân công chủ nhiệm | `HomeroomAssignments` | Mã lớp + Năm học + Mã học kỳ | Mã lớp, Mã giáo viên, Năm học, Mã học kỳ, Số tiết giảm, Mã quy định |

Phân công chuyên môn không có `Mã lớp`. Phân công lớp cụ thể chỉ dùng cho GVCN.

## Quy tắc import

- Tải template và nhập file là hai thao tác riêng với luồng nhập `LessonRequirements`.
- File phải có đúng định dạng `.xlsx`, chữ ký ZIP hợp lệ và không chứa công thức hoặc hyperlink nguy hiểm.
- Preview không ghi vào bảng domain; chỉ tạo batch/row staging.
- Mã mới tạo bản ghi. Mã đã có cập nhật các thuộc tính không định danh.
- Không tự động xóa hoặc khôi phục dòng vắng mặt trong file.
- Trùng khóa trong file, thiếu cột, sai kiểu, sai giới hạn hoặc sai tham chiếu đều chặn Confirm.
- Confirm atomic, idempotent, tenant/school scoped và có audit log.
- `fileChecksum`, `templateVersion` và `contractVersion` đi cùng preview/confirm.

## Chu kỳ trạng thái

```text
Tải template → Upload → Preview → Validate → Confirm → Đọc lại dữ liệu → Audit
```

`canConfirm = true` chỉ khi có ít nhất một dòng và không còn lỗi.
