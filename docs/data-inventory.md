# Data Inventory — P0.2-T01

**Product:** School Timetable Optimizer  
**Scope:** V0.1 — THCS/THPT MVP  
**Inventory version:** `2026-08-24-draft-1`  
**Status:** Draft based on synthetic local demo data and Excel QC fixtures; official pilot workbook is still required to close this task.

## 1. Evidence boundary

This inventory is derived from:

- PostgreSQL migration `backend/database/migrations/001_initial_contract.sql` and `002_import_workflow.sql`.
- Synthetic seed `backend/database/seeds/001_demo_school.sql`.
- Generated Excel QC fixtures in `backend/solver/examples/import-fixtures/`.
- The current import contract implemented by `backend/src/imports/imports.service.ts`.

The fixture data is not a real school's workbook. It is safe for local testing and demonstrates the shape of the current contract, but it must not be used to infer the official school's calendar, code system, teaching load, preferences, privacy policy or approval decision.

## 2. Current sample profile

| Source | Scope | Observed count | Quality result |
| --- | --- | ---: | --- |
| Synthetic PostgreSQL seed | 1 school, 1 academic period | 1 | Valid local baseline; no official-school evidence |
| Classes | `7A`, `7B` | 2 | Unique within school |
| Teachers | 2 synthetic display names | 2 | No staff code column in DB |
| Subjects | Toán, Vật lý, Ngữ văn | 3 | Unique within school |
| Rooms | Phòng A, Phòng B | 2 | Unique within school |
| Time slots | 2 days × 2 periods | 4 | Synthetic; weekday mapping is not confirmed |
| Lesson requirements in seed | class–subject–teacher assignments | 4 | Positive session counts |
| `valid.xlsx` QC fixture | 5 columns, 3 rows | 3 | 3/3 valid; confirm passed locally |

Local PostgreSQL was also checked on 2026-08-24 after the QC runs: `1` school,
`1` academic period, `2` classes, `2` teachers, `3` subjects, `2` rooms,
`4` time slots, `10` lesson requirements, `14` import batches and `2` audit
records. The higher lesson/import counts include confirmed and previewed QC
artifacts; they are not representative-school counts and are not pilot evidence.

The valid fixture intentionally contains only three rows and therefore is a workflow fixture, not a representative school sample. It does not cover all seeded lesson requirements and does not include preferences, teacher availability, shifts or a full school calendar.

## 3. Excel import inventory

The current workbook contract accepts the first worksheet with the following columns. Header matching is case/diacritic/whitespace tolerant and supports the English aliases documented in the implementation.

| Workbook column | Canonical field | Type | Required | Join key / mapping | Validation currently implemented | Privacy classification |
| --- | --- | --- | --- | --- | --- | --- |
| `Mã lớp` | `classId` | text | Yes | `schoolId` + `classes.id` or normalized `classes.name` | Required; master-data lookup; duplicate natural-key check | Operational identifier; no direct student data |
| `Mã môn` | `subjectId` | text | Yes | `schoolId` + `subjects.id` or normalized `subjects.name` | Required; master-data lookup | Operational identifier |
| `Mã giáo viên` | `teacherId` | text | Yes | `schoolId` + `teachers.id` or normalized `teachers.display_name` | Required; master-data lookup | Staff reference; do not import phone, email or national ID |
| `Số tiết` | `requiredSessions` | positive integer | Yes | Part of lesson-requirement payload | Required; integer and `> 0` | Non-personal workload data |
| `Mã phòng` | `roomId` | text | No | `schoolId` + `rooms.id` or normalized `rooms.name` | Optional; if present, master-data lookup | Operational identifier |

### 3.1 Join-key decisions required from the pilot

The current seed uses UUIDs as IDs and the fixture uses those UUIDs as workbook values. A real school may use short codes such as `7A`, `GV001` or `P-A`. Before locking the official template, the pilot owner must confirm:

1. Whether each master entity has a stable source code distinct from its display name.
2. Whether codes are unique only within a school or also across the tenant.
3. Whether names may change during an academic period; IDs/codes should remain stable.
4. How the workbook identifies the school and academic period. The current API supplies `schoolId` separately; the workbook does not carry `academicPeriodId`.
5. Whether a row represents one lesson requirement with an aggregate `Số tiết`, or one row per teaching session.

## 4. Domain and persistence inventory

