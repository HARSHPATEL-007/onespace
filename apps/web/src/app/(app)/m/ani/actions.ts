"use server";

import { AniService } from "@n0va/modules-ani/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new AniService(workspaceId, userId, role);
};

export async function createConversationAction(formData: FormData) {
  await (await svc()).create(String(formData.get("title") ?? "New conversation"));
}

export async function sendAniMessageAction(formData: FormData) {
  const { delayMs } = await (await svc()).send(String(formData.get("id") ?? ""), String(formData.get("content") ?? ""));
  return { delayMs };
}

export async function clearConversationAction(formData: FormData) {
  await (await svc()).clear(String(formData.get("id") ?? ""));
}

export async function removeConversationAction(formData: FormData) {
  await (await svc()).remove(String(formData.get("id") ?? ""));
}
