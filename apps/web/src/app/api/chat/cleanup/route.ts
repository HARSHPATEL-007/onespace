import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { ChatService } from "@n0va/modules-chat/server";
import { NextResponse } from "next/server";

// Purges expired ephemeral messages. Callable by any member; no-op when nothing expired.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const svc = new ChatService(ctx.workspaceId, ctx.userId, ctx.memberRole);
  const result = await svc.purgeExpiredMessages();
  return NextResponse.json({ purged: result.purged, skipped: result.skipped });
}
