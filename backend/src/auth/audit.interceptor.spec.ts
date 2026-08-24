/// <reference types="jest" />

import type { ExecutionContext } from "@nestjs/common";
import { firstValueFrom, of } from "rxjs";
import { AuditInterceptor } from "./audit.interceptor";
import type { AuditLogService } from "./audit-log.service";
import type { RequestWithAuth } from "./auth.types";

function makeContext(method: string, path: string) {
  const request = {
    method,
    path,
    baseUrl: "",
    url: path,
    requestId: "t05-interceptor-test",
    auth: {
      userId: "actor-001",
      role: "SCHEDULER" as const,
      schoolId: "school-001",
      permissions: ["READ", "WRITE", "IMPORT", "SOLVE", "AUDIT_READ"] as const,
    },
  } as unknown as RequestWithAuth;
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

describe("AuditInterceptor", () => {
  it.each([
    ["POST", "/schools/school-001/teachers", "CREATE"],
    ["PATCH", "/schools/school-001/teachers/teacher-001", "UPDATE"],
    ["DELETE", "/schools/school-001/teachers/teacher-001", "DELETE"],
    ["POST", "/imports/batch-001/confirm", "IMPORT"],
    ["POST", "/optimization-jobs", "SOLVE"],
    ["POST", "/publish", "PUBLISH"],
  ])("maps %s %s to %s", async (method, path, action) => {
    const record = jest.fn().mockResolvedValue({});
    const interceptor = new AuditInterceptor({ record } as unknown as AuditLogService);
    const { context } = makeContext(method, path);

    await firstValueFrom(interceptor.intercept(context, { handle: () => of({ id: "entity-001" }) }));

    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action }));
  });
});
