import { z } from "zod";
import { prisma, logAudit, type Prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import { publish } from "./emitter";

const MODULE = "chat";

export const channelSchema = z.object({
  name: z.string().min(1).max(80),
});

export const messageSchema = z.object({
  body: z.string().min(1).max(8000),
});

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "🎉", "👀", "🚀"] as const;

export const reactionSchema = z.object({
  messageId: z.string().min(1),
  emoji: z.enum(REACTION_EMOJIS),
});

export const channelIdSchema = z.string().min(1);

export interface MessageReaction {
  emoji: string;
  userId: string;
  authorName: string;
}

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

  async react(messageId: string, emoji: string, authorName: string) {
    await this.assert("UPDATE");
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, workspaceId: this.workspaceId },
    });
    if (!message) throw new Error("Message not found in this workspace");
    const reactions = Array.isArray(message.reactions)
      ? (message.reactions as unknown as MessageReaction[])
      : [];
    const existing = reactions.findIndex(
      (r) => r.emoji === emoji && r.userId === this.userId,
    );
    const next =
      existing >= 0
        ? reactions.filter((_, i) => i !== existing)
        : [...reactions, { emoji, userId: this.userId, authorName }];
    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { reactions: next as unknown as Prisma.InputJsonValue },
    });
  }

  async unread(): Promise<Record<string, number>> {
    await this.assert("READ");
    const channels = await prisma.chatChannel.findMany({
      where: { workspaceId: this.workspaceId },
      select: { id: true },
    });
    const ids = channels.map((c) => c.id);
    if (ids.length === 0) return {};
    const members = await prisma.chatMember.findMany({
      where: { userId: this.userId, channelId: { in: ids } },
      select: { channelId: true, lastReadAt: true },
    });
    const lastRead = new Map(members.map((m) => [m.channelId, m.lastReadAt]));
    const rows = await Promise.all(
      ids.map(async (id) => {
        const since = lastRead.get(id);
        const count = since
          ? await prisma.chatMessage.count({
              where: { channelId: id, createdAt: { gt: since } },
            })
          : await prisma.chatMessage.count({ where: { channelId: id } });
        return [id, count] as const;
      }),
    );
    return Object.fromEntries(rows.filter(([, n]) => n > 0));
  }

  async markRead(channelId: string) {
    await this.assert("READ");
    await this.ownedChannel(channelId);
    await prisma.chatMember.upsert({
      where: { channelId_userId: { channelId, userId: this.userId } },
      create: { channelId, userId: this.userId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
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