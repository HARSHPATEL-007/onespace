import { MailService, type MailFolder } from "@n0va/modules-mail/server";
import { MailApp } from "@n0va/modules-mail/components";
import { requireWorkspace } from "@/lib/context";
import {
  sendMailAction,
  replyMailAction,
  replyAllMailAction,
  forwardMailAction,
  markThreadReadAction,
  toggleStarAction,
  archiveThreadAction,
  trashThreadAction,
  restoreThreadAction,
  createLabelAction,
  assignLabelAction,
  unassignLabelAction,
  summarizeThreadAction,
  suggestReplyAction,
  extractActionItemsAction,
  adjustToneAction,
  saveDraftAction,
  createRuleAction,
  toggleRuleAction,
  deleteRuleAction,
  snoozeThreadAction,
  unsnoozeThreadAction,
  createSignatureAction,
  deleteSignatureAction,
  setAutoResponderAction,
  createContactAction,
  deleteContactAction,
  searchContactsAction,
} from "./actions";

const VALID_FOLDERS = ["INBOX", "SENT", "ARCHIVE", "TRASH"] as const;

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; q?: string }>;
}) {
  const { folder, q } = await searchParams;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new MailService(workspaceId, userId, role);

  const activeFolder: MailFolder = VALID_FOLDERS.includes(folder as MailFolder)
    ? (folder as MailFolder)
    : "INBOX";

  let threads = await svc.listFolder(activeFolder);

  // Apply search filter if query present
  if (q) {
    const results = await svc.search({ query: q, folder: activeFolder });
    const threadIds = [...new Set(results.map((r) => r.message.threadId))];
    threads = threads.filter((t) => threadIds.includes(t.threadId));
  }

  const [labels, unreadCounts, rules, signatures, folders, autoResponder] = await Promise.all([
    svc.labels(),
    svc.unreadCounts(),
    svc.getRules(),
    svc.getSignatures(),
    svc.getFolders(),
    svc.getAutoResponder(),
  ]);

  return (
    <MailApp
      folder={activeFolder}
      threads={threads}
      labels={labels}
      unreadCounts={unreadCounts}
      rules={rules.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        enabled: r.enabled,
        priority: r.priority,
        runCount: r.runCount,
      }))}
      signatures={signatures.map((s) => ({
        id: s.id,
        name: s.name,
        content: s.content,
        contentHtml: s.contentHtml,
        isDefault: s.isDefault,
      }))}
      folders={folders.map((f) => ({
        id: f.id,
        name: f.name,
        color: f.color,
        parentFolderId: f.parentFolderId,
      }))}
      autoResponder={autoResponder ? {
        enabled: autoResponder.enabled,
        subject: autoResponder.subject,
        body: autoResponder.body,
      } : null}
      actions={{
        send: sendMailAction,
        reply: replyMailAction,
        replyAll: replyAllMailAction,
        forward: forwardMailAction,
        markRead: markThreadReadAction,
        toggleStar: toggleStarAction,
        archive: archiveThreadAction,
        trash: trashThreadAction,
        restore: restoreThreadAction,
        createLabel: createLabelAction,
        assignLabel: assignLabelAction,
        unassignLabel: unassignLabelAction,
        summarizeThread: summarizeThreadAction,
        suggestReply: suggestReplyAction,
        extractActionItems: extractActionItemsAction,
        adjustTone: adjustToneAction,
        saveDraft: saveDraftAction,
        createRule: createRuleAction,
        toggleRule: toggleRuleAction,
        deleteRule: deleteRuleAction,
        snoozeThread: snoozeThreadAction,
        unsnoozeThread: unsnoozeThreadAction,
        createSignature: createSignatureAction,
        deleteSignature: deleteSignatureAction,
        setAutoResponder: setAutoResponderAction,
        createContact: createContactAction,
        deleteContact: deleteContactAction,
        searchContacts: searchContactsAction,
      }}
    />
  );
}
