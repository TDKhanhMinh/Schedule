# Tự động phân công giáo viên vào lớp

Tính năng này phân bổ giáo viên vào nhu cầu lớp-môn trước khi chạy solver thời khóa biểu. Đây là workflow riêng với `optimization.solve`.

## Ranh giới dữ liệu

- `teacher_subject_grade_assignments` xác định giáo viên được phép dạy môn và khối.
- `class_subject_demands` lưu nhu cầu lớp-môn-số tiết trước khi biết giáo viên.
- `teacher_assignment_runs` lưu vòng đời một lần chạy tự động.
- `teacher_assignment_proposals` lưu proposal theo từng nhu cầu.
- `lesson_requirements` chỉ là đầu vào đã xác nhận cho solver thời khóa biểu và luôn có `teacher_id`.

Phân công thủ công được đánh dấu `assignment_source = MANUAL` và `assignment_locked = true`. Auto assignment không được ghi đè các dòng này.

## Luồng vận hành

1. Tạo hoặc đồng bộ nhu cầu lớp-môn.
2. Kiểm tra coverage môn-khối và rule snapshot.
3. Tạo job `teacher-assignment.solve` trong queue `teacher-assignment`.
4. Worker gọi Python + OR-Tools CP-SAT.
5. Lưu proposal và diagnostics vào PostgreSQL.
6. Người dùng review, xử lý dòng chưa gán và confirm.
7. Confirm transaction materialize proposal vào `lesson_requirements`.
8. Người dùng chủ động chạy solver thời khóa biểu.

## Contract và API

Contract Python/JSON Schema: `TEACHER-ASSIGNMENT-1.0.0`.

- `GET /schools/:schoolId/academic-periods/:periodId/teacher-assignment-runs/demands`
- `POST /schools/:schoolId/academic-periods/:periodId/teacher-assignment-runs/demands`
- `POST /schools/:schoolId/academic-periods/:periodId/teacher-assignment-runs/preflight`
- `POST /schools/:schoolId/academic-periods/:periodId/teacher-assignment-runs`
- `GET /schools/:schoolId/academic-periods/:periodId/teacher-assignment-runs/:runId`
- `POST /schools/:schoolId/academic-periods/:periodId/teacher-assignment-runs/:runId/confirm`
- `POST /schools/:schoolId/academic-periods/:periodId/teacher-assignment-runs/:runId/reject`
- `POST /schools/:schoolId/academic-periods/:periodId/teacher-assignment-runs/:runId/cancel`
- `POST /schools/:schoolId/academic-periods/:periodId/teacher-assignment-runs/:runId/retry`

`confirm` yêu cầu idempotency key, kiểm tra proposal stale bằng checksum và chạy trong transaction có audit log.

## Thuật toán

CP-SAT tạo biến nhị phân cho cặp demand-teacher đủ điều kiện. Ràng buộc cứng gồm scope, teacher active, eligibility, phân công thủ công đã khóa và hard weekly cap. Objective ưu tiên cân bằng tải quanh adjusted target, giữ assignment hiện có và giảm số demand chưa được gán.

Ngày nghỉ, buổi chính/phụ, phòng và slot cụ thể không được xử lý ở bước này; chúng thuộc solver thời khóa biểu sau khi confirm.

## Trạng thái và xử lý lỗi

- `OPTIMAL` hoặc `FEASIBLE`: có proposal để review.
- `PARTIAL`: một hoặc nhiều demand chưa gán được, không được confirm.
- `INFEASIBLE`: vi phạm ràng buộc cứng.
- `UNKNOWN`: solver chưa kết luận.
- `CONFIRMED`: proposal đã materialize vào lesson requirements.

Nếu demand, eligibility, rule snapshot hoặc assignment thủ công thay đổi sau khi tạo proposal, confirm phải bị từ chối và yêu cầu chạy lại.
