import { prisma, logAudit, type PermissionAction } from "@n0va/db";
import { can, rankOf, type Role } from "@n0va/authz";
import { N0VA_MODULES, type N0vaModule } from "@n0va/core";

const MODULE = "admin";

export interface ModulePolicy {
  module: N0vaModule;
  overrides: Array<{ role: Role; action: string; allowed: boolean }>;
  hasOverrides: boolean;
}

export class AdminService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert() {
    if (rankOf(this.role) < 3) throw new Error("ADMIN or OWNER role required");
  }

  async policies(): Promise<ModulePolicy[]> {
    await this.assert();
    const rows = await prisma.workspacePermission.findMany({ where: { workspaceId: this.workspaceId } });
    return N0VA_MODULES.map((module) => {
      const moduleRows = rows.filter((r) => r.module === module.id);
      const overrides = moduleRows.map((r) => ({
        role: r.role,
        action: r.action,
        allowed: true,
      }));
      return { module, overrides, hasOverrides: moduleRows.length > 0 };
    });
  }

  async setPolicy(module: string, role: Role, action: string, allowed: boolean): Promise<void> {
    await this.assert();
    const permissionAction = action as PermissionAction;
    if (allowed) {
      await prisma.workspacePermission.upsert({
        where: { workspaceId_role_module_action: { workspaceId: this.workspaceId, role, module, action: permissionAction } },
        update: {},
        create: { workspaceId: this.workspaceId, role, module, action: permissionAction },
      });
    } else {
      await prisma.workspacePermission.deleteMany({
        where: { workspaceId: this.workspaceId, role, module, action: permissionAction },
      });
    }
    await this.audit("admin.policy.updated", module);
  }

  async resetModule(module: string): Promise<void> {
    await this.assert();
    await prisma.workspacePermission.deleteMany({ where: { workspaceId: this.workspaceId, module } });
    await this.audit("admin.policy.reset", module);
  }

  async setModuleStatus(module: string, status: "live" | "building" | "planned"): Promise<void> {
    await this.assert();
    // Workspace-level module status lives in memory only (registry); record the governance decision.
    await logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action: `admin.module.${status}`,
      targetType: "Module",
      targetId: module,
    });
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Policy",
      targetId,
    });
  }
}

export { can };
