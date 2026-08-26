# Freeze scope và affected-neighborhood — P3.2-T01

**Contract:** `FREEZE-SCOPE-1.0.0`
**Ngày:** 2026-08-26
**Phạm vi:** V1.1 Web MVP; snapshot gốc là immutable input, không phải bảng tạm để ghi đè.

## Contract

`FreezeScope` luôn gắn với `schoolId`, `academicPeriodId`, `scheduleVersionId` và SHA-256 của snapshot gốc. Selector được phép theo:

- `LESSON:<lessonId>` — giữ nguyên mọi session của lesson.
- `TEACHER:<teacherId>` — giữ nguyên các assignment của giáo viên.
- `CLASS:<classId>` — giữ nguyên các assignment của lớp.
- `DAY:<1..7>` — giữ nguyên các assignment trong ngày.
- `ROOM:<roomId>` — giữ nguyên các assignment dùng phòng.

`FreezeChangeEvent` bắt buộc có cùng identity assignment cho `before` và `after` khi là `MOVE`; `ADD` chỉ có `after`, `REMOVE` chỉ có `before`. Event mang cùng baseline hash để ngăn áp thay đổi lên snapshot đã trôi phiên bản.

## Affected-neighborhood graph

Mỗi assignment trong baseline được nối với các resource node:

```text
assignment -> LESSON, TEACHER, CLASS, DAY, ROOM
```

Với một change event, graph lấy hợp các node của `before` và `after`. Mọi assignment baseline có ít nhất một node giao với tập này được đưa vào `affectedAssignmentIds`. Vì vậy, thay đổi một assignment có thể ảnh hưởng đến các lesson cùng giáo viên/lớp/ngày/phòng ở cả vị trí cũ và vị trí mới.

Graph không tự sửa snapshot. Kết quả được sort ổn định theo key để review, audit và tái chạy cho cùng input có cùng output. Caller phải lấy baseline đã được school/period scope; module không tự hợp nhất khác tenant hoặc khác academic period.

## Decision policy

1. Hash mismatch hoặc school/period/version mismatch → `allowed=false`.
2. Change chạm selector đã freeze → `allowed=false`, reason `FROZEN_RESOURCE`, trả selectors vi phạm và neighborhood để UI/API giải thích.
3. Không chạm selector và identity khớp → `allowed=true`; server vẫn phải chạy hard-constraint validation trước khi persist/publish.
4. Baseline chỉ đọc; thao tác edit phải tạo revision/snapshot mới qua lifecycle hiện có.

## Evidence và giới hạn

- Automated evidence: `backend/src/timetable/freeze-scope.spec.ts`.
- Contract schemas: `backend/contracts/schemas/freeze-scope.schema.json`, `freeze-change-event.schema.json`, `affected-neighborhood.schema.json`.
- Reproducible report: `outputs/P3.2-T01/freeze-scope-report.json`.
- Đây là contract/model và deterministic unit evidence; chưa phải staging/pilot/production approval, chưa thay thế database transaction hoặc authenticated browser evidence.
