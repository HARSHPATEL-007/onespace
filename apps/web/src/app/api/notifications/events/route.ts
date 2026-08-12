import { auth } from "@n0va/auth";
import { NotificationEngine } from "@n0va/modules-notification-engine/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const engine = new NotificationEngine(ctx.workspace.id, ctx.user.id, ctx.memberRole);

  try {
    const result = await engine.createEvent({
      recipientId: body.recipientId || ctx.user.id,
      sourceType: body.sourceType || "system",
      sourceId: body.sourceId,
      roomId: body.roomId,
      threadId: body.threadId,
      title: body.title || "Notification",
      body: body.body,
      link: body.link,
      signals: body.signals,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
