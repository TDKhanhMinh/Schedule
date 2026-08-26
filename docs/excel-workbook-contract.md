# Hợp đồng sổ làm việc Excel — MVP-0.1.0

**Phiên bản hợp đồng:** `1.0`
**Phiên bản mẫu:** `MVP-0.1.0`
**Artifact:** `outputs/P1.3-T01/school-timetable-mvp-0.1.0-template-v1.0.xlsx`
**Trạng thái:** Sổ làm việc P1.3-T01 đã công bố để review triển khai; phê duyệt dữ liệu danh mục thí điểm còn mở

## 1. Mục đích và ranh giới tương thích

Sổ làm việc là hợp đồng đầu vào dành cho người dùng đối với yêu cầu tiết học.
Endpoint NestJS hiện tại vẫn là nguồn hành vi nhập dữ liệu:

```text
POST /api/v1/imports/preview?schoolId=<school-id>
POST /api/v1/imports/<import-batch-id>/confirm
```

`schoolId` được cung cấp bởi request API, không suy ra từ dữ liệu sổ làm việc.
Xem trước trả `importToken` không diễn giải và `fileChecksum` của sổ làm việc.
Xác nhận phải gửi cùng token trong header `Idempotency-Key` chuẩn (bộ điều hợp
cục bộ cũng nhận `X-Import-Token`). Token thuộc phạm vi trường đã chọn và giữ
ổn định khi thử lại lô đã xem trước. Phiên bản hợp đồng hiện tại không gồm
`academicPeriodId`, buổi, lịch sẵn sàng giáo viên, ưu tiên hoặc phân phòng trong
payload bộ tối ưu. Các trường đó là công việc tiếp theo rõ ràng và không được âm
thầm thêm vào sổ làm việc v1.

## 2. Cấu trúc sổ làm việc

Mẫu gồm sáu trang tính. `LessonRequirements` phải vẫn là trang đầu vì bộ nhập
hiện tại đọc trang tính đầu làm trang dữ liệu. Các trang còn lại là hướng dẫn hợp
đồng dành cho người đọc và không được nhập thành dòng nghiệp vụ.

| Trang tính           | Bắt buộc                          | Mục đích                                             |
| -------------------- | --------------------------------- | ---------------------------------------------------- |
| `LessonRequirements` | Có; trang đầu                     | Mỗi dòng là một yêu cầu tiết học                     |
| `TemplateGuide`      | Khuyến nghị                       | Phiên bản, quy tắc sử dụng và chính sách tương thích |
| `ErrorCatalog`       | Khuyến nghị                       | Mã kiểm tra, vị trí và hướng xử lý                   |
| `Mapping`            | Khuyến nghị                       | Truy xuất Excel → NestJS → PostgreSQL → Python       |
| `CodeLists`          | Khuyến nghị                       | Ví dụ mã THCS/THPT và hướng dẫn dữ liệu danh mục     |
| `Changelog`          | Bắt buộc với phiên bản đã công bố | Lịch sử phiên bản và ghi chú tương thích             |

## 3. Các cột `LessonRequirements`

| Cột            | Trường chuẩn       | Kiểu            | Bắt buộc | Quy tắc                                                                |
| -------------- | ------------------ | --------------- | -------- | ---------------------------------------------------------------------- |
| `Mã lớp`       | `classId`          | Văn bản         | Có       | Phải phân giải trong dữ liệu danh mục lớp của trường đã chọn           |
| `Mã môn`       | `subjectId`        | Văn bản         | Có       | Phải phân giải trong dữ liệu danh mục môn của trường đã chọn           |
| `Mã giáo viên` | `teacherId`        | Văn bản         | Có       | Phải phân giải trong dữ liệu danh mục giáo viên của trường đã chọn     |
| `Số tiết`      | `requiredSessions` | Số nguyên dương | Có       | Số nguyên lớn hơn không                                                |
| `Mã phòng`     | `roomId`           | Văn bản         | Không    | Nếu có, phải phân giải trong dữ liệu danh mục phòng của trường đã chọn |

Tiêu đề được đối chiếu không phân biệt hoa thường, có chuẩn hóa dấu và khoảng
trắng lặp. Bí danh hiện tại gồm:

- `Mã lớp`: `ma lop`, `class code`
- `Mã môn`: `ma mon`, `subject code`
- `Mã giáo viên`: `ma giao vien`, `ma gv`, `teacher code`
- `Số tiết`: `so tiet`, `required sessions`
- `Mã phòng`: `ma phong`, `room code`

## 4. Ánh xạ chuẩn

