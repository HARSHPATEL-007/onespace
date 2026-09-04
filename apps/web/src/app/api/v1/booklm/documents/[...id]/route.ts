import { auth } from "@n0va/auth";
import { DocIngestService, registerSchema, ingestSchema, docCorrectionSchema } from "@n0va/modules-booklm/doc-ingest";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return requireWorkspace().catch(() => null);
}

function svc(c: { workspace: { id: string }; user: { id: string }; memberRole: string }) {
  return new DocIngestService(c.workspace.id, c.user.id, c.memberRole);
}

/**
 * GET /v1/booklm/documents[/{id}/...] — list | quality-report |
 * confidence-map | layout | tables | formulas | figures | citations |
 * corrections | versions
 * GET /v1/booklm/media/{id}/transcript[?from=...]
 */
export async function GET(req: Request, { params }: { params: Promise<{ id?: string[] }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const segs = (await params).id ?? [];
  const url = new URL(req.url);
  try {
    const d = svc(c);
    if (segs.length === 0) {
      return NextResponse.json({ documents: await d.documents(url.searchParams.get("setId") ?? undefined) });
    }
    const [docId, ...rest] = segs as string[];
    if (!docId) return NextResponse.json({ error: "id required" }, { status: 400 });
    const view = rest[0] ?? "";
    const sub = rest[1] ?? "";
    if (view === "" || view === undefined) {
      return NextResponse.json(await d.qualityReport(docId));
    }
    switch (view) {
      case "quality-report": return NextResponse.json(await d.qualityReport(docId));
      case "confidence-map": return NextResponse.json(await d.confidenceMap(docId));
      case "layout": {
        const page = url.searchParams.get("page");
        return NextResponse.json({ blocks: await d.layout(docId, page ? Number(page) : undefined) });
      }
      case "tables": return NextResponse.json({ tables: await d.tables(docId) });
      case "formulas": return NextResponse.json({ formulas: await d.formulas(docId) });
      case "figures": return NextResponse.json({ figures: await d.figures(docId) });
      case "citations": return NextResponse.json({ citations: await d.citations(docId) });
      case "corrections": return NextResponse.json({ corrections: await d.corrections(docId) });
      case "versions": return NextResponse.json({ versions: await d.versions(docId) });
      case "transcript": {
        const from = url.searchParams.get("from");
        return NextResponse.json({ segments: await d.transcript(docId, from ? Number(from) : undefined) });
      }
      case "segments": {
        if (!sub) return NextResponse.json({ error: "segment id required" }, { status: 400 });
        const all = await d.transcript(docId);
        const seg = all.find((s) => s.id === sub || s.segmentKey === sub);
        if (!seg) return NextResponse.json({ error: "segment not found" }, { status: 404 });
        return NextResponse.json(seg);
      }
      default:
        return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.includes("not found") ? 404 : 500 });
  }
}

const transcriptSchema = z.object({
  text: z.string().min(1).max(200000),
  format: z.enum(["srt", "vtt", "plain"]).default("plain"),
});

/**
 * POST /v1/booklm/documents[/{id}/...] — register | extract | transcript |
 * corrections | reindex | cite
 * (reindex recomputes the quality report from current children.)
 */
export async function POST(req: Request, { params }: { params: Promise<{ id?: string[] }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const segs = (await params).id ?? [];
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const action = String(b.action ?? (segs.length === 0 ? "register" : ""));
  try {
    const d = svc(c);
    if (action === "register" && segs.length === 0) {
      const parsed = registerSchema.safeParse(b);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await d.register(parsed.data), { status: 201 });
    }
    const [docId, view] = segs as string[];
    if (!docId) return NextResponse.json({ error: "id required" }, { status: 400 });
    switch (action || view) {
      case "extract": {
        const parsed = ingestSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await d.ingestText(docId, parsed.data));
      }
      case "transcript": {
        const parsed = transcriptSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await d.uploadTranscript(docId, parsed.data.text, parsed.data.format), { status: 201 });
      }
      case "corrections": {
        const parsed = docCorrectionSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await d.correct(docId, parsed.data), { status: 201 });
      }
      case "reindex": {
        return NextResponse.json(await d.qualityReport(docId));
      }
      case "cite": {
        const { blockKey, claim, setId } = b as Record<string, string>;
        if (!blockKey || !claim) return NextResponse.json({ error: "blockKey + claim required" }, { status: 400 });
        return NextResponse.json(await d.citeBlock(docId, blockKey, claim, setId), { status: 201 });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
