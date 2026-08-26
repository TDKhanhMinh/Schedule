/// <reference types="jest" />

import type { NextFunction, Response } from "express";
import { RequestIdMiddleware, type RequestWithId } from "./request-id.middleware";

describe("RequestIdMiddleware", () => {
  it("preserves a safe incoming request ID and returns it in the response", () => {
    const request = {
      header: jest.fn().mockReturnValue("qc-run-001"),
    } as unknown as RequestWithId;
    const response = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;

    new RequestIdMiddleware().use(request, response, next);

    expect(request.requestId).toBe("qc-run-001");
    expect(response.setHeader).toHaveBeenCalledWith("x-request-id", "qc-run-001");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("replaces unsafe incoming values with a generated ID", () => {
    const request = {
      header: jest.fn().mockReturnValue("bad value"),
    } as unknown as RequestWithId;
    const response = { setHeader: jest.fn() } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;

    new RequestIdMiddleware().use(request, response, next);

    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.setHeader).toHaveBeenCalledWith("x-request-id", request.requestId);
  });
});
