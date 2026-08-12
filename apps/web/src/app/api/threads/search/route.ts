import { auth } from "@n0va/auth";
import { ThreadMemoryService } from "@n0va/modules-thread-memory/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const svc = new ThreadMemoryService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const threads = await svc.searchThreads(q, {
      channelId: url.searchParams.get("channelId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      hasDecisions: url.searchParams.get("hasDecisions") === "true",
      hasActions: url.searchParams.get("hasActions") === "true",
      pinned: url.searchParams.get("pinned") === "true",
    });
    return NextResponse.json({ threads });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
