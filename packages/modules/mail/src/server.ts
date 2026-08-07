import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "mail";

export const sendSchema = z.object({
  to: z.string().email(),
  subject: z.string().max(500).default("(no subject)"),
  body: z.string().max(100_000).default(""),
});

export type MailFolder = "INBOX" | "SENT" | "ARCHIVE" | "TRASH";

export type MailUnreadCounts = Record<MailFolder, number>;

export class MailService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for mail`);
    }
  }

  private where(folder: MailFolder) {
    return { workspaceId: this.workspaceId, folder };
  }

  async listFolder(folder: MailFolder) {
    await this.assert("READ");
    const messages = await prisma.mailMessage.findMany({
      where: this.where(folder),
      include: { labels: { include: { label: true } } },
      orderBy: { sentAt: "desc" },
    });

    const threads = new Map<
      string,
      { messages: typeof messages; unread: number; starred: boolean; latestSentAt: Date }
    >();
    for (const m of messages) {
      const t = threads.get(m.threadId) ?? { messages: [], unread: 0, starred: false, latestSentAt: m.sentAt };
      t.messages.push(m);
      if (!m.isRead) t.unread++;
      if (m.isStarred) t.starred = true;
      if (m.sentAt > t.latestSentAt) t.latestSentAt = m.sentAt;
      threads.set(m.threadId, t);
    }
    return [...threads.entries()]
      .map(([threadId, t]) => ({
        threadId,
        messages: t.messages,
        unread: t.unread,
        starred: t.starred,
        latestSentAt: t.latestSentAt,
      }))
      .sort((a, b) => b.latestSentAt.getTime() - a.latestSentAt.getTime());
  }

  async getThread(threadId: string) {
    await this.assert("READ");
    return prisma.mailMessage.findMany({
      where: { workspaceId: this.workspaceId, threadId },
      include: { labels: { include: { label: true } } },
      orderBy: { sentAt: "asc" },
    });
  }

  async unreadCounts() {
    await this.assert("READ");
    const rows = await prisma.mailMessage.groupBy({
      by: ["folder"],
      where: { workspaceId: this.workspaceId, isRead: false },
      _count: true,
    });
    const counts: MailUnreadCounts = { INBOX: 0, SENT: 0, ARCHIVE: 0, TRASH: 0 };
    for (const row of rows) counts[row.folder] = row._count;
    return counts;
  }

  async labels() {
    await this.assert("READ");
    return prisma.mailLabel.findMany({
      where: { workspaceId: this.workspaceId },
      include: { _count: { select: { messages: true } } },
      orderBy: { name: "asc" },
    });
  }

  async send(input: { to: string; subject: string; body: string; replyToThreadId?: string }) {
    await this.assert("CREATE");
    const threadId = input.replyToThreadId ?? crypto.randomUUID();
    const message = await prisma.mailMessage.create({
      data: {
        workspaceId: this.workspaceId,
        threadId,
        direction: "OUT",
        folder: "SENT",
        fromName: "N0VA Workspace",
        fromEmail: "outbox@n0va.workspace",
        toEmails: [input.to],
        subject: input.subject,
        body: input.body,
        inReplyToId: null,
        isRead: true,
      },
    });
    await this.audit("mail.sent", message.id);
    return message;
  }

  async reply(threadId: string, body: string) {
    await this.assert("CREATE");
    const latest = await prisma.mailMessage.findFirst({
      where: { workspaceId: this.workspaceId, threadId },
      orderBy: { sentAt: "desc" },
    });
    if (!latest) throw new Error("Thread not found");
    const to = latest.fromEmail;
    const message = await prisma.mailMessage.create({
      data: {
        workspaceId: this.workspaceId,
        threadId,
        direction: "OUT",
        folder: "SENT",
        fromName: "N0VA Workspace",
        fromEmail: "outbox@n0va.workspace",
        toEmails: [to],
        subject: `Re: ${latest.subject}`,
        body,
        inReplyToId: latest.id,
        isRead: true,
      },
    });
    return message;
  }

  async markThreadRead(threadId: string) {
    await this.assert("UPDATE");
    await prisma.mailMessage.updateMany({
      where: { workspaceId: this.workspaceId, threadId, isRead: false },
      data: { isRead: true },
    });
  }

  async toggleStar(messageId: string) {
    await this.assert("UPDATE");
    const m = await this.ownedMessage(messageId);
    await prisma.mailMessage.update({ where: { id: messageId }, data: { isStarred: !m.isStarred } });
  }

  async archiveThread(threadId: string) {
    await this.assert("UPDATE");
    await prisma.mailMessage.updateMany({
      where: { workspaceId: this.workspaceId, threadId, folder: "INBOX" },
      data: { folder: "ARCHIVE" },
    });
  }

  async trashThread(threadId: string) {
    await this.assert("DELETE");
    await prisma.mailMessage.updateMany({
      where: { workspaceId: this.workspaceId, threadId, folder: { in: ["INBOX", "SENT", "ARCHIVE"] } },
      data: { folder: "TRASH" },
    });
  }

  async restoreThread(threadId: string) {
    await this.assert("UPDATE");
    await prisma.mailMessage.updateMany({
      where: { workspaceId: this.workspaceId, threadId, folder: "TRASH" },
      data: { folder: "INBOX" },
    });
  }

  async deleteForever(threadId: string) {
    await this.assert("DELETE");
    await prisma.mailMessage.deleteMany({ where: { workspaceId: this.workspaceId, threadId } });
  }

  async createLabel(name: string, color: string) {
    await this.assert("CREATE");
    const label = await prisma.mailLabel.create({
      data: { workspaceId: this.workspaceId, name, color },
    });
    return label;
  }

  async assignLabel(messageId: string, labelId: string) {
    await this.assert("UPDATE");
    await this.ownedMessage(messageId);
    const label = await prisma.mailLabel.findFirst({ where: { id: labelId, workspaceId: this.workspaceId } });
    if (!label) throw new Error("Label not found");
    await prisma.mailLabelMap.upsert({
      where: { messageId_labelId: { messageId, labelId } },
      create: { messageId, labelId, workspaceId: this.workspaceId },
      update: {},
    });
  }

  async unassignLabel(messageId: string, labelId: string) {
    await this.assert("UPDATE");
    await prisma.mailLabelMap.deleteMany({ where: { messageId, labelId } });
  }

  private async ownedMessage(id: string) {
    const m = await prisma.mailMessage.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!m) throw new Error("Message not found in this workspace");
    return m;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "MailMessage",
      targetId,
    });
  }
}
