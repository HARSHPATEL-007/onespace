import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { publishLiveEvent } from "@/lib/live";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const channelId = String(body.channelId ?? "");
  if (!channelId) return NextResponse.json({ error: "Missing channelId" }, { status: 400 });

  await publishLiveEvent(ctx.workspace.id, {
    type: "typing",
    channel_id: channelId,
    user_id: session.user.id,
  });

  return NextResponse.json({ ok: true });
}
