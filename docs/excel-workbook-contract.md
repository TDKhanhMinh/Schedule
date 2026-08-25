# Excel Workbook Contract — MVP-0.1.0

**Contract version:** `1.0`  
**Template version:** `MVP-0.1.0`  
**Artifact:** `outputs/P1.3-T01/school-timetable-mvp-0.1.0-template-v1.0.xlsx`
**Status:** Published P1.3-T01 workbook for implementation review; pilot master-data approval remains open

## 1. Purpose and compatibility boundary

The workbook is the user-facing input contract for lesson requirements. The
current NestJS endpoint remains the source of import behavior:

```text
POST /api/v1/imports/preview?schoolId=<school-id>
POST /api/v1/imports/<import-batch-id>/confirm
```

`schoolId` is supplied by the API request, not inferred from workbook data.
Preview returns an opaque `importToken` and the workbook `fileChecksum`. Confirm
must send the same token in the standard `Idempotency-Key` header (the local
adapter also accepts `X-Import-Token`). The token is scoped to the selected
school and remains stable for retries of that previewed batch.
The current contract version does not include `academicPeriodId`, shifts,
teacher availability, preferences or room assignment in the solver payload.
Those fields are explicit follow-ups and must not be silently added to a v1
workbook.

## 2. Workbook structure

The template contains six sheets. `LessonRequirements` must remain the first
sheet because the current importer reads the first worksheet as the data sheet.
The other sheets are human-readable contract guidance and are not imported as
domain rows.

| Sheet                | Required                        | Purpose                                                       |
| -------------------- | ------------------------------- | ------------------------------------------------------------- |
| `LessonRequirements` | Yes; first sheet                | One row per lesson requirement                                |
| `TemplateGuide`      | Recommended                     | Version, usage rules and compatibility policy                 |
| `ErrorCatalog`       | Recommended                     | Validation codes, locations and remediation                   |
| `Mapping`            | Recommended                     | Excel → NestJS → PostgreSQL → Python traceability             |
| `CodeLists`          | Recommended                     | Illustrative THCS/THPT code examples and master-data guidance |
| `Changelog`          | Required for published versions | Version history and compatibility notes                       |

## 3. `LessonRequirements` columns

| Column         | Canonical field    | Type             | Required | Rule                                                               |
| -------------- | ------------------ | ---------------- | -------- | ------------------------------------------------------------------ |
| `Mã lớp`       | `classId`          | Text             | Yes      | Must resolve in the selected school's class master data            |
| `Mã môn`       | `subjectId`        | Text             | Yes      | Must resolve in the selected school's subject master data          |
| `Mã giáo viên` | `teacherId`        | Text             | Yes      | Must resolve in the selected school's teacher master data          |
| `Số tiết`      | `requiredSessions` | Positive integer | Yes      | Integer greater than zero                                          |
| `Mã phòng`     | `roomId`           | Text             | No       | If present, must resolve in the selected school's room master data |

Headers are matched case-insensitively with diacritics and repeated whitespace
normalized. Current aliases include:

- `Mã lớp`: `ma lop`, `class code`
- `Mã môn`: `ma mon`, `subject code`
- `Mã giáo viên`: `ma giao vien`, `ma gv`, `teacher code`
- `Số tiết`: `so tiet`, `required sessions`
- `Mã phòng`: `ma phong`, `room code`

## 4. Canonical mapping

| Workbook       | NestJS normalized payload | PostgreSQL                              | Python solver                        |
| -------------- | ------------------------- | --------------------------------------- | ------------------------------------ |
| `Mã lớp`       | `classId`                 | `classes.id`                            | `LessonRequirement.classId`          |
| `Mã môn`       | `subjectId`               | `subjects.id`                           | `LessonRequirement.subjectId`        |
| `Mã giáo viên` | `teacherId`               | `teachers.id`                           | `LessonRequirement.teacherId`        |
| `Số tiết`      | `requiredSessions`        | `lesson_requirements.required_sessions` | `LessonRequirement.requiredSessions` |
| `Mã phòng`     | `roomId`                  | `rooms.id` during validation            | Not present in solver v1 assignment  |

Stable school-level source codes are preferred. Until dedicated code columns
exist in master data, the current importer can resolve an ID or normalized
master display name. A pilot must choose one stable convention before a
production template is published; display names are not a durable join key.

## 5. Validation and error location

The error catalog is part of the workbook and mirrors current API error codes:

| Code                       | Scope    | Current location data                                              |
| -------------------------- | -------- | ------------------------------------------------------------------ |
| `INVALID_FILE_TYPE`        | Request  | Filename/extension                                                 |
| `INVALID_FILE_SIGNATURE`   | Request  | File bytes are not a ZIP/OOXML workbook                            |
| `FILE_TOO_LARGE`           | Request  | Multipart file exceeds the 5 MiB limit                             |
| `WORKBOOK_TOO_LARGE`       | Workbook | Compressed workbook exceeds the 5 MiB limit                        |
| `WORKBOOK_UNSAFE_CONTENT`  | Workbook | Macro, formula, hyperlink, external relationship or expansion risk |
| `WORKBOOK_LIMIT_EXCEEDED`  | Workbook | Sheet, row or column limit                                         |
| `WORKBOOK_PARSE_TIMEOUT`   | Workbook | Parse exceeds the five-second limit                                |
| `INVALID_TEMPLATE`         | Header   | First sheet, header row, missing column labels                     |
| `REQUIRED`                 | Data row | `sheet`, `row`, `column`, `cell` and canonical `field`             |
| `INVALID_NUMBER`           | Data row | `sheet`, `row`, `column`, `cell` and `Số tiết`                     |
| `UNKNOWN_REFERENCE`        | Data row | `sheet`, `row`, `column`, `cell` and master-data field             |
| `DUPLICATE`                | Data row | `sheet`, `row`, column range and duplicate natural-key field       |
| `IMPORT_HAS_ERRORS`        | Confirm  | Import batch                                                       |
| `IDEMPOTENCY_KEY_REQUIRED` | Confirm  | `Idempotency-Key`/import token header                              |
| `IDEMPOTENCY_KEY_MISMATCH` | Confirm  | Import batch already bound to another token                        |
| `IDEMPOTENCY_KEY_REUSED`   | Confirm  | School-scoped token already belongs to another batch               |

