import { MailService, type MailFolder } from "@n0va/modules-mail/server";
import { MailApp } from "@n0va/modules-mail/components";
import { requireWorkspace } from "@/lib/context";
import {
  sendMailAction,
  replyMailAction,
  markThreadReadAction,
  toggleStarAction,
  archiveThreadAction,
  trashThreadAction,
  restoreThreadAction,
  createLabelAction,
  assignLabelAction,
  unassignLabelAction,
} from "./actions";

const VALID_FOLDERS = ["INBOX", "SENT", "ARCHIVE", "TRASH"] as const;

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const { folder } = await searchParams;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new MailService(workspaceId, userId, role);

  const activeFolder: MailFolder = VALID_FOLDERS.includes(folder as MailFolder)
    ? (folder as MailFolder)
    : "INBOX";

  const [threads, labels, unreadCounts] = await Promise.all([
    svc.listFolder(activeFolder),
    svc.labels(),
    svc.unreadCounts(),
  ]);

  return (
    <MailApp
      folder={activeFolder}
      threads={threads}
      labels={labels}
      unreadCounts={unreadCounts}
      actions={{
        send: sendMailAction,
        reply: replyMailAction,
        markRead: markThreadReadAction,
        toggleStar: toggleStarAction,
        archive: archiveThreadAction,
        trash: trashThreadAction,
        restore: restoreThreadAction,
        createLabel: createLabelAction,
        assignLabel: assignLabelAction,
        unassignLabel: unassignLabelAction,
      }}
    />
  );
}
