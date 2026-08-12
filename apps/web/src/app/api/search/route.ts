import { auth } from "@n0va/auth";
import { SearchEngine } from "@n0va/modules-search-engine/server";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  if (!q.trim()) return NextResponse.json({ results: [] });

  const engine = new SearchEngine(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    const results = await engine.search(q, {
      contentType: url.searchParams.get("contentType") ?? undefined,
      roomId: url.searchParams.get("roomId") ?? undefined,
      senderId: url.searchParams.get("senderId") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      in: url.searchParams.get("in") ?? undefined,
      before: url.searchParams.get("before") ?? undefined,
      after: url.searchParams.get("after") ?? undefined,
      has: url.searchParams.get("has")?.split(",") ?? undefined,
      sentiment: url.searchParams.get("sentiment") as any,
      keyword: url.searchParams.get("keyword") ?? undefined,
      owner: url.searchParams.get("owner") ?? undefined,
      threadId: url.searchParams.get("threadId") ?? undefined,
      queryType: url.searchParams.get("queryType") as any,
      limit: parseInt(url.searchParams.get("limit") ?? "20", 10),
    });
    return NextResponse.json({ results, query: q });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Search failed" }, { status: 500 });
  }
}
