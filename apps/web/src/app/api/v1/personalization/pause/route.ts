import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const { profile_id } = await req.json() as { profile_id: string };
    const svc = new AniService(workspaceId, userId, role);
    const ok = await svc.pausePersonalizationProfile(profile_id);
    return Response.json({ ok });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
