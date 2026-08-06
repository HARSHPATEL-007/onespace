import { z } from "zod";
import { prisma, logAudit, type Payment, type Subscription } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "revenue";

export const subscriptionSchema = z.object({
  plan: z.string().trim().min(1).max(80),
  mrrCents: z.coerce.number().int().min(0).max(100_000_000),
  status: z.enum(["ACTIVE", "TRIAL", "CHURNED"]).default("TRIAL"),
});

export const paymentSchema = z.object({
  subscriptionId: z.string().optional(),
  amountCents: z.coerce.number().int().min(0).max(100_000_000),
  method: z.string().max(40).default("card"),
  status: z.enum(["SUCCEEDED", "FAILED", "REFUNDED"]).default("SUCCEEDED"),
});

export class RevenueService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for revenue`);
    }
  }

  async overview(): Promise<{ subscriptions: Array<Subscription & { payments: Payment[] }>; payments: Payment[] }> {
    await this.assert("READ");
    const [subscriptions, payments] = await Promise.all([
      prisma.subscription.findMany({
        where: { workspaceId: this.workspaceId },
        include: { payments: { orderBy: { occurredAt: "desc" }, take: 5 } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.payment.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { occurredAt: "desc" }, take: 50 }),
    ]);
    return { subscriptions, payments };
  }

  async createSubscription(input: z.infer<typeof subscriptionSchema>): Promise<void> {
    await this.assert("CREATE");
    await prisma.subscription.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, plan: input.plan, mrrCents: input.mrrCents, status: input.status },
    });
    await this.audit("revenue.subscription.created", input.plan);
  }

  async setSubscriptionStatus(id: string, status: string): Promise<void> {
    await this.assert("UPDATE");
    await prisma.subscription.update({
      where: { id },
      data: { status: status as never, canceledAt: status === "CHURNED" ? new Date() : undefined },
    });
  }

  async removeSubscription(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.subscription.delete({ where: { id } });
  }

  async recordPayment(input: z.infer<typeof paymentSchema>): Promise<void> {
    await this.assert("CREATE");
    await prisma.payment.create({
      data: {
        workspaceId: this.workspaceId,
        subscriptionId: input.subscriptionId ?? null,
        createdById: this.userId,
        amountCents: input.amountCents,
        method: input.method,
        status: input.status,
      },
    });
    await this.audit("revenue.payment.recorded", `${input.amountCents}`);
  }

  async removePayment(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.payment.delete({ where: { id } });
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Subscription",
      targetId,
    });
  }
}
