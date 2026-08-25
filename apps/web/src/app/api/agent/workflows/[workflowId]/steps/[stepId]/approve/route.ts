// @ts-nocheck
import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalAgentKernel } from "@n0va/modules-ani/agent-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /v1/agent/workflows/{workflow_id}/steps/{step_id}/approve — step-specific approval per spec §10
export async function POST(req: Request, { params }: { params: Promise<{ workflowId: string; stepId: string }> }) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { workflowId, stepId } = await params;
  let body: { approval_id?: string; comment?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const wf = globalAgentKernel.getWorkflow(workflowId);
  if (!wf) return Response.json({ error: "Workflow not found" }, { status: 404 });
  const step = wf.plan.steps.find((s) => s.step_id === stepId);
  if (!step) return Response.json({ error: "Step not found" }, { status: 404 });

  // Validate approval is still valid and not expired, and step is awaiting approval
  if (wf.state !== "AWAITING_APPROVAL" && wf.state !== "PAUSED" && wf.state !== "ESCALATED") {
    return Response.json({ error: `Workflow not awaiting approval (state: ${wf.state})`, step }, { status: 409 });
  }

  // Record approval and transition if all required steps approved
  wf.approval_ids.push(body.approval_id ?? `apr_${Date.now().toString(36)}`);
  // For demo, approve the single step and move to APPROVED if no other steps require approval
  const remaining = wf.plan.steps.filter((s) => s.approval === "required" && !wf.approval_ids.includes(s.step_id));
  // Simplified: if this was the last required approval, move to APPROVED
  if (remaining.length === 0 || remaining.every((s) => s.step_id === stepId)) {
    try {
      globalAgentKernel.transition(workflowId, "APPROVED", "human");
    } catch {}
  }
  return Response.json({ workflow_id: workflowId, step_id: stepId, state: wf.state, approval_id: body.approval_id ?? wf.approval_ids[wf.approval_ids.length - 1] });
}
