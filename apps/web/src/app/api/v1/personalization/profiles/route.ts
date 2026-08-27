import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /v1/personalization/profiles — list
export async function GET() {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const svc = new AniService(workspaceId, userId, role);
    const profiles = await svc.listPersonalizationProfiles();
    return Response.json({ profiles });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// POST /v1/personalization/profiles — create
export async function POST(req: Request) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const body = await req.json();
    const svc = new AniService(workspaceId, userId, role);
    const result = await svc.createPersonalizationProfile(body);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
