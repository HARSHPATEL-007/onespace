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

// ── AI & Intelligent Automation ──

export async function oneClickRepliesAction(formData: FormData) {
  const threadId = String(formData.get("threadId") ?? "");
  return (await svc()).oneClickReplies(threadId);
}

export async function rewriteDraftAction(formData: FormData) {
  const content = String(formData.get("content") ?? "");
  const tone = String(formData.get("tone") ?? "formal") as "formal" | "friendly" | "assertive" | "concise" | "empathetic";
  const fixGrammar = formData.get("fixGrammar") === "true";
  const shorten = formData.get("shorten") === "true";
  return (await svc()).rewriteDraft({ content, tone, fixGrammar, shorten });
}

export async function classifyInboxAction() {
  return (await svc()).classifyInbox();
}

export async function summarizeThreadDetailedAction(formData: FormData) {
  const threadId = String(formData.get("threadId") ?? "");
  return (await svc()).summarizeThreadDetailed(threadId);
}

// ── Team Collaboration ──

export async function createMailboxAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const description = String(formData.get("description") ?? "");
  await (await svc()).createMailbox({ name, email, description });
}

export async function deleteMailboxAction(formData: FormData) {
  await (await svc()).deleteMailbox(String(formData.get("mailboxId") ?? ""));
}

export async function addCommentAction(formData: FormData) {
  const messageId = String(formData.get("messageId") ?? "");
  const body = String(formData.get("body") ?? "");
  const isResolve = formData.get("isResolve") === "true";
  await (await svc()).addComment(messageId, body, isResolve);
}

export async function deleteCommentAction(formData: FormData) {
  await (await svc()).deleteComment(String(formData.get("commentId") ?? ""));
}

export async function createDelegationAction(formData: FormData) {
  const delegateId = String(formData.get("delegateId") ?? "");
  const canSend = formData.get("canSend") === "true";
  const canRead = formData.get("canRead") === "true";
  const canDelete = formData.get("canDelete") === "true";
  await (await svc()).createDelegation({ delegateId, canSend, canRead, canDelete });
}

export async function revokeDelegationAction(formData: FormData) {
  await (await svc()).revokeDelegation(String(formData.get("delegationId") ?? ""));
}

