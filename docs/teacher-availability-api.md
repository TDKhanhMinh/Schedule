# Teacher availability API

**Contract:** `TEACHER-AVAILABILITY-1.0.0`

Availability is read from an approved, immutable `RuleSetSnapshot`; the API
does not treat the React UI as a correctness boundary.

## Read effective availability

```http
GET /api/v1/schools/:schoolId/academic-periods/:periodId/teacher-availability?ruleSnapshotId=:snapshotId&teacherId=:teacherId
```

The `teacherId` query is optional. Without it, the response contains all
teacher-scoped availability rules in the snapshot.

```json
{
  "contractVersion": "TEACHER-AVAILABILITY-1.0.0",
  "schoolId": "school-001",
  "academicPeriodId": "period-001",
  "effectiveAsOf": "2026-09-01",
  "ruleSnapshotId": "snapshot-001",
  "ruleSetVersion": "RULE-SET-1.0.0",
  "ruleSnapshotHash": "<sha256>",
  "rules": [
    {
      "ruleId": "RULE-TEACHER-AVAILABILITY-001",
      "code": "RULE-TEACHER-AVAILABILITY-001",
      "teacherId": "teacher-001",
      "strength": "HARD_UNAVAILABLE",
      "weight": null,
      "dayOfWeek": 1,
      "shiftCode": "MORNING",
      "blockedSlotIds": ["slot-001", "slot-002"],
      "effectiveFrom": "2026-09-01",
      "source": {
        "sourceUrl": "https://schedule.local/school-decision",
        "sourceLocator": "PILOT-AVAILABILITY-001",
        "ruleSnapshotId": "snapshot-001",
        "ruleSetVersion": "RULE-SET-1.0.0",
        "ruleSnapshotHash": "<sha256>"
      }
    }
  ]
}
```

Rule definitions inside the snapshot use the prefix
`RULE-TEACHER-AVAILABILITY-` and the following parameters:

- Hard unavailable: `kind: HARD`, `constraintType: "UNAVAILABLE"`.
- Strong preference: `kind: SOFT`, `preferenceLevel: "STRONG"`, non-negative
  `weight`.
- Soft wish: `kind: SOFT`, `preferenceLevel: "SOFT"`, non-negative `weight`.
- Selector: `dayOfWeek` is required; `shiftCode`, `period` and `slotId` are
  optional. Omitting `shiftCode` and `period` means the whole day.
- `effectiveFrom`/`effectiveTo` and snapshot approval are checked before the
  rule is returned. `blockedSlotIds` are resolved from the period's
  PostgreSQL `time_slots` so the solver receives a deterministic projection.

Python CP-SAT excludes hard-unavailable slots. Strong and soft preferences are
penalized in the objective and a `PREFERENCE_VIOLATED:<ruleCode>` warning is
returned when the chosen schedule must violate one. Production RBAC, official
pilot sources and stakeholder approval remain separate gates.