For v1, the first sheet is fixed to `LessonRequirements`, while the preview
summarizes every sheet and marks later guidance sheets as `IGNORED`. Each issue
has `severity` (`ERROR` or `WARNING`), a machine-readable `code`, a canonical
field, the source sheet, Excel column letter and cell reference. The preview
also returns `status` (`VALID`, `WARNING` or `INVALID`) and `normalized` values
for every row. The current five-column contract has no enum-valued field; an
`INVALID_ENUM` rule must be added only with an approved versioned contract
extension.

### 5.1 Preview response additions

`POST /api/v1/imports/preview` keeps the existing `errors`, `rows` and summary
fields and additionally returns:

- `columnMappings[]`: source Excel column, header, canonical field and requiredness.
- `sheetSummaries[]`: sheet name/index, import status, row/column counts and validation counts.
- `warningCount` and `warnings[]`: non-blocking issues; warnings do not disable Confirm.
- `rows[].status`, `rows[].normalized` and `rows[].warnings` alongside raw `values` and `errors`.
- `importToken` and `fileChecksum` for the confirm/idempotency and traceability boundary.

Preview persists only staging rows. `normalized` is the canonical NestJS shape
(`classId`, `subjectId`, `teacherId`, `requiredSessions`, optional `roomId`) and
does not change the Python solver contract.

### 5.2 Downloadable error report

For a staged batch, `GET /api/v1/imports/:batchId/error-report` returns an
`.xlsx` workbook scoped to that batch and school. The `ImportErrors` sheet has
the columns `Sheet`, `Row`, `Column`, `Cell`, `Field`, `Code`, `Severity`,
`Message` and `Original Value`. It is generated from the persisted validation
issues only, so it does not copy unrelated master data or workbook sheets.
The frontend exposes the same contract as `Tải báo cáo lỗi Excel` when the
preview contains errors. Empty reports are still valid workbooks with the
header row, allowing a caller to use one deterministic download flow.

## 6. Natural key and duplicate policy

Within one workbook, the current duplicate check uses:

```text
schoolId + classId + subjectId + teacherId
```

Confirm is atomic and idempotent by the school-scoped `Idempotency-Key`: the
batch is locked, all normalized requirements, batch status, confirmation result
and `IMPORT_CONFIRMED` audit record are committed in one PostgreSQL transaction.
A retry with the same key returns the persisted result and does not insert a
second set of domain rows. A different key for the same batch, or reusing a key
for another batch, is rejected. A re-import with a new preview token remains a
new reviewable batch and must not be assumed to update existing lesson
requirements automatically.

The import log stores the actor, template version, file checksum, row counts
and batch identifier. The staged rows retain their normalized payload and
validation errors so the file and any rejected rows can be traced without
copying the workbook bytes into audit metadata.

## 7. Version compatibility

- Non-breaking wording, example or formatting changes keep `contractVersion: 1.0`.
- Adding an optional sheet that the current importer ignores is documentation
  only and must not be treated as a new API capability.
- Adding/removing/renaming required columns, changing field meaning, changing
  master-data join rules or changing row semantics requires a new contract
  version and synchronized NestJS/Python/schema/test changes.
- Unsupported breaking versions must be rejected; adapters must not silently
  coerce an unknown workbook contract.
- The filename should follow:
  `school-timetable-mvp-<product-version>-template-v<contract-version>.xlsx`.

### P1.3-T01 publication

`MVP-0.1.0` template `v1.0` keeps `contractVersion: 1.0` and the five-column
`LessonRequirements` import contract unchanged. The published workbook adds
the `CodeLists` and `Changelog` sheets, a whole-number validation rule for
`Số tiết` in rows 2–200, and illustrative examples for both THCS and THPT.
The examples are not official school master data and must not be used as a
pilot workbook until the school confirms its stable codes and names.

Every later published workbook must append a row to `Changelog`. A breaking
change to the first-sheet columns, field meaning or join rules requires a new
contract version and synchronized NestJS/Python/schema/test changes.

## 8. Verification evidence

The P1.3-T01 generated template was inspected and rendered for all six sheets,
then re-imported after export. The first sheet contains the five-column
lesson-requirement header and three valid example rows. The `Số tiết` column
has whole-number validation from 1 to 50 for rows 2–200; `CodeLists` contains
illustrative THCS/THPT examples; `Changelog` records `v1.0`; and the error scan
found no formula errors. The read-only template contract check verifies sheet
order, headers, examples, validation metadata, version metadata and changelog.
The current NestJS importer also accepted this artifact in a local runtime
preview with three valid rows and then confirmed it, producing the import audit
event `IMPORT_CONFIRMED`. Existing QC fixtures continue to cover valid
preview/confirm, invalid file/template, missing value, invalid number and
unknown master-data reference cases.
