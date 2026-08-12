import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { ChatService } from "@n0va/modules-chat/server";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  let body: { scope?: "CHANNEL" | "WORKSPACE" | "THREAD"; channelId?: string; since?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const svc = new ChatService(ctx.workspaceId, ctx.userId, ctx.memberRole);
  const result = await svc.exportMessages({
    scope: body.scope ?? "CHANNEL",
    channelId: body.channelId,
    since: body.since,
  });
  return NextResponse.json(result);
}
