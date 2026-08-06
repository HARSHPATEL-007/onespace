"use server";

import { MeetService, roomSchema, meetMessageSchema } from "@n0va/modules-meet/server";
import { actionContext, requireActionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new MeetService(workspaceId, userId, role);
};

export async function createRoomAction(formData: FormData) {
  const { name } = roomSchema.parse({ name: String(formData.get("name") ?? "") });
  await (await svc()).createRoom(name);
}

export async function joinRoomAction(formData: FormData) {
  const roomId = String(formData.get("roomId") ?? "");
  const ctx = await requireActionContext();
  const name = ctx.user.name ?? ctx.user.email ?? "Member";
  await (await svc()).join(roomId, name);
}

export async function leaveRoomAction(formData: FormData) {
  await (await svc()).leave(String(formData.get("roomId") ?? ""));
}

export async function endRoomAction(formData: FormData) {
  await (await svc()).endRoom(String(formData.get("roomId") ?? ""));
}

export async function sendMeetMessageAction(formData: FormData) {
  const roomId = String(formData.get("roomId") ?? "");
  const body = String(formData.get("body") ?? "");
  const { body: parsed } = meetMessageSchema.parse({ body });
  const ctx = await requireActionContext();
  const name = ctx.user.name ?? ctx.user.email ?? "Member";
  await (await svc()).sendMessage(roomId, parsed, name);
}
