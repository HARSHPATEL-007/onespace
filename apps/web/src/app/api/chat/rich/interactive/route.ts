import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/context";
import { ChatService } from "@n0va/modules-chat/server";

export async function POST(req: Request) {
  try {
    const { workspaceId, userId, role } = await requireWorkspace();
    const body = await req.json() as { messageId?: string; channelId?: string; actionId?: string; value?: string; confirm?: boolean; op?: string; title?: string; summaryLine?: string; kind?: "approval" | "task" | "poll" | "generic" };
    const svc = new ChatService(workspaceId, userId, role);

    if (body.op === "create") {
      if (!body.channelId || !body.title) return NextResponse.json({ error: "channelId and title required" }, { status: 400 });
      const res = await svc.createInteractive({
        channelId: body.channelId,
        messageId: body.messageId,
        kind: body.kind ?? "generic",
        title: body.title,
        summaryLine: body.summaryLine ?? body.title,
      });
      return NextResponse.json(res);
    }

    if (!body.messageId || !body.actionId || !body.channelId) return NextResponse.json({ error: "messageId, channelId, actionId required" }, { status: 400 });
    const res = await svc.handleRichAction({
      messageId: body.messageId,
      channelId: body.channelId,
      actionId: body.actionId,
      value: body.value,
      confirm: body.confirm,
    });
    if (!res.ok) return NextResponse.json(res, { status: 400 });
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
}
