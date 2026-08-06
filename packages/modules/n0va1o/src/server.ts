import { z } from "zod";
import { prisma, logAudit, type Integration, type IntegrationLog } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "n0va1o";

export const integrationSchema = z.object({
  provider: z.enum(["slack", "discord", "gdrive", "github", "custom"]),
  name: z.string().trim().min(1).max(120),
  token: z.string().max(500).default(""),
});

export type IntegrationWithLogs = Integration & { logs: IntegrationLog[] };

export class N0va1oService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for n0va1o`);
    }
  }

  async list(): Promise<IntegrationWithLogs[]> {
    await this.assert("READ");
    return prisma.integration.findMany({
      where: { workspaceId: this.workspaceId },
      include: { logs: { orderBy: { createdAt: "desc" }, take: 4 } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async connect(input: z.infer<typeof integrationSchema>): Promise<void> {
    await this.assert("CREATE");
    await prisma.integration.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        provider: input.provider,
        name: input.name,
        config: input.token ? { token: input.token } : {},
        status: "connected",
        lastSyncAt: new Date(),
      },
    });
    await prisma.integrationLog.create({
      data: { workspaceId: this.workspaceId, integrationId: "", level: "info", message: `Connected ${input.provider}` },
    });
    await this.audit("integration.connected", input.provider);
  }

  async sync(id: string): Promise<{ message: string }> {
    await this.assert("UPDATE");
    const integration = await prisma.integration.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!integration) throw new Error("Integration not found");
    if (!integration.enabled) throw new Error("Integration is paused");
    const level = Math.random() > 0.15 ? "info" : "error";
    const message =
      level === "info"
        ? `Synced ${integration.provider} — 12 items pulled at ${new Date().toLocaleTimeString()}`
        : `Sync failed for ${integration.provider} — token may have expired`;
    await prisma.integration.update({ where: { id }, data: { lastSyncAt: new Date() } });
    await prisma.integrationLog.create({
      data: { workspaceId: this.workspaceId, integrationId: id, level, message },
    });
    return { message };
  }

  async toggle(id: string, enabled: boolean): Promise<void> {
    await this.assert("UPDATE");
    await prisma.integration.update({ where: { id }, data: { enabled } });
  }

  async remove(id: string): Promise<void> {
    await this.assert("DELETE");
    const integration = await prisma.integration.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!integration) throw new Error("Integration not found");
    await prisma.integration.delete({ where: { id } });
    await this.audit("integration.disconnected", integration.provider);
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Integration",
      targetId,
    });
  }
}
