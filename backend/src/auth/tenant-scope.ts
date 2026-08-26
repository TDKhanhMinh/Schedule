export const TENANT_SCOPE_CONTRACT_VERSION = "TENANT-SCOPE-1.0.0" as const;

export class TenantScopeViolation extends Error {
  constructor(
    public readonly code: "TENANT_CONTEXT_REQUIRED" | "TENANT_SCOPE_FORBIDDEN" | "TENANT_ID_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "TenantScopeViolation";
  }
}

export function assertTenantId(value: string, field = "tenantId") {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) {
    throw new TenantScopeViolation("TENANT_ID_INVALID", `${field} không hợp lệ.`);
  }
  return value;
}

export function assertTenantScope(identityTenantId: string | undefined, requestedTenantId: string | undefined) {
  if (!requestedTenantId) return identityTenantId;
  if (!identityTenantId) {
    throw new TenantScopeViolation("TENANT_CONTEXT_REQUIRED", "Tenant context phải đến từ identity đã xác thực.");
  }
  if (identityTenantId !== requestedTenantId) {
    throw new TenantScopeViolation("TENANT_SCOPE_FORBIDDEN", "Không được truy cập tenant scope khác.");
  }
  return identityTenantId;
}

export function tenantQueueNamespace(tenantId: string | undefined, schoolId: string) {
  return `tenant:${tenantId ?? "legacy"}:school:${schoolId}:optimization`;
}
