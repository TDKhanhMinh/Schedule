# Approval and publish permissions

The schedule lifecycle has two authorization layers:

- `AuthGuard` maps `APPROVED`, `PUBLISHED` and `ARCHIVED` transitions to the
  `PUBLISH` permission. `REVIEWER` and `ADMIN` have that permission; a
  `SCHEDULER` can prepare/review and lock a version but cannot approve or
  publish it.
- `ScheduleVersionService` repeats the policy check so a direct service call
  cannot bypass the HTTP boundary. Approval and publish also require a non-empty
  reason.

`APPROVED` and `PUBLISHED` transitions run in a PostgreSQL transaction. The
transaction locks the version, rechecks its lifecycle state, and writes an
`APPROVE` or `PUBLISH` audit event with actor, role, reason, correlation ID
and timestamp. A failed transition rolls back the state change and audit.

Before `PUBLISHED`, the service checks:

- expected lesson sessions equal materialized assignments;
- every assignment stays inside the school and academic-period scope;
- no class, teacher or room is assigned twice in the same slot.

The publish transaction also computes the canonical schedule snapshot hash.
PostgreSQL lifecycle/assignment triggers remain the final immutability boundary
for published and archived snapshots. The frontend displays role-aware controls
as a workflow aid only; it is not a security or correctness boundary.
