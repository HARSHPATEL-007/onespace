import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
import { createConsent } from "@n0va/modules-ani/multimodal-evidence";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

// POST /v1/multimodal/sessions — create session with granular consent
export async function POST(req: Request) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const body = await req.json().catch(()=>({})) as { session_id?: string; purposes?: Record<string,string> };
    const svc = new AniService(workspaceId, userId, role);
    const session_id = body.session_id ?? `meet_${Date.now().toString(36)}`;
    const consent = createConsent(session_id, body.purposes as never);
    await svc.setMultimodalConsent(consent);
    return Response.json({ session_id, consent }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// GET list sessions via evidence list (stub)
export async function GET() {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const svc = new AniService(workspaceId, userId, role);
    const evs = await svc.listMultimodalEvidence();
    const sessions = [...new Set(evs.map(e=>e.session_id))];
    return Response.json({ sessions });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
