# Ranked relaxation proposals — P3.2-T04

`RELAXATION-PROPOSAL-1.0.0` is a review-only diagnostic. Proposals are sorted
by deterministic impact score and proposal ID, and include affected lesson and
entity counts, rule source, impact, approval requirement and whether a hard rule
is protected.

Supported proposal kinds:

- `SOFT_RULE_WEIGHT`: review a soft wish or preference weight;
- `STAKEHOLDER_DATA_CHANGE`: review slot/data capacity with the school owner;
- `STAKEHOLDER_HARD_RULE_REVIEW`: identify a hard/legal rule for authorized
  stakeholder review, never automatic relaxation.

Every proposal has `requiresApproval=true` and `autoApply=false`. The frontend
renders proposals but does not apply them or publish a schedule.
