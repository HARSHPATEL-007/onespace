import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? url.searchParams.get("text") ?? "";
    const svc = new AniService(workspaceId, userId, role);
    const res = await svc.searchMultimodalEvidence({ text: q, filters: { } });
    const filtered = res.filter(r=> r.session_id===params.id || !params.id);
    return Response.json({ results: filtered });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
