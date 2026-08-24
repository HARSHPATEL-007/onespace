import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/context";
import { ChatService } from "@n0va/modules-chat/server";

export async function GET(req: Request) {
  try {
    const { workspaceId, userId, role } = await requireWorkspace();
    const url = new URL(req.url);
    const messageId = url.searchParams.get("messageId");
    if (!messageId) return NextResponse.json({ error: "messageId required" }, { status: 400 });
    const svc = new ChatService(workspaceId, userId, role);
    const data = await svc.getMessageRichCards(messageId);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
}
