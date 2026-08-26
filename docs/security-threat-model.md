# Security threat review — P2.5-T03

Date: 2026-08-25  
Scope: local/dev API and UI review before staging preparation.

## Security boundary

The `AuthGuard` is the only API authorization boundary for protected NestJS routes. In `development` and `test`, the existing local identity adapter accepts `x-user-id`, `x-user-role`, and `x-school-id` so the pilot workflow can be tested deterministically. In `production`, this adapter fails closed with `AUTH_PROVIDER_REQUIRED`; a real OIDC/session adapter must be configured before production traffic is allowed. The frontend never decides school scope, permission, export eligibility, or solver correctness.

## Threat checklist and disposition

| Surface              | Threat                                                                                               | Disposition                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication       | Forged local headers used as production identity                                                     | Closed for release by fail-closed production guard; production IdP/session integration remains a deployment gate.                                                 |
| Session/cookie/token | Token or cookie copied into audit/log metadata                                                       | Audit metadata is allow-listed/redacted; public schedule tokens are random 32-byte values and only SHA-256 hashes are stored.                                     |
| RBAC                 | Viewer mutates solve/import/master-data or scheduler approves/publishes                              | Permission matrix and approval/publish role checks are enforced server-side; negative tests cover denial.                                                         |
| Object authorization | User changes a resource by guessing an ID                                                            | Controllers require path/body school scope; SQL reads/writes use school and academic-period predicates. `GET /schools` now returns only the authenticated school. |
| Import               | Oversized, decompression-bomb, formula, hyperlink or cross-school workbook                           | Size/sheet/row/column/uncompressed limits, parse timeout, ZIP preflight, formula/hyperlink rejection and master-data scope checks are enforced.                   |
| Export               | Draft export by viewer, cross-school snapshot, hard-conflict export or spreadsheet formula injection | Export checks role/status, snapshot scope/completeness/conflicts, and prefixes formula-like user strings with an apostrophe before writing cells.                 |
| Public link          | Guessable/revoked/expired link exposes a non-published snapshot                                      | 32-byte base64url token, hash-at-rest lookup, expiry/revocation checks, published-only joins and school-scoped assignment joins.                                  |
| Browser hardening    | MIME sniffing, framing, referrer and unnecessary device APIs                                         | API sets `nosniff`, `DENY`, `no-referrer`, and a restrictive Permissions-Policy; production CORS requires an explicit allow-list.                                 |

## Automated evidence

- AuthGuard tests cover missing identity, invalid role, school-scope mismatch, viewer mutation denial, and production fail-closed behavior.
- Master-data tests prove school listing is parameterized by the authenticated scope.
- Import tests cover workbook abuse limits and unsafe formula/hyperlink content.
- Export tests cover viewer draft denial, server hard gates, and formula-like cell escaping.
- Public-link tests cover random token generation, hash-at-rest lookup, published-only access, filtering, and expiry/revocation behavior.

## Remaining release gates

The local adapter is not a production identity provider. Before staging/production, configure and test the approved OIDC/session/cookie integration, trusted proxy/TLS policy, rate limiting/WAF, secret rotation, database least-privilege/RLS posture, dependency/container scanning, and an authenticated browser/E2E run. These are explicitly not inferred from local implementation or from a Notion `Done` status.