export async function convertToTaskAction(formData: FormData) {
  const messageId = String(formData.get("messageId") ?? "");
  const title = String(formData.get("title") ?? "");
  const assigneeId = String(formData.get("assigneeId") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");
  const priority = String(formData.get("priority") ?? "MEDIUM") as "HIGH" | "MEDIUM" | "LOW";
  await (await svc()).convertToTask(messageId, { title: title || undefined, assigneeId: assigneeId || undefined, dueDate: dueDate || undefined, priority });
}

export async function updateTaskAction(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const status = String(formData.get("status") ?? "");
  await (await svc()).updateTask(taskId, { status });
}

export async function deleteTaskAction(formData: FormData) {
  await (await svc()).deleteTask(String(formData.get("taskId") ?? ""));
}

export async function createSharedDraftAction(formData: FormData) {
  const subject = String(formData.get("subject") ?? "");
  const body = String(formData.get("body") ?? "");
  await (await svc()).createSharedDraft({ subject, body });
}

export async function updateSharedDraftAction(formData: FormData) {
  const draftId = String(formData.get("draftId") ?? "");
  const subject = String(formData.get("subject") ?? "");
  const body = String(formData.get("body") ?? "");
  await (await svc()).updateSharedDraft(draftId, { subject, body });
}

export async function deleteSharedDraftAction(formData: FormData) {
  await (await svc()).deleteSharedDraft(String(formData.get("draftId") ?? ""));
}

export async function addDraftCollaboratorAction(formData: FormData) {
  const draftId = String(formData.get("draftId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  await (await svc()).addDraftCollaborator(draftId, userId);
}

// ── Domain & Alias Management ──

export async function registerDomainAction(formData: FormData) {
  const domain = String(formData.get("domain") ?? "");
  const privacyEnabled = formData.get("privacyEnabled") === "true";
  const catchAllEnabled = formData.get("catchAllEnabled") === "true";
  const catchAllTarget = String(formData.get("catchAllTarget") ?? "");
  await (await svc()).registerDomain({ domain, privacyEnabled, catchAllEnabled, catchAllTarget });
}

export async function updateDomainAction(formData: FormData) {
  const domainId = String(formData.get("domainId") ?? "");
  const privacyEnabled = formData.get("privacyEnabled") === "true" ? true : formData.get("privacyEnabled") === "false" ? false : undefined;
  const catchAllEnabled = formData.get("catchAllEnabled") === "true" ? true : formData.get("catchAllEnabled") === "false" ? false : undefined;
  const spfRecord = String(formData.get("spfRecord") || "");
  await (await svc()).updateDomain(domainId, { privacyEnabled, catchAllEnabled, spfRecord: spfRecord || undefined });
}

export async function deleteDomainAction(formData: FormData) {
  await (await svc()).deleteDomain(String(formData.get("domainId") ?? ""));
}

export async function verifyDomainAction(formData: FormData) {
  return await (await svc()).verifyDomain(String(formData.get("domainId") ?? ""));
}

export async function addDnsRecordAction(formData: FormData) {
  const domainId = String(formData.get("domainId") ?? "");
  const type = String(formData.get("type") ?? "");
  const name = String(formData.get("name") ?? "");
  const value = String(formData.get("value") ?? "");
  const priority = Number(formData.get("priority") || 0);
  await (await svc()).addDnsRecord({ domainId, type, name, value, priority });
}

export async function deleteDnsRecordAction(formData: FormData) {
  await (await svc()).deleteDnsRecord(String(formData.get("recordId") ?? ""));
}

export async function createAliasAction(formData: FormData) {
  const domainId = String(formData.get("domainId") ?? "");
  const localPart = String(formData.get("localPart") ?? "");
  const forwardTo = String(formData.get("forwardTo") ?? "");
  const description = String(formData.get("description") ?? "");
  await (await svc()).createAlias({ domainId, localPart, forwardTo, description });
}

export async function toggleAliasAction(formData: FormData) {
  await (await svc()).toggleAlias(String(formData.get("aliasId") ?? ""));
}

export async function deleteAliasAction(formData: FormData) {
  await (await svc()).deleteAlias(String(formData.get("aliasId") ?? ""));
}

export async function createReverseAliasAction(formData: FormData) {
  const aliasId = String(formData.get("aliasId") ?? "");
  const targetEmail = String(formData.get("targetEmail") ?? "");
  await (await svc()).createReverseAlias({ aliasId, targetEmail });
}

export async function deleteReverseAliasAction(formData: FormData) {
  await (await svc()).deleteReverseAlias(String(formData.get("reverseId") ?? ""));
}

export async function reportBreachAction(formData: FormData) {
  const aliasEmail = String(formData.get("aliasEmail") ?? "");
  const source = String(formData.get("source") ?? "");
  const severity = String(formData.get("severity") ?? "medium");
  await (await svc()).reportBreach({ aliasEmail, source, severity });
}

export async function resolveBreachAction(formData: FormData) {
  await (await svc()).resolveBreach(String(formData.get("breachId") ?? ""));
}

// — Routing & Security —

export async function createRoutingRuleAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const tier = String(formData.get("tier") ?? "TIER2");
  const condition = String(formData.get("condition") ?? "to_contains");
  const matchValue = String(formData.get("matchValue") ?? "");
  const action = String(formData.get("action") ?? "tag");
  const actionValue = String(formData.get("actionValue") ?? "");
  await (await svc()).createRoutingRule({ name, description, tier, condition, matchValue, action, actionValue });
}

export async function toggleRoutingRuleAction(formData: FormData) {
  await (await svc()).toggleRoutingRule(String(formData.get("ruleId") ?? ""));
}

export async function deleteRoutingRuleAction(formData: FormData) {
  await (await svc()).deleteRoutingRule(String(formData.get("ruleId") ?? ""));
}

export async function setupMasterInboxAction(formData: FormData) {
  const masterEmail = String(formData.get("masterEmail") ?? "");
  const provider = String(formData.get("provider") ?? "");
  const mfaEnabled = formData.get("mfaEnabled") === "true";
  const hardwareKey = formData.get("hardwareKey") === "true";
  const recoveryEmail = String(formData.get("recoveryEmail") ?? "");
  await (await svc()).setupMasterInbox({ masterEmail, provider, mfaEnabled, hardwareKey, recoveryEmail });
}

export async function calculateSecurityScoreAction() {
  return await (await svc()).calculateSecurityScore();
}

export async function logSecurityEventAction(formData: FormData) {
  const type = String(formData.get("type") ?? "");
  const source = String(formData.get("source") ?? "");
  const aliasEmail = String(formData.get("aliasEmail") ?? "");
  await (await svc()).logSecurityEvent({ type, source, aliasEmail });
}

export async function resolveSecurityEventAction(formData: FormData) {
  await (await svc()).resolveSecurityEvent(String(formData.get("eventId") ?? ""));
}

export async function blockAliasAction(formData: FormData) {
  await (await svc()).blockAlias(String(formData.get("aliasId") ?? ""));
}

export async function replyViaReverseAliasAction(formData: FormData) {
  const reverseAliasId = String(formData.get("reverseAliasId") ?? "");
  const body = String(formData.get("body") ?? "");
  await (await svc()).replyViaReverseAlias(reverseAliasId, body);
}
