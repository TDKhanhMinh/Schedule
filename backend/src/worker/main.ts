import "reflect-metadata";
import { Worker } from "bullmq";
import { OPTIMIZATION_QUEUE } from "../contracts";
import { parseRedisConnection } from "../jobs/redis-connection";
import type { OptimizationJobData } from "../jobs/optimization-job.contract";
import { OptimizationRunStore } from "../jobs/optimization-run.store";
import { processOptimizationJob } from "./optimization-worker";
import { runPythonSolver } from "./solver-process";
import { ObservabilityService } from "../observability/observability.service";
import { createTenantAwarePool } from "../database/tenant-aware-pool";
import { tenantContext } from "../database/tenant-context";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for the solver worker.");
const pool = createTenantAwarePool(databaseUrl, {
  enforceTenantContext: process.env.TENANT_DB_ENFORCEMENT === "true",
});
const store = new OptimizationRunStore(pool);
const observability = new ObservabilityService();

const worker = new Worker<OptimizationJobData>(
  OPTIMIZATION_QUEUE,
  async (job) =>
    tenantContext.run(job.data.tenantId, () =>
      processOptimizationJob(job, { store, solve: runPythonSolver, observability }),
    ),
  { connection: parseRedisConnection(redisUrl) },
);

worker.on("ready", () => console.log(`[solver-worker] listening on ${OPTIMIZATION_QUEUE}`));
worker.on("completed", (job, result) =>
  console.log(`[solver-worker] completed ${job.id}: ${"status" in result ? result.status : "CANCELLED"}`),
);
worker.on("failed", (job, error) => console.error(`[solver-worker] failed ${job?.id ?? "unknown"}: ${error.message}`));

const shutdown = async () => {
  await worker.close();
  await pool.end();
  process.exit(0);
};

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
