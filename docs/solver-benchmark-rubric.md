# P0.2-T05 — Rubric chất lượng và hiệu năng solver

**Rubric:** `1.0` · **Benchmark:** `1.0` · **Contract:** `schemaVersion: 1.0`  
**Scope:** local regression cho ba dataset benchmark THCS/THPT MVP  
**Boundary:** đây là ngưỡng kỹ thuật có thể tái lập, chưa phải SLO pilot hoặc production.

## 1. Nguyên tắc pass/fail

Một dataset chỉ đạt khi tất cả gate dưới đây đạt trên mọi seed trong `{0, 1, 7}`.
Seed là tham số của harness ở ngoài request contract; API/Python payload vẫn giữ
`schemaVersion: 1.0`.

| Gate | Feasible dataset | Infeasible dataset |
| --- | --- | --- |
| Status | `OPTIMAL` bắt buộc cho small/medium; `FEASIBLE` chỉ được chấp nhận khi rubric tương lai cho phép | `INFEASIBLE` |
| Assignment count | Bằng `manifest.expectedAssignmentCount` | `0` |
| Hard constraints | `0` hard conflicts | Có diagnostic hard-conflict đúng manifest |
| Explainability | Không có conflict ẩn | Diagnostic chứa `expectedConflictContains` |
| Seed stability | Status, assignment count và hard-conflict count giống nhau | Tương tự |
| Runtime | Không vượt ngưỡng dataset | Không vượt ngưỡng dataset |
| Optimality gap | `0%` khi benchmark đạt `OPTIMAL`; baseline ngoài solver vẫn chưa có | `null` |

Exact assignment layout không phải điều kiện stability: nhiều nghiệm tương đương
có thể hợp lệ. Regression so sánh status, coverage và hard diagnostics trước; chỉ
so sánh layout khi product contract yêu cầu canonical tie-break.

## 2. Ngưỡng benchmark v1

Ngưỡng runtime là local reference để bắt hồi quy, không được diễn giải thành
cam kết production. Mỗi report phải ghi OS, Python, OR-Tools, processor, seed và
runtime từng lần chạy.

| Dataset | Expected | Assignments | Runtime limit | Explainability |
| --- | --- | ---: | ---: | --- |
| `small-feasible` | `OPTIMAL` | 5 | ≤ 5s | 0 hard conflicts |
| `medium-near-realistic` | `OPTIMAL` | 40 | ≤ 30s | 0 hard conflicts |
| `infeasible-teacher-conflict` | `INFEASIBLE` | 0 | ≤ 5s | Có diagnostic teacher/class hard conflict |

Reference run ngày 2026-08-25 đạt `3/3` dataset trên cả ba seed với
`SOLVER-OBJECTIVE-1.0.0`. Max runtime quan sát được trong report: small
`19.547ms`, medium `15885.768ms`, infeasible `0.190ms`. Các con số này là
evidence của lần chạy đó, không thay thế việc chạy lại khi đổi code, máy hoặc
solver version.

## 3. Soft score groups

Tổng trọng số thiết kế là 100%. Benchmark dùng objective versioned và ghi
`diagnostics.objectiveBreakdown` cùng `softScore` (weightedTotal, thấp hơn là
tốt hơn); hard feasibility vẫn là gate độc lập.

| Nhóm | Trọng số | Ý nghĩa |
| --- | ---: | --- |
| `teacherGap` | 20% | Khoảng trống giữa các tiết cùng giáo viên trong ngày |
| `compactness` | 20% | Khoảng trống giữa các tiết cùng lớp trong ngày |
| `dayDistribution` | 20% | Độ lệch phân bố tải lớp giữa các ngày |
| `undesirableSlots` | 15% | Soft availability rule khớp slot |
| `preferredDays` | 10% | Soft rule thể hiện ngày ưu tiên |
| `fairness` | 15% | Độ lệch phân bố tải giáo viên giữa các ngày |

## 4. Cách chạy và lưu report

Từ repository root:

```powershell
$solverSource = (Resolve-Path .\backend\solver\src).Path
$oldPythonPath = $env:PYTHONPATH
try {
  $env:PYTHONPATH = $solverSource
  & .\backend\solver\.venv\Scripts\python.exe `
    .\backend\solver\scripts\run_benchmark_rubric.py `
    --output .\outputs\P0.2-T05\solver-benchmark-report.json
} finally {
  if ($null -eq $oldPythonPath) { Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue }
  else { $env:PYTHONPATH = $oldPythonPath }
}
```

Report có `reportVersion`, rubric/benchmark/contract version, input SHA-256,
expected values, từng seed run, runtime, diagnostics, objective gap, soft score
và summary `passedCount/allPassed`. Report lần chạy hiện tại nằm tại
`outputs/P0.2-T05/solver-benchmark-report.json`.

Regression test:

```powershell
& .\backend\solver\.venv\Scripts\python.exe -c "import sys,unittest; sys.path.insert(0,'backend/solver/src'); suite=unittest.defaultTestLoader.discover('backend/solver/tests'); result=unittest.TextTestRunner(verbosity=2).run(suite); raise SystemExit(not result.wasSuccessful())"
```

## 5. Traceability và giới hạn

- Input truth: `backend/solver/examples/benchmarks/manifest.json` và ba JSON dataset.
- Machine-readable rubric: `backend/solver/examples/benchmarks/rubric.json`.
- Runner: `backend/solver/scripts/run_benchmark_rubric.py`.
- Regression coverage: `backend/solver/tests/test_benchmark_rubric.py` và
  `test_benchmarks.py`.
- `SOLVER-OBJECTIVE-1.0.0` là request/result extension; `random_seed` vẫn chỉ là
  keyword-only harness control trong Python solver.
- Chưa có dữ liệu trường thật, pilot approver, deployment SLO hoặc production
  observability trong task này.
