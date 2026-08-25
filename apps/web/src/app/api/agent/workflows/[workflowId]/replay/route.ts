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
  const events = globalAgentKernel.replay(workflowId);
  if (events.length === 0 && !globalAgentKernel.getWorkflow(workflowId)) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ workflow_id: workflowId, events });
}
