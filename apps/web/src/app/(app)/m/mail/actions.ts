"use server";

import { MailService, sendSchema } from "@n0va/modules-mail/server";
import { actionContext } from "@/lib/action-context";

const svc = async () => {
  const { workspaceId, userId, role } = await actionContext();
  return new MailService(workspaceId, userId, role);
};

// ── Core: Send / Reply / Forward ──

export async function sendMailAction(formData: FormData) {
  const to = String(formData.get("to") ?? "");
  const subject = String(formData.get("subject") ?? "");
  const body = String(formData.get("body") ?? "");
  const bodyHtml = String(formData.get("bodyHtml") || "");
  const cc = String(formData.get("cc") || "");
  const bcc = String(formData.get("bcc") || "");
  const signatureId = String(formData.get("signatureId") || "");
  const scheduledAt = String(formData.get("scheduledAt") || "");

  sendSchema.parse({ to, subject, body });

  await (await svc()).send({
    to: to.split(",").map((e) => e.trim()).filter(Boolean)[0] || to,
    subject,
    body,
    bodyHtml: bodyHtml || undefined,
    cc: cc || undefined,
    bcc: bcc || undefined,
    signatureId: signatureId || undefined,
    scheduledAt: scheduledAt || undefined,
  });
}

export async function replyMailAction(formData: FormData) {
  const threadId = String(formData.get("threadId") ?? "");
  const body = String(formData.get("body") ?? "");
  const bodyHtml = String(formData.get("bodyHtml") || "");
  await (await svc()).reply(threadId, body, bodyHtml || undefined);
}

export async function replyAllMailAction(formData: FormData) {
  const threadId = String(formData.get("threadId") ?? "");
  const body = String(formData.get("body") ?? "");
  const bodyHtml = String(formData.get("bodyHtml") || "");
  await (await svc()).replyAll(threadId, body, bodyHtml || undefined);
}

export async function forwardMailAction(formData: FormData) {
  const threadId = String(formData.get("threadId") ?? "");
  const to = String(formData.get("to") ?? "");
  const body = String(formData.get("body") ?? "");
  const bodyHtml = String(formData.get("bodyHtml") || "");
  await (await svc()).forward(threadId, to.split(",").map((e) => e.trim()).filter(Boolean), body, bodyHtml || undefined);
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

// ── Snooze ──

export async function snoozeThreadAction(formData: FormData) {
  const threadId = String(formData.get("threadId") ?? "");
  const until = String(formData.get("until") ?? "");
  await (await svc()).snoozeThread(threadId, until);
}

export async function unsnoozeThreadAction(formData: FormData) {
  await (await svc()).unsnoozeThread(String(formData.get("threadId") ?? ""));
}

// ── AI Features ──

export async function summarizeThreadAction(formData: FormData) {
  const threadId = String(formData.get("threadId") ?? "");
  return (await svc()).summarizeThread(threadId);
}

export async function suggestReplyAction(formData: FormData) {
  const threadId = String(formData.get("threadId") ?? "");
  return (await svc()).suggestReply(threadId);
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
  return (await svc()).adjustTone(threadId, content, tone);
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
  await (await svc()).sendDraft(String(formData.get("draftId") ?? ""));
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
  await (await svc()).toggleRule(String(formData.get("ruleId") ?? ""));
}

export async function deleteRuleAction(formData: FormData) {
  await (await svc()).deleteRule(String(formData.get("ruleId") ?? ""));
}

// ── Signatures ──

export async function createSignatureAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const content = String(formData.get("content") ?? "");
  const isDefault = formData.get("isDefault") === "true";
  await (await svc()).createSignature({ name, content, isDefault });
}

export async function deleteSignatureAction(formData: FormData) {
  await (await svc()).deleteSignature(String(formData.get("signatureId") ?? ""));
}

// ── Auto-Responder ──

export async function setAutoResponderAction(formData: FormData) {
  const enabled = formData.get("enabled") === "true";
  const subject = String(formData.get("subject") ?? "Out of Office");
  const body = String(formData.get("body") ?? "I am currently out of office.");
  const startTime = String(formData.get("startTime") || "");
  const endTime = String(formData.get("endTime") || "");
  await (await svc()).setAutoResponder({
    enabled,
    subject,
    body,
    startTime: startTime || undefined,
    endTime: endTime || undefined,
  });
}

// ── Contacts ──

export async function createContactAction(formData: FormData) {
  const firstName = String(formData.get("firstName") ?? "");
  const lastName = String(formData.get("lastName") ?? "");
  const email = String(formData.get("email") ?? "");
  const phone = String(formData.get("phone") ?? "");
  const company = String(formData.get("company") ?? "");
  const jobTitle = String(formData.get("jobTitle") ?? "");
  const notes = String(formData.get("notes") ?? "");
  const isFavorite = formData.get("isFavorite") === "true";
  await (await svc()).createContact({ firstName, lastName, email, phone, company, jobTitle, notes, isFavorite });
}

export async function deleteContactAction(formData: FormData) {
  await (await svc()).deleteContact(String(formData.get("contactId") ?? ""));
}

export async function searchContactsAction(formData: FormData) {
  const query = String(formData.get("query") ?? "");
  const contacts = await (await svc()).getContacts(query || undefined);
  return contacts.map((c) => ({ id: c.id, email: c.email, firstName: c.firstName, lastName: c.lastName }));
}
