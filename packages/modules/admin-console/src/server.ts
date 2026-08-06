import { z } from "zod";
import { prisma, logAudit, type AuditLog, type WorkspaceMember } from "@n0va/db";
import { rankOf, type Role } from "@n0va/authz";
import bcrypt from "bcryptjs";

const MODULE = "admin-console";

export const inviteSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().max(120).default(""),
  role: z.enum(["VIEWER", "MEMBER", "ADMIN"]),
});

export type MemberRow = WorkspaceMember & { user: { id: string; name: string | null; email: string; createdAt: Date } };

export class AdminConsoleService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert() {
    if (rankOf(this.role) < 3) throw new Error("ADMIN or OWNER role required");
  }

  async members(): Promise<MemberRow[]> {
    await this.assert();
    return prisma.workspaceMember.findMany({
      where: { workspaceId: this.workspaceId },
      include: { user: { select: { id: true, name: true, email: true, createdAt: true } } },
      orderBy: { joinedAt: "asc" },
    });
  }

  async setRole(memberId: string, role: Role): Promise<void> {
    await this.assert();
    if (role === "OWNER") throw new Error("Ownership cannot be reassigned here");
    const member = await prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId: this.workspaceId } });
    if (!member) throw new Error("Member not found");
    if (member.userId === this.userId && role !== "ADMIN") throw new Error("You cannot demote yourself");
    await prisma.workspaceMember.update({ where: { id: memberId }, data: { role } });
    await this.audit("console.role.changed", memberId);
  }

  async invite(input: z.infer<typeof inviteSchema>): Promise<{ email: string; temporaryPassword: string }> {
    await this.assert();
    const temporaryPassword = `nv-${crypto.randomUUID().slice(0, 10)}`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const user = await prisma.user.upsert({
      where: { email: input.email },
      update: { name: input.name || undefined, passwordHash },
      create: { email: input.email, name: input.name || null, passwordHash },
    });
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: this.workspaceId, userId: user.id } },
      update: { role: input.role, status: "ACTIVE" },
      create: { workspaceId: this.workspaceId, userId: user.id, role: input.role, status: "ACTIVE" },
    });
    await this.audit("console.member.invited", user.id);
    return { email: user.email, temporaryPassword };
  }

  async removeMember(memberId: string): Promise<void> {
    await this.assert();
    const member = await prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId: this.workspaceId } });
    if (!member) throw new Error("Member not found");
    if (member.userId === this.userId) throw new Error("You cannot remove yourself");
    await prisma.workspaceMember.delete({ where: { id: memberId } });
    await this.audit("console.member.removed", memberId);
  }

  async auditLog(take = 100): Promise<AuditLog[]> {
    await this.assert();
    return prisma.auditLog.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async security(): Promise<{ mfaEnabled: boolean; sessionTimeoutMin: number }> {
    await this.assert();
    const ws = await prisma.workspace.findUnique({ where: { id: this.workspaceId } });
    return { mfaEnabled: ws?.mfaEnabled ?? false, sessionTimeoutMin: ws?.sessionTimeoutMin ?? 60 };
  }

  async setSecurity(mfaEnabled: boolean, sessionTimeoutMin: number): Promise<void> {
    await this.assert();
    await prisma.workspace.update({
      where: { id: this.workspaceId },
      data: { mfaEnabled, sessionTimeoutMin: Math.max(5, Math.min(240, sessionTimeoutMin)) },
    });
    await this.audit("console.security.updated", this.workspaceId);
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "AdminConsole",
      targetId,
    });
  }
}
