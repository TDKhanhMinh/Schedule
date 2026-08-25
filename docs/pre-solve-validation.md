# Pre-solve validation

**Contract:** `PRE-SOLVE-1.0.0`

Every issue also carries `catalogVersion: CONFLICT-CATALOG-1.0.0`, a stable
`entity`, a Vietnamese `remediationHint` and bounded `entityReferences`. See
[`conflict-catalog.md`](./conflict-catalog.md) for the import/API/solver
mapping.

Pre-solve validation is a necessary-condition gate owned by the API and
repeated by the Python worker. It prevents a job with a provably impossible
dataset from consuming CP-SAT time; CP-SAT remains the final authority for the
complete hard-constraint model.

## API

```http
POST /api/v1/optimization-jobs/preflight
```

The body is the same validated `SolveJobRequest` used by
`POST /api/v1/optimization-jobs`. A failed preflight returns a structured
report with `canSolve: false`; the enqueue endpoint responds with
`PRESOLVE_FAILED` and does not create a BullMQ job.

## Checks

- `TOTAL_SLOT_CAPACITY_EXCEEDED`: total required sessions exceed the number
  of available slots.
- `LESSON_SLOT_CAPACITY_EXCEEDED`: one lesson cannot fit its required sessions
  in its fixed/allowed slots after hard teacher/class availability filtering.
- `CLASS_SLOT_CAPACITY_EXCEEDED` and `TEACHER_SLOT_CAPACITY_EXCEEDED`:
  aggregate demand exceeds the resource's candidate-slot capacity.
- `UNKNOWN_ALLOWED_SLOT` and `UNKNOWN_FIXED_SLOT`: the request references a
  slot outside `timeSlots`.
- `FIXED_RESOURCE_CONFLICT`: two fixed lessons use the same class or teacher
  at one slot.
- `ROOM_CAPABILITY_UNSATISFIED`: a lesson's required capabilities have no
  eligible room in the optional `rooms` projection.

Class unavailable slots use `classUnavailableSlotIds`. Teacher unavailable
slots use the approved `TEACHER-AVAILABILITY-1.0.0` projection. Room checks are
necessary-condition checks only; room assignment and full room CP-SAT
constraints remain a later solver task.

The result diagnostics include the pre-solve report. A failed Python preflight
returns `INFEASIBLE`, no assignments, issue codes and the same report without
constructing the CP-SAT model.
