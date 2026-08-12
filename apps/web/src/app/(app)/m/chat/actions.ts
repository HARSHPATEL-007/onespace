"use server";

import { ChatService, channelSchema, channelMetaSchema, messageSchema, reactionSchema, channelIdSchema, savedSearchSchema } from "@n0va/modules-chat/server";
import { actionContext, requireActionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new ChatService(workspaceId, userId, role);
};

// ── Channels ─────────────────────────────────────────────────────────

export async function createChannelAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const { name: parsed } = channelSchema.parse({ name });
  const meta = channelMetaSchema.parse({
    topic: String(formData.get("topic") ?? "") || undefined,
    description: String(formData.get("description") ?? "") || undefined,
    isPrivate: formData.get("isPrivate") === "true" || undefined,
    kind: formData.get("kind") === "ANNOUNCEMENT" ? "ANNOUNCEMENT" : undefined,
  });
  await (await svc()).createChannel(parsed, meta);
}

export async function createDmAction(formData: FormData) {
  await (await svc()).createDm(String(formData.get("targetUserId") ?? ""));
}

export async function updateChannelAction(formData: FormData) {
  const channelId = String(formData.get("channelId") ?? "");
  const name = formData.get("name") ? String(formData.get("name")) : undefined;
  const topic = formData.get("topic") !== null ? String(formData.get("topic") ?? "") : undefined;
  const description = formData.get("description") !== null ? String(formData.get("description") ?? "") : undefined;
  const isPrivate = formData.get("isPrivate") !== null ? formData.get("isPrivate") === "true" : undefined;
  if (name) channelSchema.parse({ name });
  await (await svc()).updateChannel(channelId, { name, topic, description, isPrivate });
}

export async function renameChannelAction(formData: FormData) {
  const channelId = String(formData.get("channelId") ?? "");
  const name = String(formData.get("name") ?? "");
  const { name: parsed } = channelSchema.parse({ name });
  await (await svc()).renameChannel(channelId, parsed);
}

export async function deleteChannelAction(formData: FormData) {
  await (await svc()).removeChannel(String(formData.get("channelId") ?? ""));
}

