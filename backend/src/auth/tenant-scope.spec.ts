/// <reference types="jest" />

import { assertTenantId, assertTenantScope, TenantScopeViolation, tenantQueueNamespace } from "./tenant-scope";

describe("tenant scope boundary", () => {
  it("requires trusted identity context and blocks mismatched client scope", () => {
    expect(assertTenantScope("tenant-a", "tenant-a")).toBe("tenant-a");
    expect(() => assertTenantScope(undefined, "tenant-a")).toThrow(TenantScopeViolation);
    try {
      assertTenantScope("tenant-a", "tenant-b");
    } catch (error) {
      expect(error).toMatchObject({ code: "TENANT_SCOPE_FORBIDDEN" });
    }
  });

  it("validates opaque tenant IDs and creates a scoped queue namespace", () => {
    expect(assertTenantId("tenant-a")).toBe("tenant-a");
    try {
      assertTenantId("tenant/a");
    } catch (error) {
      expect(error).toMatchObject({ code: "TENANT_ID_INVALID" });
    }
    expect(tenantQueueNamespace("tenant-a", "school-1")).toBe("tenant:tenant-a:school:school-1:optimization");
    expect(tenantQueueNamespace(undefined, "school-1")).toBe("tenant:legacy:school:school-1:optimization");
  });
});
