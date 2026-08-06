"use server";

import { MailService, sendSchema } from "@n0va/modules-mail/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new MailService(workspaceId, userId, role);
};

export async function sendMailAction(formData: FormData) {
  const { to, subject, body } = sendSchema.parse({
    to: String(formData.get("to") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
  });
  await (await svc()).send({ to, subject, body });
}

export async function replyMailAction(formData: FormData) {
  const threadId = String(formData.get("threadId") ?? "");
  const body = String(formData.get("body") ?? "");
  await (await svc()).reply(threadId, body);
}

export async function markThreadReadAction(formData: FormData) {
  await (await svc()).markThreadRead(String(formData.get("threadId") ?? ""));
}

export async function toggleStarAction(formData: FormData) {
  await (await svc()).toggleStar(String(formData.get("messageId") ?? ""));
}

export async function archiveThreadAction(formData: FormData) {
  await (await svc()).archiveThread(String(formData.get("threadId") ?? ""));
}

export async function trashThreadAction(formData: FormData) {
  await (await svc()).trashThread(String(formData.get("threadId") ?? ""));
}

export async function restoreThreadAction(formData: FormData) {
  await (await svc()).restoreThread(String(formData.get("threadId") ?? ""));
}

export async function createLabelAction(formData: FormData) {
  await (await svc()).createLabel(String(formData.get("name") ?? ""), String(formData.get("color") ?? "#7c5cfc"));
}

export async function assignLabelAction(formData: FormData) {
  await (await svc()).assignLabel(String(formData.get("messageId") ?? ""), String(formData.get("labelId") ?? ""));
}

export async function unassignLabelAction(formData: FormData) {
  await (await svc()).unassignLabel(String(formData.get("messageId") ?? ""), String(formData.get("labelId") ?? ""));
}
