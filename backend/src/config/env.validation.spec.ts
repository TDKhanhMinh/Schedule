/// <reference types="jest" />

import { validateEnvironment } from "./env.validation";

describe("validateEnvironment", () => {
  it("normalizes the API port and keeps the configured boundaries", () => {
    const result = validateEnvironment({
      NODE_ENV: "test",
      API_PORT: "3100",
      API_PREFIX: "api/v1",
      DATABASE_URL: "postgresql://localhost/scheduler",
      REDIS_URL: "redis://localhost:6379",
    });

    expect(result.API_PORT).toBe(3100);
    expect(result.API_PREFIX).toBe("api/v1");
    expect(result.DATABASE_URL).toContain("postgresql://");
    expect(result.REDIS_URL).toContain("redis://");
  });

  it("rejects missing infrastructure configuration", () => {
    expect(() => validateEnvironment({ NODE_ENV: "test", API_PORT: "3100" })).toThrow(
      "Invalid environment configuration",
    );
  });

  it("requires an explicit CORS allow-list in production", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        API_PORT: "3100",
        DATABASE_URL: "postgresql://localhost/scheduler",
        REDIS_URL: "redis://localhost:6379",
      }),
    ).toThrow("CORS_ORIGIN is required in production");
  });

  it("requires tenant database enforcement in production", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        API_PORT: "3100",
        DATABASE_URL: "postgresql://scheduler_app/production",
        REDIS_URL: "redis://localhost:6379",
        CORS_ORIGIN: "https://schedule.example.com",
      }),
    ).toThrow("TENANT_DB_ENFORCEMENT=true is required in production");
  });
});
