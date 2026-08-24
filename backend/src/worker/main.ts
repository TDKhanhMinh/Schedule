import "reflect-metadata";
import { Worker } from "bullmq";
import { OPTIMIZATION_QUEUE, type SolveJobRequest, type SolveJobResult } from "../contracts";
import { parseRedisConnection } from "../jobs/redis-connection";
import { runPythonSolver } from "./solver-process";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

const worker = new Worker<SolveJobRequest, SolveJobResult>(
  OPTIMIZATION_QUEUE,
  async (job) => runPythonSolver(job.data),
  { connection: parseRedisConnection(redisUrl) }
);

worker.on("ready", () => console.log(`[solver-worker] listening on ${OPTIMIZATION_QUEUE}`));
worker.on("completed", (job, result) => console.log(`[solver-worker] completed ${job.id}: ${result.status}`));
worker.on("failed", (job, error) => console.error(`[solver-worker] failed ${job?.id ?? "unknown"}: ${error.message}`));

const shutdown = async () => {
  await worker.close();
  process.exit(0);
};

process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });

