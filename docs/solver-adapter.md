# Solver adapter contract

**Contract:** `SOLVER-ADAPTER-1.0.0`

The adapter is the deterministic seam between NestJS snapshot data and the
Python worker. It keeps the canonical `SolveJobRequest` inside a small
versioned envelope instead of making Python query PostgreSQL.

```text
SolverAdapterPayload
├── adapterContractVersion
├── source
│   ├── schemaVersion / templateVersion
│   ├── schoolId / academicPeriodId
│   └── ruleSnapshotId / ruleSetVersion / ruleSnapshotHash
├── reproducibility
│   ├── randomSeed
│   └── timeLimitSeconds
├── input: SolveJobRequest
└── inputChecksum: SHA-256(canonical unsigned payload)
```

The TypeScript builder is `buildSolverAdapterPayload` in
`backend/src/contracts/solver-adapter.ts`. Canonicalization sorts object keys,
omits null/undefined object fields and preserves array order. The Python
`SolverAdapterPayload` validates the same checksum before CP-SAT is called.
Integral float values are normalized in the Python canonicalizer so JSON
numbers such as `10` and `10.0` produce the same digest across runtimes.

The published round-trip fixture is
`backend/contracts/examples/solver-adapter.json`; its JSON Schema is
`backend/contracts/schemas/solver-adapter.schema.json`. Raw
`SolveJobRequest` input remains accepted by the CLI during the compatibility
window, while adapter input adds `adapterContractVersion`, template/period
provenance, checksum and effective seed/time-limit metadata to the result.

NestJS remains responsible for authorization, PostgreSQL snapshot selection,
queue orchestration and audit. Python validates the canonical envelope and
enforces hard constraints; the UI does not participate in correctness.
