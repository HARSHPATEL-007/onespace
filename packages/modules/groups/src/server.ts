import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "groups";

export const groupSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).default(""),
});

export class GroupsService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for groups`);
    }
  }

  async list() {
    await this.assert("READ");
    return prisma.group.findMany({
      where: { workspaceId: this.workspaceId },
      include: { _count: { select: { members: true } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async get(id: string) {
    await this.assert("READ");
    const group = await prisma.group.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });
    if (!group) throw new Error("Group not found in this workspace");
    return group;
  }

  async create(input: { name: string; description?: string }) {
    await this.assert("CREATE");
    const group = await prisma.group.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, ...input },
    });
    await this.audit("group.created", group.id);
    return group;
  }

  async update(id: string, input: { name: string; description?: string }) {
    await this.assert("UPDATE");
    await this.owned(id);
    return prisma.group.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    await this.assert("DELETE");
    await this.owned(id);
    await prisma.group.delete({ where: { id } });
    await this.audit("group.deleted", id);
  }

  async workspaceUsers(): Promise<Array<{ id: string; name: string | null; email: string }>> {
    await this.assert("READ");
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: this.workspaceId, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { joinedAt: "asc" },
    });
    return members.map((m) => m.user);
  }

  async addMember(groupId: string, userId: string) {
    await this.assert("UPDATE");
    await this.owned(groupId);
    return prisma.groupMember.upsert({
      where: { groupId_userId: { groupId, userId } },
      create: { groupId, userId, workspaceId: this.workspaceId },
      update: {},
    });
  }

  async removeMember(groupId: string, userId: string) {
    await this.assert("UPDATE");
    await this.owned(groupId);
    await prisma.groupMember.deleteMany({ where: { groupId, userId } });
  }

  private async owned(id: string) {
    const group = await prisma.group.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!group) throw new Error("Group not found in this workspace");
    return group;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Group",
      targetId,
    });
  }
}
