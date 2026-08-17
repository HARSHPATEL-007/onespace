"use server";

import { ChatService, channelSchema, channelMetaSchema, messageSchema, reactionSchema, channelIdSchema, savedSearchSchema } from "@n0va/modules-chat/server";
import { ApprovalService } from "@n0va/modules-approvals/server";
import { messageCreated } from "@n0va/modules-events";
import { getEventBus } from "@/lib/eventbus";
import { actionContext, requireActionContext } from "@/lib/action-context";
import { getDeliveryEngine, resolvePolicy, listPolicies, upsertPolicy, deletePolicy, resetPolicies, matrixRows, breakerStates, resetBreaker, quotaState, resetQuota, listDlq, replayDlq, resolveDlq, dropDlq, concurrencyState } from "@n0va/modules-chat/delivery";
import { PersonalizationEngine, PRESETS, type RuleInput, type DndWindowInput, type PinInput, type SampleEvent, type PresetName, type Suggestion } from "@n0va/modules-chat/personalization";

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
  const message = await (await svc()).sendMessage(channelId, parsed, name, {
    parentId,
    ttlSeconds: Number.isInteger(ttl) && ttl > 0 ? ttl : undefined,
  });
  await emitMessageCreated({
    workspaceId: ctx.workspaceId,
    userId: ctx.user.id,
    messageId: message.id,
    channelId,
    threadId: parentId,
    body: parsed,
  });
}

