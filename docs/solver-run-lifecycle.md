# Solver run lifecycle

`SolveJobResult.status` is one of `INVALID`, `INFEASIBLE`, `FEASIBLE`,
`OPTIMAL`, or `UNKNOWN`:

- `INVALID`: the worker rejected the input contract before solving;
- `INFEASIBLE`: pre-solve or CP-SAT proved no hard-feasible assignment;
- `FEASIBLE`: a time-limited run returned a valid incumbent;
- `OPTIMAL`: CP-SAT proved the best objective found;
- `UNKNOWN`: no valid incumbent was available or the solver returned an
  unclassified status.

`diagnostics.runMetrics` records `wallTimeMs`, `bestObjectiveBound`, and
`objectiveGapPercent`. Seed and time limit remain in `metadata`, while the
weighted objective is in `objectiveBreakdown`. A feasible incumbent is retained
when the time limit is reached; the post-solve hard-constraint audit still runs
before the result is returned.

At the NestJS worker boundary, malformed solver input is converted to an
`INVALID` result with machine-readable diagnostics. Python process failures are
reported as worker/system errors and are not relabeled as business
`INFEASIBLE`. `runPythonSolver` accepts an `AbortSignal`; abort kills the child
process and rejects with `SOLVER_CANCELLED`, preventing a partial result from
being published.
