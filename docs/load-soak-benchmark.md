# Load, performance và soak benchmark — P3.3-T03

**Benchmark version:** `LOAD-SOAK-1.0.0`
**Ngày:** 2026-08-26
**Môi trường:** Docker Compose local, PostgreSQL/Redis/API/worker; benchmark fixture `small-feasible.json`.

## Kịch bản và ngưỡng local

| Scenario                  | Mẫu chạy                                              | Ngưỡng local để pass                                                         |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| Health/API responsiveness | 60 request, concurrency 10                            | HTTP 200, p95 ≤ 500ms, error rate = 0                                        |
| Preflight                 | 20 request, concurrency 5                             | HTTP 201 + `canSolve=true`, p95 ≤ 500ms                                      |
| Metrics endpoint          | 10 request, concurrency 2                             | HTTP 200 text/plain, p95 ≤ 500ms                                             |
| Concurrent solve jobs     | 3 unique jobs, same synthetic dataset                 | Create + terminal status cho 100%, no duplicate/lost job, trace ID preserved |
| Bounded soak              | Health/preflight chạy đồng thời trong lúc 3 job solve | API không vượt ngưỡng health; queue/worker phải trả terminal status          |

Chạy:

```text
npm run benchmark:load
```

Script ghi report tại `outputs/P3.3-T03/load-soak-report.json`, chụp Docker CPU/RAM một lần sau workload và không gọi production endpoint.

## Đọc kết quả

- `benchmarkPass=true` chỉ có nghĩa workload synthetic bounded đạt ngưỡng local.
- `capacityLimit` là giới hạn đã được chứng minh của lần chạy, không phải production capacity/SLO.
- `jobIntegrity` phải có `created == terminal`, `duplicateJobIds == 0`, `lostJobIds == 0` và mọi job ID/trace ID là duy nhất.
- CPU/RAM snapshot dùng để tìm bottleneck ban đầu; không thay thế time-series metrics, long-duration soak, autoscaling hay load profile từ trường.

## Production gates còn mở

Chưa có baseline phần cứng/staging, concurrent-user target do stakeholder chốt, long-duration soak, autoscaling, queue depth time series, APM collector hoặc production SLO approval. Vì vậy report có thể đóng Dev/Test benchmark nhưng không đánh dấu pilot/production approved.
