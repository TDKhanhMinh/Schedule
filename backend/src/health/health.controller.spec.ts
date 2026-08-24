/// <reference types="jest" />

import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns the API health contract", () => {
    const result = new HealthController().getHealth();

    expect(result.status).toBe("ok");
    expect(result.service).toBe("schedule-api");
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
