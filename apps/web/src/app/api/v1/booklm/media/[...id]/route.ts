import { auth } from "@n0va/auth";
import { DocIngestService } from "@n0va/modules-booklm/doc-ingest";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /v1/booklm/media/{id}/transcript[?from=...] — timestamped segments
 * (speaker labels only). GET /v1/booklm/media/{id}/segments/{segmentId}.
 * A clickable citation opens the media at the segment timestamp with
 * transcript confidence and machine-transcribed labeling.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string[] }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const segs = (await params).id ?? [];
  const [mediaId, view, sub] = segs;
  if (!mediaId) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const d = new DocIngestService(c.workspace.id, c.user.id, c.memberRole);
    if (view === "segments" && sub) {
      const all = await d.transcript(mediaId);
      const seg = all.find((s) => s.id === sub || s.segmentKey === sub);
      if (!seg) return NextResponse.json({ error: "segment not found" }, { status: 404 });
      return NextResponse.json({ ...seg, machineTranscribed: true });
    }
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const segments = await d.transcript(mediaId, from ? Number(from) : undefined);
    return NextResponse.json({
      segments: segments.map((s) => ({ ...s, machineTranscribed: true })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.includes("not found") ? 404 : 500 });
  }
}
