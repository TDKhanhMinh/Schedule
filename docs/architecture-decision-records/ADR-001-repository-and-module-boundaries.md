# ADR-001 — Repository và module boundaries

**Status:** Proposed for implementation review  
**Date:** 2026-08-24  
**Scope:** V0.2 / MVP School Timetable Optimizer  
**Decision owners:** Product/engineering team

## Context

MVP cần giữ rõ ranh giới giữa giao diện web, API/core, dữ liệu canonical, điều
phối job và solver tối ưu. Nếu mỗi lớp tự diễn giải business rule hoặc tự làm
nguồn dữ liệu, NestJS và Python có thể cho kết quả khác nhau, frontend có thể
vượt authorization boundary và Redis có thể bị dùng nhầm như database.

Kiến trúc đã chốt là React + TypeScript + Vite; NestJS; PostgreSQL;
Redis + BullMQ; Python + OR-Tools CP-SAT. Repository cũng phải tách biệt thành
hai folder ứng dụng chính `frontend` và `backend`.

## Decision

Giữ một repository với hai application folder bắt buộc và các contract/docs
dùng chung:

```text
/
├─ frontend/                         React + TypeScript + Vite (presentation)
│  ├─ src/App.tsx                    workflow UI và API client boundary
│  ├─ src/styles.css                 presentation styles
│  └─ src/main.tsx                   browser entrypoint
├─ backend/                          NestJS API/core + Python solver
│  ├─ src/
│  │  ├─ auth/                       authentication and school-scope boundary
│  │  ├─ master-data/                canonical school/period/master-data boundary
│  │  ├─ health/                     liveness/readiness surface
│  │  ├─ imports/                    staging preview, validation, confirm, audit
│  │  ├─ rules/                      versioned rule profile boundary
│  │  ├─ timetable/                  schedule version/review/publish boundary
│  │  ├─ jobs/                       BullMQ enqueue/status boundary
│  │  ├─ common/http/                request ID and canonical error boundary
│  │  ├─ config/                     validated environment configuration
│  │  ├─ database/                   PostgreSQL pool/lifecycle boundary
│  │  ├─ worker/                     NestJS → Python process bridge
│  │  └─ contracts/                  TypeScript request/result adapter
│  ├─ contracts/schemas/             versioned JSON Schema source
│  ├─ database/migrations/            forward-only PostgreSQL schema
│  ├─ database/seeds/                 local synthetic seed only
│  └─ solver/
│     ├─ src/timetable_solver/       Pydantic adapter + CP-SAT model
│     ├─ examples/                    synthetic fixtures/benchmarks
│     ├─ scripts/                     benchmark harnesses
│     └─ tests/                       Python contract/solver regression
├─ docs/                             product, domain, rules, architecture, UX
├─ outputs/                          generated evidence artifacts, not canonical data
└─ docker-compose.yml                local PostgreSQL + Redis infrastructure
```

`frontend` chỉ gọi NestJS API. Browser không kết nối trực tiếp PostgreSQL,
Redis hoặc Python. `backend/src` là owner của authorization, validation,
domain orchestration, persistence và enqueue. Python chỉ nhận canonical solve
payload, enforce solver constraints và trả result/diagnostics; không tự quyết
định user/session permission.

## Ownership matrix

| Boundary | Owns | May read/call | Must not own |
| --- | --- | --- | --- |
| React frontend | User journey, form/table state, status polling, accessible feedback | NestJS HTTP API | Auth decision, canonical rule enforcement, direct DB/Redis/Python |
| NestJS API/core | Auth/school scope, input validation, import/domain orchestration, persistence, queue enqueue | PostgreSQL, Redis/BullMQ, Python bridge | CP-SAT model internals, UI-only validation as source of truth |
| PostgreSQL | Canonical school/period data, staging import, versions, audit and durable results | NestJS service account | Queue state, frontend session state, solver-only temporary state |
| Redis + BullMQ | Queue coordination, job state, retry/remove policy | NestJS producer/worker | Canonical business data, authorization, final audit source |
| NestJS worker bridge | Serialize the validated canonical payload and capture process result | Python solver process | Rewriting fields or silently coercing schema versions |
| Python + OR-Tools | Pydantic contract validation, hard constraints, feasibility/optimization, diagnostics | Canonical payload from bridge | Auth, user identity, import/publish decisions, DB writes |
| JSON Schema + adapters | Shared shape/version source and compatibility checks | TS/Pydantic implementations | Business policy not present in the versioned contract |

