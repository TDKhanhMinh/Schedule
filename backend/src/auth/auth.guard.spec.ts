/// <reference types="jest" />

import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "./auth.guard";
import type { RequestWithAuth } from "./auth.types";

function makeContext(headers: Record<string, string | undefined>, overrides: Partial<RequestWithAuth> = {}) {
  const request = {
    method: "GET",
    path: "/schools/school-001",
    baseUrl: "",
    url: "/schools/school-001",
    params: { schoolId: "school-001" },
    body: {},
    header(name: string) {
      return headers[name.toLowerCase()];
    },
    ...overrides,
  } as unknown as RequestWithAuth;
  const handler = () => undefined;
  const target = class TestController {};
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => target,
    } as unknown as ExecutionContext,
  };
}

describe("AuthGuard", () => {
  const guard = new AuthGuard(new Reflector());

  it("rejects requests without the local identity headers", () => {
    const { context } = makeContext({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it("allows a viewer to read only inside the declared school scope", () => {
    const { context, request } = makeContext({
      "x-user-id": "viewer-001",
      "x-user-role": "VIEWER",
      "x-school-id": "school-001",
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(request.auth).toMatchObject({ userId: "viewer-001", role: "VIEWER", schoolId: "school-001" });
  });

  it("denies a viewer from mutating master data", () => {
    const { context } = makeContext(
      {
        "x-user-id": "viewer-001",
        "x-user-role": "VIEWER",
        "x-school-id": "school-001",
      },
      { method: "POST", path: "/schools/school-001/teachers", url: "/schools/school-001/teachers" },
    );

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it("allows a scheduler to mutate its school and blocks another school", () => {
    const allowed = makeContext(
      {
        "x-user-id": "scheduler-001",
        "x-user-role": "SCHEDULER",
        "x-school-id": "school-001",
      },
      { method: "POST", path: "/schools/school-001/teachers", url: "/schools/school-001/teachers" },
    );
    expect(guard.canActivate(allowed.context)).toBe(true);

    const denied = makeContext(
      {
        "x-user-id": "scheduler-001",
        "x-user-role": "SCHEDULER",
        "x-school-id": "school-002",
      },
      { method: "GET", path: "/schools/school-001/teachers", url: "/schools/school-001/teachers" },
    );
    expect(() => guard.canActivate(denied.context)).toThrow(ForbiddenException);
  });

  it("allows a reviewer to approve or publish a schedule version", () => {
    const { context } = makeContext(
      {
        "x-user-id": "reviewer-001",
        "x-user-role": "REVIEWER",
        "x-school-id": "school-001",
      },
      {
        method: "POST",
        path: "/schools/school-001/schedule-versions/version-001/transitions",
        url: "/schools/school-001/schedule-versions/version-001/transitions",
        body: { toStatus: "APPROVED" },
      },
    );

    expect(guard.canActivate(context)).toBe(true);
  });
});
