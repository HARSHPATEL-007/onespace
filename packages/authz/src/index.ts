import { Role, PermissionAction } from "@n0va/db";
import { prisma } from "@n0va/db";

export { Role, PermissionAction };
export type { Role as RoleType, PermissionAction as PermissionActionType };

export type PermissionActionName = "READ" | "CREATE" | "UPDATE" | "DELETE" | "ADMIN";

export const ALL_ACTIONS: PermissionActionName[] = [
  "READ",
  "CREATE",
  "UPDATE",
  "DELETE",
  "ADMIN",
];

/**
 * Default module permission matrix. Depth increases with role rank:
 * VIEWER = read only, MEMBER = read+create+update, ADMIN = full CRUD, OWNER = everything + admin.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, PermissionActionName[]> = {
  VIEWER: ["READ"],
  MEMBER: ["READ", "CREATE", "UPDATE"],
  ADMIN: ["READ", "CREATE", "UPDATE", "DELETE"],
  OWNER: ["READ", "CREATE", "UPDATE", "DELETE", "ADMIN"],
};

export function canSync(role: Role, action: PermissionActionName): boolean {
  return DEFAULT_ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}

export function rankOf(role: Role): number {
  return ({ OWNER: 4, ADMIN: 3, MEMBER: 2, VIEWER: 1 } as Record<Role, number>)[role] ?? 0;
}

/**
 * Tenant-scoped RBAC check for a module + action.
 *
 * Decision order:
 * 1. If the workspace has explicit matrix rows for this role + module, those rows
 *    fully control the answer.
 * 2. Otherwise fall back to the role default ({@link DEFAULT_ROLE_PERMISSIONS}).
 */
export async function can(
  workspaceId: string,
  role: Role,
  module: string,
  action: PermissionActionName,
): Promise<boolean> {
  const rows = await prisma.workspacePermission.findMany({
    where: { workspaceId, module, role },
    select: { action: true },
  });

  if (rows.length > 0) {
    return rows.some((r) => r.action === action);
  }

  return DEFAULT_ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}