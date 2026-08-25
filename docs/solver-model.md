# CP-SAT lesson-slot-room model

The solver builds one Boolean decision variable for each feasible tuple:

`(lessonId, sessionIndex, slotId, roomId)`

When the request omits `rooms`, the model stays compatible with the original
no-room contract and uses one virtual `null` room per slot. When `rooms` is
provided, a lesson's room domain is filtered by `allowedRoomIds` and
`requiredRoomCapabilities`; every remaining room is represented in the
variable index.

Before creating a variable, the builder prunes unknown slots, rooms that do
not satisfy the lesson's room requirements, and slots blocked by a hard
teacher-availability rule. It then applies these hard constraints:

- exactly one candidate per lesson session;
- at most one lesson for a class in a slot;
- at most one lesson for a teacher in a slot;
- at most one lesson for a room in a slot when the room model is enabled.

The result diagnostics expose `modelMetrics`:

- `variableCount`: number of CP-SAT Boolean variables created;
- `candidatePairCount`: number of feasible lesson/session-slot-room pairs;
- `domainPrunedCount`: number of slot-room candidates removed during domain
  construction;
- `roomDomainCount`: sum of eligible room entries across lesson domains.

Assignments are decoded from the same tuple index, so a selected room is
returned as `roomId`. The field is `null` in backwards-compatible no-room
mode. These metrics and the reverse mapping are solver evidence; the UI is
not a correctness boundary.
