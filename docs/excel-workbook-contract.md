# Excel Workbook Contract — MVP-0.1.0

**Contract version:** `1.0`  
**Template version:** `MVP-0.1.0`  
**Artifact:** `outputs/P0.2-T02/school-timetable-mvp-0.1.0-template-v1.0.xlsx`  
**Status:** Standard workbook definition for the current MVP import slice

## 1. Purpose and compatibility boundary

The workbook is the user-facing input contract for lesson requirements. The
current NestJS endpoint remains the source of import behavior:

```text
POST /api/v1/imports/preview?schoolId=<school-id>
POST /api/v1/imports/<import-batch-id>/confirm
```

`schoolId` is supplied by the API request, not inferred from workbook data.
The current contract version does not include `academicPeriodId`, shifts,
teacher availability, preferences or room assignment in the solver payload.
Those fields are explicit follow-ups and must not be silently added to a v1
workbook.

## 2. Workbook structure

The template contains four sheets. `LessonRequirements` must remain the first
sheet because the current importer reads the first worksheet as the data sheet.
The other sheets are human-readable contract guidance and are not imported as
domain rows.

| Sheet | Required | Purpose |
| --- | --- | --- |
| `LessonRequirements` | Yes; first sheet | One row per lesson requirement |
| `TemplateGuide` | Recommended | Version, usage rules and compatibility policy |
| `ErrorCatalog` | Recommended | Validation codes, locations and remediation |
| `Mapping` | Recommended | Excel → NestJS → PostgreSQL → Python traceability |

## 3. `LessonRequirements` columns

| Column | Canonical field | Type | Required | Rule |
| --- | --- | --- | --- | --- |
| `Mã lớp` | `classId` | Text | Yes | Must resolve in the selected school's class master data |
| `Mã môn` | `subjectId` | Text | Yes | Must resolve in the selected school's subject master data |
| `Mã giáo viên` | `teacherId` | Text | Yes | Must resolve in the selected school's teacher master data |
| `Số tiết` | `requiredSessions` | Positive integer | Yes | Integer greater than zero |
| `Mã phòng` | `roomId` | Text | No | If present, must resolve in the selected school's room master data |

Headers are matched case-insensitively with diacritics and repeated whitespace
normalized. Current aliases include:

- `Mã lớp`: `ma lop`, `class code`
- `Mã môn`: `ma mon`, `subject code`
- `Mã giáo viên`: `ma giao vien`, `ma gv`, `teacher code`
- `Số tiết`: `so tiet`, `required sessions`
- `Mã phòng`: `ma phong`, `room code`

## 4. Canonical mapping

| Workbook | NestJS normalized payload | PostgreSQL | Python solver |
| --- | --- | --- | --- |
| `Mã lớp` | `classId` | `classes.id` | `LessonRequirement.classId` |
| `Mã môn` | `subjectId` | `subjects.id` | `LessonRequirement.subjectId` |
| `Mã giáo viên` | `teacherId` | `teachers.id` | `LessonRequirement.teacherId` |
| `Số tiết` | `requiredSessions` | `lesson_requirements.required_sessions` | `LessonRequirement.requiredSessions` |
| `Mã phòng` | `roomId` | `rooms.id` during validation | Not present in solver v1 assignment |

Stable school-level source codes are preferred. Until dedicated code columns
exist in master data, the current importer can resolve an ID or normalized
master display name. A pilot must choose one stable convention before a
production template is published; display names are not a durable join key.

## 5. Validation and error location

The error catalog is part of the workbook and mirrors current API error codes:

| Code | Scope | Current location data |
| --- | --- | --- |
| `INVALID_FILE_TYPE` | Request | Filename/extension |
| `INVALID_TEMPLATE` | Header | First sheet, header row, missing column labels |
| `REQUIRED` | Data row | `row` plus canonical `field` |
| `INVALID_NUMBER` | Data row | `row` plus `Số tiết` |
| `UNKNOWN_REFERENCE` | Data row | `row` plus master-data field |
| `DUPLICATE` | Data row | `row` plus duplicate natural-key field |
| `IMPORT_HAS_ERRORS` | Confirm | Import batch |

For v1, the sheet is fixed to `LessonRequirements`; the API returns the row
number and field label for row errors. A future multi-sheet import must extend
the API issue shape with an explicit `sheet` and `column` before it is allowed
to change the first-sheet rule.

## 6. Natural key and duplicate policy

Within one workbook, the current duplicate check uses:

```text
schoolId + classId + subjectId + teacherId
```

The official cross-import upsert/idempotency policy is not yet implemented.
Until it is approved, a re-import must be treated as a new reviewable batch and
must not be assumed to update existing lesson requirements automatically.

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

## 8. Verification evidence

The generated template was inspected and rendered for all four sheets. The
first sheet contains the five-column lesson-requirement header and three valid
example rows. The `Số tiết` column has whole-number validation greater than
zero, and the error scan found no formula errors. Existing QC fixtures continue
to cover valid preview/confirm, invalid file/template, missing value, invalid
number and unknown master-data reference cases.

