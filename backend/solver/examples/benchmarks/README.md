# Solver benchmark datasets

Version: `1.0` · Generated: `2026-08-24` · Contract: `schemaVersion: 1.0`

These are deterministic, synthetic, PII-free CP-SAT benchmark inputs for the THCS/THPT MVP. The manifest records expected status, assignment count, hard-constraint intent and SHA-256 for every payload.

| Dataset | Size | Expected | Purpose |
| --- | ---: | --- | --- |
| `small-feasible.json` | 4 slots / 4 lesson requirements / 5 sessions | `OPTIMAL`, 5 assignments | Fast smoke baseline |
| `medium-near-realistic.json` | 30 slots / 20 lesson requirements / 40 sessions | `OPTIMAL`, 40 assignments | Near-realistic capacity sample |
| `infeasible-teacher-conflict.json` | 1 slot / 2 lesson requirements / 2 sessions | `INFEASIBLE`, 0 assignments | Explicit hard teacher conflict |

Run the deterministic verification from the repository root:

```powershell
& .\backend\solver\.venv\Scripts\python.exe -c "import sys,unittest; sys.path.insert(0,'backend/solver/src'); suite=unittest.defaultTestLoader.discover('backend/solver/tests'); result=unittest.TextTestRunner(verbosity=2).run(suite); raise SystemExit(not result.wasSuccessful())"
```

Do not use these synthetic datasets as school-pilot approval evidence. A pilot dataset must be anonymized, separately approved and assigned its own version/hash.
