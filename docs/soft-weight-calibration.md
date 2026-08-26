# Soft-weight calibration record — P3.1-T04

Soft weights change preference ordering only. They must never relax a hard
constraint, change the input snapshot, or be presented as approved school policy
without a dated decision record.

## Reproducible sensitivity run

From the repository root:

```powershell
& .\backend\solver\.venv\Scripts\python.exe .\backend\solver\scripts\run_weight_sensitivity.py `
  --output .\outputs\P3.1-T04\weight-sensitivity-report.json
```

The run keeps contract `SOLVER-OBJECTIVE-1.0.0`, benchmark inputs, time limits and
seeds `0/1/7` fixed. It compares the existing `baseline-v1` weights with two
candidate profiles:

- `candidate-teacher-fairness-v1`: teacher gap `3`, fairness `2`, other groups `1`;
- `candidate-compactness-v1`: compactness `3`, day distribution `2`, other groups `1`.

These numbers are sensitivity candidates, not a school decision. The report stores
before/after weighted totals and runtime ratios per dataset/seed. Weighted totals
from different profiles are not treated as directly comparable quality claims;
the rationale and component breakdown must be reviewed with the timetable team.

## Acceptance gate

A candidate is eligible for stakeholder review only if status/assignment count and
hard-conflict behavior remain unchanged and median runtime stays within 2× of the
baseline. The run does not approve the profile or persist it into the production
rule set. `pilotWeightsApproved=false` and `productionApproved=false` remain true
until P3.1-T02 is reconciled and a school/stakeholder decision is recorded.
