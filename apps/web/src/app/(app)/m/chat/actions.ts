"use server";

import { ChatService, channelSchema, messageSchema, reactionSchema, channelIdSchema } from "@n0va/modules-chat/server";
import { actionContext, requireActionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new ChatService(workspaceId, userId, role);
};

export async function createChannelAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const { name: parsed } = channelSchema.parse({ name });
  await (await svc()).createChannel(parsed);
}

export async function createDmAction(formData: FormData) {
  await (await svc()).createDm(String(formData.get("targetUserId") ?? ""));
}

export async function sendMessageAction(formData: FormData) {
  const channelId = String(formData.get("channelId") ?? "");
  const body = String(formData.get("body") ?? "");
  const { body: parsed } = messageSchema.parse({ body });
  const ctx = await requireActionContext();
  const name = ctx.user.name ?? ctx.user.email ?? "Member";
  await (await svc()).sendMessage(channelId, parsed, name);
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

export async function reactAction(formData: FormData) {
  const messageId = String(formData.get("messageId") ?? "");
  const emoji = String(formData.get("emoji") ?? "");
  const { messageId: parsedMessageId, emoji: parsedEmoji } = reactionSchema.parse({ messageId, emoji });
  const ctx = await requireActionContext();
  const name = ctx.user.name ?? ctx.user.email ?? "Member";
  await (await svc()).react(parsedMessageId, parsedEmoji, name);
}

export async function markReadAction(formData: FormData) {
  const channelId = channelIdSchema.parse(String(formData.get("channelId") ?? ""));
  await (await svc()).markRead(channelId);
}
