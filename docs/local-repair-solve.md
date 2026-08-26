# Local repair solve — P3.2-T02

`LOCAL-REPAIR-1.0.0` is an additive `SolveJobRequest.localRepair` mode. It
requires a complete baseline assignment snapshot, a SHA-256 baseline hash, an
affected occurrence region and optional frozen occurrence keys.

The solver applies the following safety rules:

- every baseline occurrence outside `affectedAssignmentKeys` is hard-fixed;
- every `frozenAssignmentKeys` occurrence is hard-fixed even if it is listed as
  affected;
- the existing class, teacher, room, fixed-slot and availability constraints
  remain hard constraints;
- the objective minimizes moved occurrences before ordinary soft preferences;
- the result reports moved/preserved counts and whether the outside region is
  unchanged.

The mode does not publish or persist a schedule by itself. The API/worker
contract remains the source of truth and later review/approve/publish actions
must still pass server-side validation.

Reproducible local evidence:

```powershell
npm run repair:evidence
```

Output: `outputs/P3.2-T02/local-repair-report.json`.
