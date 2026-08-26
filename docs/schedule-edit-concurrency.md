# Đồng thời khi chỉnh sửa thời khóa biểu

**Contract:** `SCHEDULE-EDIT-1.0.0`

`GET /api/v1/schools/:schoolId/schedule-versions/:versionId` returns the
current schedule snapshot and an `ETag` such as
`"schedule-version:<versionId>:<revision>"`. A manual assignment edit uses:

```http
PATCH /api/v1/schools/:schoolId/schedule-versions/:versionId/assignments/:lessonId/:sessionIndex
If-Match: "schedule-version:<versionId>:<revision>"
Content-Type: application/json

{"timeSlotId":"<slot-id>","roomId":"<room-id-or-null>"}
```

Service NestJS mở transaction PostgreSQL, khóa phiên bản thời khóa biểu,
checks the ETag and editable lifecycle state, validates that the lesson, slot
and room remain in the same school/academic-period scope, and checks class,
teacher and room occupancy hard constraints before changing an assignment. A
successful edit increments `schedule_versions.revision` and returns the new
snapshot/ETag.

Nếu ETag cũ, API trả HTTP `409` với mã
`SCHEDULE_VERSION_CONCURRENT_UPDATE` and `currentSnapshot`. Hard constraint or
scope conflicts also return `409` with `currentSnapshot`; the transaction is
rolled back, so no partial write is visible. Missing `If-Match` returns HTTP
`428` và client phải làm mới bản chụp trước. Giao diện chỉ hỗ trợ workflow; phân
quyền và tính đúng thuộc máy chủ.

`GET /api/v1/schools/:schoolId/schedule-versions/:versionId/history` trả lịch sử
nhật ký chỉnh sửa thủ công. Một chỉnh sửa phân công thành công, không phải no-op, ghi
one `schedule_assignment` audit event in the same transaction as the assignment
và cập nhật revision; chỉnh sửa thất bại hoàn tác cả hai. Sự kiện ghi siêu dữ liệu an toàn
workflow metadata (actor, correlation ID, lesson/session, from/to slot and room,
and revision/ETag transition) without persisting the request body or sensitive
log client. Giao diện thời khóa biểu cũng hiển thị siêu dữ liệu chuyển/khóa/mở
khóa/hoàn tác trong phiên như hỗ trợ review; nhật ký máy chủ vẫn có thẩm quyền.
