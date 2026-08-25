# Public read-only schedule — P2.4-T05

## Contracts and routes

- `SCHEDULE-PUBLIC-LINK-1.0.0`: expiring/revocable link creation response.
- `SCHEDULE-PUBLIC-VIEW-1.0.0`: safe read-only JSON payload; internal lesson,
  room and schedule-assignment IDs are not exposed.
- `SCHEDULE-PDF-1.0.0`: printable PDF metadata and watermark contract.

Authenticated link management:

```text
POST /api/v1/schools/:schoolId/schedule-versions/:versionId/public-links
POST /api/v1/schools/:schoolId/schedule-versions/:versionId/public-links/:linkId/revoke
```

Only `ADMIN` and `REVIEWER` can create/revoke links, and only `PUBLISHED`
versions can receive a public link. The database stores only a SHA-256 token
hash. Default expiry is 168 hours and the API caps it at 720 hours.

Unauthenticated read-only routes:

```text
GET /api/v1/public/schedules/:token?view=all|class|teacher|room&resource=...
GET /api/v1/public/schedules/:token.pdf?view=all|class|teacher|room&resource=...
```

Expired/revoked links return `410`; unknown links return `404`. If the linked
version is no longer `PUBLISHED`, the public view is unavailable. The React
route `/public/schedules/:token` contains filters, print action and PDF link,
but has no edit/lock/approval/publish controls.

## PDF and security boundary

NestJS generates an A4 landscape PDF with embedded Unicode font when available,
compact resource/time columns, repeated metadata footer, page numbering and a
`PUBLIC READ ONLY` watermark. The server validates the token, link lifecycle
and published snapshot before JSON or PDF output; UI visibility is not a
security boundary.

Local runtime evidence is separate from staging/production, pilot and
stakeholder approval. The PDF output must be rendered and visually inspected
before claiming the layout gate.
