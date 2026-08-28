import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { getSemanticDiff, explainVersionDifference } from "@n0va/modules-videos/semantic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /v1/timelines/{timelineId}/diff?from=v27&to=v31&detail=semantic
 * Spec: What Changed Between Versions — editorial, semantic, visual, narrative, audio, review
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ timelineId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { timelineId } = await params;
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "tl001:v27";
  const to = searchParams.get("to") ?? "tl001:v31";
  const detail = searchParams.get("detail") ?? "semantic";

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });

  const diff = getSemanticDiff(from, to);
  const explained = detail === "semantic" ? explainVersionDifference(from, to) : null;

  return NextResponse.json({
    timelineId,
    detail,
    diff: {
      diff_id: diff.diff_id,
      from_version: diff.from_version,
      to_version: diff.to_version,
      duration_delta_ms: diff.duration_delta_ms,
      duration_delta_label: `${diff.duration_delta_ms > 0 ? "+" : ""}${Math.round(diff.duration_delta_ms / 1000)}s`,
      changes: diff.changes.map(c => ({
        ...c,
        // every explanation links back to exact affected ranges and underlying timeline events
        linked_event: c.source_event_id ? `evt_${c.source_event_id}` : undefined,
      })),
      narrative_delta: diff.narrative_delta,
      visual_summary: diff.visual_summary,
      audio_summary: diff.audio_summary,
      review_summary: diff.review_summary,
    },
    explained: explained ? {
      summary: explained.summary,
      editorial: explained.editorial,
      semantic: explained.semantic,
      visual: explained.visual,
      narrative: explained.narrative,
      audio: explained.audio,
      review: explained.review,
    } : undefined,
  });
}
