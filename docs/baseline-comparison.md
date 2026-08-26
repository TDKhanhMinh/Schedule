# Baseline and like-for-like comparison — P3.1-T03

Baseline chỉ có ý nghĩa khi input, rule set, contract, seed, time limit và rubric
giống nhau. Không so sánh một output synthetic với lịch thủ công của trường rồi
kết luận sản phẩm tốt hơn.

## Chạy baseline

```text
node scripts/run-pilot-baseline.mjs
```

Runner dùng benchmark manifest/rubric version `1.0`, solver contract `1.0`,
objective contract `SOLVER-OBJECTIVE-1.0.0` và seed set trong rubric. Report ghi
hard-constraint, status, assignment count, soft score, seed stability, runtime,
optimality và explainability của từng dataset; đồng thời so regression với report
P2.2-T07 nếu có.

Output: `outputs/P3.1-T03/baseline-comparison-report.json`.

## Kết quả và giới hạn

- Synthetic baseline phải đạt `allPassed=true`, không hard violation cho dataset
  feasible, status/assignment count ổn định giữa seeds và nằm trong time limit.
- Lịch thủ công hoặc phần mềm khác được ghi `NOT_SUPPLIED` nếu chưa có artifact
  với cùng input/rule/rubric. Không được điền điểm giả định.
- Snapshot pilot P3.1-T02 chỉ được solve khi `solveAllowed=true`. Nếu còn blocker,
  report ghi `BLOCKED_UNRECONCILED_SNAPSHOT` và không tạo claim chất lượng pilot.
- `pilotApproved` và `productionApproved` luôn là hai gate riêng, chờ owner,
  stakeholder, UAT/security/restore và sign-off phù hợp.
