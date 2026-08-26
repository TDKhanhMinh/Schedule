# Integration API, webhook và import profile — P4.1-T03

**Contract:** `SCHOOL-INTEGRATION-1.0.0`
**Ngày:** 2026-08-26

## Contract decisions

- Webhook envelope gồm `eventId`, `eventType`, `source`, `keyId`, `occurredAt`, version và payload; signature là HMAC-SHA256 trên canonical envelope.
- Secret rotation giữ `ACTIVE` + `PREVIOUS` key trong overlap window; key không xuất hiện trong logs/report. Signature compare dùng constant-time check.
- Replay ledger nhận một `eventId` một lần; duplicate không được chạy mapping/import lần hai. Durable PostgreSQL/Redis ledger là bước tích hợp tiếp theo.
- Import mapping profile map external fields → canonical import fields; profile sai, required field thiếu hoặc canonical number invalid bị cô lập bằng diagnostics.
- HTTP 408/409/429/5xx được retry bounded; 4xx khác hoặc max attempts vào dead-letter với reason code.

## Scope boundary

Đã có contract/policy implementation và automated evidence trong `backend/src/integrations/integration-contract.ts`. Chưa tạo external provider, durable webhook table/DLQ, secret manager, tenant migration hoặc production webhook endpoint. Provider rollout và DB persistence cần task/hardening tiếp theo.

Evidence: `outputs/P4.1-T03/integration-contract-report.json` và `npm run integration:evidence`.
