export const ROLES = ["ADMIN", "SCHEDULER", "REVIEWER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = ["READ", "WRITE", "IMPORT", "SOLVE", "PUBLISH", "AUDIT_READ"] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: ["READ", "WRITE", "IMPORT", "SOLVE", "PUBLISH", "AUDIT_READ"],
  SCHEDULER: ["READ", "WRITE", "IMPORT", "SOLVE", "AUDIT_READ"],
  REVIEWER: ["READ", "PUBLISH", "AUDIT_READ"],
  VIEWER: ["READ", "AUDIT_READ"],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
