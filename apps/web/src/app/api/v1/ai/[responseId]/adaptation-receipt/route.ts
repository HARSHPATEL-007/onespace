import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: { responseId: string } }) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const svc = new AniService(workspaceId, userId, role);
    const receipt = await svc.getAdaptationReceipt(params.responseId);
    if (!receipt) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ adaptation_receipt: receipt });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
