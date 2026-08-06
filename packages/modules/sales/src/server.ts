import { z } from "zod";
import { prisma, logAudit, type Deal } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "sales";

export const dealSchema = z.object({
  title: z.string().trim().min(1).max(160),
  company: z.string().max(120).default(""),
  valueCents: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
  stage: z.enum(["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"]).default("LEAD"),
});

export class SalesService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for sales`);
    }
  }

  async pipeline(): Promise<Deal[]> {
    await this.assert("READ");
    return prisma.deal.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { updatedAt: "desc" } });
  }

  async create(input: z.infer<typeof dealSchema>): Promise<void> {
    await this.assert("CREATE");
    await prisma.deal.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        title: input.title,
        company: input.company,
        valueCents: input.valueCents,
        stage: input.stage,
      },
    });
    await this.audit("sales.deal.created", input.title);
  }

  async setStage(id: string, stage: string): Promise<void> {
    await this.assert("UPDATE");
    const deal = await prisma.deal.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!deal) throw new Error("Deal not found");
    await prisma.deal.update({
      where: { id },
      data: { stage: stage as never, closeDate: stage === "WON" || stage === "LOST" ? new Date() : undefined },
    });
    await this.audit(`sales.deal.stage.${stage.toLowerCase()}`, deal.title);
  }

  async remove(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.deal.delete({ where: { id } });
    await this.audit("sales.deal.deleted", id);
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Deal",
      targetId,
    });
  }
}
