import { z } from "zod";
import { prisma, logAudit, type Ticket, type TicketReply } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "customer-experience";

export const ticketSchema = z.object({
  requesterName: z.string().trim().min(1).max(120),
  requesterEmail: z.string().trim().email().max(200),
  subject: z.string().trim().min(1).max(200),
  description: z.string().max(4000).default(""),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
});

export class CxService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for customer-experience`);
    }
  }

  async tickets(): Promise<Array<Ticket & { replies: TicketReply[] }>> {
    await this.assert("READ");
    return prisma.ticket.findMany({
      where: { workspaceId: this.workspaceId },
      include: { replies: { orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async create(input: z.infer<typeof ticketSchema>): Promise<void> {
    await this.assert("CREATE");
    await prisma.ticket.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        requesterName: input.requesterName,
        requesterEmail: input.requesterEmail,
        subject: input.subject,
        description: input.description,
        priority: input.priority,
      },
    });
    await this.audit("ticket.created", input.subject);
  }

  async setStatus(id: string, status: string): Promise<void> {
    await this.assert("UPDATE");
    await prisma.ticket.update({ where: { id }, data: { status: status as never } });
  }

  async setPriority(id: string, priority: string): Promise<void> {
    await this.assert("UPDATE");
    await prisma.ticket.update({ where: { id }, data: { priority: priority as never } });
  }

  async reply(id: string, body: string): Promise<void> {
    await this.assert("CREATE");
    const ticket = await prisma.ticket.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!ticket) throw new Error("Ticket not found");
    await prisma.ticketReply.create({
      data: { ticketId: id, workspaceId: this.workspaceId, authorId: this.userId, body },
    });
    await prisma.ticket.update({ where: { id }, data: { updatedAt: new Date() } });
    await this.audit("ticket.replied", ticket.subject);
  }

  async remove(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.ticket.delete({ where: { id } });
    await this.audit("ticket.deleted", id);
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Ticket",
      targetId,
    });
  }
}
