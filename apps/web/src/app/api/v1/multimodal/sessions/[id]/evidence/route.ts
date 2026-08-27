import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const svc = new AniService(workspaceId, userId, role);
    const evs = await svc.listMultimodalEvidence(params.id);
    return Response.json({ evidence: evs });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const body = await req.json();
    const svc = new AniService(workspaceId, userId, role);
    const ev = await svc.createMultimodalEvidence({ session_id: params.id, asset_id: body.asset_id ?? `asset_${params.id}`, type: body.type ?? "transcript_sentence", modality: body.modality ?? "document", time: body.time ?? { start_ms: 0, end_ms: 0 }, location: body.location ?? { page:null, slide:null, frame:null, region:null, sheet:null, cell:null }, content: body.content ?? { text: body.text ?? "" }, confidence: body.confidence ?? 0.9, permissions: { tenant_id: workspaceId, visibility: "meeting_participants", classification: "internal" }, derived_from: body.derived_from ?? [], derived_assets: [], provenance: body.provenance ?? { model: "n0va-test", model_version:"1.0", created_at: new Date().toISOString() } });
    return Response.json({ evidence: ev }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
