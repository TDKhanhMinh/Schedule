# Conflict catalog

**Contract:** `CONFLICT-CATALOG-1.0.0`

The catalog is the shared explanation contract for workbook import issues,
NestJS pre-solve responses and Python solver diagnostics. The source of truth
is `backend/src/contracts/conflict-catalog.ts`; the Python mirror is
`backend/solver/src/timetable_solver/conflict_catalog.py`. The JSON schema and
published example are in `backend/contracts/schemas/` and
`backend/contracts/examples/`.

Each diagnostic contains:

- `code`: stable machine-readable code;
- `severity`: `ERROR`, `WARNING` or `INFO`;
- `entity`: the bounded domain entity involved;
- `message`: Vietnamese user-facing explanation;
- `remediationHint`: Vietnamese next action;
- `entityReferences`: opaque lesson/resource/row references only.

`ImportIssue` includes the catalog version, entity and remediation hint. The
pre-solve report includes the same fields for every issue, and the solver
returns `diagnostics.catalogVersion` plus `diagnostics.conflictDetails` while
retaining the original `warnings[]` and `conflicts[]` strings for compatibility.

## Mapping by workflow boundary

| Boundary | Example code | UI/API behavior |
| --- | --- | --- |
| Excel preview | `REQUIRED`, `INVALID_NUMBER`, `UNKNOWN_REFERENCE`, `DUPLICATE` | Highlight the source row/cell, show message and remediation hint, keep Confirm disabled for `ERROR`. |
| API pre-solve | `TOTAL_SLOT_CAPACITY_EXCEEDED`, `CLASS_SLOT_CAPACITY_EXCEEDED`, `UNKNOWN_FIXED_SLOT`, `ROOM_CAPABILITY_UNSATISFIED` | Show the structured conflict list; do not enqueue a BullMQ job when `canSolve=false`. |
| Python solve | `NO_FEASIBLE_ASSIGNMENT`, `HARD_AVAILABILITY_CONFLICT`, `PREFERENCE_VIOLATED` | Show hard conflicts as blocking diagnostics and soft preference violations as warnings. |

The UI only renders this contract. Hard constraints remain enforced by the
NestJS preflight and Python solver; a hidden or modified UI cannot make an
invalid schedule valid. HTTP errors are normalized by the NestJS exception
filter, which removes stack/cause fields and returns only the catalog hint and
safe details.

Adding or changing a code requires a new catalog version and synchronized
NestJS/Python tests. Existing `code`, `message`, `warnings[]` and
`conflicts[]` fields remain available during the v1 compatibility window.
