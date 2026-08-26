# Conflict chains — P3.2-T03

`CONFLICT-CHAIN-1.0.0` extends the existing `CONFLICT-CATALOG-1.0.0` diagnostic
without changing the stable reason code. Each chain is deterministic from the
reason code and sorted entity references:

`entity references → constraint node → outcome node`

The chain is emitted for pre-solve and full solver diagnostics, including fixed
resource conflicts, class/teacher capacity shortages, hard availability and
room capability/availability mismatches. References are bounded identifiers;
stack traces, raw payloads and unauthorized data are not included.