export async function addMemberAction(formData: FormData) {
  const channelId = String(formData.get("channelId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  const role = String(formData.get("role") ?? "MEMBER");
  await (await svc()).addMember(channelId, targetUserId, role);
}

export async function removeMemberAction(formData: FormData) {
  const channelId = String(formData.get("channelId") ?? "");
  const targetUserId = String(formData.get("targetUserId") ?? "");
  await (await svc()).removeMember(channelId, targetUserId);
}

// ── Messages ─────────────────────────────────────────────────────────

export async function sendMessageAction(formData: FormData) {
  const channelId = String(formData.get("channelId") ?? "");
  const body = String(formData.get("body") ?? "");
  const parentId = formData.get("parentId") ? String(formData.get("parentId")) : undefined;
  const ttl = Number(formData.get("ttlSeconds") ?? "");
  const { body: parsed } = messageSchema.parse({ body });
  const ctx = await requireActionContext();
  const name = ctx.user.name ?? ctx.user.email ?? "Member";
  await (await svc()).sendMessage(channelId, parsed, name, {
    parentId,
    ttlSeconds: Number.isInteger(ttl) && ttl > 0 ? ttl : undefined,
  });
}

export async function editMessageAction(formData: FormData) {
  const messageId = String(formData.get("messageId") ?? "");
  const body = String(formData.get("body") ?? "");
  const { body: parsed } = messageSchema.parse({ body });
  await (await svc()).editMessage(messageId, parsed);
}

export async function deleteMessageAction(formData: FormData) {
  const messageId = String(formData.get("messageId") ?? "");
  await (await svc()).deleteMessage(messageId);
}

// ── Reactions ────────────────────────────────────────────────────────

export async function reactAction(formData: FormData) {
  const messageId = String(formData.get("messageId") ?? "");
  const emoji = String(formData.get("emoji") ?? "");
  const { messageId: parsedMessageId, emoji: parsedEmoji } = reactionSchema.parse({ messageId, emoji });
  const ctx = await requireActionContext();
  const name = ctx.user.name ?? ctx.user.email ?? "Member";
  await (await svc()).react(parsedMessageId, parsedEmoji, name);
}

// ── Pins ─────────────────────────────────────────────────────────────

export async function pinMessageAction(formData: FormData) {
  const messageId = String(formData.get("messageId") ?? "");
  await (await svc()).pinMessage(messageId);
}

export async function unpinMessageAction(formData: FormData) {
  const messageId = String(formData.get("messageId") ?? "");
  await (await svc()).unpinMessage(messageId);
}

// ── Threads ──────────────────────────────────────────────────────────

export async function replyMessageAction(formData: FormData) {
  const channelId = String(formData.get("channelId") ?? "");
  const parentId = String(formData.get("parentId") ?? "");
  const body = String(formData.get("body") ?? "");
  const { body: parsed } = messageSchema.parse({ body });
  const ctx = await requireActionContext();
  const name = ctx.user.name ?? ctx.user.email ?? "Member";
  await (await svc()).sendMessage(channelId, parsed, name, { parentId });
}

// ── Read Tracking ───────────────────────────────────────────────────

export async function markReadAction(formData: FormData) {
  const channelId = channelIdSchema.parse(String(formData.get("channelId") ?? ""));
  await (await svc()).markRead(channelId);
}

// ── Search ──────────────────────────────────────────────────────────

export async function searchMessagesAction(formData: FormData) {
  const query = String(formData.get("query") ?? "");
  const channelId = formData.get("channelId") ? String(formData.get("channelId")) : undefined;
  if (!query.trim()) return { messages: [] };
  const result = await (await svc()).searchMessages(query, channelId);
  return { messages: result.messages };
}

// ── Bookmarks ─────────────────────────────────────────────────────────

export async function toggleBookmarkAction(formData: FormData) {
  const messageId = String(formData.get("messageId") ?? "");
  if (!messageId.trim()) return { bookmarked: false };
  return (await svc()).toggleBookmark(messageId);
}

// ── Saved searches ────────────────────────────────────────────────────

export async function saveSearchAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const query = String(formData.get("query") ?? "");
  const filtersRaw = String(formData.get("filters") ?? "{}");
  const parsed = savedSearchSchema.parse({
    name,
    query,
    filters: filtersRaw ? JSON.parse(filtersRaw) : undefined,
  });
  return (await svc()).saveSearch(parsed.name, parsed.query, parsed.filters);
}

export async function deleteSavedSearchAction(formData: FormData) {
  const searchId = String(formData.get("searchId") ?? "");
  if (searchId.trim()) await (await svc()).deleteSavedSearch(searchId);
}

// ── Presence ──────────────────────────────────────────────────────────

export async function setPresenceAction(formData: FormData) {
  const status = String(formData.get("status") ?? "");
  const customStatus = formData.get("customStatus") ? String(formData.get("customStatus")) : undefined;
  const valid = ["ONLINE", "AWAY", "BUSY", "DND", "IDLE"] as const;
  if (!(valid as readonly string[]).includes(status)) return;
  await (await svc()).setPresence(status as (typeof valid)[number], customStatus);
}

// ── Hyper-context ───────────────────────────────────────────────────────

export interface HyperInput {
  op: "getContext" | "confirmLink" | "reweightLink" | "rejectLink" | "commitTask" | "commitEvent" | "raiseApproval" | "getConfig" | "updateConfig" | "listOutbox" | "retryOutbox" | "processOutbox";
  messageId?: string;
  suggestionId?: string;
  proposalId?: string;
  reweight?: number;
  status?: string;
  eventId?: string;
  patch?: {
    autoCreateTasks?: boolean;
    taskConfidence?: number;
    autoCreateEvents?: boolean;
    eventConfidence?: number;
    autoRaiseApprovals?: boolean;
    approvalConfidence?: number;
    maxLinks?: number;
    notifyOnAutoCreate?: boolean;
  };
}

export async function hyperAction(input: HyperInput) {
  const chat = await svc();
  switch (input.op) {
    case "getContext":
      return chat.getHyperContext(input.messageId!);
    case "confirmLink":
      return chat.confirmLink(input.suggestionId!);
    case "reweightLink":
      return chat.reweightLink(input.suggestionId!, input.reweight ?? 0.5);
    case "rejectLink":
      return chat.rejectLink(input.suggestionId!);
    case "commitTask":
      return chat.commitTask(input.proposalId!);
    case "commitEvent":
      return chat.commitEvent(input.proposalId!);
    case "raiseApproval":
      return chat.raiseApproval(input.proposalId!);
    case "getConfig":
      return chat.getHyperConfigFor();
    case "updateConfig":
      return chat.updateHyperConfig(input.patch ?? {});
    case "listOutbox":
      return chat.listOutbox(input.status);
    case "retryOutbox":
      return chat.retryOutbox(input.eventId!);
    case "processOutbox":
      return chat.processPendingOutbox(25);
    default:
      throw new Error("Unknown hyper op");
  }
}

// ── Compliance & governance ────────────────────────────────────────────

export interface GovernanceInput {
  op: "classify" | "extendRetention" | "placeHold" | "releaseHold" | "listHolds" | "listPolicies" | "updatePolicy" | "listAudit" | "verifyChain" | "requestApproval" | "reviewApproval" | "listApprovals" | "assignRole" | "removeRole" | "listRoles" | "getConfig" | "updateConfig" | "rotateKeys" | "stats" | "watermarkPreview" | "export";
  messageId?: string;
  classification?: string;
  objectId?: string;
  objectType?: string;
  days?: number;
  holdId?: string;
  scope?: string;
  reason?: string;
  policyId?: string;
  durationDays?: number | null;
  policyActive?: boolean;
  anchor?: string;
  limit?: number;
  cursor?: string;
  action?: string;
  approvalId?: string;
  approve?: boolean;
  note?: string;
  rationale?: string;
  userId?: string;
  role?: string;
  config?: {
    watermarkEnabled?: boolean;
    watermarkStyle?: string;
    watermarkViewerScope?: string;
    externalStronger?: boolean;
    pqRequired?: boolean;
    exportRedaction?: boolean;
    derivedPropagation?: boolean;
    keyRotationDays?: number;
  };
  exportScope?: "CHANNEL" | "WORKSPACE" | "THREAD";
  channelId?: string;
  since?: string;
}

export async function governanceAction(input: GovernanceInput) {
  const chat = await svc();
  const objectType = (input.objectType ?? "MESSAGE") as "MESSAGE" | "FILE" | "EXPORT" | "AI_ARTIFACT";
  switch (input.op) {
    case "classify":
      return chat.classifyMessage(input.messageId!, input.classification as never);
    case "extendRetention":
      return chat.extendRetention(input.objectId!, objectType, input.days ?? 30);
    case "placeHold":
      return chat.placeLegalHold({ scope: input.scope ?? "MESSAGE", objectId: input.objectId, objectType, reason: input.reason ?? "Legal hold" });
    case "releaseHold":
      return chat.releaseLegalHold(input.holdId!, input.reason ?? "Released");
    case "listHolds":
      return chat.listLegalHolds(true);
    case "listPolicies":
      return chat.listRetentionPolicies();
    case "updatePolicy":
      return chat.updateRetentionPolicy(input.policyId!, { durationDays: input.durationDays, active: input.policyActive, anchor: input.anchor });
    case "listAudit":
      return chat.listAudit({ limit: input.limit, cursor: input.cursor, action: input.action });
    case "verifyChain":
      return chat.verifyAuditChain();
    case "requestApproval":
      return chat.requestApproval(input.action as never, input.rationale ?? "", input.objectId, objectType);
    case "reviewApproval":
      return chat.reviewApproval(input.approvalId!, !!input.approve, input.note);
    case "listApprovals":
      return chat.listApprovals();
    case "assignRole":
      return chat.assignGovernanceRole(input.userId!, (input.role ?? "AUDITOR") as never);
    case "removeRole":
      return chat.removeGovernanceRole(input.userId!);
    case "listRoles":
      return chat.listGovernanceAssignments();
    case "getConfig":
      return chat.getComplianceConfig();
    case "updateConfig":
      return chat.updateComplianceConfig(input.config ?? {});
    case "rotateKeys":
      return chat.rotateMasterKey();
    case "stats":
      return chat.listComplianceStats();
    case "watermarkPreview":
      return chat.watermarkPreview(input.objectId!, objectType);
    case "export":
      return chat.exportMessages({ scope: input.exportScope ?? "CHANNEL", channelId: input.channelId, since: input.since });
    default:
      throw new Error("Unknown governance op");
  }
}
