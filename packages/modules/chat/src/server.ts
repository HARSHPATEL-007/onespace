import { z } from "zod";
import { prisma, logAudit, type Prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import { publish } from "./emitter";

const MODULE = "chat";

export const channelSchema = z.object({
  name: z.string().min(1).max(80),
});

export const channelMetaSchema = z.object({
  topic: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().optional(),
});

export const messageSchema = z.object({
  body: z.string().min(1).max(50000),
});

export const attachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(127),
  sizeBytes: z.number().int().min(0).max(10737418240),
  storageKey: z.string().min(1),
  thumbnailKey: z.string().optional(),
  checksum: z.string().optional(),
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

export interface ChatAttachment {
  id: string;
  messageId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  thumbnailKey?: string | null;
  createdAt: Date;
}

export interface ThreadInfo {
  replyCount: number;
  participantCount: number;
  lastReplyAt: string | null;
  participants: string[];
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

  // ── Channels ──────────────────────────────────────────────────────

  async listChannels() {
    await this.assert("READ");
    return prisma.chatChannel.findMany({
      where: { workspaceId: this.workspaceId, archivedAt: null },
      include: {
        members: { select: { userId: true, role: true } },
        _count: { select: { messages: { where: { deletedAt: null } } } },
      },
      orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
    });
  }

  async getChannel(channelId: string) {
    await this.assert("READ");
    return prisma.chatChannel.findFirst({
      where: { id: channelId, workspaceId: this.workspaceId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true, image: true } } },
        },
        _count: { select: { messages: { where: { deletedAt: null } } } },
      },
    });
  }

  async createChannel(name: string, meta?: { topic?: string; description?: string; isPrivate?: boolean }) {
    await this.assert("CREATE");
    const channel = await prisma.chatChannel.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name,
        kind: "CHANNEL",
        topic: meta?.topic ?? "",
        description: meta?.description ?? "",
        isPrivate: meta?.isPrivate ?? false,
        members: { create: { userId: this.userId, role: "OWNER" } },
      },
    });
    await this.audit("channel.created", channel.id);
    return channel;
  }

  async updateChannel(channelId: string, data: { name?: string; topic?: string; description?: string; isPrivate?: boolean }) {
    await this.assert("UPDATE");
    await this.ownedChannel(channelId);
    const channel = await prisma.chatChannel.update({
      where: { id: channelId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.topic !== undefined && { topic: data.topic }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isPrivate !== undefined && { isPrivate: data.isPrivate }),
      },
    });
    await this.audit("channel.updated", channelId);
    return channel;
  }

  async addMember(channelId: string, targetUserId: string, memberRole: string = "MEMBER") {
    await this.assert("UPDATE");
    await this.ownedChannel(channelId);
    return prisma.chatMember.upsert({
      where: { channelId_userId: { channelId, userId: targetUserId } },
      create: { channelId, userId: targetUserId, role: memberRole as "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" },
      update: { role: memberRole as "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" },
    });
  }

  async removeMember(channelId: string, targetUserId: string) {
    await this.assert("UPDATE");
    await this.ownedChannel(channelId);
    await prisma.chatMember.deleteMany({
      where: { channelId, userId: targetUserId },
    });
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
          create: [
            { userId: this.userId, role: "MEMBER" },
            { userId: targetUserId, role: "MEMBER" },
          ],
        },
      },
    });
    return channel;
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

  // ── Members ────────────────────────────────────────────────────────

  async listMembers() {
    await this.assert("READ");
    return prisma.workspaceMember.findMany({
      where: { workspaceId: this.workspaceId, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    });
  }

  // ── Messages ───────────────────────────────────────────────────────

  async listMessages(channelId: string, limit = 50) {
    await this.assert("READ");
    const channel = await this.ownedChannel(channelId);
    const messages = await prisma.chatMessage.findMany({
      where: { channelId, parentId: null, deletedAt: null },
      include: {
        attachments: true,
        edits: { orderBy: { editedAt: "desc" }, take: 1 },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return { channel, messages: messages.reverse() };
  }

  async listThreadReplies(parentId: string) {
    await this.assert("READ");
    return prisma.chatMessage.findMany({
      where: { parentId, deletedAt: null },
      include: { attachments: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async sendMessage(channelId: string, body: string, authorName: string, opts?: { parentId?: string; attachments?: Array<z.infer<typeof attachmentSchema>> }) {
    await this.assert("CREATE");
    await this.ownedChannel(channelId);
    const bodyHtml = renderMarkdown(body);
    const message = await prisma.chatMessage.create({
      data: {
        channelId,
        workspaceId: this.workspaceId,
        createdById: this.userId,
        authorName,
        body,
        bodyHtml,
        parentId: opts?.parentId,
        attachments: opts?.attachments ? {
          create: opts.attachments.map(a => ({
            workspaceId: this.workspaceId,
            filename: a.filename,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            storageKey: a.storageKey,
            thumbnailKey: a.thumbnailKey,
            checksum: a.checksum,
          })),
        } : undefined,
      },
      include: { attachments: true },
    });
    await prisma.chatMember.upsert({
      where: { channelId_userId: { channelId, userId: this.userId } },
      create: { channelId, userId: this.userId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
    await prisma.chatChannel.update({ where: { id: channelId }, data: { updatedAt: new Date() } });
    const payload = {
      type: "message" as const,
      message: {
        id: message.id,
        channelId: message.channelId,
        workspaceId: message.workspaceId,
        createdById: message.createdById,
        authorName: message.authorName,
        body: message.body,
        bodyHtml: message.bodyHtml,
        parentId: message.parentId,
        createdAt: message.createdAt.toISOString(),
        attachments: message.attachments.map(a => ({
          id: a.id,
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          storageKey: a.storageKey,
          thumbnailKey: a.thumbnailKey,
        })),
      },
    };
    publish(this.workspaceId, payload);

    // Populate search index
    try {
      await prisma.chatSearchIndex.create({
        data: {
          messageId: message.id,
          channelId,
          workspaceId: this.workspaceId,
          authorName,
          body,
          searchVector: body.toLowerCase(),
        },
      });
    } catch {
      // Search index is best-effort
    }

    return message;
  }

  async editMessage(messageId: string, newBody: string) {
    await this.assert("UPDATE");
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, workspaceId: this.workspaceId, deletedAt: null },
    });
    if (!message) throw new Error("Message not found");
    if (message.createdById !== this.userId) {
      throw new Error("Can only edit your own messages");
    }
    await prisma.chatMessageEdit.create({
      data: {
        messageId,
        oldBody: message.body,
        newBody,
      },
    });
    const bodyHtml = renderMarkdown(newBody);
    return prisma.chatMessage.update({
      where: { id: messageId },
      data: { body: newBody, bodyHtml, editedAt: new Date() },
      include: { attachments: true },
    });
  }

  async deleteMessage(messageId: string) {
    await this.assert("DELETE");
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, workspaceId: this.workspaceId },
    });
    if (!message) throw new Error("Message not found");
    if (message.createdById !== this.userId && this.role !== "ADMIN" && this.role !== "OWNER") {
      throw new Error("Cannot delete this message");
    }
    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), body: "[deleted]", bodyHtml: "<p>[deleted]</p>" },
    });
  }

  // ── Reactions ──────────────────────────────────────────────────────

  async react(messageId: string, emoji: string, authorName: string) {
    await this.assert("UPDATE");
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, workspaceId: this.workspaceId, deletedAt: null },
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

  // ── Pins ───────────────────────────────────────────────────────────

  async pinMessage(messageId: string) {
    await this.assert("UPDATE");
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, workspaceId: this.workspaceId, deletedAt: null },
    });
    if (!message) throw new Error("Message not found");
    await prisma.chatPin.upsert({
      where: { messageId },
      create: { messageId, channelId: message.channelId, pinnedById: this.userId },
      update: {},
    });
    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { pinnedAt: new Date() },
    });
  }

  async unpinMessage(messageId: string) {
    await this.assert("UPDATE");
    await prisma.chatPin.deleteMany({ where: { messageId } });
    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { pinnedAt: null },
    });
  }

  async listPinned(channelId: string) {
    await this.assert("READ");
    return prisma.chatMessage.findMany({
      where: { channelId, pinnedAt: { not: null }, deletedAt: null },
      include: { pins: true },
      orderBy: { pinnedAt: "desc" },
    });
  }

  // ── Thread Info ────────────────────────────────────────────────────

  async getThreadInfo(parentId: string): Promise<ThreadInfo> {
    await this.assert("READ");
    const replies = await prisma.chatMessage.findMany({
      where: { parentId, deletedAt: null },
      select: { createdById: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const participants = [...new Set(replies.map(r => r.createdById))];
    return {
      replyCount: replies.length,
      participantCount: participants.length,
      lastReplyAt: replies.length > 0 ? replies[replies.length - 1]!.createdAt.toISOString() : null,
      participants,
    };
  }

  // ── Unread ─────────────────────────────────────────────────────────

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
              where: { channelId: id, createdAt: { gt: since }, deletedAt: null },
            })
          : await prisma.chatMessage.count({ where: { channelId: id, deletedAt: null } });
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

  async getReadReceipts(messageId: string): Promise<Array<{ userId: string; name: string; readAt: string }>> {
    await this.assert("READ");
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, workspaceId: this.workspaceId },
    });
    if (!message) return [];

    const members = await prisma.chatMember.findMany({
      where: {
        channelId: message.channelId,
        userId: { not: message.createdById },
        lastReadAt: { gte: message.createdAt },
      },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return members.map(m => ({
      userId: m.userId,
      name: m.user.name ?? m.user.email,
      readAt: m.lastReadAt?.toISOString() ?? "",
    }));
  }

  // ── Search ─────────────────────────────────────────────────────────

  async searchMessages(query: string, channelId?: string, limit = 50) {
    await this.assert("READ");
    const where: Prisma.ChatMessageWhereInput = {
      workspaceId: this.workspaceId,
      deletedAt: null,
      body: { contains: query, mode: "insensitive" as Prisma.QueryMode },
    };
    if (channelId) where.channelId = channelId;
    return prisma.chatMessage.findMany({
      where,
      include: {
        channel: { select: { name: true, kind: true } },
        attachments: { select: { filename: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────

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

// ── Simple markdown renderer ─────────────────────────────────────────

function renderMarkdown(input: string): string {
  let html = input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks ```language\ncode```
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
    const langLabel = lang ? `<div class="nv-code-lang">${lang}</div>` : "";
    return `<pre class="nv-code-block">${langLabel}<code>${code.trim()}</code></pre>`;
  });

  // Inline code `code`
  html = html.replace(/`([^`]+)`/g, '<code class="nv-code-inline">$1</code>');

  // Bold **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Italic *text*
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");

  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}
