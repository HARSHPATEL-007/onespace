import { z } from "zod";
import { prisma, logAudit, type Prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import { publish } from "./emitter";
import { detectApproval, ApprovalService } from "@n0va/modules-approvals/server";
import { registerBackend, getDeliveryEngine, idempotencyKeyFor } from "./delivery";
import type { PolicyChannelKind } from "./delivery";
import { publishToRedis } from "./delivery/redis-bridge";
import {
  buildHyperContext,
  commitEventProposal,
  commitTaskProposal,
  enqueueOutbox,
  getHyperConfig,
  processOutbox,
} from "./hypertext";
import {
  auditAppend,
  assertGovernanceRole,
  assertMutable,
  classifyContent,
  complianceSnapshot,
  computeRetainUntil,
  encryptBundle,
  ensureApproval,
  ensurePolicies,
  getConfig,
  getEnvelope,
  getPolicy,
  govRoleOf,
  privilegedBypass,
  redactSensitive,
  requestApproval as requestApprovalRecord,
  reviewApproval as reviewApprovalRecord,
  rotateMasterKey as rotateMaster,
  sha3,
  verifyAuditChain as verifyChain,
  watermarkPayload,
  type ApprovalAction,
  type ArtifactType,
  type ClassificationLabel,
  type GovernanceRole,
  type RetentionTier,
} from "./compliance";

const MODULE = "chat";

// Register the chat fan-out backend once (in-process SSE emitter + Redis bridge
// so WS-gateway clients also receive Server-Action messages).
let __chatBackendRegistered = false;
function ensureChatBackend() {
  if (__chatBackendRegistered) return;
  __chatBackendRegistered = true;
  registerBackend("chat", async (ctx) => {
    const messagePayload = (ctx.payload as { message?: unknown }).message ?? ctx.payload;
    const { listenerCount } = publish(ctx.workspaceId, { type: "message", message: messagePayload });
    const channelId =
      (messagePayload as { channelId?: string } | null)?.channelId ?? ctx.channelId;
    await publishToRedis("n0va:chat:events", { type: "message", channel_id: channelId, message: messagePayload });
    const delivered = Math.max(listenerCount, 0);
    return {
      ok: true,
      targetCount: delivered,
      deliveredCount: delivered,
      reason: delivered === 0 ? "queued_durable" : "fanned_out",
    };
  });
}
ensureChatBackend();

export const channelSchema = z.object({
  name: z.string().min(1).max(80),
});

export const channelMetaSchema = z.object({
  topic: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  isPrivate: z.boolean().optional(),
  kind: z.enum(["CHANNEL", "ANNOUNCEMENT"]).optional(),
  classification: z.enum(["", "CONFIDENTIAL", "TOP_SECRET", "CLIENT_RESTRICTED", "LEGAL_MATTER", "PII"]).optional(),
  retentionTier: z.enum(["STANDARD", "EXTENDED", "COMPLIANCE", "GOVERNANCE", "BLOCKCHAIN", "LEGAL_HOLD"]).optional(),
});

export const ephemeralSchema = z.object({
  ttlSeconds: z.number().int().min(1).max(86400).optional(),
});

export const savedSearchSchema = z.object({
  name: z.string().min(1).max(80),
  query: z.string().min(1).max(300),
  filters: z.record(z.unknown()).optional(),
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

// ── DLP (Data Loss Prevention) ──────────────────────────────────────────

export interface DlpHit {
  rule: string;
  label: string;
  snippet: string;
}

const CONFIDENTIAL_MARKERS = [
  "confidential",
  "top secret",
  "classified",
  "eyes only",
  "internal use only",
  "do not distribute",
];

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function dlpScan(body: string): DlpHit[] {
  const hits: DlpHit[] = [];
  const lower = body.toLowerCase();

  for (const marker of CONFIDENTIAL_MARKERS) {
    if (lower.includes(marker)) {
      hits.push({ rule: "confidential_marker", label: "Confidential marker", snippet: marker });
    }
  }

  const ccMatches = body.match(/\b(?:\d[ -]?){13,19}\d\b/g) ?? [];
  for (const raw of ccMatches) {
    const digits = raw.replace(/[^0-9]/g, "");
    if ((digits.length >= 13 && digits.length <= 19) && luhnValid(digits)) {
      hits.push({ rule: "credit_card", label: "Credit card number", snippet: raw.trim().slice(0, 24) });
    }
  }

  const ssnMatches = body.match(/\b\d{3}-\d{2}-\d{4}\b/g) ?? [];
  for (const m of ssnMatches) {
    const n = parseInt(m.slice(0, 3), 10);
    if (n > 0 && n <= 899) {
      hits.push({ rule: "ssn", label: "Social Security number", snippet: m });
    }
  }

  const apiKeyPatterns: Array<[RegExp, string, string]> = [
    [/\bsk-[A-Za-z0-9]{20,}\b/g, "openai_key", "OpenAI API key"],
    [/\bghp_[A-Za-z0-9]{36}\b/g, "github_key", "GitHub personal access token"],
    [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "github_fine_key", "GitHub fine-grained token"],
    [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "slack_key", "Slack token"],
    [/\bAKIA[0-9A-Z]{16}\b/g, "aws_key", "AWS access key"],
    [/\bAIza[0-9A-Za-z_-]{35}\b/g, "gcp_key", "Google API key"],
    [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "jwt", "JWT token"],
  ];
  for (const [re, rule, label] of apiKeyPatterns) {
    const matches = body.match(re) ?? [];
    for (const m of matches) {
      hits.push({ rule, label, snippet: m.slice(0, 16) + "…" });
    }
  }

  return hits;
}

// ── Search operator parsing ─────────────────────────────────────────────

export interface ParsedSearch {
  term: string;
  fromName?: string;
  channelName?: string;
  hasFile?: boolean;
  hasImage?: boolean;
  hasVideo?: boolean;
  hasLink?: boolean;
  isThread?: boolean;
  before?: Date;
  after?: Date;
  typeCode?: boolean;
}

export function parseSearchQuery(query: string): ParsedSearch {
  const parsed: ParsedSearch = { term: "" };
  const terms: string[] = [];
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  for (const part of query.split(/\s+/)) {
    const [key = "", ...rest] = part.split(":");
    const value = rest.join(":");
    switch (key.toLowerCase()) {
      case "from":
        if (value) parsed.fromName = value;
        break;
      case "in":
        if (value) parsed.channelName = value.replace(/^#/, "");
        break;
      case "has":
        if (value === "file") parsed.hasFile = true;
        else if (value === "image") parsed.hasImage = true;
        else if (value === "video") parsed.hasVideo = true;
        else if (value === "link") parsed.hasLink = true;
        break;
      case "is":
        if (value === "thread") parsed.isThread = true;
        break;
      case "before":
        if (value && (dateRe.test(value) || !isNaN(Date.parse(value)))) {
          const d = dateRe.test(value) ? new Date(value + "T23:59:59Z") : new Date(value);
          if (!isNaN(d.getTime())) parsed.before = d;
        }
        break;
      case "after":
        if (value && (dateRe.test(value) || !isNaN(Date.parse(value)))) {
          const d = dateRe.test(value) ? new Date(value + "T00:00:00Z") : new Date(value);
          if (!isNaN(d.getTime())) parsed.after = d;
        }
        break;
      case "type":
        if (value === "code") parsed.typeCode = true;
        break;
      default:
        if (part.trim()) terms.push(part);
    }
  }
  parsed.term = terms.join(" ");
  return parsed;
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

  async createChannel(name: string, meta?: { topic?: string; description?: string; isPrivate?: boolean; kind?: "CHANNEL" | "ANNOUNCEMENT"; classification?: ClassificationLabel; retentionTier?: RetentionTier }) {
    await this.assert("CREATE");
    const kind = meta?.kind ?? "CHANNEL";
    if (kind === "ANNOUNCEMENT" && this.role !== "ADMIN" && this.role !== "OWNER") {
      throw new Error("Only admins can create announcement channels");
    }
    const channel = await prisma.chatChannel.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name,
        kind,
        topic: meta?.topic ?? "",
        description: meta?.description ?? "",
        isPrivate: meta?.isPrivate ?? false,
        classification: meta?.classification || null,
        retentionTier: meta?.retentionTier || null,
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
    const locked = await prisma.chatComplianceRecord.count({
      where: {
        workspaceId: this.workspaceId,
        OR: [
          { legalHold: true },
          { retainUntil: { gt: new Date() }, retentionMode: { in: ["COMPLIANCE", "GOVERNANCE", "BLOCKCHAIN"] } },
        ],
      },
    });
    if (locked > 0) {
      const bypass = await privilegedBypass(this.workspaceId, this.userId);
      if (!bypass) {
        throw new Error(`CHAT_009 This channel contains ${locked} record(s) under retention locks or legal hold`);
      }
      await auditAppend({
        workspaceId: this.workspaceId,
        actorId: this.userId,
        action: "worm.bypass",
        objectType: "CHANNEL",
        objectId: channelId,
        details: { locked },
      });
    }
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
    await this.attachCompliance(messages);
    await this.attachHyperContext(messages);
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

  async sendMessage(channelId: string, body: string, authorName: string, opts?: { parentId?: string; attachments?: Array<z.infer<typeof attachmentSchema>>; ttlSeconds?: number }) {
    await this.assert("CREATE");
    const channel = await this.ownedChannel(channelId);
    if (channel.kind === "ANNOUNCEMENT" && this.role !== "ADMIN" && this.role !== "OWNER") {
      throw new Error("Announcement channels are read-only for members");
    }

    const dlpHits = dlpScan(body);
    if (dlpHits.length > 0) {
      const labels = [...new Set(dlpHits.map((h) => h.label))].join(", ");
      await auditAppend({
        workspaceId: this.workspaceId,
        actorId: this.userId,
        action: "dlp.blocked",
        objectType: "MESSAGE",
        channelId,
        outcome: "DENIED",
        policyApplied: "dlp",
        details: { labels },
      });
      throw new Error(`CHAT_005 DLP violation detected: ${labels}`);
    }

    const ttlSeconds = opts?.ttlSeconds;
    const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;
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
        ttlSeconds,
        expiresAt,
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

    await this.applyCompliance(channel, message.id, body, opts?.parentId);

    await this.buildHyperContextFor(channel, message.id, message.createdAt, message.createdById);

    // Approval intent detection (best-effort: must never break messaging).
    try {
      const detection = await detectApproval({
        workspaceId: this.workspaceId,
        userId: this.userId,
        role: this.role,
        channelId,
        channelName: channel.name,
        channelTopic: (channel as { topic?: string | null }).topic ?? null,
        messageId: message.id,
        body,
        attachments: message.attachments.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType ?? null })),
      });
      if (detection) {
        const approvalSvc = new ApprovalService(this.workspaceId, this.userId, this.role);
        await approvalSvc.handleMessageDetection(detection, {
          channelId,
          channelName: channel.name,
          sourceMessageId: message.id,
          requesterName: authorName,
        });
      }
    } catch {
      // best-effort
    }

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
        ttlSeconds: message.ttlSeconds,
        expiresAt: message.expiresAt?.toISOString() ?? null,
        viewedBy: message.viewedBy,
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

    // Policy-driven delivery: fan-out + durable delivery-state tracking.
    try {
      await getDeliveryEngine().deliver({
        workspaceId: this.workspaceId,
        channelId,
        messageId: message.id,
        target: "chat",
        channelKind: (channel.kind as PolicyChannelKind) ?? "CHANNEL",
        payload: { message: payload.message },
        idempotencyKey: idempotencyKeyFor([this.workspaceId, "chat", message.id]),
      });
    } catch {
      // best-effort: must never break messaging
    }

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
    await this.assertMutableMessage(messageId);
    await prisma.chatMessageEdit.create({
      data: {
        messageId,
        oldBody: message.body,
        newBody,
      },
    });
    const bodyHtml = renderMarkdown(newBody);
    const updated = await prisma.chatMessage.update({
      where: { id: messageId },
      data: { body: newBody, bodyHtml, editedAt: new Date() },
      include: { attachments: true },
    });
    const channel = await this.ownedChannel(message.channelId);
    await this.buildHyperContextFor(channel, messageId, message.createdAt, message.createdById);
    return updated;
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
    await this.assertMutableMessage(messageId);
    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), body: "[deleted]", bodyHtml: "<p>[deleted]</p>" },
    });
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: "message.deleted",
      objectType: "MESSAGE",
      objectId: messageId,
      channelId: message.channelId,
      policyApplied: "retention",
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
    const parsed = parseSearchQuery(query);
    const where: Prisma.ChatMessageWhereInput = {
      workspaceId: this.workspaceId,
      deletedAt: null,
    };
    const textTerms = parsed.term.split(/\s+/).filter(Boolean);
    if (textTerms.length > 0) {
      where.AND = textTerms.map((t) => ({
        body: { contains: t, mode: "insensitive" as Prisma.QueryMode },
      }));
    }
    if (parsed.fromName) {
      where.authorName = { contains: parsed.fromName, mode: "insensitive" as Prisma.QueryMode };
    }
    if (parsed.isThread) where.parentId = { not: null };
    else where.parentId = null;
    if (parsed.hasFile || parsed.hasImage || parsed.hasVideo) {
      where.attachments = {
        some: parsed.hasImage
          ? { mimeType: { startsWith: "image/" } }
          : parsed.hasVideo
            ? { mimeType: { startsWith: "video/" } }
            : undefined,
      };
    }
    if (parsed.hasLink) where.body = { contains: "http", mode: "insensitive" as Prisma.QueryMode };
    if (parsed.typeCode) where.body = { contains: "```" };
    if (parsed.before || parsed.after) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (parsed.before) createdAt.lt = parsed.before;
      if (parsed.after) createdAt.gt = parsed.after;
      where.createdAt = createdAt;
    }
    if (channelId) where.channelId = channelId;
    if (parsed.channelName) {
      const channels = await prisma.chatChannel.findMany({
        where: { workspaceId: this.workspaceId, name: { contains: parsed.channelName, mode: "insensitive" as Prisma.QueryMode } },
        select: { id: true },
      });
      where.channelId = { in: channels.map((c) => c.id) };
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      include: {
        channel: { select: { name: true, kind: true } },
        attachments: { select: { filename: true, mimeType: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return { messages, parsed };
  }

  // ── Saved searches ─────────────────────────────────────────────────

  async saveSearch(name: string, query: string, filters?: Record<string, unknown>) {
    await this.assert("CREATE");
    return prisma.chatSavedSearch.create({
      data: { workspaceId: this.workspaceId, userId: this.userId, name, query, filters: (filters ?? {}) as Prisma.InputJsonValue },
    });
  }

  async listSavedSearches() {
    await this.assert("READ");
    return prisma.chatSavedSearch.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      orderBy: { updatedAt: "desc" },
    });
  }

  async deleteSavedSearch(searchId: string) {
    await this.assert("DELETE");
    await prisma.chatSavedSearch.deleteMany({
      where: { id: searchId, workspaceId: this.workspaceId, userId: this.userId },
    });
  }

  // ── Bookmarks ──────────────────────────────────────────────────────

  async toggleBookmark(messageId: string) {
    await this.assert("UPDATE");
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, workspaceId: this.workspaceId, deletedAt: null },
    });
    if (!message) throw new Error("Message not found");
    const existing = await prisma.chatBookmark.findUnique({
      where: { userId_messageId: { userId: this.userId, messageId } },
    });
    if (existing) {
      await prisma.chatBookmark.delete({ where: { id: existing.id } });
      return { bookmarked: false };
    }
    await prisma.chatBookmark.create({
      data: {
        workspaceId: this.workspaceId,
        userId: this.userId,
        messageId,
        channelId: message.channelId,
      },
    });
    return { bookmarked: true };
  }

  async listBookmarks() {
    await this.assert("READ");
    return prisma.chatBookmark.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      include: {
        message: {
          include: {
            channel: { select: { name: true, kind: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ── Presence ───────────────────────────────────────────────────────

  async setPresence(status: "ONLINE" | "AWAY" | "BUSY" | "DND" | "IDLE", customStatus?: string) {
    await this.assert("UPDATE");
    await prisma.presenceSession.upsert({
      where: { userId_workspaceId: { userId: this.userId, workspaceId: this.workspaceId } },
      create: {
        userId: this.userId,
        workspaceId: this.workspaceId,
        status,
        customStatus: customStatus ?? "",
      },
      update: {
        status,
        ...(customStatus !== undefined && { customStatus }),
        lastHeartbeat: new Date(),
      },
    });
    publish(this.workspaceId, {
      type: "presence" as const,
      user_id: this.userId,
      status: status.toLowerCase(),
    });
  }

  async listPresence() {
    await this.assert("READ");
    return prisma.presenceSession.findMany({
      where: { workspaceId: this.workspaceId, status: { not: "OFFLINE" } },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { status: "asc" },
    });
  }

  // ── Ephemeral lifecycle ────────────────────────────────────────────

  async markEphemeralViewed(messageId: string) {
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, workspaceId: this.workspaceId, ttlSeconds: { not: null }, deletedAt: null },
    });
    if (!message) return;
    const viewed = Array.isArray(message.viewedBy) ? (message.viewedBy as unknown as string[]) : [];
    if (viewed.includes(this.userId)) return;
    await prisma.chatMessage.update({
      where: { id: messageId },
      data: { viewedBy: [...viewed, this.userId] as unknown as Prisma.InputJsonValue },
    });
  }

  async purgeExpiredMessages() {
    const now = new Date();
    const expired = await prisma.chatMessage.findMany({
      where: { expiresAt: { lte: now }, deletedAt: null },
      select: { id: true },
    });
    const locked = await prisma.chatComplianceRecord.findMany({
      where: {
        objectType: "MESSAGE",
        objectId: { in: expired.map((m) => m.id) },
        OR: [
          { legalHold: true },
          { retainUntil: { gt: now }, retentionMode: { in: ["COMPLIANCE", "GOVERNANCE", "BLOCKCHAIN"] } },
        ],
      },
      select: { objectId: true },
    });
    const lockedIds = new Set(locked.map((l) => l.objectId));
    const purgeable = expired.filter((m) => !lockedIds.has(m.id)).map((m) => m.id);
    if (purgeable.length === 0) return { purged: 0, skipped: lockedIds.size };
    const result = await prisma.chatMessage.updateMany({
      where: { id: { in: purgeable } },
      data: {
        deletedAt: now,
        body: "[expired]",
        bodyHtml: "<p><em>This ephemeral message has expired</em></p>",
      },
    });
    return { purged: result.count, skipped: lockedIds.size };
  }

  // ── Compliance & governance ─────────────────────────────────────────

  async applyCompliance(channel: { id: string; kind: string; classification?: string | null; retentionTier?: string | null; name: string; topic?: string | null }, messageId: string, body: string, parentId?: string | null) {
    const parent = parentId
      ? await prisma.chatComplianceRecord.findUnique({ where: { objectType_objectId: { objectType: "MESSAGE", objectId: parentId } } })
      : null;
    const classification = classifyContent({
      channelClassification: channel.classification,
      channelName: channel.name,
      channelTopic: channel.topic ?? "",
      body,
      parentClassification: parent?.classification ?? null,
    });
    const config = await getConfig(this.workspaceId);
    const tier = (parent?.retentionMode ?? channel.retentionTier ?? "STANDARD") as RetentionTier;
    const policy = await getPolicy(this.workspaceId, tier, "MESSAGE");
    const retainUntil = computeRetainUntil(policy);
    const envelope = await getEnvelope(this.workspaceId, "PRODUCTION");
    const contentHash = sha3(`${body}|${messageId}`);
    const audit = await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: "message.created",
      objectType: "MESSAGE",
      objectId: messageId,
      channelId: channel.id,
      policyApplied: policy.name,
    });
    const record = await prisma.chatComplianceRecord.create({
      data: {
        workspaceId: this.workspaceId,
        objectType: "MESSAGE",
        objectId: messageId,
        classification: classification.label,
        classificationSource: classification.source,
        retentionMode: tier,
        retainUntil,
        legalHold: false,
        watermarkEnabled: config.watermarkEnabled,
        watermarkStyle: config.watermarkStyle,
        watermarkViewerScope: config.watermarkViewerScope,
        encAlgorithm: envelope.algorithm,
        keySource: "HSM",
        keyVersion: String(envelope.keyVersion),
        algTag: envelope.algTag,
        pqReady: envelope.pqReady,
        pqRequired: config.pqRequired,
        contentHash,
        chainPrev: audit.chainPrev,
        chainIndex: audit.chainIndex,
      },
    });
    if (classification.source === "INHERITED" || classification.label) {
      await auditAppend({
        workspaceId: this.workspaceId,
        actorId: this.userId,
        action: "classify.auto",
        objectType: "MESSAGE",
        objectId: messageId,
        channelId: channel.id,
        policyApplied: classification.label,
      });
    }
    return record;
  }

  async classifyMessage(messageId: string, label: ClassificationLabel) {
    await this.assert("UPDATE");
    const message = await prisma.chatMessage.findFirst({ where: { id: messageId, workspaceId: this.workspaceId } });
    if (!message) throw new Error("Message not found");
    const bypass = await privilegedBypass(this.workspaceId, this.userId);
    const rec = await prisma.chatComplianceRecord.findUnique({ where: { objectType_objectId: { objectType: "MESSAGE", objectId: messageId } } });
    if (rec) assertMutable(rec, { privilegedBypass: bypass });
    await prisma.chatComplianceRecord.upsert({
      where: { objectType_objectId: { objectType: "MESSAGE", objectId: messageId } },
      create: {
        workspaceId: this.workspaceId,
        objectType: "MESSAGE",
        objectId: messageId,
        classification: label,
        classificationSource: "MANUAL",
        retentionMode: "STANDARD",
        keySource: "HSM",
        encAlgorithm: "AES-256-GCM",
        contentHash: sha3(`${message.body}|${messageId}`),
      },
      update: { classification: label, classificationSource: "MANUAL" },
    });
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: "classify.manual",
      objectType: "MESSAGE",
      objectId: messageId,
      channelId: message.channelId,
      policyApplied: label || "none",
    });
    return { classified: label };
  }

  async extendRetention(objectId: string, objectType: ArtifactType, days: number) {
    await this.assert("UPDATE");
    const bypass = await privilegedBypass(this.workspaceId, this.userId);
    const rec = await prisma.chatComplianceRecord.findUnique({ where: { objectType_objectId: { objectType, objectId } } });
    if (!rec) throw new Error("Compliance record not found");
    if (rec.legalHold) throw new Error("CHAT_010 This record is under legal hold; retention is governed by the hold");
    const base = rec.retainUntil && rec.retainUntil.getTime() > Date.now() ? rec.retainUntil : new Date();
    const retainUntil = new Date(base.getTime() + days * 86_400_000);
    await prisma.chatComplianceRecord.update({
      where: { id: rec.id },
      data: { retainUntil },
    });
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: "retention.extended",
      objectType,
      objectId,
      policyApplied: `+${days}d`,
      details: { retainUntil: retainUntil.toISOString() },
    });
    return { retainUntil };
  }

  async placeLegalHold(opts: { scope: string; objectId?: string; objectType?: ArtifactType; reason: string }) {
    await this.assertGovernance(["LEGAL_ADMIN", "COMPLIANCE_OFFICER"]);
    const hold = await prisma.chatLegalHold.create({
      data: {
        workspaceId: this.workspaceId,
        scope: opts.scope,
        objectId: opts.objectId,
        objectType: opts.objectType,
        reason: opts.reason,
        placedBy: this.userId,
        placedById: this.userId,
      },
    });
    if (opts.objectId && opts.objectType) {
      await prisma.chatComplianceRecord.upsert({
        where: { objectType_objectId: { objectType: opts.objectType, objectId: opts.objectId } },
        create: {
          workspaceId: this.workspaceId,
          objectType: opts.objectType,
          objectId: opts.objectId,
          legalHold: true,
          legalHoldReason: opts.reason,
          keySource: "HSM",
          encAlgorithm: "AES-256-GCM",
          classification: "",
          contentHash: opts.objectType === "MESSAGE" ? sha3(`${opts.objectId}`) : null,
        },
        update: { legalHold: true, legalHoldReason: opts.reason },
      });
    }
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: "hold.placed",
      objectType: opts.objectType,
      objectId: opts.objectId,
      policyApplied: "legal_hold",
      details: { scope: opts.scope, reason: opts.reason },
    });
    return hold;
  }

  async releaseLegalHold(holdId: string, reason: string) {
    await this.assertGovernance(["LEGAL_ADMIN", "COMPLIANCE_OFFICER"]);
    const hold = await prisma.chatLegalHold.findFirst({ where: { id: holdId, workspaceId: this.workspaceId, active: true } });
    if (!hold) throw new Error("Active legal hold not found");
    await prisma.chatLegalHold.update({
      where: { id: holdId },
      data: { active: false, releasedBy: this.userId, releasedById: this.userId, releasedAt: new Date() },
    });
    if (hold.objectId && hold.objectType) {
      await prisma.chatComplianceRecord.updateMany({
        where: { objectType: hold.objectType, objectId: hold.objectId },
        data: { legalHold: false, legalHoldReason: null },
      });
    }
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: "hold.released",
      objectType: hold.objectType ?? undefined,
      objectId: hold.objectId ?? undefined,
      policyApplied: "legal_hold",
      details: { reason },
    });
    return hold;
  }

  async listLegalHolds(activeOnly = true) {
    await this.assert("READ");
    return prisma.chatLegalHold.findMany({
      where: { workspaceId: this.workspaceId, ...(activeOnly ? { active: true } : {}) },
      orderBy: { placedAt: "desc" },
    });
  }

  async listRetentionPolicies() {
    await this.assert("READ");
    await ensurePolicies(this.workspaceId);
    return prisma.chatRetentionPolicy.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: [{ tier: "asc" }, { scope: "asc" }],
    });
  }

  async updateRetentionPolicy(policyId: string, patch: { durationDays?: number | null; active?: boolean; anchor?: string }) {
    await this.assertGovernance(["COMPLIANCE_OFFICER", "SECURITY_ADMIN"]);
    const policy = await prisma.chatRetentionPolicy.findFirst({ where: { id: policyId, workspaceId: this.workspaceId } });
    if (!policy) throw new Error("Retention policy not found");
    if (patch.durationDays !== undefined && patch.durationDays !== null && policy.durationDays !== null && patch.durationDays < policy.durationDays) {
      throw new Error("CHAT_011 Lowering retention requires an approved LOWER_RETENTION request");
    }
    if (patch.active === false) {
      throw new Error("CHAT_011 Deactivating a retention policy requires an approved LOWER_RETENTION request");
    }
    const updated = await prisma.chatRetentionPolicy.update({
      where: { id: policyId },
      data: { durationDays: patch.durationDays, active: patch.active, anchor: patch.anchor },
    });
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: "retention.policy.updated",
      objectType: "POLICY",
      objectId: policyId,
      policyApplied: updated.name,
      details: { durationDays: updated.durationDays, active: updated.active },
    });
    return updated;
  }

  async listAudit(opts: { limit?: number; cursor?: string; action?: string }) {
    await this.assert("READ");
    return prisma.chatAuditLog.findMany({
      where: {
        workspaceId: this.workspaceId,
        ...(opts.action ? { action: opts.action } : {}),
        ...(opts.cursor ? { chainIndex: { lt: parseInt(opts.cursor, 10) } } : {}),
      },
      orderBy: { chainIndex: "desc" },
      take: opts.limit ?? 50,
    });
  }

  async verifyAuditChain() {
    await this.assert("READ");
    return verifyChain(this.workspaceId);
  }

  async requestApproval(action: ApprovalAction, rationale: string, objectId?: string, objectType?: ArtifactType) {
    await this.assert("UPDATE");
    const approval = await requestApprovalRecord(this.workspaceId, this.userId, action, rationale, objectId, objectType);
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: `approval.requested:${action}`,
      objectType: objectType,
      objectId,
      policyApplied: action,
    });
    return approval;
  }

  async reviewApproval(approvalId: string, approve: boolean, note?: string) {
    const approval = await reviewApprovalRecord(this.workspaceId, this.userId, approvalId, approve, note);
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: `approval.${approve ? "approved" : "rejected"}:${approval.action}`,
      objectId: approval.objectId ?? undefined,
      objectType: approval.objectType ?? undefined,
      policyApplied: approval.action,
      details: { note },
    });
    return approval;
  }

  async listApprovals(status?: "PENDING" | "APPROVED" | "REJECTED") {
    await this.assert("READ");
    return prisma.chatApproval.findMany({
      where: { workspaceId: this.workspaceId, ...(status ? { status } : {}) },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        reviewedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async assignGovernanceRole(userId: string, role: GovernanceRole) {
    await this.assertGovernance(["SECURITY_ADMIN"]);
    const assignment = await prisma.chatGovernanceAssignment.upsert({
      where: { workspaceId_userId: { workspaceId: this.workspaceId, userId } },
      create: { workspaceId: this.workspaceId, userId, role, createdById: this.userId },
      update: { role },
    });
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: "governance.role.assigned",
      objectType: "USER",
      objectId: userId,
      policyApplied: role,
    });
    return assignment;
  }

  async removeGovernanceRole(userId: string) {
    await this.assertGovernance(["SECURITY_ADMIN"]);
    await prisma.chatGovernanceAssignment.deleteMany({ where: { workspaceId: this.workspaceId, userId } });
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: "governance.role.removed",
      objectType: "USER",
      objectId: userId,
    });
  }

  async listGovernanceAssignments() {
    await this.assert("READ");
    return prisma.chatGovernanceAssignment.findMany({
      where: { workspaceId: this.workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async getComplianceConfig() {
    await this.assert("READ");
    return getConfig(this.workspaceId);
  }

  async updateComplianceConfig(patch: { watermarkEnabled?: boolean; watermarkStyle?: string; watermarkViewerScope?: string; externalStronger?: boolean; pqRequired?: boolean; exportRedaction?: boolean; derivedPropagation?: boolean; keyRotationDays?: number }) {
    await this.assertGovernance(["SECURITY_ADMIN"]);
    if (patch.watermarkEnabled === false) {
      throw new Error("CHAT_011 Disabling watermarking requires an approved DISABLE_WATERMARK request");
    }
    const config = await prisma.chatComplianceConfig.upsert({
      where: { workspaceId: this.workspaceId },
      create: { workspaceId: this.workspaceId, ...patch },
      update: patch,
    });
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: "compliance.config.updated",
      policyApplied: "config",
      details: patch as Record<string, unknown>,
    });
    return config;
  }

  async rotateMasterKey() {
    await this.assertGovernance(["SECURITY_ADMIN"]);
    const result = await rotateMaster(this.workspaceId);
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: "key.rotated",
      policyApplied: `master_v${result.masterKeyVersion}`,
      details: { reWrapped: result.reWrapped },
    });
    return result;
  }

  async watermarkPreview(objectId: string, objectType: ArtifactType, version = 1) {
    await this.assert("READ");
    const config = await getConfig(this.workspaceId);
    const user = await prisma.user.findUnique({ where: { id: this.userId } });
    const workspace = await prisma.workspace.findUnique({ where: { id: this.workspaceId } });
    return watermarkPayload({
      workspaceId: this.workspaceId,
      workspaceName: workspace?.name ?? "",
      config,
      objectId,
      objectType,
      viewerId: this.userId,
      viewerName: user?.name ?? "Member",
      viewerEmail: user?.email ?? "",
      version,
    });
  }

  async exportMessages(opts: { scope: "CHANNEL" | "WORKSPACE" | "THREAD"; channelId?: string; parentId?: string; since?: string }) {
    await this.assert("READ");
    const where: Prisma.ChatMessageWhereInput = {
      workspaceId: this.workspaceId,
      deletedAt: null,
      ...(opts.channelId ? { channelId: opts.channelId } : {}),
      ...(opts.parentId ? { parentId: opts.parentId } : {}),
      ...(opts.scope === "WORKSPACE" ? {} : opts.parentId ? {} : { parentId: null }),
      ...(opts.since ? { createdAt: { gte: new Date(opts.since) } } : {}),
    };
    const messages = await prisma.chatMessage.findMany({
      where,
      include: {
        attachments: true,
        channel: { select: { name: true, kind: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 2000,
    });
    await this.attachCompliance(messages);
    const config = await getConfig(this.workspaceId);
    const user = await prisma.user.findUnique({ where: { id: this.userId } });
    const workspace = await prisma.workspace.findUnique({ where: { id: this.workspaceId } });
    const confidential = messages.some((m) => (m as any).compliance?.[0]?.classification || (m as any).compliance?.[0]?.retentionMode === "COMPLIANCE");
    if (confidential) {
      await ensureApproval(this.workspaceId, this.userId, "EXPORT_CONFIDENTIAL");
    }
    const needEncryption = messages.some((m) => {
      const rec = (m as any).compliance?.[0];
      return rec && (["COMPLIANCE", "GOVERNANCE", "BLOCKCHAIN"].includes(rec.retentionMode) || rec.pqRequired);
    });
    const envelope = needEncryption ? await getEnvelope(this.workspaceId, "PRODUCTION") : null;
    const version = Date.now();
    const wm = watermarkPayload({
      workspaceId: this.workspaceId,
      workspaceName: workspace?.name ?? "",
      config,
      objectId: `export_${version}`,
      objectType: "EXPORT",
      viewerId: this.userId,
      viewerName: user?.name ?? "Member",
      viewerEmail: user?.email ?? "",
      version,
    });
    const artifacts = messages.map((m) => {
      const rec = (m as any).compliance?.[0];
      const isSensitive = !!rec?.classification || rec?.retentionMode === "COMPLIANCE";
      return {
        id: m.id,
        channel: m.channel.name,
        author: m.authorName,
        createdAt: m.createdAt.toISOString(),
        body: isSensitive && config.exportRedaction ? redactSensitive(m.body) : m.body,
        attachments: m.attachments.map((a) => ({ filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes })),
        compliance: rec ? {
          classification: rec.classification,
          retentionMode: rec.retentionMode,
          retainUntil: rec.retainUntil?.toISOString() ?? null,
          legalHold: rec.legalHold,
          hash: rec.contentHash,
        } : null,
      };
    });
    const receipt = sha3(JSON.stringify({ scope: opts.scope, version, count: artifacts.length, viewer: this.userId }));
    const bundle = { scope: opts.scope, version, generatedAt: new Date().toISOString(), watermark: wm, receipt, artifacts };
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: "export.downloaded",
      objectType: "EXPORT",
      channelId: opts.channelId,
      outcome: "SUCCESS",
      policyApplied: needEncryption ? "encrypted_bundle" : "plain",
      details: { scope: opts.scope, count: artifacts.length, confidential, encrypted: !!envelope },
    });
    let payload: unknown = bundle;
    let encryption = null;
    if (envelope) {
      const encrypted = encryptBundle(Buffer.from(JSON.stringify(bundle), "utf8"), envelope, `${this.workspaceId}|${receipt}`);
      encryption = { algorithm: encrypted.algorithm, keyVersion: encrypted.keyVersion, masterKeyVersion: encrypted.masterKeyVersion, pqReady: encrypted.pqReady, algTag: encrypted.algTag };
      payload = { ...encrypted, receipt, watermark: wm };
    }
    return { bundle: payload, encryption, receipt };
  }

  async listComplianceStats() {
    await this.assert("READ");
    const now = new Date();
    const [byTier, held, expiring, expired, dlpBlocked, denied, total, watermarkCoverage, keyRecords, pqRequired] = await Promise.all([
      prisma.chatComplianceRecord.groupBy({ by: ["retentionMode"], _count: true, where: { workspaceId: this.workspaceId } }),
      prisma.chatComplianceRecord.count({ where: { workspaceId: this.workspaceId, legalHold: true } }),
      prisma.chatComplianceRecord.count({ where: { workspaceId: this.workspaceId, retainUntil: { gte: now, lte: new Date(now.getTime() + 30 * 86_400_000) } } }),
      prisma.chatComplianceRecord.count({ where: { workspaceId: this.workspaceId, retainUntil: { lt: now } } }),
      prisma.chatAuditLog.count({ where: { workspaceId: this.workspaceId, action: "dlp.blocked" } }),
      prisma.chatAuditLog.count({ where: { workspaceId: this.workspaceId, outcome: "DENIED" } }),
      prisma.chatComplianceRecord.count({ where: { workspaceId: this.workspaceId } }),
      prisma.chatComplianceRecord.count({ where: { workspaceId: this.workspaceId, watermarkEnabled: true } }),
      prisma.chatKeyRecord.findMany({ where: { workspaceId: this.workspaceId } }),
      prisma.chatComplianceRecord.count({ where: { workspaceId: this.workspaceId, pqRequired: true } }),
    ]);
    return {
      byTier,
      held,
      expiringSoon: expiring,
      expired,
      dlpBlocked,
      deniedActions: denied,
      records: total,
      watermarkCoverage: total > 0 ? Math.round((watermarkCoverage / total) * 100) : 100,
      pqRequired,
      keys: keyRecords.map((k) => ({
        purpose: k.purpose,
        keyVersion: k.keyVersion,
        masterKeyVersion: k.masterKeyVersion,
        rotatedAt: k.rotatedAt,
        pqReady: k.pqReady,
      })),
    };
  }

  // ── Hyper-context ───────────────────────────────────────────────────

  async getHyperContext(messageId: string) {
    await this.assert("READ");
    const message = await prisma.chatMessage.findFirst({
      where: { id: messageId, workspaceId: this.workspaceId },
    });
    if (!message) throw new Error("Message not found");
    const [context, suggestions, taskProposal, eventProposal, approval] = await Promise.all([
      prisma.chatHyperContext.findUnique({ where: { messageId } }),
      prisma.chatLinkSuggestion.findMany({
        where: { workspaceId: this.workspaceId, messageId },
        orderBy: { score: "desc" },
      }),
      prisma.chatTaskProposal.findUnique({ where: { id: `task:${messageId}`.slice(0, 191) } }),
      prisma.chatEventProposal.findUnique({ where: { id: `event:${messageId}`.slice(0, 191) } }),
      prisma.chatApprovalRequest.findUnique({ where: { id: `approval:${messageId}`.slice(0, 191) } }),
    ]);
    return { context: context ?? null, suggestions, taskProposal, eventProposal, approval, config: await getHyperConfig(this.workspaceId) };
  }

  async confirmLink(suggestionId: string) {
    await this.assert("UPDATE");
    const suggestion = await prisma.chatLinkSuggestion.findFirst({
      where: { id: suggestionId, workspaceId: this.workspaceId },
    });
    if (!suggestion) throw new Error("Link suggestion not found");
    await prisma.chatLinkSuggestion.update({ where: { id: suggestionId }, data: { status: "CONFIRMED" } });
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: "hyperlink.confirmed",
      objectType: "MESSAGE",
      objectId: suggestion.messageId,
      channelId: undefined,
      policyApplied: "hypercontext",
      details: { module: suggestion.module, objectId: suggestion.objectId, score: suggestion.score },
    });
    return { ok: true };
  }

  async reweightLink(suggestionId: string, reweight: number) {
    await this.assert("UPDATE");
    const suggestion = await prisma.chatLinkSuggestion.findFirst({
      where: { id: suggestionId, workspaceId: this.workspaceId },
    });
    if (!suggestion) throw new Error("Link suggestion not found");
    if (reweight < 0 || reweight > 1) throw new Error("reweight must be between 0 and 1");
    await prisma.chatLinkSuggestion.update({
      where: { id: suggestionId },
      data: { reweight, status: "REWEIGHTED" },
    });
    return { ok: true };
  }

  async rejectLink(suggestionId: string) {
    await this.assert("UPDATE");
    const suggestion = await prisma.chatLinkSuggestion.findFirst({
      where: { id: suggestionId, workspaceId: this.workspaceId },
    });
    if (!suggestion) throw new Error("Link suggestion not found");
    await prisma.chatLinkSuggestion.update({ where: { id: suggestionId }, data: { status: "REJECTED" } });
    return { ok: true };
  }

  async commitTask(proposalId: string) {
    await this.assert("CREATE");
    const proposal = await prisma.chatTaskProposal.findFirst({
      where: { id: proposalId, workspaceId: this.workspaceId },
    });
    if (!proposal) throw new Error("Task proposal not found");
    const result = await commitTaskProposal(this.workspaceId, proposalId);
    publish(this.workspaceId, { type: "hyperctx", action: "task_committed", message_id: proposal.messageId, task_id: result.taskId });
    return { ...result, action: "task_committed" };
  }

  async commitEvent(proposalId: string) {
    await this.assert("CREATE");
    const proposal = await prisma.chatEventProposal.findFirst({
      where: { id: proposalId, workspaceId: this.workspaceId },
    });
    if (!proposal) throw new Error("Event proposal not found");
    const result = await commitEventProposal(this.workspaceId, proposalId);
    publish(this.workspaceId, { type: "hyperctx", action: "event_committed", message_id: proposal.messageId, event_id: result.meetingId });
    return { ...result, action: "event_committed" };
  }

  async raiseApproval(proposalId: string) {
    await this.assert("CREATE");
    const proposal = await prisma.chatApprovalRequest.findFirst({
      where: { id: proposalId, workspaceId: this.workspaceId },
    });
    if (!proposal) throw new Error("Approval proposal not found");
    await enqueueOutbox({
      workspaceId: this.workspaceId,
      messageId: proposal.messageId,
      actionType: "RAISE_APPROVAL",
      module: "approvals",
      payload: { proposalId, requestType: proposal.requestType, amount: proposal.amount },
      causeEventId: proposal.messageId,
    });
    await auditAppend({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      action: "approval.raised",
      objectType: "MESSAGE",
      objectId: proposal.messageId,
      channelId: undefined,
      policyApplied: "hypercontext",
      details: { requestType: proposal.requestType, amount: proposal.amount },
    });
    return { ok: true, action: "approval_raised" };
  }

  async getHyperConfigFor() {
    await this.assert("READ");
    return getHyperConfig(this.workspaceId);
  }

  async updateHyperConfig(patch: { autoCreateTasks?: boolean; taskConfidence?: number; autoCreateEvents?: boolean; eventConfidence?: number; autoRaiseApprovals?: boolean; approvalConfidence?: number; maxLinks?: number; notifyOnAutoCreate?: boolean }) {
    await this.assert("UPDATE");
    this.requireAdmin();
    return prisma.chatHyperConfig.upsert({
      where: { workspaceId: this.workspaceId },
      create: { workspaceId: this.workspaceId, ...patch },
      update: patch,
    });
  }

  async listOutbox(status?: string) {
    await this.assert("READ");
    this.requireAdmin();
    return prisma.chatOutboxEvent.findMany({
      where: { workspaceId: this.workspaceId, ...(status ? { status } : {}) },
      orderBy: { causalOrder: "desc" },
      take: 100,
    });
  }

  async retryOutbox(eventId: string) {
    await this.assert("UPDATE");
    this.requireAdmin();
    const event = await prisma.chatOutboxEvent.findFirst({
      where: { id: eventId, workspaceId: this.workspaceId },
    });
    if (!event) throw new Error("Outbox event not found");
    await prisma.chatOutboxEvent.update({
      where: { id: eventId },
      data: { status: "PENDING", attempts: 0, error: null },
    });
    const results = await this.processPendingOutbox(1);
    return { results };
  }

  async processPendingOutbox(limit = 25) {
    await this.assert("UPDATE");
    this.requireAdmin();
    return processOutbox(this.workspaceId, this.outboxConsumers(), limit);
  }

  private requireAdmin() {
    if (this.role !== "ADMIN" && this.role !== "OWNER") {
      throw new Error("Requires admin or owner role");
    }
  }

  private outboxConsumers() {
    return [
      {
        key: "CREATE_TASK",
        run: async (_ws: string, payload: Record<string, unknown>) => {
          const proposalId = String(payload.proposalId);
          await commitTaskProposal(_ws, proposalId);
        },
      },
      {
        key: "CREATE_EVENT",
        run: async (_ws: string, payload: Record<string, unknown>) => {
          const proposalId = String(payload.proposalId);
          await commitEventProposal(_ws, proposalId);
        },
      },
      {
        key: "RAISE_APPROVAL",
        run: async (ws: string, payload: Record<string, unknown>) => {
          const proposalId = String(payload.proposalId);
          const p = await prisma.chatApprovalRequest.findUnique({ where: { id: proposalId } });
          if (!p) throw new Error("Approval proposal not found");
          await prisma.chatApprovalRequest.update({ where: { id: proposalId }, data: { status: "RAISED" } });
          publish(ws, { type: "hyperctx", action: "approval_raised", message_id: p.messageId, proposalId: p.id });
        },
      },
      {
        key: "NOTIFY",
        run: async (ws: string, payload: Record<string, unknown>) => {
          publish(ws, { type: "hyperctx", action: "notify", ...payload });
        },
      },
    ];
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private async assertGovernance(roles: GovernanceRole[]) {
    return assertGovernanceRole(this.workspaceId, this.userId, roles);
  }

  private async attachHyperContext(messages: Array<{ id: string }>) {
    if (messages.length === 0) return;
    const records = await prisma.chatHyperContext.findMany({
      where: { workspaceId: this.workspaceId, messageId: { in: messages.map((m) => m.id) } },
    });
    const byId = new Map(records.map((r) => [r.messageId, r]));
    for (const m of messages) {
      const rec = byId.get(m.id);
      if (rec) {
        const links = rec.links as unknown as Array<Record<string, unknown>>;
        (m as unknown as Record<string, unknown>).hyperContext = {
          linkCount: links.length,
          links,
          actions: rec.actions,
          extractedAt: rec.extractedAt,
        };
      }
    }
  }

  private async buildHyperContextFor(channel: { id: string; name: string }, messageId: string, createdAt: Date, authorId: string) {
    const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message || message.body.startsWith("[deleted]")) return;
    try {
      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId: this.workspaceId, status: "ACTIVE" },
        include: { user: { select: { id: true, name: true } } },
      });
      await buildHyperContext({
        workspaceId: this.workspaceId,
        messageId,
        threadId: message.parentId,
        body: message.body,
        authorName: message.authorName,
        authorUserId: authorId,
        channelName: channel.name,
        createdAt,
        memberNames: members.map((wm) => ({ id: wm.user.id, name: wm.user.name ?? "Member" })),
      });
    } catch (err) {
      await auditAppend({
        workspaceId: this.workspaceId,
        actorId: this.userId,
        action: "hypercontext.build.failed",
        objectType: "MESSAGE",
        objectId: messageId,
        channelId: channel.id,
        policyApplied: "hypercontext",
        details: { error: (err as Error).message },
      });
    }
  }

  private async attachCompliance(messages: Array<{ id: string }>) {
    if (messages.length === 0) return;
    const records = await prisma.chatComplianceRecord.findMany({
      where: { workspaceId: this.workspaceId, objectType: "MESSAGE", objectId: { in: messages.map((m) => m.id) } },
    });
    const byId = new Map(records.map((r) => [r.objectId, r]));
    for (const m of messages) {
      const rec = byId.get(m.id);
      if (rec) (m as unknown as Record<string, unknown>).compliance = [rec];
    }
  }

  private async assertMutableMessage(messageId: string) {
    const rec = await prisma.chatComplianceRecord.findUnique({
      where: { objectType_objectId: { objectType: "MESSAGE", objectId: messageId } },
    });
    if (!rec) return;
    const bypass = await privilegedBypass(this.workspaceId, this.userId);
    try {
      assertMutable(rec, { privilegedBypass: bypass });
    } catch (err) {
      await auditAppend({
        workspaceId: this.workspaceId,
        actorId: this.userId,
        action: "worm.denied",
        objectType: "MESSAGE",
        objectId: messageId,
        outcome: "DENIED",
        policyApplied: rec.retentionMode,
        details: { error: (err as Error).message },
      });
      throw err;
    }
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
