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

// ── AI Features ──

export async function summarizeThreadAction(formData: FormData) {
  const threadId = String(formData.get("threadId") ?? "");
  const result = await (await svc()).summarizeThread(threadId);
  return { content: result.content };
}

export async function suggestReplyAction(formData: FormData) {
  const threadId = String(formData.get("threadId") ?? "");
  const result = await (await svc()).suggestReply(threadId);
  return { content: result.content };
}

export async function extractActionItemsAction(formData: FormData) {
  const threadId = String(formData.get("threadId") ?? "");
  const items = await (await svc()).extractActionItems(threadId);
  return { items };
}

export async function adjustToneAction(formData: FormData) {
  const threadId = String(formData.get("threadId") ?? "");
  const content = String(formData.get("content") ?? "");
  const tone = String(formData.get("tone") ?? "formal") as "formal" | "concise" | "friendly" | "persuasive";
  const result = await (await svc()).adjustTone(threadId, content, tone);
  return { content: result.content };
}

// ── Drafts ──

export async function saveDraftAction(formData: FormData) {
  const subject = String(formData.get("subject") ?? "");
  const toEmails = String(formData.get("toEmails") ?? "").split(",").filter(Boolean);
  const body = String(formData.get("body") ?? "");
  const threadId = String(formData.get("threadId") ?? "");
  await (await svc()).saveDraft({ subject, toEmails, body, threadId });
}

export async function sendDraftAction(formData: FormData) {
  const draftId = String(formData.get("draftId") ?? "");
  await (await svc()).sendDraft(draftId);
}

// ── Rules ──

export async function createRuleAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const conditions = JSON.parse(String(formData.get("conditions") ?? "{}"));
  const actions = JSON.parse(String(formData.get("actions") ?? "[]"));
  const priority = Number(formData.get("priority") ?? 100);
  await (await svc()).createRule({ name, description, conditions, actions, priority });
}

export async function toggleRuleAction(formData: FormData) {
  const ruleId = String(formData.get("ruleId") ?? "");
  await (await svc()).toggleRule(ruleId);
}

export async function deleteRuleAction(formData: FormData) {
  const ruleId = String(formData.get("ruleId") ?? "");
  await (await svc()).deleteRule(ruleId);
}
