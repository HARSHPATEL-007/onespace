import { auth } from "@n0va/auth";
import { NotificationEngine } from "@n0va/modules-notification-engine/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const engine = new NotificationEngine(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const inbox = await engine.getPriorityInbox(ctx.user.id);
    return NextResponse.json({ inbox });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
