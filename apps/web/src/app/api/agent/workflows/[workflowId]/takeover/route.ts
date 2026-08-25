// @ts-nocheck
import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalAgentKernel } from "@n0va/modules-ani/agent-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ workflowId: string }> }) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { workflowId } = await params;
  let body: { action?: string; stepId?: string; newArgs?: Record<string, unknown> } = {};
  try {
    body = await req.json();
  } catch {}
  try {
    const wf = globalAgentKernel.takeover(workflowId, { type: body.action ?? "pause", stepId: body.stepId, newArgs: body.newArgs });
    return Response.json({ workflow_id: wf.workflow_id, state: wf.state, plan: wf.plan });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
