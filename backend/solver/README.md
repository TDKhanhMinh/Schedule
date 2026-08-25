# Python solver

Worker boundary cho `optimization.solve`, dùng Python + OR-Tools CP-SAT. Contract request/result phải bám các JSON Schema trong [`../contracts/schemas`](../contracts/schemas) và `schemaVersion: "1.0"`. Rule provenance dùng contract độc lập `RuleSetSnapshot` phiên bản `RULE-SET-1.0.0`. Adapter snapshot-to-worker dùng `SOLVER-ADAPTER-1.0.0`, checksum SHA-256 và metadata seed/time-limit; xem [`docs/solver-adapter.md`](../../docs/solver-adapter.md).

## Local setup

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e .
```

## Contract runner

```powershell
Get-Content .\examples\minimal-request.json | schedule-solver
Get-Content .\examples\minimal-request.json | schedule-solver --random-seed 7
```

The runner writes a versioned `SolveJobResult` JSON document to stdout. It
accepts either the raw `SolveJobRequest` compatibility shape or a validated
`SOLVER-ADAPTER-1.0.0` envelope. Adapter runs preserve template version,
academic period, input checksum and effective random seed in result metadata.
The
result includes `status`, `objectiveValue` as the v1 score field,
`diagnostics`, assignments and `metadata` containing `solverVersion`,
`contractVersion`, the effective random seed, the effective time limit and,
when supplied, the `ruleSnapshotId`, `ruleSetVersion` and
`ruleSnapshotHash` used by the request.

`RuleSetSnapshot` carries the profile/register versions, source URL and
locator, effective date range, applicability scope, approval state, immutable
rule definitions and canonical SHA-256 hash. A pending, revoked or expired
rule is not effective. The v1 CP-SAT objective still enforces only its current
hard class/teacher/slot invariants; interpreting additional hard/soft rule
kinds is the follow-up P2.1-T02 solver task.

Invalid JSON or a payload that fails the Pydantic contract exits with code `2`
and writes a machine-readable error to stderr with `INVALID_JSON` or
`INVALID_SOLVE_REQUEST`.

Defaults are explicit: `options.timeLimitSeconds` is `10.0` seconds when the
request omits `options`, and the CLI/library random seed is `0`. The seed is a
runner control and is intentionally not part of the `schemaVersion: "1.0"`
request payload.

Runner này là seam kiểm thử deterministic cho solver. API đã có BullMQ enqueue boundary; queue consumer, kết nối worker production và ghi kết quả về PostgreSQL là phần việc tiếp theo, không được đánh dấu hoàn tất trong task scope/setup này.
