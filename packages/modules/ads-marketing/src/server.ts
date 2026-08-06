import { z } from "zod";
import { prisma, logAudit, type Campaign } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "ads-marketing";

export const campaignSchema = z.object({
  name: z.string().trim().min(1).max(160),
  channel: z.enum(["SOCIAL", "SEARCH", "EMAIL", "DISPLAY"]).default("SOCIAL"),
  budgetCents: z.coerce.number().int().min(0).max(1_000_000_000).default(0),
});

export class CampaignService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for ads-marketing`);
    }
  }

  async list(): Promise<Campaign[]> {
    await this.assert("READ");
    return prisma.campaign.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { updatedAt: "desc" } });
  }

  async create(input: z.infer<typeof campaignSchema>): Promise<void> {
    await this.assert("CREATE");
    await prisma.campaign.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, name: input.name, channel: input.channel, budgetCents: input.budgetCents },
    });
    await this.audit("campaign.created", input.name);
  }

  async setStatus(id: string, status: string): Promise<void> {
    await this.assert("UPDATE");
    await prisma.campaign.update({ where: { id }, data: { status: status as never } });
  }

  async simulate(id: string): Promise<Campaign> {
    await this.assert("UPDATE");
    const campaign = await prisma.campaign.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!campaign) throw new Error("Campaign not found");
    if (campaign.status !== "RUNNING") throw new Error("Campaign must be running to deliver");

    const impressions = campaign.impressions + 500 + Math.floor(Math.random() * 4000);
    const clicks = campaign.clicks + Math.floor(impressions * 0.02) + Math.floor(Math.random() * 60);
    const conversions = campaign.conversions + Math.floor(clicks * 0.06) + Math.floor(Math.random() * 8);
    const spentCents = Math.min(campaign.budgetCents, campaign.spentCents + 2000 + Math.floor(Math.random() * 6000));

    const updated = await prisma.campaign.update({
      where: { id },
      data: { impressions, clicks, conversions, spentCents, updatedAt: new Date() },
    });
    await this.audit("campaign.delivered", campaign.name);
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.campaign.delete({ where: { id } });
    await this.audit("campaign.deleted", id);
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Campaign",
      targetId,
    });
  }
}
