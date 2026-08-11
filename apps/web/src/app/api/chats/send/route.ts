import { auth } from "@n0va/auth";
import { ChatService } from "@n0va/modules-chat/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) {
    return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { channelId, body: messageBody, contactCard } = body;

  if (!channelId || !messageBody) {
    return NextResponse.json({ error: "channelId and body are required" }, { status: 400 });
  }

  const svc = new ChatService(ctx.workspace.id, ctx.user.id, ctx.memberRole);

  try {
    const name = ctx.user.name ?? ctx.user.email ?? "Member";

    let finalBody = messageBody;
    if (contactCard) {
      const card = [
        contactCard.name,
        contactCard.phone ? `📱 ${contactCard.phone}` : null,
        contactCard.email ? `📧 ${contactCard.email}` : null,
        contactCard.n0vachatId ? `💬 ${contactCard.n0vachatId}` : null,
      ].filter(Boolean).join("\n");
      finalBody = messageBody + "\n\n---\n" + card;
    }

    const message = await svc.sendMessage(channelId, finalBody, name);
    return NextResponse.json({ message });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send message" },
      { status: 500 },
    );
  }
}
