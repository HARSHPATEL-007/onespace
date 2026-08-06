import { z } from "zod";
import { prisma, logAudit, type Incident, type OpsRunbook } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "operations-teams";

export const runbookSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(2000).default(""),
  steps: z.string().max(6000).default(""),
});

export const incidentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  severity: z.enum(["SEV1", "SEV2", "SEV3", "SEV4"]).default("SEV3"),
});

export class OpsService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for operations-teams`);
    }
  }

  async runbooks(): Promise<OpsRunbook[]> {
    await this.assert("READ");
    return prisma.opsRunbook.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { updatedAt: "desc" } });
  }

  async createRunbook(input: z.infer<typeof runbookSchema>): Promise<void> {
    await this.assert("CREATE");
    const steps = input.steps
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
    await prisma.opsRunbook.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        title: input.title,
        description: input.description,
        steps: steps,
      },
    });
    await this.audit("runbook.created", input.title);
  }

  async setRunbookStatus(id: string, status: string): Promise<void> {
    await this.assert("UPDATE");
    await prisma.opsRunbook.update({ where: { id }, data: { status: status as never } });
  }

  async removeRunbook(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.opsRunbook.delete({ where: { id } });
  }

  async incidents(): Promise<Incident[]> {
    await this.assert("READ");
    return prisma.incident.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" } });
  }

  async createIncident(input: z.infer<typeof incidentSchema>): Promise<void> {
    await this.assert("CREATE");
    await prisma.incident.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, title: input.title, severity: input.severity },
    });
    await this.audit("incident.created", input.title);
  }

  async advanceIncident(id: string): Promise<void> {
    await this.assert("UPDATE");
    const incident = await prisma.incident.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!incident) throw new Error("Incident not found");
    const next: Record<string, string> = { OPEN: "INVESTIGATING", INVESTIGATING: "RESOLVED", RESOLVED: "RESOLVED" };
    await prisma.incident.update({
      where: { id },
      data: { status: next[incident.status] as never, resolvedAt: next[incident.status] === "RESOLVED" ? new Date() : null },
    });
    await this.audit("incident.advanced", incident.title);
  }

  async removeIncident(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.incident.delete({ where: { id } });
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "OpsRunbook",
      targetId,
    });
  }
}
