import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { ThreadMemoryService } from "@n0va/modules-thread-memory/server";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const channelId = url.searchParams.get("channelId") ?? undefined;
  const assignee = url.searchParams.get("assignee") ?? undefined;
  const pinned = url.searchParams.get("pinned") === "true" ? true : undefined;
  const hasDecisions = url.searchParams.get("hasDecisions") === "true" ? true : undefined;
  const hasActions = url.searchParams.get("hasActions") === "true" ? true : undefined;
  const unresolved = url.searchParams.get("unresolved") === "true" ? true : undefined;
  const archived = url.searchParams.get("archived") === "true" ? true : undefined;
  const svc = new ThreadMemoryService(ctx.workspace.id, session.user.id, ctx.memberRole);
  try {
    const results = await svc.searchThreads(q, { channelId, hasDecisions, hasActions, pinned, assignee, unresolved, archived });
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
