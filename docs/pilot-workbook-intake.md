# Pilot workbook intake — P3.1-T01

Tài liệu này mô tả cách biến một workbook đã được trường cung cấp thành một
import batch có thể audit. Nó giữ ranh giới rõ giữa bằng chứng local/dev và
Pilot/Production approval.

## Artifact hiện có

- Workbook đang có trong workspace: `outputs/P1.3-T01/school-timetable-mvp-0.1.0-template-v1.0.xlsx`.
- Đây là template/fixture có ba dòng minh họa, không phải bằng chứng file do
  trường ký gửi. Không gọi nó là official pilot workbook nếu chưa có owner/source
  xác nhận.
- Evidence runtime: `outputs/P3.1-T01/pilot-import-evidence.json`.
- SHA-256 của artifact đã chạy ngày 2026-08-26:
  `b57bd0198c8a2e1196182e80978f7fb093dc3e2a0f370e93f65d083039986049`.

## Chạy lại trên workbook đã được phép

Sau khi đặt file chính thức vào workspace, chạy với path cụ thể:

```text
node scripts/run-pilot-workbook-evidence.mjs --input <path-to-approved-workbook.xlsx> --output outputs/P3.1-T01/pilot-import-evidence.json
```

Script không sửa workbook. Nó đọc sheet/header để tạo mapping, tính SHA-256,
gọi API preview, confirm bằng `importToken`, đọc audit và ghi report. Mặc định
script không ghi đè report; dùng `--force` chỉ khi chủ động tạo một import batch
mới và chấp nhận tác động dữ liệu local/dev.

## Quyết định chuẩn hóa v1

1. `LessonRequirements` là sheet dữ liệu duy nhất; các sheet hướng dẫn được giữ
   nguyên nhưng không import thành domain rows.
2. Header được map về `classId`, `subjectId`, `teacherId`, `requiredSessions`,
   `roomId`; API v1 thực hiện bước resolve bằng mã/tên master data trong school
   scope.
3. Không sửa ngầm cell gốc và không suy luận `academicPeriodId`; trường phải
   xác nhận join key ổn định trước khi dùng production.
4. Mọi sheet/dòng được phân loại `IMPORTED`, `WARNING` hoặc `ERROR`; anomaly log
   phải ghi code, vị trí và quyết định xử lý.

## Exit gate

`devTestComplete` chỉ được đánh dấu khi preview/confirm/audit, checksum, mapping
và anomaly log có bằng chứng. `pilotApproved` và `productionApproved` vẫn là
false cho tới khi có workbook owner, stakeholder mapping decision,
staging/UAT/security/restore evidence và sign-off phù hợp.
