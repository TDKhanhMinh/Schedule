const DEFAULT_API_BASE_URL = "/api/v1";
const DEFAULT_SCHOOL_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_ACTOR_ID = "local-qc-user";
const DEFAULT_ACTOR_ROLE = "SCHEDULER";
const DEFAULT_SCHEDULE_VERSION_ID = "00000000-0000-0000-0000-000000000902";

export const frontendConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL,
  schoolId: import.meta.env.VITE_DEMO_SCHOOL_ID?.trim() || DEFAULT_SCHOOL_ID,
  actorId: import.meta.env.VITE_USER_ID?.trim() || DEFAULT_ACTOR_ID,
  actorRole: import.meta.env.VITE_USER_ROLE?.trim().toUpperCase() || DEFAULT_ACTOR_ROLE,
  scheduleVersionId: import.meta.env.VITE_DEMO_SCHEDULE_VERSION_ID?.trim() || DEFAULT_SCHEDULE_VERSION_ID,
} as const;

export function authHeaders() {
  return {
    "x-user-id": frontendConfig.actorId,
    "x-user-role": frontendConfig.actorRole,
    "x-school-id": frontendConfig.schoolId,
  };
}
