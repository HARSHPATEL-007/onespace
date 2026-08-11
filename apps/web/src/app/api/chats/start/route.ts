import { auth } from "@n0va/auth";
import { ContactChatService } from "@n0va/modules-contacts/server";
import { ChatService } from "@n0va/modules-chat/server";
import { prisma } from "@n0va/db";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspaceId, role } = await requireWorkspace().catch(() => ({ workspaceId: null, role: null }));
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const identifier: string | undefined = body.identifier;
  const message: string | undefined = body.message;

  if (!identifier) {
    return NextResponse.json({ error: "Identifier is required" }, { status: 400 });
  }

  const contactSvc = new ContactChatService(workspaceId, session.user.id, role ?? "MEMBER");
  const chatSvc = new ChatService(workspaceId, session.user.id, role ?? "MEMBER");

  try {
    const result = await contactSvc.resolveContact(identifier);

    if (!result.contact.n0vachatId) {
      return NextResponse.json(
        { error: "Contact is not on N0VA CHAT. Use invite flow instead.", status: "off_platform" },
        { status: 409 },
      );
    }

    let channelId = result.chatLink?.channelId;

    if (!channelId) {
      const initResult = await contactSvc.initiateChat(identifier);
      channelId = initResult.channelId;
    }

    if (message?.trim()) {
      const ctx = await requireWorkspace();
      const name = ctx.user.name ?? ctx.user.email ?? "Member";
      await chatSvc.sendMessage(channelId, message.trim(), name);
    }

    return NextResponse.json({ channelId, contact: result.contact });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to start chat" },
      { status: 500 },
    );
  }
}
