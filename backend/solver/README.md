# Python solver

Worker boundary cho `optimization.solve`, dùng Python + OR-Tools CP-SAT. Contract request/result phải bám các JSON Schema trong [`../contracts/schemas`](../contracts/schemas) và `schemaVersion: "1.0"`.

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

The runner writes a versioned `SolveJobResult` JSON document to stdout. The
result includes `status`, `objectiveValue` as the v1 score field,
`diagnostics`, assignments and `metadata` containing `solverVersion`,
`contractVersion`, the effective random seed and the effective time limit.

Invalid JSON or a payload that fails the Pydantic contract exits with code `2`
and writes a machine-readable error to stderr with `INVALID_JSON` or
`INVALID_SOLVE_REQUEST`.

Defaults are explicit: `options.timeLimitSeconds` is `10.0` seconds when the
request omits `options`, and the CLI/library random seed is `0`. The seed is a
runner control and is intentionally not part of the `schemaVersion: "1.0"`
request payload.

Runner này là seam kiểm thử deterministic cho solver. API đã có BullMQ enqueue boundary; queue consumer, kết nối worker production và ghi kết quả về PostgreSQL là phần việc tiếp theo, không được đánh dấu hoàn tất trong task scope/setup này.
