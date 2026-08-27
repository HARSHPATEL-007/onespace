import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const svc = new AniService(workspaceId, userId, role);
    const profile = await svc.acceptPersonalizationSuggestion(params.id);
    if (!profile) return Response.json({ error: "not found or not candidate" }, { status: 404 });
    return Response.json({ profile });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
