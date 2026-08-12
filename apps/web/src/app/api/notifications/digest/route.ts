import { auth } from "@n0va/auth";
import { NotificationEngine } from "@n0va/modules-notification-engine/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const url = new URL(req.url);
  const roomId = url.searchParams.get("roomId") ?? undefined;
  const engine = new NotificationEngine(ctx.workspace.id, ctx.user.id, ctx.memberRole);

  try {
    const digest = await engine.getDigest(ctx.user.id, roomId);
    return NextResponse.json({ digest });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
