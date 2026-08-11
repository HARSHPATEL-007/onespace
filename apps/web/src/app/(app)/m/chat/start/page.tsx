import { ContactChatStarter } from "@/components/chat/ContactChatStarter";
import { requireWorkspace } from "@/lib/context";

export default async function ChatStartPage() {
  const { workspaceId } = await requireWorkspace();

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--nv-space-5)" }}>
      <ContactChatStarter workspaceId={workspaceId} />
    </div>
  );
}
