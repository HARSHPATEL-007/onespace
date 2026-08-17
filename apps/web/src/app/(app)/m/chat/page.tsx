import { ChatService, REACTION_EMOJIS } from "@n0va/modules-chat/server";
import { ApprovalService } from "@n0va/modules-approvals/server";
import { getDeliveryEngine } from "@n0va/modules-chat/delivery";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { requireWorkspace } from "@/lib/context";
import { auth } from "@n0va/auth";
import { SignJWT } from "jose";
import {
  createChannelAction,
  createDmAction,
  sendMessageAction,
  editMessageAction,
  deleteMessageAction,
  replyMessageAction,
  renameChannelAction,
  deleteChannelAction,
  addMemberAction,
  removeMemberAction,
  reactAction,
  pinMessageAction,
  unpinMessageAction,
  markReadAction,
  searchMessagesAction,
  toggleBookmarkAction,
  saveSearchAction,
  deleteSavedSearchAction,
  setPresenceAction,
  governanceAction,
  hyperAction,
  approvalAction,
  deliveryAction,
  slashCommandAction,
  createChannelFromTemplateAction,
  inviteGuestAction,
  huddleAction,
  threadSummaryAction,
  threadDecisionAction,
  threadPinAction,
  threadExportAction,
  threadActionItemsAction,
  messageEditsAction,
  digestAction,
} from "./actions";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new ChatService(workspaceId, userId, role);

  // Generate WebSocket token for the Rust gateway
  const session = await auth();
  const secret = process.env.NEXTAUTH_SECRET || "change-me-in-production";
  const key = new TextEncoder().encode(secret);
  const token = await new SignJWT({
    sub: session?.user?.id || "",
    workspace_id: workspaceId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);

  const [channels, members, unread, presenceSessions] = await Promise.all([
    svc.listChannels(),
    svc.listMembers(),
    svc.unread(),
    svc.listPresence(),
  ]);

  const initialPresence = Object.fromEntries(
    presenceSessions.map((p) => [p.userId, p.status.toLowerCase()]),
  );

  let activeChannelId: string | null = c ?? channels[0]?.id ?? null;
  let initialMessages: Awaited<ReturnType<ChatService["listMessages"]>>["messages"] = [];
  if (activeChannelId) {
    try {
      const res = await svc.listMessages(activeChannelId);
      initialMessages = res.messages;
    } catch {
      activeChannelId = null;
    }
  }

  const approvalSvc = new ApprovalService(workspaceId, userId, role);
  const [approvalPendingCounts, channelApprovals, deliveryRows] = await Promise.all([
    approvalSvc.pendingCountsByChannel().catch(() => ({} as Record<string, number>)),
    activeChannelId ? approvalSvc.listForChannel(activeChannelId).catch(() => []) : Promise.resolve([]),
    activeChannelId
      ? getDeliveryEngine().deliveries(workspaceId, activeChannelId).catch(() => [])
      : Promise.resolve([]),
  ]);
  const deliveryMap = Object.fromEntries(
    deliveryRows.map((d) => [d.messageId, {
      id: d.id,
      state: d.state,
      attemptCount: d.attemptCount,
      maxAttempts: d.maxAttempts,
      lastError: d.lastError,
      deliveredCount: d.deliveredCount,
      targetCount: d.targetCount,
      deliveredAt: d.deliveredAt?.toISOString() ?? null,
      correlationId: d.correlationId,
    }]),
  );

  return (
    <ChatPanel
      workspaceId={workspaceId}
      userId={userId}
      channels={channels}
      members={members}
      activeChannelId={activeChannelId}
      initialMessages={initialMessages}
      unread={unread}
      reactionEmojis={[...REACTION_EMOJIS]}
      initialPresence={initialPresence}
      approvalPendingCounts={approvalPendingCounts}
      channelApprovals={channelApprovals}
      deliveryMap={deliveryMap}
      actions={{
        createChannel: createChannelAction,
        createDm: createDmAction,
        send: sendMessageAction,
        edit: editMessageAction,
        delete: deleteMessageAction,
        reply: replyMessageAction,
        rename: renameChannelAction,
        deleteChannel: deleteChannelAction,
        addMember: addMemberAction,
        removeMember: removeMemberAction,
        react: reactAction,
        pin: pinMessageAction,
        unpin: unpinMessageAction,
        markRead: markReadAction,
        search: searchMessagesAction,
        toggleBookmark: toggleBookmarkAction,
        saveSearch: saveSearchAction,
        deleteSavedSearch: deleteSavedSearchAction,
        setPresence: setPresenceAction,
        governance: governanceAction,
        hyper: hyperAction,
        approval: approvalAction,
        delivery: deliveryAction,
        slash: slashCommandAction,
        createFromTemplate: createChannelFromTemplateAction,
        inviteGuest: inviteGuestAction,
        huddle: huddleAction,
        threadSummary: threadSummaryAction,
        threadDecision: threadDecisionAction,
        threadPin: threadPinAction,
        threadExport: threadExportAction,
        threadActionItems: threadActionItemsAction,
        messageEdits: messageEditsAction,
        digest: digestAction,
      }}
      token={token}
    />
  );
}