| Sổ làm việc    | Payload chuẩn hóa NestJS | PostgreSQL                              | Bộ tối ưu Python                     |
| -------------- | ------------------------ | --------------------------------------- | ------------------------------------ |
| `Mã lớp`       | `classId`                | `classes.id`                            | `LessonRequirement.classId`          |
| `Mã môn`       | `subjectId`              | `subjects.id`                           | `LessonRequirement.subjectId`        |
| `Mã giáo viên` | `teacherId`              | `teachers.id`                           | `LessonRequirement.teacherId`        |
| `Số tiết`      | `requiredSessions`       | `lesson_requirements.required_sessions` | `LessonRequirement.requiredSessions` |
| `Mã phòng`     | `roomId`                 | `rooms.id` during validation            | Not present in solver v1 assignment  |

Ưu tiên mã nguồn ổn định cấp trường. Cho đến khi dữ liệu danh mục có cột mã riêng,
bộ nhập hiện tại có thể phân giải ID hoặc tên hiển thị danh mục đã chuẩn hóa. Thí
điểm phải chọn một quy ước ổn định trước khi công bố mẫu production; tên hiển thị
không phải khóa nối bền vững.

## 5. Kiểm tra và vị trí lỗi

Danh mục lỗi là một phần của sổ làm việc và phản ánh các mã lỗi API hiện tại:

| Mã                         | Phạm vi      | Dữ liệu vị trí hiện tại                                          |
| -------------------------- | ------------ | ---------------------------------------------------------------- |
| `INVALID_FILE_TYPE`        | Request      | Tên/phần mở rộng tệp                                             |
| `INVALID_FILE_SIGNATURE`   | Request      | Byte tệp không phải sổ làm việc ZIP/OOXML                        |
| `FILE_TOO_LARGE`           | Request      | Tệp multipart vượt giới hạn 5 MiB                                |
| `WORKBOOK_TOO_LARGE`       | Sổ làm việc  | Sổ làm việc nén vượt giới hạn 5 MiB                              |
| `WORKBOOK_UNSAFE_CONTENT`  | Sổ làm việc  | Rủi ro macro, công thức, hyperlink, liên kết ngoài hoặc giải nén |
| `WORKBOOK_LIMIT_EXCEEDED`  | Sổ làm việc  | Vượt giới hạn trang tính, dòng hoặc cột                          |
| `WORKBOOK_PARSE_TIMEOUT`   | Sổ làm việc  | Đọc vượt giới hạn năm giây                                       |
| `INVALID_TEMPLATE`         | Tiêu đề      | Trang đầu, dòng tiêu đề, nhãn cột thiếu                          |
| `REQUIRED`                 | Dòng dữ liệu | `sheet`, `row`, `column`, `cell` và `field` chuẩn                |
| `INVALID_NUMBER`           | Dòng dữ liệu | `sheet`, `row`, `column`, `cell` và `Số tiết`                    |
| `UNKNOWN_REFERENCE`        | Dòng dữ liệu | `sheet`, `row`, `column`, `cell` và trường danh mục              |
| `DUPLICATE`                | Dòng dữ liệu | `sheet`, `row`, phạm vi cột và trường khóa tự nhiên trùng        |
| `IMPORT_HAS_ERRORS`        | Xác nhận     | Lô nhập                                                          |
| `IDEMPOTENCY_KEY_REQUIRED` | Xác nhận     | Header `Idempotency-Key`/mã lô nhập                              |
| `IDEMPOTENCY_KEY_MISMATCH` | Xác nhận     | Lô nhập đã gắn với token khác                                    |
| `IDEMPOTENCY_KEY_REUSED`   | Xác nhận     | Token theo phạm vi trường đã thuộc lô khác                       |

Ở v1, trang đầu cố định là `LessonRequirements`; xem trước tóm tắt mọi trang
và đánh dấu các trang hướng dẫn phía sau là `IGNORED`. Mỗi vấn đề có `severity`
(`ERROR` hoặc `WARNING`), `code` máy đọc được, `catalogVersion: CONFLICT-CATALOG-1.0.0`,
`remediationHint` tiếng Việt, map `entityReferences` có giới hạn, trường chuẩn,
trang nguồn, chữ cái cột Excel và tham chiếu ô. Xem trước cũng trả `status`
(`VALID`, `WARNING` hoặc `INVALID`) và giá trị `normalized` cho mỗi dòng. Hợp
đồng năm cột hiện tại không có trường enum; chỉ thêm quy tắc `INVALID_ENUM` khi
có mở rộng hợp đồng có phiên bản đã phê duyệt.

### 5.1 Bổ sung trong phản hồi xem trước

`POST /api/v1/imports/preview` giữ các trường `errors`, `rows` và tóm tắt hiện
có, đồng thời trả thêm:

- `columnMappings[]`: cột Excel nguồn, tiêu đề, trường chuẩn và tính bắt buộc.
- `sheetSummaries[]`: tên/chỉ số trang tính, trạng thái nhập, số dòng/cột và số lượng kiểm tra.
- `warningCount` và `warnings[]`: vấn đề không chặn; cảnh báo không vô hiệu hóa xác nhận.
- `rows[].status`, `rows[].normalized` và `rows[].warnings` cùng `values` và `errors` thô.
- `importToken` và `fileChecksum` cho ranh giới xác nhận/idempotency và truy xuất.

