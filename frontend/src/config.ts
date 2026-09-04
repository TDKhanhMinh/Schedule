const DEFAULT_API_BASE_URL = "/api/v1";
export const frontendConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL,
  schoolId: import.meta.env.VITE_SCHOOL_ID?.trim() || "",
  actorId: import.meta.env.VITE_USER_ID?.trim() || "",
  actorRole: import.meta.env.VITE_USER_ROLE?.trim().toUpperCase() || "VIEWER",
  scheduleVersionId: import.meta.env.VITE_SCHEDULE_VERSION_ID?.trim() || "",
  tenantId: import.meta.env.VITE_TENANT_ID?.trim() || "",
  academicPeriodId: "",
};

export function setFrontendContext(context: {
  schoolId?: string;
  academicPeriodId?: string;
  scheduleVersionId?: string;
}) {
  if (context.schoolId !== undefined) frontendConfig.schoolId = context.schoolId;
  if (context.academicPeriodId !== undefined) frontendConfig.academicPeriodId = context.academicPeriodId;
  if (context.scheduleVersionId !== undefined) frontendConfig.scheduleVersionId = context.scheduleVersionId;
}

export function authHeaders() {
  return {
    "x-user-id": frontendConfig.actorId,
    "x-user-role": frontendConfig.actorRole,
    "x-school-id": frontendConfig.schoolId,
    ...(frontendConfig.tenantId ? { "x-tenant-id": frontendConfig.tenantId } : {}),
  };
}
