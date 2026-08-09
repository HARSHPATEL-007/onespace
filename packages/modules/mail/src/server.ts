import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import { callLlm, composeFallbackReply, getTypingDelay } from "@n0va/modules-ani/providers";

const MODULE = "mail";

export const sendSchema = z.object({
  to: z.string().email(),
  subject: z.string().max(500).default("(no subject)"),
  body: z.string().max(100_000).default(""),
  bodyHtml: z.string().max(200_000).optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  signatureId: z.string().optional(),
  scheduledAt: z.string().optional(),
  replyToThreadId: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
});

export type MailFolder = "INBOX" | "SENT" | "ARCHIVE" | "TRASH";

export type MailUnreadCounts = Record<MailFolder, number>;

export type RuleCondition = {
  field: "subject" | "body" | "fromEmail" | "toEmails" | "isRead" | "isStarred" | "folder" | "direction";
  operator: "contains" | "equals" | "not_equals" | "regex" | "startsWith" | "endsWith";
  value: string | string[] | boolean;
  not?: boolean;
};

export type RuleAction =
  | { type: "addLabel"; labelId: string }
  | { type: "moveToFolder"; folder: MailFolder }
  | { type: "markRead" }
  | { type: "toggleStar"; starred: boolean }
  | { type: "autoReply"; body: string }
  | { type: "webhookTrigger"; url: string; payload: Record<string, unknown> }
  | { type: "aiClassify" }
  | { type: "createTask"; title: string; listId: string };

export type RuleLogic = { operator: "AND" | "OR"; conditions: RuleCondition[]; not?: boolean };

export interface AiSuggestion {
  content: string;
  typingDelayMs: number;
}

