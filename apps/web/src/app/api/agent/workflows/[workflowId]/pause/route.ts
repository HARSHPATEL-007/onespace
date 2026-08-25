// @ts-nocheck
import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalAgentKernel } from "@n0va/modules-ani/agent-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ workflowId: string }> }) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { workflowId } = await params;
  try {
    const wf = globalAgentKernel.takeover(workflowId, { type: "pause" });
    return Response.json({ workflow_id: wf.workflow_id, state: wf.state });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
