# Schedule version compare, clone and rollback

**Contract:** `SCHEDULE-VERSION-OPS-1.0.0`

The API treats a schedule version as an immutable snapshot once it is
`PUBLISHED` or `ARCHIVED`. Scenario operations never update that snapshot:

- `GET /api/v1/schools/:schoolId/schedule-versions/:versionId/compare/:againstVersionId`
  returns assignment-level `MOVE`, `ADD` and `REMOVE` entries plus summary counts
  and a score delta. The score is read from the source optimization run when
  available; otherwise the response explicitly returns `available: false` and
  `delta: null`.
- `POST /api/v1/schools/:schoolId/schedule-versions/:versionId/clone` creates a
  new `DRAFT` from the source snapshot. The optional body is
  `{"reason":"..."}`.
- `POST /api/v1/schools/:schoolId/schedule-versions/:versionId/rollback` creates
  a new `DRAFT` from `sourceVersionId`; the body requires
  `{"sourceVersionId":"...","reason":"..."}`. The path version is retained
  as the rollback target in audit metadata and is not mutated.

Clone and rollback run in one PostgreSQL transaction. The transaction locks the
academic period while allocating the next version number, copies assignments,
computes a canonical schedule snapshot hash and writes one audit event with the
actor, reason, source version, operation and correlation ID. A failure rolls back
the draft, copied assignments and audit event together. Server authorization and
solver hard constraints remain authoritative; the frontend only previews the
workflow.
