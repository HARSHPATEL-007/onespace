import { z } from "zod";
import { prisma, logAudit, type Invoice } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "finance";

export const invoiceSchema = z.object({
  number: z.string().trim().min(1).max(40),
  customer: z.string().trim().min(1).max(120),
  amountCents: z.coerce.number().int().min(0).max(100_000_000),
  currency: z.string().max(8).default("USD"),
  dueDate: z.string().optional(),
});

export class FinanceService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for finance`);
    }
  }

  async list(): Promise<Invoice[]> {
    await this.assert("READ");
    return prisma.invoice.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" } });
  }

  async create(input: z.infer<typeof invoiceSchema>): Promise<void> {
    await this.assert("CREATE");
    await prisma.invoice.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        number: input.number,
        customer: input.customer,
        amountCents: input.amountCents,
        currency: input.currency,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      },
    });
    await this.audit("invoice.created", input.number);
  }

  async markSent(id: string): Promise<void> {
    await this.assert("UPDATE");
    await prisma.invoice.update({ where: { id }, data: { status: "SENT" } });
  }

  async markPaid(id: string): Promise<void> {
    await this.assert("UPDATE");
    await prisma.invoice.update({ where: { id }, data: { status: "PAID", paidAt: new Date() } });
  }

  async remove(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.invoice.delete({ where: { id } });
    await this.audit("invoice.deleted", id);
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Invoice",
      targetId,
    });
  }
}
