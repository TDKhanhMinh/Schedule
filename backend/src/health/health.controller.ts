import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createConnection } from "node:net";
import type { Pool } from "pg";
import { PG_POOL } from "../database/database.module";

async function pingRedis(redisUrl: string) {
  const url = new URL(redisUrl);
  const port = Number(url.port || 6379);
  const host = url.hostname || "localhost";

  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Redis readiness timeout"));
    }, 1000);
    let response = "";
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on("data", (chunk) => {
      response += chunk.toString();
      if (response.includes("+PONG")) {
        clearTimeout(timer);
        socket.end();
        resolve();
      }
    });
    socket.on("connect", () => socket.write("*1\r\n$4\r\nPING\r\n"));
  });
}

@Controller("health")
export class HealthController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly config: ConfigService,
  ) {}

  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "schedule-api",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async getReadiness() {
    try {
      await this.pool.query("SELECT 1");
      await pingRedis(this.config.getOrThrow<string>("REDIS_URL"));
      return {
        status: "ready",
        service: "schedule-api",
        dependencies: { postgres: "ok", redis: "ok" },
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        code: "DEPENDENCY_NOT_READY",
        message: "PostgreSQL hoặc Redis chưa sẵn sàng.",
      });
    }
  }
}