| Entity/table | Required business fields observed | Key relationships | Current state |
| --- | --- | --- | --- |
| `schools` | `id`, `name` | Root scope for all school data | Implemented |
| `academic_periods` | `id`, `school_id`, `name`, `starts_on`, `ends_on` | Belongs to `schools` | Persisted, not part of the import/solver v1 payload |
| `classes` | `id`, `school_id`, `name`, `grade` | Belongs to `schools` | Implemented; unique `(school_id, name)` |
| `teachers` | `id`, `school_id`, `display_name` | Belongs to `schools` | Implemented; no canonical source-code field |
| `subjects` | `id`, `school_id`, `name` | Belongs to `schools` | Implemented; unique `(school_id, name)` |
| `rooms` | `id`, `school_id`, `name` | Belongs to `schools` | Implemented; room capacity/type not present |
| `time_slots` | `id`, `school_id`, `day`, `period` | Belongs to `schools` | Implemented; shift/start/end and weekday mapping not present |
| `lesson_requirements` | class, subject, teacher, `required_sessions` | References class/subject/teacher | Implemented; no room, period or academic-period columns |
| `import_batches` | filename, template version, counts, actor, status | Stages one upload for a school | Implemented in migration 002 |
| `import_rows` | row number, normalized payload, validation errors | Belongs to `import_batches` | Implemented; raw workbook is not retained |
| `audit_logs` | actor, action, entity, metadata, timestamp | Records confirmed import | Implemented for `IMPORT_CONFIRMED` |

## 5. Data-quality findings from the supplied QC fixtures

| Fixture / case | Finding | System result | Inventory implication |
| --- | --- | --- | --- |
| `valid.xlsx` / TC-IMP-01 | Required columns and three valid rows | Preview 3/3; confirm succeeds | Baseline contract is executable locally |
| `invalid.pdf`, `invalid.docx` / TC-IMP-02 | Unsupported file type | Rejected with `INVALID_FILE_TYPE` | Extension and workbook parsing must both remain guarded |
| `missing-required-column.xlsx` / TC-IMP-03 | Missing `Mã giáo viên` | Rejected with `INVALID_TEMPLATE` | Template columns are mandatory and versioned |
| `missing-value.xlsx` / TC-VAL-01 | Blank `Mã lớp` | Row error; Confirm disabled | Required-field errors are row-addressable |
| `wrong-number.xlsx` / TC-VAL-02 | Text `hai` in `Số tiết` | Row error `INVALID_NUMBER` | Numeric type and positive range must remain explicit |
| `unknown-master-data.xlsx` / TC-VAL-03 | Unknown teacher and room references | Row errors `UNKNOWN_REFERENCE` | Master data must be loaded before import; pilot codes need mapping |
| Duplicate natural key in one workbook | Same class–subject–teacher appears twice | Second row receives `DUPLICATE` | Pilot must confirm whether duplicates are errors or intentional split allocations |

## 6. Gaps and risks to carry into P0.2-T02

1. **Official sample missing:** no real, anonymized school workbook is stored in this workspace. P0.2-T01 cannot be marked Done on synthetic fixtures alone.
2. **Stable codes are unresolved:** teachers have `display_name` but no source-code column; matching by display name is fragile.
3. **Academic period is out of band:** import and solver requests do not carry `academicPeriodId`, so the API must scope it explicitly before production use.
4. **Room mapping is only partial:** the importer validates `roomId`, but the current confirm path does not persist it into `lesson_requirements`; solver v1 also has no room assignment field or room constraint.
5. **Schedule dimensions are absent:** shifts, start/end times, weekday labels, teacher availability, preferences and teaching-load rules are not represented by the current five-column workbook.
6. **Cross-import duplicate policy is unresolved:** duplicate detection is currently within one workbook. The database does not yet define the official natural key for re-import/upsert behavior across batches.
7. **Privacy/retention must be confirmed:** official uploads should be anonymized, retain only required operational identifiers, avoid student/employee personal attributes, and define deletion/retention for staging rows and filenames.

## 7. Official pilot workbook intake checklist

Use this checklist when the pilot owner supplies the workbook. Do not paste personal data into task notes; attach only the approved anonymized file or record its filename, version and hash in the controlled evidence location.

- [ ] Workbook owner, school scope and academic period identified.
- [ ] Anonymization/privacy review approved; no unnecessary student or staff personal data.
- [ ] Sheets and columns inventoried; types, requiredness and examples recorded.
- [ ] Master-data codes and join keys confirmed for class, subject, teacher and room.
- [ ] Missing, duplicate, invalid and unknown-reference counts recorded.
- [ ] Calendar dimensions recorded: number of days, periods/day, shifts and weekday mapping.
- [ ] Teacher availability, preferences, fixed lessons and teaching-load fields identified.
- [ ] Import mapping reviewed against NestJS, PostgreSQL and Python contract.
- [ ] Pilot owner/approver signs off on the inventory and template assumptions.

## 8. Related implementation follow-ups

The inventory exposes contract changes that must be handled together when scheduled: add stable master-data codes, decide `academicPeriodId` scope, define room persistence/solver behavior, define re-import idempotency, and version any expanded workbook contract. These changes must update the glossary, JSON schemas, TypeScript/Python adapters, migrations and tests together.
