import { AniService } from "@n0va/modules-ani/server";
import { AniChat } from "@n0va/modules-ani/components";
import { requireWorkspace } from "@/lib/context";
import { createConversationAction, sendAniMessageAction, clearConversationAction, removeConversationAction } from "./actions";

export default async function AniPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { workspaceId, userId, role } = await requireWorkspace();
  const { c } = await searchParams;
  const svc = new AniService(workspaceId, userId, role);
  const conversations = await svc.conversations();
  const active = c ? await svc.open(c) : null;

  return (
    <AniChat
      conversations={conversations}
      active={active}
      actions={{
        create: createConversationAction,
        send: sendAniMessageAction,
        clear: clearConversationAction,
        remove: removeConversationAction,
      }}
    />
  );
}
