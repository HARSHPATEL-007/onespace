import { prisma, logAudit, type PermissionAction } from "@n0va/db";
import { can, rankOf, type Role } from "@n0va/authz";
import { N0VA_MODULES, type N0vaModule } from "@n0va/core";

const MODULE = "admin";

export interface ModulePolicy {
  module: N0vaModule;
  overrides: Array<{ role: Role; action: string; allowed: boolean }>;
  hasOverrides: boolean;
}

export interface ModuleSetting {
  module: N0vaModule;
  enabled: boolean;
}

export type N0vaStatus = "live" | "building" | "planned";

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

  async moduleSettings(): Promise<ModuleSetting[]> {
    await this.assert();
    const rows = await prisma.workspaceModuleSetting.findMany({ where: { workspaceId: this.workspaceId } });
    const enabledByModule = new Map(rows.map((r) => [r.moduleId, r.enabled] as const));
    return N0VA_MODULES.map((module) => ({
      module,
      enabled: enabledByModule.get(module.id) ?? true,
    }));
  }

  async setModuleStatus(module: string, status: N0vaStatus): Promise<void> {
    await this.assert();
    const enabled = status !== "planned";
    await prisma.workspaceModuleSetting.upsert({
      where: { workspaceId_moduleId: { workspaceId: this.workspaceId, moduleId: module } },
      update: { enabled },
      create: { workspaceId: this.workspaceId, moduleId: module, enabled },
    });
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

export async function moduleEnableMap(workspaceId: string): Promise<Record<string, boolean>> {
  const rows = await prisma.workspaceModuleSetting.findMany({ where: { workspaceId } });
  const enabled: Record<string, boolean> = {};
  for (const m of N0VA_MODULES) enabled[m.id] = true;
  for (const r of rows) enabled[r.moduleId] = r.enabled;
  return enabled;
}

export async function isModuleEnabled(workspaceId: string, moduleId: string): Promise<boolean> {
  const row = await prisma.workspaceModuleSetting.findUnique({
    where: { workspaceId_moduleId: { workspaceId, moduleId } },
  });
  return row ? row.enabled : true;
}
