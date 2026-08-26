# Runbook container và dev/staging — P2.5-T05

## Local Docker stack

Stack compose gồm PostgreSQL, Redis, dịch vụ migration chạy một lần, API NestJS,
worker Python/OR-Tools và giao diện React được Nginx phục vụ. `migrate` chờ
PostgreSQL khỏe; API/worker chờ migration thành công và Redis khỏe. Probe
readiness của API kiểm tra cả PostgreSQL và Redis qua `/api/v1/health/ready`.

```powershell
docker compose build
docker compose up -d
docker compose ps
Invoke-WebRequest http://localhost:3011/api/v1/health/ready
Invoke-WebRequest http://localhost:8080
```

Cổng cục bộ là API `3011`, giao diện `8080`, PostgreSQL `55432` và Redis
`6379`. `.env.example` của kho chỉ chứa chỗ trống kết nối; thông tin xác thực
thật phải được cung cấp qua `.env` cục bộ đã bỏ qua hoặc trình quản lý bí mật.
Tệp compose dùng header danh tính phát triển và không được dùng làm ranh giới
danh tính production.

Với cơ sở dữ liệu mới, container migration áp dụng các tệp SQL theo thứ tự, chỉ
tiến tới và ghi nhận vào `schema_migrations`. Nếu phát hiện cơ sở dữ liệu cục bộ
hiện có đã chứa đầy đủ schema được quản lý nhưng chưa có sổ migration, nó tạo sổ
đường cơ sở mà không chạy lại SQL. Schema không đầy đủ hoặc không xác định sẽ
thất bại và yêu cầu sao lưu/review cơ sở dữ liệu rõ ràng trước khi tiếp tục.

## Mẫu staging

`deploy/staging/` là mẫu Kubernetes/Kustomize cho cụm staging. Thay registry/tag
image mẫu, `CORS_ORIGIN`, tham chiếu bí mật database/Redis và chính sách
ingress/mạng theo nền tảng triển khai. `secret.example.yaml` cố ý chứa chỗ trống
và tuyệt đối không điền giá trị thật trong Git. Staging phải cung cấp bộ điều hợp
OIDC/session thật trước khi nới guard fail-closed của production, đồng thời nên
dùng PostgreSQL/Redis được quản lý thay vì volume compose cục bộ.

Các manifest gồm probe liveness/readiness của API, cấu hình container không chạy
quyền root, Deployment riêng cho API/worker/giao diện và ranh giới
ConfigMap/Secret. Đây chỉ là bằng chứng triển khai tĩnh, không chứng minh cụm,
registry, TLS, nhà cung cấp danh tính, sao lưu, giám sát hoặc thí điểm đã được
cấu hình.
