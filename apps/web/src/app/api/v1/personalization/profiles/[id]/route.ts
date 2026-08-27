import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /v1/personalization/profiles/{id}
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const body = await req.json();
    const svc = new AniService(workspaceId, userId, role);
    const result = await svc.updatePersonalizationProfile(params.id, body);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// DELETE /v1/personalization/profiles/{id}
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const svc = new AniService(workspaceId, userId, role);
    const ok = await svc.deletePersonalizationProfile(params.id);
    if (!ok) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// GET single (optional)
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const svc = new AniService(workspaceId, userId, role);
    const profile = await svc.getPersonalizationProfile(params.id);
    if (!profile) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ profile });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
