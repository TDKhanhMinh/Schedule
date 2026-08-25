# Schedule edit concurrency

**Contract:** `SCHEDULE-EDIT-1.0.0`

`GET /api/v1/schools/:schoolId/schedule-versions/:versionId` returns the
current schedule snapshot and an `ETag` such as
`"schedule-version:<versionId>:<revision>"`. A manual assignment edit uses:

```http
PATCH /api/v1/schools/:schoolId/schedule-versions/:versionId/assignments/:lessonId/:sessionIndex
If-Match: "schedule-version:<versionId>:<revision>"
Content-Type: application/json

{"timeSlotId":"<slot-id>","roomId":"<room-id-or-null>"}
```

The NestJS service opens a PostgreSQL transaction, locks the schedule version,
checks the ETag and editable lifecycle state, validates that the lesson, slot
and room remain in the same school/academic-period scope, and checks class,
teacher and room occupancy hard constraints before changing an assignment. A
successful edit increments `schedule_versions.revision` and returns the new
snapshot/ETag.

If the ETag is stale, the API returns HTTP `409` with code
`SCHEDULE_VERSION_CONCURRENT_UPDATE` and `currentSnapshot`. Hard constraint or
scope conflicts also return `409` with `currentSnapshot`; the transaction is
rolled back, so no partial write is visible. Missing `If-Match` returns HTTP
`428` and the client must first refresh the snapshot. The UI remains a workflow
aid; authorization and correctness stay server-owned.