export type { MailStatus } from "@n0va/db";

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

  async send(input: {
    to: string;
    subject: string;
    body: string;
    bodyHtml?: string;
    cc?: string;
    bcc?: string;
    signatureId?: string;
    scheduledAt?: string;
    replyToThreadId?: string;
    attachmentIds?: string[];
  }) {
    await this.assert("CREATE");
    const threadId = input.replyToThreadId ?? crypto.randomUUID();
    const now = new Date();
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    const status = scheduledAt && scheduledAt > now ? "SCHEDULED" : "SENT";

    let signatureHtml = "";
    if (input.signatureId) {
      const sig = await prisma.mailSignature.findFirst({ where: { id: input.signatureId, workspaceId: this.workspaceId } });
      if (sig) signatureHtml = sig.contentHtml || sig.content;
    }

    const finalBodyHtml = input.bodyHtml ? `${input.bodyHtml}<br><br>${signatureHtml}` : signatureHtml ? `${input.body}<br><br>${signatureHtml}` : input.bodyHtml || "";

    const toEmails = [input.to, ...(input.cc ? input.cc.split(",").map(e => e.trim()).filter(Boolean) : [])];
    const ccEmails = input.cc ? input.cc.split(",").map(e => e.trim()).filter(Boolean) : [];
    const bccEmails = input.bcc ? input.bcc.split(",").map(e => e.trim()).filter(Boolean) : [];

    const message = await prisma.mailMessage.create({
      data: {
        workspaceId: this.workspaceId,
        threadId,
        direction: "OUT",
        folder: "SENT",
        status,
        fromName: "N0VA Workspace",
        fromEmail: "outbox@n0va.workspace",
        toEmails: toEmails,
        ccEmails: ccEmails,
        bccEmails: bccEmails,
        subject: input.subject,
        body: input.body,
        bodyHtml: finalBodyHtml,
        signatureId: input.signatureId ?? null,
        scheduledAt,
        inReplyToId: null,
        isRead: true,
        sentAt: scheduledAt ?? now,
      },
    });

    await this.audit("mail.sent", message.id);
    if (status === "SENT") void this._applyRulesToMessage(message);
    return message;
  }

  async reply(threadId: string, body: string, bodyHtml?: string) {
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
        ccEmails: [],
        bccEmails: [],
        subject: `Re: ${latest.subject}`,
        body,
        bodyHtml: bodyHtml || "",
        inReplyToId: latest.id,
        isRead: true,
      },
    });
    void this._applyRulesToMessage(message);
    return message;
  }

  async replyAll(threadId: string, body: string, bodyHtml?: string) {
    await this.assert("CREATE");
    const latest = await prisma.mailMessage.findFirst({
      where: { workspaceId: this.workspaceId, threadId },
      orderBy: { sentAt: "desc" },
    });
    if (!latest) throw new Error("Thread not found");

    // Reply to sender + all original recipients (exclude ourselves)
    const allTo = Array.isArray(latest.toEmails) ? latest.toEmails as string[] : [];
    const allCc = Array.isArray(latest.ccEmails) ? latest.ccEmails as string[] : [];
    const allEmails = [...new Set([latest.fromEmail, ...allTo, ...allCc])];
    const selfEmail = "outbox@n0va.workspace";
    const toEmails = allEmails.filter(e => e !== selfEmail);
    const ccEmails: string[] = [];

    const message = await prisma.mailMessage.create({
      data: {
        workspaceId: this.workspaceId,
        threadId,
        direction: "OUT",
        folder: "SENT",
        fromName: "N0VA Workspace",
        fromEmail: selfEmail,
        toEmails,
        ccEmails,
        bccEmails: [],
        subject: `Re: ${latest.subject}`,
        body,
        bodyHtml: bodyHtml || "",
        inReplyToId: latest.id,
        isRead: true,
      },
    });
    void this._applyRulesToMessage(message);
    return message;
  }

  async forward(threadId: string, toEmails: string[], body: string = "", bodyHtml?: string) {
    await this.assert("CREATE");
    const original = await prisma.mailMessage.findFirst({
      where: { workspaceId: this.workspaceId, threadId },
      orderBy: { sentAt: "desc" },
    });
    if (!original) throw new Error("Thread not found");

    const message = await prisma.mailMessage.create({
      data: {
        workspaceId: this.workspaceId,
        threadId,
        direction: "OUT",
        folder: "SENT",
        fromName: "N0VA Workspace",
        fromEmail: "outbox@n0va.workspace",
        toEmails,
        ccEmails: [],
        bccEmails: [],
        subject: `Fwd: ${original.subject}`,
        body,
        bodyHtml: bodyHtml || "",
        isForwarded: true,
        inReplyToId: original.id,
        isRead: true,
      },
    });
    await this.audit("mail.forwarded", message.id);
    void this._applyRulesToMessage(message);
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

  /* ── Contacts / Address Book ──────────────────────────────── */

  async createContact(input: {
    firstName?: string;
    lastName?: string;
    email: string;
    phone?: string;
    company?: string;
    jobTitle?: string;
    notes?: string;
    isFavorite?: boolean;
  }) {
    await this.assert("CREATE");
    const contact = await prisma.mailContact.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        firstName: input.firstName ?? "",
        lastName: input.lastName ?? "",
        email: input.email,
        phone: input.phone ?? "",
        company: input.company ?? "",
        jobTitle: input.jobTitle ?? "",
        notes: input.notes ?? "",
        isFavorite: input.isFavorite ?? false,
      },
    });
    await this.audit("mail.contact_created", contact.id);
    return contact;
  }

  async getContacts(search?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
      ];
    }
    return prisma.mailContact.findMany({
      where,
      orderBy: [{ isFavorite: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    });
  }

  async updateContact(contactId: string, input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    company?: string;
    jobTitle?: string;
    notes?: string;
    isFavorite?: boolean;
  }) {
    await this.assert("UPDATE");
    const contact = await prisma.mailContact.findFirst({ where: { id: contactId, workspaceId: this.workspaceId } });
    if (!contact) throw new Error("Contact not found");
    return prisma.mailContact.update({ where: { id: contactId }, data: input });
  }

  async deleteContact(contactId: string) {
    await this.assert("DELETE");
    await prisma.mailContact.deleteMany({ where: { id: contactId, workspaceId: this.workspaceId } });
  }

  async searchContacts(query: string) {
    await this.assert("READ");
    const contacts = await prisma.mailContact.findMany({
      where: {
        workspaceId: this.workspaceId,
        OR: [
          { firstName: { contains: query, mode: "insensitive" } },
          { lastName: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
          { company: { contains: query, mode: "insensitive" } },
        ],
      },
      select: { id: true, email: true, firstName: true, lastName: true, company: true },
      orderBy: [{ isFavorite: "desc" }, { lastName: "asc" }],
      take: 20,
    });
    return contacts;
  }

  /* ── Signatures ───────────────────────────────────────────── */

  async createSignature(input: { name: string; content: string; contentHtml?: string; isDefault?: boolean }) {
    await this.assert("CREATE");
    if (input.isDefault) {
      await prisma.mailSignature.updateMany({
        where: { workspaceId: this.workspaceId },
        data: { isDefault: false },
      });
    }
    const sig = await prisma.mailSignature.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name: input.name,
        content: input.content,
        contentHtml: input.contentHtml ?? "",
        isDefault: input.isDefault ?? false,
      },
    });
    await this.audit("mail.signature_created", sig.id);
    return sig;
  }

  async getSignatures() {
    await this.assert("READ");
    return prisma.mailSignature.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async updateSignature(sigId: string, input: { name?: string; content?: string; contentHtml?: string; isDefault?: boolean }) {
    await this.assert("UPDATE");
    if (input.isDefault) {
      await prisma.mailSignature.updateMany({
        where: { workspaceId: this.workspaceId, id: { not: sigId } },
        data: { isDefault: false },
      });
    }
    return prisma.mailSignature.update({ where: { id: sigId }, data: input });
  }

  async deleteSignature(sigId: string) {
    await this.assert("DELETE");
    await prisma.mailSignature.deleteMany({ where: { id: sigId, workspaceId: this.workspaceId } });
  }

  async getDefaultSignature() {
    await this.assert("READ");
    return prisma.mailSignature.findFirst({
      where: { workspaceId: this.workspaceId, isDefault: true },
    });
  }

  /* ── Auto-Responder ───────────────────────────────────────── */

  async setAutoResponder(input: {
    enabled: boolean;
    subject?: string;
    body?: string;
    startTime?: string;
    endTime?: string;
  }) {
    await this.assert("CREATE");
    const existing = await prisma.mailAutoResponder.findFirst({ where: { workspaceId: this.workspaceId } });
    if (existing) {
      const updated = await prisma.mailAutoResponder.update({
        where: { id: existing.id },
        data: {
          enabled: input.enabled,
          subject: input.subject ?? existing.subject,
          body: input.body ?? existing.body,
          startTime: input.startTime ? new Date(input.startTime) : existing.startTime,
          endTime: input.endTime ? new Date(input.endTime) : existing.endTime,
        },
      });
      await this.audit("mail.auto_responder_updated", updated.id);
      return updated;
    }
    const ar = await prisma.mailAutoResponder.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        enabled: input.enabled,
        subject: input.subject ?? "Out of Office",
        body: input.body ?? "I am currently out of office.",
        startTime: input.startTime ? new Date(input.startTime) : null,
        endTime: input.endTime ? new Date(input.endTime) : null,
      },
    });
    await this.audit("mail.auto_responder_created", ar.id);
    return ar;
  }

  async getAutoResponder() {
    await this.assert("READ");
    return prisma.mailAutoResponder.findFirst({ where: { workspaceId: this.workspaceId } });
  }

  async checkAndTriggerAutoResponder(fromEmail: string, threadId: string) {
    await this.assert("READ");
    const ar = await prisma.mailAutoResponder.findFirst({ where: { workspaceId: this.workspaceId, enabled: true } });
    if (!ar) return null;

    const now = new Date();
    if (ar.startTime && now < ar.startTime) return null;
    if (ar.endTime && now > ar.endTime) return null;

    // Check if we already auto-responded to this sender recently (within 24h)
    const recentAuto = await prisma.mailMessage.findFirst({
      where: {
        workspaceId: this.workspaceId,
        fromEmail: "outbox@n0va.workspace",
        autoRespond: true,
        sentAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });
    if (recentAuto) return null;

    // Send auto-response
    const message = await prisma.mailMessage.create({
      data: {
        workspaceId: this.workspaceId,
        threadId,
        direction: "OUT",
        folder: "SENT",
        status: "SENT",
        fromName: "N0VA Auto-Responder",
        fromEmail: "outbox@n0va.workspace",
        toEmails: [fromEmail],
        ccEmails: [],
        bccEmails: [],
        subject: ar.subject,
        body: ar.body,
        autoRespond: true,
        isRead: true,
      },
    });
    await this.audit("mail.auto_responded", message.id);
    return message;
  }

  /* ── Snooze ───────────────────────────────────────────────── */

  async snoozeThread(threadId: string, until: string) {
    await this.assert("UPDATE");
    await prisma.mailMessage.updateMany({
      where: { workspaceId: this.workspaceId, threadId },
      data: { snoozeUntil: new Date(until) },
    });
    await this.audit("mail.thread_snoozed", threadId);
  }

  async unsnoozeThread(threadId: string) {
    await this.assert("UPDATE");
    await prisma.mailMessage.updateMany({
      where: { workspaceId: this.workspaceId, threadId },
      data: { snoozeUntil: null },
    });
  }

  async getSnoozedThreads() {
    await this.assert("READ");
    const now = new Date();
    const messages = await prisma.mailMessage.findMany({
      where: {
        workspaceId: this.workspaceId,
        folder: "INBOX",
        snoozeUntil: { gt: now },
      },
      include: { labels: { include: { label: true } } },
      orderBy: { snoozeUntil: "asc" },
    });

    const threads = new Map<string, { messages: typeof messages; unread: number; starred: boolean; latestSentAt: Date; snoozeUntil: Date | null }>();
    for (const m of messages) {
      const t = threads.get(m.threadId) ?? { messages: [], unread: 0, starred: false, latestSentAt: m.sentAt, snoozeUntil: m.snoozeUntil };
      t.messages.push(m);
      if (!m.isRead) t.unread++;
      if (m.isStarred) t.starred = true;
      if (m.sentAt > t.latestSentAt) t.latestSentAt = m.sentAt;
      threads.set(m.threadId, t);
    }
    return [...threads.entries()].map(([threadId, t]) => ({
      threadId, messages: t.messages, unread: t.unread, starred: t.starred, latestSentAt: t.latestSentAt, snoozeUntil: t.snoozeUntil,
    }));
  }

  async getUnsnoozedThreads() {
    await this.assert("READ");
    const now = new Date();
    await prisma.mailMessage.updateMany({
      where: { workspaceId: this.workspaceId, folder: "INBOX", snoozeUntil: { lte: now } },
      data: { snoozeUntil: null },
    });
  }

  /* ── User Folders ─────────────────────────────────────────── */

  async createFolder(input: { name: string; parentFolderId?: string; color?: string }) {
    await this.assert("CREATE");
    const folder = await prisma.mailUserFolder.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name: input.name,
        parentFolderId: input.parentFolderId ?? null,
        color: input.color ?? "#7c5cfc",
      },
    });
    await this.audit("mail.folder_created", folder.id);
    return folder;
  }

  async getFolders() {
    await this.assert("READ");
    return prisma.mailUserFolder.findMany({
      where: { workspaceId: this.workspaceId },
      include: { childFolders: { orderBy: { sortOrder: "asc" } } },
      orderBy: [{ parentFolderId: "asc" }, { sortOrder: "asc" }],
    });
  }

  async updateFolder(folderId: string, input: { name?: string; color?: string; parentFolderId?: string | null; sortOrder?: number }) {
    await this.assert("UPDATE");
    return prisma.mailUserFolder.update({ where: { id: folderId }, data: input });
  }

  async deleteFolder(folderId: string) {
    await this.assert("DELETE");
    await prisma.mailUserFolder.deleteMany({ where: { id: folderId, workspaceId: this.workspaceId } });
  }

  async moveThreadToFolder(threadId: string, folderId: string | null) {
    await this.assert("UPDATE");
    // folderId null = move to INBOX (default system folder)
    await prisma.mailMessage.updateMany({
      where: { workspaceId: this.workspaceId, threadId },
      data: { folder: "INBOX" },
    });
    await this.audit("mail.thread_moved", threadId);
  }

  /* ── Scheduled Sending ────────────────────────────────────── */

  async getScheduledMessages() {
    await this.assert("READ");
    return prisma.mailMessage.findMany({
      where: { workspaceId: this.workspaceId, status: "SCHEDULED" },
      include: { labels: { include: { label: true } } },
      orderBy: { scheduledAt: "asc" },
    });
  }

  async cancelScheduledMessage(messageId: string) {
    await this.assert("UPDATE");
    await prisma.mailMessage.update({
      where: { id: messageId, workspaceId: this.workspaceId, status: "SCHEDULED" },
      data: { status: "DRAFT", folder: "SENT" },
    });
  }

  async sendScheduledMessage(messageId: string) {
    await this.assert("CREATE");
    const msg = await prisma.mailMessage.findFirst({ where: { id: messageId, workspaceId: this.workspaceId, status: "SCHEDULED" } });
    if (!msg) throw new Error("Scheduled message not found");

    const message = await prisma.mailMessage.update({
      where: { id: messageId },
      data: { status: "SENT", sentAt: new Date() },
    });
    void this._applyRulesToMessage(message);
    return message;
  }

  /* ── AI Features ─────────────────────────────────────────── */

  private async _resolveAiIntegration() {
    const candidate = await prisma.integration.findFirst({
      where: {
        workspaceId: this.workspaceId,
        provider: { in: ["openai", "anthropic", "gemini"] },
        enabled: true,
      },
      orderBy: { createdAt: "desc" },
    });
    if (candidate?.config) return candidate;

    if (
      process.env["OPENAI_API_KEY"] ||
      process.env["ANTHROPIC_API_KEY"] ||
      process.env["GOOGLE_API_KEY"] ||
      process.env["GEMINI_API_KEY"]
    ) {
      const provider = process.env["OPENAI_API_KEY"]
        ? "openai"
        : process.env["ANTHROPIC_API_KEY"]
          ? "anthropic"
          : "gemini";
      const token = process.env["OPENAI_API_KEY"] ?? process.env["ANTHROPIC_API_KEY"] ?? process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_API_KEY"]!;
      return {
        id: "env-llm",
        provider,
        name: "LLM (env)",
        enabled: true,
        config: {
          provider,
          token,
          model:
            provider === "openai"
              ? "gpt-4o-mini"
              : provider === "anthropic"
                ? "claude-3-5-sonnet-20241022"
                : "gemini-1.5-flash",
        },
        workspaceId: this.workspaceId,
      } as never;
    }

    return null;
  }

  async summarizeThread(threadId: string): Promise<AiSuggestion> {
    await this.assert("READ");
    const messages = await this.getThread(threadId);
    if (messages.length === 0) throw new Error("Thread not found");

    const threadText = messages
      .map((m) => `[${m.direction}] ${m.fromName || m.fromEmail}: ${m.body}`)
      .join("\n\n");

    const prompt = `Summarize the following email thread in 5 concise bullets. Focus on decisions, action items, and key context.\n\n${threadText}`;

    const integration = await this._resolveAiIntegration();
    let content: string;

    if (integration) {
      const cfg = integration.config as Record<string, unknown>;
      const result = await callLlm(
        cfg.provider as string,
        cfg.model as string,
        cfg,
        [{ role: "user", content: prompt }],
        [],
      );
      content = result.content;
    } else {
      content = composeFallbackReply(prompt, "thread summary");
    }

    return { content, typingDelayMs: getTypingDelay(messages.length) };
  }

  async suggestReply(threadId: string): Promise<AiSuggestion> {
    await this.assert("READ");
    const messages = await this.getThread(threadId);
    if (messages.length === 0) throw new Error("Thread not found");

    const latest = messages[messages.length - 1]!;
    const previous = messages.slice(0, -1).map((m) => `[${m.direction}] ${m.fromName || m.fromEmail}: ${m.body}`);
    const context = previous.join("\n\n");

    const prompt = `Write a concise, professional reply to the latest message from ${latest.fromName || latest.fromEmail}. Context:\n\n${context}\n\nLatest message body: ${latest.body}\n\nReply:`;

    const integration = await this._resolveAiIntegration();
    let content: string;

    if (integration) {
      const cfg = integration.config as Record<string, unknown>;
      const result = await callLlm(
        cfg.provider as string,
        cfg.model as string,
        cfg,
        [{ role: "user", content: prompt }],
        [],
      );
      content = result.content;
    } else {
      content = composeFallbackReply(prompt, "smart reply");
    }

    return { content, typingDelayMs: getTypingDelay(messages.length) };
  }

  async extractActionItems(threadId: string): Promise<string[]> {
    await this.assert("READ");
    const messages = await this.getThread(threadId);
    if (messages.length === 0) throw new Error("Thread not found");

    const threadText = messages
      .map((m) => `[${m.direction}] ${m.fromName || m.fromEmail}: ${m.body}`)
      .join("\n\n");

    const prompt = `Extract all action items and to-dos from this email thread. Return a JSON array of strings, each describing one action item. If none, return an empty array.\n\n${threadText}`;

    const integration = await this._resolveAiIntegration();
    let content: string;

    if (integration) {
      const cfg = integration.config as Record<string, unknown>;
      const result = await callLlm(
        cfg.provider as string,
        cfg.model as string,
        cfg,
        [{ role: "user", content: prompt }],
        [],
      );
      content = result.content;
    } else {
      content = composeFallbackReply(prompt, "action items");
    }

    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      /* fall through */
    }

    return content.split("\n").filter(Boolean).slice(0, 10);
  }

  async adjustTone(threadId: string, content: string, tone: "formal" | "concise" | "friendly" | "persuasive"): Promise<AiSuggestion> {
    await this.assert("READ");
    const messages = await this.getThread(threadId);
    if (messages.length === 0) throw new Error("Thread not found");

    const prompt = `Rewrite the following text to be ${tone}. Preserve the meaning but adjust the tone and style accordingly.\n\nText:\n${content}\n\nRewritten:`;

    const integration = await this._resolveAiIntegration();
    let aiContent: string;

    if (integration) {
      const cfg = integration.config as Record<string, unknown>;
      const result = await callLlm(
        cfg.provider as string,
        cfg.model as string,
        cfg,
        [{ role: "user", content: prompt }],
        [],
      );
      aiContent = result.content;
    } else {
      aiContent = composeFallbackReply(prompt, `adjust tone to ${tone}`);
    }

    return { content: aiContent, typingDelayMs: getTypingDelay(3) };
  }

  /* ── Search ─────────────────────────────────────────────── */

  async search(input: {
    query?: string;
    folder?: MailFolder;
    fromEmail?: string;
    isRead?: boolean;
    isStarred?: boolean;
    senderOrRecipient?: string;
  }): Promise<
    Array<{
      message: { threadId: string };
      labels: Array<{ id: string; name: string; color: string }>;
    }>
  > {
    await this.assert("READ");

    const OR: Array<Record<string, unknown>> = [];
    if (input.query) {
      OR.push({ subject: { contains: input.query, mode: "insensitive" as const } });
      OR.push({ body: { contains: input.query, mode: "insensitive" as const } });
    }
    if (input.fromEmail) {
      OR.push({ fromEmail: { equals: input.fromEmail } });
    }
    if (input.senderOrRecipient) {
      OR.push({ fromEmail: { contains: input.senderOrRecipient, mode: "insensitive" as const } });
      OR.push({ toEmails: { path: "$", string_contains: input.senderOrRecipient } });
    }

    const where: Record<string, unknown> = {
      workspaceId: this.workspaceId,
    };

    if (OR.length > 0) {
      if (input.query && input.fromEmail) {
        // If both query and fromEmail, use AND for fromEmail (it's an exact match)
        where.AND = { fromEmail: { equals: input.fromEmail } };
        where.OR = OR.filter((o) => !o.fromEmail);
      } else {
        where.OR = OR;
      }
    }

    if (input.folder) where.folder = input.folder;
    if (input.isRead !== undefined) where.isRead = input.isRead;
    if (input.isStarred !== undefined) where.isStarred = input.isStarred;

    const results = await prisma.mailMessage.findMany({
      where,
      include: { labels: { include: { label: true } } },
      orderBy: { sentAt: "desc" },
    });

    return results.map((m) => ({
      message: m,
      labels: m.labels.map((lm) => ({ id: lm.labelId, name: lm.label.name, color: lm.label.color })),
    }));
  }

  /* ── Drafts ─────────────────────────────────────────────── */

  async saveDraft(input: {
    subject: string;
    toEmails: string[];
    ccEmails?: string[];
    body: string;
    threadId?: string;
    scheduledAt?: Date;
    status?: "DRAFT" | "SCHEDULED" | "SENDING";
  }) {
    await this.assert("CREATE");
    const draft = await prisma.mailDraft.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        subject: input.subject,
        toEmails: input.toEmails,
        ccEmails: input.ccEmails ?? [],
        body: input.body,
        threadId: input.threadId ?? null,
        scheduledAt: input.scheduledAt ?? null,
        status: input.status ?? "DRAFT",
      },
    });
    await this.audit("mail.draft_saved", draft.id);
    return draft;
  }

  async getDrafts() {
    await this.assert("READ");
    return prisma.mailDraft.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getDraft(draftId: string) {
    await this.assert("READ");
    return prisma.mailDraft.findFirst({
      where: { id: draftId, workspaceId: this.workspaceId },
    });
  }

  async updateDraft(draftId: string, input: {
    subject?: string;
    toEmails?: string[];
    ccEmails?: string[];
    body?: string;
    scheduledAt?: Date | null;
    status?: "DRAFT" | "SCHEDULED" | "SENDING";
  }) {
    await this.assert("UPDATE");
    const draft = await prisma.mailDraft.findFirst({ where: { id: draftId, workspaceId: this.workspaceId } });
    if (!draft) throw new Error("Draft not found");

    const data: Record<string, unknown> = {};
    if (input.subject !== undefined) data.subject = input.subject;
    if (input.toEmails !== undefined) data.toEmails = input.toEmails;
    if (input.ccEmails !== undefined) data.ccEmails = input.ccEmails;
    if (input.body !== undefined) data.body = input.body;
    if (input.scheduledAt !== undefined) data.scheduledAt = input.scheduledAt;
    if (input.status !== undefined) data.status = input.status;

    return prisma.mailDraft.update({ where: { id: draftId }, data });
  }

  async deleteDraft(draftId: string) {
    await this.assert("DELETE");
    await prisma.mailDraft.deleteMany({ where: { id: draftId, workspaceId: this.workspaceId } });
  }

  async sendDraft(draftId: string): Promise<{ id: string; threadId: string }> {
    await this.assert("CREATE");
    const draft = await prisma.mailDraft.findFirst({ where: { id: draftId, workspaceId: this.workspaceId } });
    if (!draft) throw new Error("Draft not found");

    const threadId = draft.threadId ?? crypto.randomUUID();
    const message = await prisma.mailMessage.create({
      data: {
        workspaceId: this.workspaceId,
        threadId,
        direction: "OUT",
        folder: "SENT",
        fromName: "N0VA Workspace",
        fromEmail: "outbox@n0va.workspace",
        toEmails: draft.toEmails,
        subject: draft.subject,
        body: draft.body,
        inReplyToId: null,
        isRead: true,
      },
    });

    await prisma.mailDraft.delete({ where: { id: draftId } });
    await this.audit("mail.sent", message.id);
    void this._applyRulesToMessage(message);
    return message;
  }

  async replyAsDraft(threadId: string, body: string) {
    await this.assert("CREATE");
    const latest = await this.getThread(threadId);
    if (latest.length === 0) throw new Error("Thread not found");
    const latestMsg = latest[latest.length - 1]!;
    const draft = await this.saveDraft({
      subject: `Re: ${latestMsg.subject}`,
      toEmails: [latestMsg.fromEmail],
      body,
      threadId,
    });
    return draft;
  }

  /* ── Rules Engine ───────────────────────────────────────── */

  async createRule(input: {
    name: string;
    description?: string;
    enabled?: boolean;
    priority?: number;
    conditions: RuleLogic | RuleCondition[];
    actions: RuleAction[];
  }) {
    await this.assert("CREATE");
    const rule = await prisma.mailRule.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name: input.name,
        description: input.description ?? "",
        enabled: input.enabled ?? true,
        priority: input.priority ?? 100,
        conditions: input.conditions as unknown as string,
        actions: input.actions as unknown as string,
      },
    });
    await this.audit("mail.rule_created", rule.id);
    return rule;
  }

  async getRules() {
    await this.assert("READ");
    return prisma.mailRule.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    });
  }

  async getRule(ruleId: string) {
    await this.assert("READ");
    return prisma.mailRule.findFirst({ where: { id: ruleId, workspaceId: this.workspaceId } });
  }

  async updateRule(ruleId: string, input: {
    name?: string;
    description?: string;
    enabled?: boolean;
    priority?: number;
    conditions?: RuleLogic | RuleCondition[];
    actions?: RuleAction[];
  }) {
    await this.assert("UPDATE");
    const rule = await prisma.mailRule.findFirst({ where: { id: ruleId, workspaceId: this.workspaceId } });
    if (!rule) throw new Error("Rule not found");

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.enabled !== undefined) data.enabled = input.enabled;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.conditions !== undefined) data.conditions = input.conditions as unknown as string;
    if (input.actions !== undefined) data.actions = input.actions as unknown as string;

    return prisma.mailRule.update({ where: { id: ruleId }, data });
  }

  async deleteRule(ruleId: string) {
    await this.assert("DELETE");
    await prisma.mailRule.deleteMany({ where: { id: ruleId, workspaceId: this.workspaceId } });
  }

  async toggleRule(ruleId: string) {
    await this.assert("UPDATE");
    const rule = await prisma.mailRule.findFirst({ where: { id: ruleId, workspaceId: this.workspaceId } });
    if (!rule) throw new Error("Rule not found");
    return prisma.mailRule.update({ where: { id: ruleId }, data: { enabled: !rule.enabled } });
  }

  private async _applyRulesToMessage(message: {
    id: string;
    workspaceId: string;
    threadId: string;
    direction: string;
    folder: string;
    fromName: string;
    fromEmail: string;
    toEmails: unknown;
    subject: string;
    body: string;
    isRead: boolean;
    isStarred: boolean;
  }) {
    const rules = await prisma.mailRule.findMany({
      where: { workspaceId: this.workspaceId, enabled: true },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    });

    for (const rule of rules) {
      const conditions = rule.conditions as unknown as RuleLogic | RuleCondition[];
      const actions = rule.actions as unknown as RuleAction[];

      const matched = this._evaluateConditions(conditions, message);
      if (!matched) continue;

      for (const action of actions) {
        await this._executeAction(action, message);
      }

      await prisma.mailRule.update({
        where: { id: rule.id },
        data: { lastRunAt: new Date(), runCount: { increment: 1 } },
      });
    }
  }

  private _evaluateConditions(conditions: RuleLogic | RuleCondition[], message: Record<string, unknown>): boolean {
    const isLogic = (c: unknown): c is RuleLogic =>
      c !== null && typeof c === "object" && "operator" in c && "conditions" in c;

    if (isLogic(conditions)) {
      const results = conditions.conditions.map((c) => this._evaluateCondition(c, message));
      const match = conditions.operator === "OR" ? results.some(Boolean) : results.every(Boolean);
      return conditions.not ? !match : match;
    }

    return conditions.every((c) => this._evaluateCondition(c, message));
  }

  private _evaluateCondition(cond: RuleCondition, message: Record<string, unknown>): boolean {
    const fieldVal = cond.field === "toEmails" ? JSON.stringify(message.toEmails) : message[cond.field];

    let match: boolean;
    switch (cond.operator) {
      case "contains":
        match = typeof fieldVal === "string" && fieldVal.toLowerCase().includes(String(cond.value).toLowerCase());
        break;
      case "equals":
        match = String(fieldVal) === String(cond.value);
        break;
      case "not_equals":
        match = String(fieldVal) !== String(cond.value);
        break;
      case "startsWith":
        match = typeof fieldVal === "string" && fieldVal.startsWith(String(cond.value));
        break;
      case "endsWith":
        match = typeof fieldVal === "string" && fieldVal.endsWith(String(cond.value));
        break;
      case "regex":
        match = typeof fieldVal === "string" && new RegExp(String(cond.value)).test(fieldVal);
        break;
      default:
        match = false;
    }

    return cond.not ? !match : match;
  }

  private async _executeAction(action: RuleAction, message: { id: string; workspaceId: string; threadId: string; fromEmail: string; subject: string; body: string }) {
    switch (action.type) {
      case "addLabel": {
        const exists = await this.ownedMessage(message.id);
        await prisma.mailLabelMap.upsert({
          where: { messageId_labelId: { messageId: message.id, labelId: action.labelId } },
          create: { messageId: message.id, labelId: action.labelId, workspaceId: this.workspaceId },
          update: {},
        });
        break;
      }
      case "moveToFolder":
        await prisma.mailMessage.update({ where: { id: message.id }, data: { folder: action.folder } });
        break;
      case "markRead":
        await prisma.mailMessage.update({ where: { id: message.id }, data: { isRead: true } });
        break;
      case "toggleStar":
        await prisma.mailMessage.update({ where: { id: message.id }, data: { isStarred: action.starred } });
        break;
      case "webhookTrigger":
        void fetch(action.url, { method: "POST", body: JSON.stringify(action.payload) }).catch(() => {});
        break;
      case "autoReply":
        void this.reply(message.threadId, action.body);
        break;
      case "aiClassify":
        void this._autoLabelWithAI(message);
        break;
      case "createTask":
        void this._createTaskFromMail(message, action.title, action.listId);
        break;
    }
  }

  private async _autoLabelWithAI(message: { id: string; body: string; fromEmail: string; subject: string }) {
    const prompt = `Read this email and suggest a single short label (max 3 words). Only return the label text.\n\nFrom: ${message.fromEmail}\nSubject: ${message.subject}\nBody: ${message.body.slice(0, 500)}`;

    const integration = await this._resolveAiIntegration();
    let labelText: string;

    if (integration) {
      const cfg = integration.config as Record<string, unknown>;
      const result = await callLlm(cfg.provider as string, cfg.model as string, cfg, [{ role: "user", content: prompt }], []);
      labelText = result.content.trim().slice(0, 50);
    } else {
      labelText = composeFallbackReply(prompt, "label");
    }

    const existing = await prisma.mailLabel.findFirst({ where: { workspaceId: this.workspaceId, name: { equals: labelText, mode: "insensitive" } } });
    let label = existing;
    if (!label) {
      label = await prisma.mailLabel.create({ data: { workspaceId: this.workspaceId, name: labelText, color: "#7c5cfc" } });
    }
    await prisma.mailLabelMap.upsert({
      where: { messageId_labelId: { messageId: message.id, labelId: label.id } },
      create: { messageId: message.id, labelId: label.id, workspaceId: this.workspaceId },
      update: {},
    });
  }

  private async _createTaskFromMail(message: { subject: string; body: string }, title: string, listId: string) {
    await prisma.task.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        listId,
        title: title || `Follow up: ${message.subject.slice(0, 100)}`,
        completedAt: null,
      },
    });
  }

  /* ── Thread Helpers ────────────────────────────────────── */

  async threadSummary(threadId: string) {
    await this.assert("READ");
    const messages = await this.getThread(threadId);
    if (messages.length === 0) throw new Error("Thread not found");

    const threadText = messages
      .map((m) => `[${m.direction}] ${m.fromName || m.fromEmail}: ${m.body.slice(0, 200)}`)
      .join("\n\n");

    const prompt = `Provide a 3-sentence summary of this email thread:\n\n${threadText}`;

    const integration = await this._resolveAiIntegration();
    let content: string;

    if (integration) {
      const cfg = integration.config as Record<string, unknown>;
      const result = await callLlm(cfg.provider as string, cfg.model as string, cfg, [{ role: "user", content: prompt }], []);
      content = result.content;
    } else {
      content = composeFallbackReply(prompt, "thread summary");
    }

    return content;
  }

  async upsertThread(threadId: string) {
    await this.assert("READ");
    const messages = await this.getThread(threadId);
    if (messages.length === 0) throw new Error("Thread not found");

    const isRead = messages.every((m) => m.isRead);
    const isStarred = messages.some((m) => m.isStarred);
    const unreadCount = messages.filter((m) => !m.isRead).length;

    const participants = Array.from(
      new Set(messages.flatMap((m) => [m.fromEmail, ...(Array.isArray(m.toEmails) ? m.toEmails : [String(m.toEmails)])])),
    );

    const latest = messages.reduce((latest, m) => (m.sentAt > latest.sentAt ? m : latest));
    const folder = latest.folder;

    return prisma.mailThread.upsert({
      where: { workspaceId_threadId: { workspaceId: this.workspaceId, threadId } },
      update: {
        folder,
        subject: latest.subject,
        isRead,
        isStarred,
        unreadCount,
        messageCount: messages.length,
        participants: participants as unknown as string,
        latestSentAt: latest.sentAt,
        latestMsgId: latest.id,
      },
      create: {
        workspaceId: this.workspaceId,
        threadId,
        folder,
        subject: latest.subject,
        isRead,
        isStarred,
        unreadCount,
        messageCount: messages.length,
        participants: participants as unknown as string,
        latestSentAt: latest.sentAt,
        latestMsgId: latest.id,
      },
    });
  }
}
