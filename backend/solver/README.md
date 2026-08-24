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
```

Runner này là seam kiểm thử deterministic cho solver. API đã có BullMQ enqueue boundary; queue consumer, kết nối worker production và ghi kết quả về PostgreSQL là phần việc tiếp theo, không được đánh dấu hoàn tất trong task scope/setup này.

