# Vòng đời lần chạy bộ tối ưu

`SolveJobResult.status` là một trong `INVALID`, `INFEASIBLE`, `FEASIBLE`,
`OPTIMAL`, or `UNKNOWN`:

- `INVALID`: worker từ chối hợp đồng đầu vào trước khi tối ưu;
- `INFEASIBLE`: kiểm tra trước hoặc CP-SAT chứng minh không có phân công khả thi cứng;
- `FEASIBLE`: lần chạy giới hạn thời gian trả nghiệm hiện tại hợp lệ;
- `OPTIMAL`: CP-SAT chứng minh mục tiêu tốt nhất đã tìm thấy;
- `UNKNOWN`: không có nghiệm hiện tại hợp lệ hoặc bộ tối ưu trả trạng thái chưa phân loại.

`diagnostics.runMetrics` records `wallTimeMs`, `bestObjectiveBound`, and
`objectiveGapPercent`. Seed and time limit remain in `metadata`, while the
weighted objective is in `objectiveBreakdown`. A feasible incumbent is retained
when the time limit is reached; the post-solve hard-constraint audit still runs
before the result is returned.

Tại ranh giới worker NestJS, đầu vào bộ tối ưu sai được chuyển thành kết quả
`INVALID` với chẩn đoán máy đọc được. Lỗi tiến trình Python được báo như lỗi
worker/hệ thống và không đổi nhãn thành nghiệp vụ `INFEASIBLE`.
`runPythonSolver` nhận `AbortSignal`; hủy sẽ dừng tiến trình con và từ chối với
`SOLVER_CANCELLED`, ngăn công bố kết quả một phần.