## Communication and data flows

### Synchronous browser flow

```text
React
  → NestJS HTTP controller
  → DTO/authorization/domain validation
  → PostgreSQL transaction or BullMQ enqueue
  ← canonical response/error with safe message
```

The current import flow is:

```text
POST /api/v1/imports/preview
  → staging import + row/field validation
POST /api/v1/imports/{importBatchId}/confirm
  → transactional domain insert + audit
GET /api/v1/imports/{importBatchId}/audit
  → audit evidence
```

### Asynchronous solve flow

```text
POST /api/v1/optimization-jobs
  → BullMQ queue `optimization`, job `optimization.solve`
  → NestJS worker bridge
  → Python `timetable_solver.main`
  → OR-Tools CP-SAT
  → result in BullMQ job return value
GET /api/v1/optimization-jobs/{jobId}
  ← state + result/diagnostics
```

The API and worker must pass the same canonical payload. A breaking change
requires a new `schemaVersion`, updates to JSON Schema, TypeScript adapter,
Pydantic adapter and regression tests; no silent field coercion is allowed.

## Contract governance

The v1 contract is `schemaVersion: "1.0"` and is represented in three layers:

1. `backend/contracts/schemas/*.schema.json` — reviewable shape boundary.
2. `backend/src/contracts/index.ts` and NestJS DTOs — TypeScript/API adapter.
3. `backend/solver/src/timetable_solver/contracts.py` — Pydantic/Python adapter.

The adapters may add transport/runtime validation, but they must not introduce
different business meaning. Canonical names come from
[`docs/domain-glossary.md`](../domain-glossary.md); rule provenance comes from
[`docs/legal-rule-register.md`](../legal-rule-register.md). A legal rule becomes
a solver constraint only after it has a version, source, applicability and
approval.

## Security boundaries

- NestJS is the only authorization boundary. Frontend checks are usability
  hints, not permission enforcement.
- Every school/academic-period scoped read/write must be authorized in NestJS
  before persistence or enqueue.
- Python receives only the minimum canonical solve payload; it does not receive
  session tokens and cannot approve, publish or export.
- PostgreSQL is the source of truth for durable audit; Redis job state is
  operational and must not be treated as an audit record.
- Diagnostics shown to users must be structured and redacted; secrets,
  credentials and unnecessary personal data must not enter logs or solver input.

## Explicit non-decisions

| Option | Decision | Reason |
| --- | --- | --- |
| FastAPI for Python | Not needed for MVP | Python is a process boundary behind NestJS/BullMQ; avoid a second HTTP API and duplicate auth/contract surface |
| Tauri/desktop | Out of scope | MVP is web-first; offline/desktop adds sync and distribution complexity |
| Direct frontend → PostgreSQL/Redis | Rejected | Violates authorization and data ownership boundaries |
| Python writes PostgreSQL directly | Rejected for current boundary | Persistence/audit remains NestJS/domain ownership; solver returns a result only |
| Separate contract per adapter | Rejected | Creates hidden NestJS/Python divergence; use the versioned JSON Schema and adapters |

## Consequences and follow-ups

Positive consequences:

- The required `frontend`/`backend` separation is explicit and reviewable.
- API authorization, data writes and audit have one owner.
- Solver runs can be reproduced from a versioned payload and benchmark report.
- Future modules can be added without moving CP-SAT rules into React or NestJS.

Follow-up work:

- Add full auth/school isolation and durable schedule-version persistence.
- Add domain modules for manual input, rule profiles, review/edit, approval,
  publish and export behind NestJS.
- Add bounded queue retry/observability and production backup/restore evidence.
- Version a weighted objective before enabling soft-score calculation.

## Validation evidence

- Repository layout inspected: `frontend` and `backend` are separate folders.
- Existing import and optimization endpoints match the synchronous/asynchronous
  flows above.
- NestJS module map, validated environment configuration, request ID middleware
  and canonical error envelope are implemented; see
  [`docs/api-error-envelope.md`](../api-error-envelope.md).
- `npm run typecheck` passes for both `@schedule/backend` and `@schedule/frontend`.
- Existing Python contract/benchmark tests and solver rubric report pass; this
  ADR introduces no API/schema change.

## References

- [`docs/architecture.md`](../architecture.md)
- [`docs/prd-mvp.md`](../prd-mvp.md)
- [`docs/solver-benchmark-rubric.md`](../solver-benchmark-rubric.md)
- [`backend/contracts/schemas`](../../backend/contracts/schemas)
