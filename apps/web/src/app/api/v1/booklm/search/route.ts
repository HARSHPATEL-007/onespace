import { auth } from "@n0va/auth";
import { LearningService } from "@n0va/modules-booklm/server";
import { EvidenceService } from "@n0va/modules-booklm/evidence";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/booklm/search?q=...&setId=...&limit=...
 * Hybrid retrieval (keyword + citation-authority + recency). Without setId,
 * searches across the workspace's sets (capped) and merges ranked results.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const setId = url.searchParams.get("setId") ?? undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 50);
  if (!q) return NextResponse.json({ results: [], query: q });

  const ev = new EvidenceService(c.workspace.id, c.user.id);
  try {
    if (setId) {
      const results = await ev.hybridSearch(setId, q, { limit });
      return NextResponse.json({ results, query: q });
    }
    const svc = new LearningService(c.workspace.id, c.user.id, c.memberRole);
    const sets = (await svc.list()).slice(0, 10);
    const per = Math.max(3, Math.ceil(limit / Math.max(1, sets.length)));
    const merged: { setId: string; setTitle: string; item: unknown; score: number }[] = [];
    for (const s of sets) {
      const r = await ev.hybridSearch(s.id, q, { limit: per });
      for (const hit of r) merged.push({ setId: s.id, setTitle: s.title, item: hit.item, score: hit.score });
    }
    merged.sort((a, b) => b.score - a.score);
    return NextResponse.json({ results: merged.slice(0, limit), query: q });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Search failed" }, { status: 500 });
  }
}
