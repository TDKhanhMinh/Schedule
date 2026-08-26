# Observability API → queue → worker → Python solver — P3.3-T01

**Contract:** `SCHEDULE-OBSERVABILITY-1.0.0`  
**Ngày:** 2026-08-26  
**Phạm vi:** local/dev implementation cho V1.1; production collector, retention và paging policy vẫn là release work.

## Trace flow

`RequestIdMiddleware` nhận hoặc tạo một opaque `x-request-id`, trả lại cả `x-request-id` và `x-trace-id`, rồi API truyền giá trị này trong `OptimizationJobData.traceId`. Worker giữ trace khi ghi queue/solver events và truyền tiếp vào Python adapter; kết quả solver giữ trace trong `metadata.traceId`.

Không ghi request body, workbook cells, raw PII, secret, access token hoặc stack trace vào structured event. `jobId` chỉ xuất hiện dưới dạng SHA-256 rút gọn; metrics chỉ dùng route template, method, status và trạng thái bounded.

## Metrics endpoint

API expose Prometheus text format tại `GET /api/v1/metrics`. Các metric ban đầu:

- `schedule_http_requests_total{method,route,status}` và `schedule_http_request_duration_ms`.
- `schedule_queue_events_total{event}` với `enqueued`, `dequeued`, `persisting`, `completed`, `failed`, `cancelled`, `precheck_rejected`.
- `schedule_solver_runs_total{status}` và `schedule_solver_duration_ms`.
- `schedule_alert_state_changes_total{alert,state}` để kiểm chứng alert mở/đóng.

Metric state hiện giữ trong process API; worker log ra JSON event cùng contract nhưng chưa có exporter/remote collector. Khi triển khai production, phải cấu hình scrape/aggregation, retention, access control và dashboard datasource trước khi coi metrics là monitoring gate.

## Dashboard và alerts

- Dashboard config: `deploy/observability/dashboard.json`.
- Initial alert rules: `deploy/observability/alerts.yaml`.
- API 5xx: critical khi >5% trong 10 phút.
- Queue failure: warning khi >2% trong 10 phút.
- Solver p95: warning khi >10 giây trong 10 phút.

Alert state chỉ chuyển khi có state change; test evidence phải chứng minh `OPEN → CLOSED`, không chỉ gọi một lần.

## Verification

```text
npm run observability:evidence
```

Report: `outputs/P3.3-T01/observability-report.json`. Test hiện kiểm chứng metric counters/histograms, safe identifier redaction, trace contract metadata và alert open/close. Đây là Dev/Test evidence; chưa claim staging, production paging, SLO sign-off hoặc stakeholder approval.
