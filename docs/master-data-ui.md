# Master data UI contract

P1.3-T05 adds the `/master-data` React route for direct maintenance of the canonical data used by import validation and the Python solver input.

## Scope

The screen provides create, edit, archive/delete, list and client-side filter for:

- school;
- academic period and its time slots;
- teachers, classes, subjects and rooms;
- lesson requirements (the class/subject/teacher/room assignment input).

The active school is `VITE_DEMO_SCHOOL_ID` (fallback: the local demo school). Time slots and lesson requirements are scoped to the selected academic period.

## API boundary

The UI reuses the existing NestJS endpoints under `/api/v1/schools`. Payload names are unchanged and match `backend/src/master-data/master-data.dto.ts`:

| Entity             | Create/update fields                                              | API scope                                                           |
| ------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| School             | `code`, `name`, `timezone`                                        | `/schools`                                                          |
| Academic period    | `academicYear`, `termCode`, `name`, `startsOn`, `endsOn`          | `/schools/:schoolId/academic-periods`                               |
| Time slot          | `day`, `period`, `shiftCode`, `startsAt`, `endsAt`                | `/schools/:schoolId/academic-periods/:periodId/time-slots`          |
| Teacher            | `code`, `displayName`                                             | `/schools/:schoolId/teachers`                                       |
| Class              | `code`, `name`, `grade`                                           | `/schools/:schoolId/classes`                                        |
| Subject            | `code`, `name`                                                    | `/schools/:schoolId/subjects`                                       |
| Room               | `code`, `name`, `roomType`, `capacity`                            | `/schools/:schoolId/rooms`                                          |
| Lesson requirement | `classId`, `subjectId`, `teacherId`, `roomId`, `requiredSessions` | `/schools/:schoolId/academic-periods/:periodId/lesson-requirements` |

The backend remains the source of truth for authorization, school scope, uniqueness, reference integrity, lifecycle status and solver-facing persistence. The UI does not copy Python/OR-Tools rules.

## Permission and error behavior

`ADMIN` and `SCHEDULER` see write controls; `REVIEWER` and `VIEWER` remain read-only. The NestJS `AuthGuard` still enforces `WRITE` and returns the authoritative error when the UI role is not allowed. Validation arrays and business errors are shown in the form alert, with field-level highlighting when a server message identifies a field.

The “Kiểm tra dữ liệu” action is intentionally basic: it checks required values, grade range, positive numeric values and time/date ordering for the currently filtered list. It is a convenience check, not a replacement for NestJS validation.

After every successful mutation the UI reloads the affected lists from the API. This makes the next Excel preview and solver request consume the same PostgreSQL-backed master data.

## Validation evidence

- Frontend typecheck, lint, production build and smoke test must pass.
- Backend master-data unit tests and the existing root CI checks must pass.
- Local HTTP runtime must cover read, create/update/delete, permission denial and a server validation error before this task can be accepted.
- Browser visual/E2E, real pilot data and stakeholder approval remain separate gates.
