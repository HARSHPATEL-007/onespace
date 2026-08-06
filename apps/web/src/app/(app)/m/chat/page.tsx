import { ChatService } from "@n0va/modules-chat/server";
import { ChatPanel } from "@n0va/modules-chat/components";
import { requireWorkspace } from "@/lib/context";
import {
  createChannelAction,
  createDmAction,
  sendMessageAction,
  renameChannelAction,
  deleteChannelAction,
} from "./actions";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const { workspaceId, userId, role } = await requireWorkspace();
  const svc = new ChatService(workspaceId, userId, role);

  const [channels, members] = await Promise.all([svc.listChannels(), svc.listMembers()]);

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
      actions={{
        createChannel: createChannelAction,
        createDm: createDmAction,
        send: sendMessageAction,
        rename: renameChannelAction,
        deleteChannel: deleteChannelAction,
      }}
    />
  );
}
