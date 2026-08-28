import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { semanticSearchAdvanced } from "@n0va/modules-videos/semantic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /v1/video-projects/{projectId}/semantic-search
 * Spec: unified semantic search across transcript, visual, audio, objects, faces, locations, shot types, emotion, narrative
 * Returns: ranges, confidence, why matched, source asset, current branch, related clips, available edit actions
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const body = await request.json().catch(() => ({}));
  const query = String(body.query ?? "");
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const scope = body.scope ?? {};
  const filters = body.filters ?? {};
  const returnFields = body.return ?? body.return_fields ?? undefined;

  const result = semanticSearchAdvanced({
    query,
    scope: { timeline_version: scope.timeline_version, project_id: projectId, timeline_id: scope.timeline_version?.split(":")[0] },
    filters: {
      speaker_id: filters.speaker_id,
      shot_type: filters.shot_type,
      location: filters.location,
      narrative_role: filters.narrative_role,
      entity_label: filters.entity_label,
    },
    return_fields: returnFields,
    limit: body.limit ?? 20,
  });

  // Enrich with request echo for spec compliance
  return NextResponse.json({
    query: result.query,
    results: result.results.map(r => ({
      timeline_id: r.timeline_id,
      range: r.range,
      match_reasons: r.match_reasons,
      source_asset_id: r.source_asset_id,
      current_branch: r.current_branch,
      related_clips: r.related_clips,
      confidence: r.confidence,
      actions: r.actions,
      transcript: r.transcript,
      narrative_role: r.narrative_role,
    })),
    total: result.total,
    model_versions: result.model_versions,
    took_ms: result.took_ms,
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? searchParams.get("query") ?? "";
  if (!q) return NextResponse.json({ error: "query required (?q=...)" }, { status: 400 });
  const fakeReq = new NextRequest(request.url, { method: "POST" });
  // delegate to POST logic via params
  return POST(new NextRequest(request.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: q }),
  }) as unknown as NextRequest, { params });
}