async function emitMessageCreated(opts: { workspaceId: string; userId: string; messageId: string; channelId: string; threadId?: string; body: string }) {
  try {
    const bus = getEventBus();
    const event = messageCreated(
      {
        messageId: opts.messageId,
        channelId: opts.channelId,
        authorId: opts.userId,
        body: opts.body,
        ...(opts.threadId ? { threadId: opts.threadId } : {}),
        workspaceId: opts.workspaceId,
      },
      {
        producer: "chat-service",
        tenantId: opts.workspaceId,
        aggregateId: opts.channelId,
        partitionKey: opts.threadId ?? opts.channelId,
        correlationId: `msg_${opts.messageId}`,
      },
    );
    await bus.emit(event);
  } catch (e) {
    console.error("[eventbus] failed to emit chat.message.created", e);
  }
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

// ── Approval decision routing ────────────────────────────────────────────

export interface ApprovalInput {
  op: "decide" | "comment" | "provideInfo" | "cancel" | "forceSync" | "listForChannel" | "pendingCounts" | "listPolicies" | "createPolicy" | "updatePolicy" | "deletePolicy" | "getConfig" | "setConfig" | "metrics";
  approvalId?: string;
  decision?: string;
  note?: string;
  body?: string;
  channelId?: string;
  input?: Record<string, unknown>;
  ruleId?: string;
}

export async function approvalAction(input: ApprovalInput) {
  const { workspaceId, userId, role } = await actionContext();
  const svc = new ApprovalService(workspaceId, userId, role);
  switch (input.op) {
    case "decide":
      return svc.decide(input.approvalId!, input.decision!, input.note);
    case "comment":
      return svc.comment(input.approvalId!, input.body!);
    case "provideInfo":
      return svc.provideInfo(input.approvalId!, input.body!);
    case "cancel":
      return svc.cancel(input.approvalId!, input.note);
    case "forceSync":
      return svc.forceSync(input.approvalId!);
    case "listForChannel":
      return svc.listForChannel(input.channelId!);
    case "pendingCounts":
      return svc.pendingCountsByChannel();
    case "listPolicies":
      return svc.listPolicies();
    case "createPolicy":
      return svc.createPolicy(input.input as never);
    case "updatePolicy":
      return svc.updatePolicy(input.ruleId!, input.input ?? {});
    case "deletePolicy":
      return svc.deletePolicy(input.ruleId!);
    case "getConfig":
      return svc.config();
    case "setConfig":
      return svc.setConfig(input.input ?? {});
    case "metrics":
      return svc.metrics();
    default:
      throw new Error("Unknown approval op");
  }
}

// ── Delivery matrix ─────────────────────────────────────────────────────────

export interface DeliveryInput {
  op:
    | "listDeliveries" | "retryDelivery" | "cancelDelivery" | "deliveryAttempts"
    | "stats" | "deliverDue" | "reconcile" | "queueDepth" | "concurrencyState"
    | "listPolicies" | "upsertPolicy" | "deletePolicy" | "resetPolicies" | "matrix"
    | "listDlq" | "replayDlq" | "resolveDlq" | "dropDlq"
    | "breakerStates" | "resetBreaker"
    | "quotaState" | "resetQuota";
  deliveryId?: string;
  channelId?: string;
  state?: string;
  target?: string;
  channelKind?: string;
  patch?: Record<string, unknown>;
  path?: "read" | "write";
}

export async function deliveryAction(input: DeliveryInput) {
  const { workspaceId } = await requireActionContext();
  const engine = getDeliveryEngine();
  switch (input.op) {
    case "listDeliveries":
      return engine.deliveries(workspaceId, input.channelId, input.state);
    case "retryDelivery":
      return engine.retryDelivery(input.deliveryId!);
    case "cancelDelivery":
      return engine.cancelDelivery(input.deliveryId!);
    case "deliveryAttempts":
      return engine.deliveryAttempts(input.deliveryId!);
    case "stats":
      return engine.stats(workspaceId);
    case "deliverDue":
      return engine.deliverDue(new Date());
    case "reconcile":
      return engine.reconcile(new Date());
    case "queueDepth":
      return { depth: await engine.queueDepth(new Date()), backlog: await engine.backlog(new Date()) };
    case "concurrencyState":
      return concurrencyState();
    case "listPolicies":
      return listPolicies(workspaceId);
    case "upsertPolicy":
      return upsertPolicy(workspaceId, (input.channelKind as "CHANNEL" | "DM" | "ANNOUNCEMENT" | "ALL") ?? "ALL", (input.target as "chat" | "notifications" | "approvals" | "telemetry" | "media" | "voice" | "broker" | "connector") ?? "chat", input.patch ?? {});
    case "deletePolicy":
      return deletePolicy(workspaceId, (input.channelKind as "CHANNEL" | "DM" | "ANNOUNCEMENT" | "ALL") ?? "ALL", (input.target as "chat" | "notifications" | "approvals" | "telemetry" | "media" | "voice" | "broker" | "connector") ?? "chat");
    case "resetPolicies":
      return resetPolicies(workspaceId);
    case "matrix":
      return matrixRows();
    case "listDlq":
      return listDlq(workspaceId, input.state);
    case "replayDlq":
      return replayDlq(workspaceId, input.deliveryId!);
    case "resolveDlq":
      return resolveDlq(workspaceId, input.deliveryId!);
    case "dropDlq":
      return dropDlq(workspaceId, input.deliveryId!);
    case "breakerStates":
      return breakerStates(workspaceId);
    case "resetBreaker":
      return resetBreaker(workspaceId, input.target!, input.path ?? "write");
    case "quotaState":
      return quotaState(workspaceId);
    case "resetQuota":
      return resetQuota(workspaceId);
    default:
      throw new Error("Unknown delivery op");
  }
}

// ── Personalization (rules, DND, priority inbox, pins, suggestions) ────────

export interface PersonalizationInput {
  op:
    | "profile" | "updateProfile"
    | "listRules" | "upsertRule" | "deleteRule" | "snoozeRule"
    | "listWorkspaceDefaults" | "upsertWorkspaceDefault" | "deleteWorkspaceDefault"
    | "listDnd" | "upsertDnd" | "deleteDnd" | "dndStatus"
    | "evaluate" | "testRule"
    | "priorityInbox" | "recordClick"
    | "listPins" | "pin" | "unpin" | "deletePin"
    | "applyPreset"
    | "suggestions" | "acceptSuggestion" | "dismissSuggestion"
    | "recentEvents" | "metrics" | "workspaceMetrics";
  rule?: RuleInput;
  ruleId?: string;
  snoozeUntil?: string | null;
  dnd?: DndWindowInput;
  dndId?: string;
  pin?: PinInput;
  preset?: PresetName;
  suggestion?: Suggestion;
  samples?: SampleEvent[];
  messageId?: string;
  roomId?: string;
  patch?: Record<string, unknown>;
  limit?: number;
  targetUserId?: string;
}

export async function personalizationAction(input: PersonalizationInput) {
  const { workspaceId, userId } = await requireActionContext();
  const engine = new PersonalizationEngine(userId, workspaceId);
  switch (input.op) {
    case "profile":
      return engine.getProfile();
    case "updateProfile":
      return engine.updateProfile({
        prioritySort: input.patch?.prioritySort as string | undefined,
        digestEnabled: input.patch?.digestEnabled as boolean | undefined,
        workingHoursStart: input.patch?.workingHoursStart as number | undefined,
        workingHoursEnd: input.patch?.workingHoursEnd as number | undefined,
        workdays: input.patch?.workdays as string[] | undefined,
        timezone: input.patch?.timezone as string | undefined,
        calendarAwareDnd: input.patch?.calendarAwareDnd as boolean | undefined,
        aiSuggestionsEnabled: input.patch?.aiSuggestionsEnabled as boolean | undefined,
        pauseUntil: input.patch?.pauseUntil ? new Date(input.patch.pauseUntil as string) : input.patch?.pauseUntil === null ? null : undefined,
      });
    case "listRules":
      return engine.listRules();
    case "upsertRule":
      return engine.upsertRule(input.rule!);
    case "deleteRule":
      return engine.deleteRule(input.ruleId!);
    case "snoozeRule":
      return engine.snoozeRule(input.ruleId!, input.snoozeUntil ? new Date(input.snoozeUntil) : null);
    case "listWorkspaceDefaults":
      return engine.listWorkspaceDefaults();
    case "upsertWorkspaceDefault":
      return engine.upsertWorkspaceDefault(input.rule!);
    case "deleteWorkspaceDefault":
      return engine.deleteWorkspaceDefault(input.ruleId!);
    case "listDnd":
      return engine.listDnd();
    case "upsertDnd":
      return engine.upsertDnd(input.dnd!);
    case "deleteDnd":
      return engine.deleteDnd(input.dndId!);
    case "dndStatus":
      return engine.dndStatus();
    case "evaluate":
      return engine.evaluateNotification({ userId, workspaceId, roomId: input.roomId, messageId: input.messageId, text: input.patch?.text as string | undefined, messageType: input.patch?.messageType as SampleEvent["messageType"] | undefined });
    case "testRule":
      return engine.testRule(input.rule!, input.samples ?? []);
    case "priorityInbox":
      return engine.priorityInbox({ limit: input.limit ?? 50 });
    case "recordClick":
      return engine.recordClick(input.messageId!, input.roomId);
    case "listPins":
      return engine.listPins();
    case "pin":
      return engine.pin(input.pin!);
    case "unpin":
      return engine.unpin(input.pin!.kind, input.pin!.refId);
    case "deletePin":
      return engine.deletePin(input.pin!.kind, input.pin!.refId);
    case "applyPreset":
      return engine.applyPreset(input.preset ?? "FOCUS");
    case "suggestions":
      return engine.suggestions();
    case "acceptSuggestion":
      return engine.acceptSuggestion(input.suggestion!);
    case "dismissSuggestion":
      return engine.dismissSuggestion(input.suggestion!);
    case "recentEvents":
      return engine.recentEvents(input.limit ?? 10);
    case "metrics":
      return engine.metrics();
    case "workspaceMetrics":
      return PersonalizationEngine.workspaceMetrics(workspaceId);
    default:
      throw new Error("Unknown personalization op");
  }
}
