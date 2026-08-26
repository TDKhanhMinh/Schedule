# Kiểm tra trước tối ưu

**Contract:** `PRE-SOLVE-1.0.0`

Mỗi vấn đề cũng có `catalogVersion: CONFLICT-CATALOG-1.0.0`, `entity` ổn định,
`remediationHint` tiếng Việt và `entityReferences` có giới hạn. Xem
[`conflict-catalog.md`](./conflict-catalog.md) for the import/API/solver
mapping.

Kiểm tra trước tối ưu là cổng điều kiện cần do API sở hữu và worker Python lặp
lại. Nó ngăn tác vụ có tập dữ liệu được chứng minh bất khả thi tiêu tốn thời gian
CP-SAT; CP-SAT vẫn là thẩm quyền cuối cho mô hình ràng buộc cứng đầy đủ.

## API

```http
POST /api/v1/optimization-jobs/preflight
```

Body là `SolveJobRequest` đã kiểm tra, giống như dùng bởi
`POST /api/v1/optimization-jobs`. A failed preflight returns a structured
báo cáo với `canSolve: false`; endpoint xếp hàng trả `PRESOLVE_FAILED` và không
tạo tác vụ BullMQ.

## Checks

- `TOTAL_SLOT_CAPACITY_EXCEEDED`: total required sessions exceed the number
  of available slots.
- `LESSON_SLOT_CAPACITY_EXCEEDED`: one lesson cannot fit its required sessions
  in its fixed/allowed slots after hard teacher/class availability filtering.
- `CLASS_SLOT_CAPACITY_EXCEEDED` and `TEACHER_SLOT_CAPACITY_EXCEEDED`:
  aggregate demand exceeds the resource's candidate-slot capacity.
- `UNKNOWN_ALLOWED_SLOT` and `UNKNOWN_FIXED_SLOT`: the request references a
  slot outside `timeSlots`.
- `FIXED_RESOURCE_CONFLICT`: two fixed lessons use the same class or teacher
  at one slot.
- `ROOM_CAPABILITY_UNSATISFIED`: a lesson's required capabilities have no
  eligible room in the optional `rooms` projection.

Class unavailable slots use `classUnavailableSlotIds`. Teacher unavailable
slots use the approved `TEACHER-AVAILABILITY-1.0.0` projection. Room checks are
necessary-condition checks only; room assignment and full room CP-SAT
constraints remain a later solver task.

Chẩn đoán kết quả gồm báo cáo kiểm tra trước tối ưu. Kiểm tra trước Python thất
bại trả `INFEASIBLE`, không có phân công, mã vấn đề và cùng báo cáo mà không dựng
mô hình CP-SAT.
