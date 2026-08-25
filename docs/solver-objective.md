# Weighted solver objective

Optional request field `objective` uses contract `SOLVER-OBJECTIVE-1.0.0`:

```json
{
  "contractVersion": "SOLVER-OBJECTIVE-1.0.0",
  "weights": {
    "teacherGap": 1,
    "compactness": 1,
    "dayDistribution": 1,
    "undesirableSlots": 2,
    "preferredDays": 1,
    "fairness": 1
  }
}
```

All weights are non-negative. CP-SAT minimizes the weighted sum only after
hard feasibility has been encoded. A missing objective keeps compatibility with
existing requests and preserves the current weighted teacher-preference
behavior. An explicit all-zero objective disables soft ranking without
changing hard constraints.

The objective groups are:

- `teacherGap`: empty periods between assignments for the same teacher/day;
- `compactness`: empty periods between assignments for the same class/day;
- `dayDistribution`: deviation from an even class load across available days;
- `undesirableSlots`: approved soft teacher availability rules that match a
  slot;
- `preferredDays`: approved soft rules whose code expresses a preferred day;
- `fairness`: deviation from an even teacher load across available days.

`diagnostics.objectiveBreakdown` reports the unweighted group scores and the
scaled `weightedTotal`. `metadata.objectiveContractVersion` identifies an
explicit objective request. The breakdown is a quality signal only; the hard
constraint audit and CP-SAT feasibility remain authoritative.
