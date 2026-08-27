import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /v1/personalization/forget
export async function POST() {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const svc = new AniService(workspaceId, userId, role);
    const count = await svc.forgetPersonalization();
    return Response.json({ forgotten: count });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
