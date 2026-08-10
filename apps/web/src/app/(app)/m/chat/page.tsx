import { ChatService, REACTION_EMOJIS } from "@n0va/modules-chat/server";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { requireWorkspace } from "@/lib/context";
import { auth } from "@n0va/auth";
import { SignJWT } from "jose";
import {
  createChannelAction,
  createDmAction,
  sendMessageAction,
  renameChannelAction,
  deleteChannelAction,
  reactAction,
  markReadAction,
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

  const [channels, members, unread] = await Promise.all([
    svc.listChannels(),
    svc.listMembers(),
    svc.unread(),
  ]);

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
      actions={{
        createChannel: createChannelAction,
        createDm: createDmAction,
        send: sendMessageAction,
        rename: renameChannelAction,
        deleteChannel: deleteChannelAction,
        react: reactAction,
        markRead: markReadAction,
      }}
      token={token}
    />
  );
}
