# Optimization job durability — P2.5-T01

The asynchronous boundary is versioned as `BULLMQ-OPTIMIZATION-1.0.0`.
NestJS remains the authorization and pre-solve gate; BullMQ/Redis coordinates
work; the standalone worker invokes Python; PostgreSQL is the durable source
for run state and result provenance.

## Lifecycle

1. `POST /api/v1/optimization-jobs` runs the server-side pre-solve checks.
2. The API creates one school-scoped `optimization_runs` row keyed by
   `(school_id, job_id)`, stores the canonical payload checksum and enqueues
   `optimization.solve` with three attempts and exponential backoff.
3. The worker marks the run `RUNNING`, invokes the Python process, and stores
   the result and canonical output checksum in one PostgreSQL transaction.
4. A retry returns to `QUEUED`; the third failure becomes `FAILED` with a
   bounded error payload. A completed run is idempotent: a redelivery with the
   same output checksum does not insert assignments again.
5. `GET /api/v1/optimization-jobs/:jobId` reads the school-scoped durable run
   when available; Redis is only used for transient queue fields.

`optimization_assignments` is populated only from UUID-backed domain rows. The
current solver v1 has no persisted room column, so room assignment remains
contract-level output and is not written to this table.

## Boundary and safety

Requests with a complete rule snapshot reference are wrapped in
`SOLVER-ADAPTER-1.0.0`; the worker passes that envelope to Python, which
validates the checksum before CP-SAT. Raw `SolveJobRequest` remains supported
for the compatibility window. Hard constraints are checked by NestJS and
Python; UI validation is not a correctness or security boundary.

## Local validation — 2026-08-25

- Backend: 23 Jest suites / 98 tests, typecheck, lint and build passed.
- Docker runtime: API `3011`, PostgreSQL `15432`, Redis `6379`, and separate
  Python worker were started successfully.
- Runtime success: `p25-t01-runtime-20260825-1627` returned `OPTIMAL`, persisted
  2 assignments, one payload checksum and one output checksum; a repeated POST
  returned the same run ID and did not duplicate assignments.
- Runtime failure: `p25-t01-runtime-20260825-1626` reached `FAILED` at attempt
  3 and retained the database error in `last_error`, proving the bounded retry
  policy. This was a deliberate local persistence fault and is not a staging or
  production incident.

These are local/dev evidence only. Staging, production, pilot and stakeholder
approval remain separate gates.
