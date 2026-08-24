import { SetMetadata } from "@nestjs/common";
import type { Permission } from "./auth.constants";

export const REQUIRED_PERMISSION = "required_permission";

export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRED_PERMISSION, permission);
