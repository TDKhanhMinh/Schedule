# Optimization job control — P2.5-T02

## Contract

The API exposes `OPTIMIZATION-JOB-STATUS-1.0.0` from `GET /api/v1/optimization-jobs/:jobId`. PostgreSQL `optimization_runs` is the durable source of truth; BullMQ state is only used as a fallback while a legacy row is being located.

The response reports:

- `state`: `QUEUED`, `RUNNING`, a terminal solver result, `FAILED`, or `CANCELLED`.
- `progress.stage`: `QUEUED`, `SOLVING`, `PERSISTING`, `RETRY_WAITING`, `CANCELLED`, `COMPLETED`, or `FAILED`.
- `progress.heartbeatAt` and `progress.isStalled`: a running job is considered stalled after 15 seconds without heartbeat; a queued job after 60 seconds without heartbeat.
- `canCancel` and `canRetry`: server-derived controls, not UI permissions. The auth guard still requires the `SOLVE` permission and school scope.

## Cancel

`POST /api/v1/optimization-jobs/:jobId/cancel` accepts an optional `{ "reason": "..." }` body. A queued job is durably moved to `CANCELLED` and its BullMQ entry is removed when possible. A running job stores a cancellation request; the worker heartbeat observes it, aborts the Python child process, and records `CANCELLED`. Repeating the request is safe and returns the same durable state.

## Retry

`POST /api/v1/optimization-jobs/:jobId/retry` requires an `Idempotency-Key` header. Only `FAILED`, `CANCELLED`, and `UNKNOWN` runs can be retried. The server rebuilds the versioned solver envelope with a new job ID, preserves the original payload and provenance, links `retryOfRunId`, and enqueues at most one run per `(school_id, retry_key)`. Solver errors returned by the status API are redacted to safe messages; detailed process output remains an internal execution concern.

## UI behavior

The timetable screen polls the status API every two seconds, persists the tracked `jobId` in the URL, shows the durable stage/attempt/heartbeat, warns on stalled jobs, and disables controls according to the server response. The UI does not decide authorization, cancellation correctness, retries, or solver output validity.

## Validation boundary

Automated tests and local runtime checks cover the API/worker contract, heartbeat/cancel path, retry idempotency, and the frontend build. Staging, production, pilot, and stakeholder approval remain separate release gates until their evidence is attached.