Xem trước chỉ lưu các dòng tạm. `normalized` là hình dạng chuẩn NestJS
(`classId`, `subjectId`, `teacherId`, `requiredSessions`, tùy chọn `roomId`) và
không thay đổi hợp đồng bộ tối ưu Python.

### 5.2 Báo cáo lỗi có thể tải xuống

Với một lô tạm, `GET /api/v1/imports/:batchId/error-report` trả sổ làm việc
`.xlsx` theo phạm vi lô và trường đó. Trang `ImportErrors` có các cột `Sheet`,
`Row`, `Column`, `Cell`, `Field`, `Code`, `Severity`, `Message` và `Original Value`.
Báo cáo chỉ được tạo từ vấn đề kiểm tra đã lưu, không sao chép dữ liệu danh mục
hoặc trang tính không liên quan. Giao diện cung cấp cùng hợp đồng qua nút
`Tải báo cáo lỗi Excel` khi xem trước có lỗi. Báo cáo rỗng vẫn là sổ làm việc hợp
lệ có dòng tiêu đề, cho phép bên gọi dùng một luồng tải xác định.

## 6. Khóa tự nhiên và chính sách trùng

Trong một sổ làm việc, kiểm tra trùng hiện tại dùng:

```text
schoolId + classId + subjectId + teacherId
```

Xác nhận là nguyên tử và idempotent theo `Idempotency-Key` phạm vi trường: lô
được khóa, mọi yêu cầu đã chuẩn hóa, trạng thái lô, kết quả xác nhận và bản ghi
nhật ký `IMPORT_CONFIRMED` được commit trong một transaction PostgreSQL. Thử lại
với cùng khóa trả kết quả đã lưu và không chèn bộ dòng nghiệp vụ thứ hai. Khóa
khác cho cùng lô hoặc dùng lại khóa cho lô khác sẽ bị từ chối. Nhập lại với token
xem trước mới vẫn là lô mới cần review và không được mặc định là tự cập nhật yêu
cầu tiết học hiện có.

Nhật ký nhập lưu người thực hiện, phiên bản mẫu, mã băm tệp, số lượng dòng
and batch identifier. The staged rows retain their normalized payload and
validation errors so the file and any rejected rows can be traced without
copying the workbook bytes into audit metadata.

## 7. Tương thích phiên bản

- Thay đổi không phá vỡ về câu chữ, ví dụ hoặc định dạng giữ `contractVersion: 1.0`.
- Thêm trang tùy chọn mà bộ nhập hiện tại bỏ qua chỉ là tài liệu và không được coi
  là năng lực API mới.
- Thêm/xóa/đổi tên cột bắt buộc, đổi ý nghĩa trường, đổi quy tắc nối dữ liệu danh
  mục hoặc đổi ngữ nghĩa dòng yêu cầu phiên bản hợp đồng mới cùng thay đổi NestJS/Python/schema/test đồng bộ.
- Phiên bản phá vỡ không hỗ trợ phải bị từ chối; bộ điều hợp không được âm thầm
  ép kiểu hợp đồng sổ làm việc không xác định.
- Tên tệp nên theo dạng:
  `school-timetable-mvp-<product-version>-template-v<contract-version>.xlsx`.

### P1.3-T01 publication

`MVP-0.1.0` template `v1.0` keeps `contractVersion: 1.0` and the five-column
`LessonRequirements` import contract unchanged. The published workbook adds
the `CodeLists` and `Changelog` sheets, a whole-number validation rule for
`Số tiết` in rows 2–200, and illustrative examples for both THCS and THPT.
Các ví dụ không phải dữ liệu danh mục chính thức của trường và không được dùng làm
pilot workbook until the school confirms its stable codes and names.

Mỗi sổ làm việc công bố sau này phải thêm một dòng vào `Changelog`. Thay đổi phá vỡ
change to the first-sheet columns, field meaning or join rules requires a new
contract version and synchronized NestJS/Python/schema/test changes.

## 8. Verification evidence

Mẫu được tạo ở P1.3-T01 đã được kiểm tra và render cho cả sáu trang tính,
then re-imported after export. The first sheet contains the five-column
lesson-requirement header and three valid example rows. The `Số tiết` column
has whole-number validation from 1 to 50 for rows 2–200; `CodeLists` contains
illustrative THCS/THPT examples; `Changelog` records `v1.0`; and the error scan
found no formula errors. The read-only template contract check verifies sheet
order, headers, examples, validation metadata, version metadata and changelog.
Bộ nhập NestJS hiện tại cũng đã nhận artifact này trong thời gian chạy cục bộ
preview with three valid rows and then confirmed it, producing the import audit
event `IMPORT_CONFIRMED`. Existing QC fixtures continue to cover valid
preview/confirm, invalid file/template, missing value, invalid number and
unknown master-data reference cases.
