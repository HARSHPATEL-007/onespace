import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /v1/personalization/export
export async function POST(req: Request) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const body = await req.json().catch(()=> ({})) as { profile_id?: string };
    const svc = new AniService(workspaceId, userId, role);
    if (!body.profile_id) return Response.json({ error: "profile_id required" }, { status: 400 });
    const exported = await svc.exportPersonalizationProfile(body.profile_id);
    if (!exported) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json(exported);
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
