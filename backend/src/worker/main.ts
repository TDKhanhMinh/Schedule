import "reflect-metadata";
import { Worker } from "bullmq";
import { OPTIMIZATION_QUEUE, TEACHER_ASSIGNMENT_QUEUE, type TeacherAssignmentJobData } from "../contracts";
import { parseRedisConnection } from "../jobs/redis-connection";
import type { OptimizationJobData } from "../jobs/optimization-job.contract";
import { OptimizationRunStore } from "../jobs/optimization-run.store";
import { processOptimizationJob } from "./optimization-worker";
import { runPythonSolver } from "./solver-process";
import { ObservabilityService } from "../observability/observability.service";
import { createTenantAwarePool } from "../database/tenant-aware-pool";
import { tenantContext } from "../database/tenant-context";
import { TeacherAssignmentRunStore } from "../teacher-assignment/teacher-assignment-run.store";
import { processTeacherAssignmentJob } from "./teacher-assignment-worker";
import { runPythonTeacherAssignmentSolver } from "./solver-process";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Worker bộ tối ưu yêu cầu DATABASE_URL.");
const pool = createTenantAwarePool(databaseUrl, {
  enforceTenantContext: process.env.TENANT_DB_ENFORCEMENT === "true",
});
const store = new OptimizationRunStore(pool);
const teacherAssignmentStore = new TeacherAssignmentRunStore(pool);
const observability = new ObservabilityService();

const worker = new Worker<OptimizationJobData>(
  OPTIMIZATION_QUEUE,
  async (job) =>
    tenantContext.run(job.data.tenantId, () =>
      processOptimizationJob(job, { store, solve: runPythonSolver, observability }),
    ),
  { connection: parseRedisConnection(redisUrl) },
);

const teacherAssignmentWorker = new Worker<TeacherAssignmentJobData>(
  TEACHER_ASSIGNMENT_QUEUE,
  async (job) =>
    tenantContext.run(job.data.tenantId, () =>
      processTeacherAssignmentJob(job, { store: teacherAssignmentStore, solve: runPythonTeacherAssignmentSolver }),
    ),
  { connection: parseRedisConnection(redisUrl) },
);

worker.on("ready", () => console.log(`[solver-worker] listening on ${OPTIMIZATION_QUEUE}`));
worker.on("completed", (job, result) =>
  console.log(`[solver-worker] completed ${job.id}: ${"status" in result ? result.status : "CANCELLED"}`),
);
worker.on("failed", (job, error) => console.error(`[solver-worker] failed ${job?.id ?? "unknown"}: ${error.message}`));
teacherAssignmentWorker.on("ready", () =>
  console.log(`[teacher-assignment-worker] listening on ${TEACHER_ASSIGNMENT_QUEUE}`),
);
teacherAssignmentWorker.on("completed", (job, result) =>
  console.log(`[teacher-assignment-worker] completed ${job.id}: ${"status" in result ? result.status : "CANCELLED"}`),
);
teacherAssignmentWorker.on("failed", (job, error) =>
  console.error(`[teacher-assignment-worker] failed ${job?.id ?? "unknown"}: ${error.message}`),
);

const shutdown = async () => {
  await worker.close();
  await teacherAssignmentWorker.close();
  await pool.end();
  process.exit(0);
};

process.once("SIGINT", () => {
  void shutdown();
});
process.once("SIGTERM", () => {
  void shutdown();
});
