import type { Request } from "express";
import type { Permission, Role } from "./auth.constants";

export interface AuthContext {
  userId: string;
  role: Role;
  schoolId: string;
  permissions: readonly Permission[];
}

export type RequestWithAuth = Request & {
  requestId?: string;
  auth?: AuthContext;
};
