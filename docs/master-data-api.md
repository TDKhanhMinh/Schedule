# Master-data API — P1.2-T03

The NestJS API exposes school-scoped CRUD for the master data needed by the
timetable workflow. The global API prefix is `/api/v1`.

## Routes

| Method | Route | Lifecycle |
| --- | --- | --- |
| `GET`, `POST` | `/schools` | List or create schools |
| `GET`, `PATCH`, `DELETE` | `/schools/:schoolId` | Read, edit, or archive a school |
| `GET`, `POST` | `/schools/:schoolId/teachers` | List or create teachers |
| `GET`, `PATCH`, `DELETE` | `/schools/:schoolId/teachers/:teacherId` | Read, edit, or archive a teacher |
| `GET`, `POST` | `/schools/:schoolId/classes` | List or create classes |
| `GET`, `PATCH`, `DELETE` | `/schools/:schoolId/classes/:classId` | Read, edit, or archive a class |
| `GET`, `POST` | `/schools/:schoolId/subjects` | List or create subjects |
| `GET`, `PATCH`, `DELETE` | `/schools/:schoolId/subjects/:subjectId` | Read, edit, or archive a subject |
| `GET`, `POST` | `/schools/:schoolId/rooms` | List or create rooms and capabilities |
| `GET`, `PATCH`, `DELETE` | `/schools/:schoolId/rooms/:roomId` | Read, edit, or archive a room |
| `GET`, `POST` | `/schools/:schoolId/academic-periods` | List or create periods |
| `GET`, `PATCH`, `DELETE` | `/schools/:schoolId/academic-periods/:periodId` | Read, edit, or archive a period |
| `GET`, `POST` | `/schools/:schoolId/academic-periods/:periodId/time-slots` | List or create slots |
| `PATCH`, `DELETE` | `/schools/:schoolId/academic-periods/:periodId/time-slots/:slotId` | Edit or delete a slot |
| `GET`, `POST` | `/schools/:schoolId/academic-periods/:periodId/lesson-requirements` | List or create teaching assignments / weekly demand |
| `GET`, `PATCH`, `DELETE` | `/schools/:schoolId/academic-periods/:periodId/lesson-requirements/:lessonId` | Read, edit, or archive a teaching assignment |

`DELETE` on a school or academic period is an archive transition. A time slot
is physically deleted only when it has no `optimization_assignments` or
`schedule_assignments` reference; referenced slots return `409
RESOURCE_REFERENCED`.

## Validation and scope

- School timezone must be a valid IANA timezone; the local default is
  `Asia/Ho_Chi_Minh`.
- Academic years use `YYYY-YYYY`, dates are ISO date strings, and `endsOn` must
  not precede `startsOn`.
- Time-slot `day` is `1..7`, `period` is at least `1`, and `endsAt` must be
  later than `startsAt` when both are supplied.
- Period and time-slot queries always include the parent school scope. A row
  from another school is returned as not found rather than leaked across the
  tenant boundary.
- Archived periods cannot receive new time slots.
- Teaching assignments must reference ACTIVE class, subject, teacher and, when
  supplied, room rows from the same school. `requiredSessions` is the current
  weekly period-demand value; the official norm remains a pilot/business rule
  gate and is not hard-coded into the solver contract.
- The active natural key for a teaching assignment is
  `(academicPeriodId, classId, subjectId, teacherId)`. Duplicate active demand
  is rejected with `409 DUPLICATE_LESSON_REQUIREMENT`.
- Room `roomType` and positive `capacity` are persisted as capability metadata;
  room collision constraints remain outside Python solver `schemaVersion: "1.0"`.

The API returns camelCase fields while PostgreSQL remains `snake_case`. The
CRUD boundary does not change the Python solver wire contract `schemaVersion:
"1.0"`; authorization/RBAC, pilot approval and production readiness remain
separate gates.
