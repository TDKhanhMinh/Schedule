# Container and dev/staging runbook — P2.5-T05

## Local Docker stack

The compose stack contains PostgreSQL, Redis, a one-shot migration service, the
NestJS API, the Python/OR-Tools worker and the Nginx-served React frontend.
`migrate` waits for PostgreSQL health and API/worker wait for successful
migrations plus Redis health. The API readiness probe checks both PostgreSQL
and Redis through `/api/v1/health/ready`.

```powershell
docker compose build
docker compose up -d
docker compose ps
Invoke-WebRequest http://localhost:3011/api/v1/health/ready
Invoke-WebRequest http://localhost:8080
```

The local ports are API `3011`, frontend `8080`, PostgreSQL `55432` and Redis
`6379`. The repository `.env.example` contains connection placeholders only;
real credentials must be supplied through a local ignored `.env` or a secret
manager. The compose file uses development identity headers and must not be
used as a production identity boundary.

For a fresh database, the migration container applies ordered forward-only
SQL files and records them in `schema_migrations`. If it finds the existing
local database already contains the complete managed schema but has no
migration ledger, it creates a baseline ledger without replaying SQL. Partial
or unknown schemas fail and require an explicit database backup/review before
continuing.

## Staging template

`deploy/staging/` is a Kubernetes/Kustomize template for a staging cluster.
Replace the example image registry/tag, `CORS_ORIGIN`, database/Redis secret
references and ingress/network policy according to the deployment platform.
`secret.example.yaml` intentionally contains placeholders and must never be
filled with real values in Git. Staging must provide a real OIDC/session
adapter before the production fail-closed guard is relaxed, and should use
managed PostgreSQL/Redis rather than the local compose volumes.

The manifests include API liveness/readiness probes, non-root container
settings, separate API/worker/frontend Deployments and a ConfigMap/Secret
boundary. They are static deployment evidence, not proof that a cluster,
registry, TLS, identity provider, backups, monitoring or pilot has been
configured.
