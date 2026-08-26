# Xuất thời khóa biểu — P2.4-T04

## Hợp đồng

`SCHEDULE-EXPORT-1.0.0` là hợp đồng siêu dữ liệu có phiên bản được nhúng trong
mỗi sổ làm việc Excel. Đầu ra do NestJS tạo từ một bản chụp bất biến
`schedule_version`; PostgreSQL vẫn là nguồn chuẩn.

Endpoint:

```text
GET /api/v1/schools/:schoolId/schedule-versions/:versionId/export.xlsx?view=all|class|teacher|room
```

Sổ làm việc `view=all` mặc định gồm:

- `Metadata & Summary`: school, academic period, version/status/revision,
  generated-at, actor/role, snapshot row count, required lesson sessions,
  reconciliation and hard-constraint check.
- `Theo lớp`, `Theo giáo viên`, `Theo phòng`: Unicode-safe, formatted and
  filterable worksheets with the same assignment snapshot, sorted by the
  selected resource and time slot.

`view=class|teacher|room` giữ trang siêu dữ liệu và chỉ trang phân phối được yêu
cầu. Tên tệp `Content-Disposition` gồm số phiên bản và trạng thái vòng đời
(`draft`, `published`, v.v.).

## Cổng máy chủ

- `ADMIN`, `SCHEDULER` and `REVIEWER` may export the selected version in their
  school scope.
- `VIEWER` may export only `PUBLISHED`; draft/review/locked export returns
  `SCHEDULE_EXPORT_DRAFT_FORBIDDEN`.
- The service rechecks snapshot assignment scope and class/teacher/room hard
  conflicts on the server before generating the workbook. UI buttons are only
  request controls and are not a security or correctness boundary.
- Requirement completeness is shown as metadata (`requiredLessonSessions` vs
  `snapshotAssignmentCount`); publish completeness remains the P2.4-T03
  server gate.

## Ranh giới kiểm chứng

Automated tests validate workbook sheet names, Unicode values, metadata,
snapshot reconciliation, role policy and hard-conflict rejection. Docker
runtime verification is local/dev evidence only; it does not establish
staging, production, pilot or stakeholder approval.
