"use server";

import { ChatService, channelSchema, channelMetaSchema, messageSchema, reactionSchema, channelIdSchema } from "@n0va/modules-chat/server";
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
  const { body: parsed } = messageSchema.parse({ body });
  const ctx = await requireActionContext();
  const name = ctx.user.name ?? ctx.user.email ?? "Member";
  await (await svc()).sendMessage(channelId, parsed, name, { parentId });
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
  const messages = await (await svc()).searchMessages(query, channelId);
  return { messages };
}
