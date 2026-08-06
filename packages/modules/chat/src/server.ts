import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import { publish } from "./emitter";

const MODULE = "chat";

export const channelSchema = z.object({
  name: z.string().min(1).max(80),
});

export const messageSchema = z.object({
  body: z.string().min(1).max(8000),
});

export class ChatService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for chat`);
    }
  }

  async listChannels() {
    await this.assert("READ");
    return prisma.chatChannel.findMany({
      where: { workspaceId: this.workspaceId },
      include: {
        members: { select: { userId: true } },
        _count: { select: { messages: true } },
      },
      orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
    });
  }

  async listMembers() {
    await this.assert("READ");
    return prisma.workspaceMember.findMany({
      where: { workspaceId: this.workspaceId, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async createChannel(name: string) {
    await this.assert("CREATE");
    const channel = await prisma.chatChannel.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name,
        kind: "CHANNEL",
        members: { create: { userId: this.userId } },
      },
    });
    await this.audit("channel.created", channel.id);
    return channel;
  }

  async createDm(targetUserId: string) {
    await this.assert("CREATE");
    if (targetUserId === this.userId) throw new Error("Cannot DM yourself");
    const exists = await prisma.chatChannel.findFirst({
      where: {
        workspaceId: this.workspaceId,
        kind: "DM",
        members: { every: { userId: { in: [this.userId, targetUserId] } } },
      },
    });
    if (exists) return exists;

    const channel = await prisma.chatChannel.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name: "direct",
        kind: "DM",
        members: {
          create: [{ userId: this.userId }, { userId: targetUserId }],
        },
      },
    });
    return channel;
  }

  async listMessages(channelId: string, limit = 50) {
    await this.assert("READ");
    const channel = await this.ownedChannel(channelId);
    const messages = await prisma.chatMessage.findMany({
      where: { channelId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return { channel, messages: messages.reverse() };
  }

  async sendMessage(channelId: string, body: string, authorName: string) {
    await this.assert("CREATE");
    await this.ownedChannel(channelId);
    const message = await prisma.chatMessage.create({
      data: {
        channelId,
        workspaceId: this.workspaceId,
        createdById: this.userId,
        authorName,
        body,
      },
    });
    await prisma.chatMember.upsert({
      where: { channelId_userId: { channelId, userId: this.userId } },
      create: { channelId, userId: this.userId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
    await prisma.chatChannel.update({ where: { id: channelId }, data: { updatedAt: new Date() } });
    publish(this.workspaceId, {
      type: "message",
      message: {
        id: message.id,
        channelId: message.channelId,
        workspaceId: message.workspaceId,
        createdById: message.createdById,
        authorName: message.authorName,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      },
    });
    return message;
  }

  async renameChannel(channelId: string, name: string) {
    await this.assert("UPDATE");
    await this.ownedChannel(channelId);
    await prisma.chatChannel.update({ where: { id: channelId }, data: { name } });
  }

  async removeChannel(channelId: string) {
    await this.assert("DELETE");
    await this.ownedChannel(channelId);
    await prisma.chatChannel.delete({ where: { id: channelId } });
    await this.audit("channel.deleted", channelId);
  }

  async deleteMessage(messageId: string) {
    await this.assert("DELETE");
    await prisma.chatMessage.delete({ where: { id: messageId } });
  }

  private async ownedChannel(channelId: string) {
    const channel = await prisma.chatChannel.findFirst({
      where: { id: channelId, workspaceId: this.workspaceId },
    });
    if (!channel) throw new Error("Channel not found in this workspace");
    return channel;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "ChatChannel",
      targetId,
    });
  }
}