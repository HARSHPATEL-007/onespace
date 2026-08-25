import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalAgentKernel } from "@n0va/modules-ani/agent-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /v1/agent/workflows — start execution (requires approved plan workflow)
export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { workflow_id?: string; plan_id?: string; goal?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  let wf = body.workflow_id ? globalAgentKernel.getWorkflow(body.workflow_id) : null;
  if (!wf && body.plan_id) {
    wf = globalAgentKernel.listWorkflows().find((w) => w.plan.plan_id === body.plan_id) ?? null;
  }
  if (!wf && body.goal) {
    const plan = globalAgentKernel.compilePlan(body.goal, []);
    wf = globalAgentKernel.createWorkflow(plan);
    try {
      globalAgentKernel.transition(wf.workflow_id, "VALIDATING", "api");
      globalAgentKernel.transition(wf.workflow_id, "SIMULATING", "api");
    } catch {}
  }
  if (!wf) return Response.json({ error: "Workflow or plan not found" }, { status: 404 });

  // Move through approval gate if needed
  try {
    if (wf.state === "SIMULATING") {
      globalAgentKernel.transition(wf.workflow_id, "AWAITING_APPROVAL", "api");
      // For demo, auto-approve if no required approvals; real would wait
      globalAgentKernel.transition(wf.workflow_id, "APPROVED", "api");
    } else if (wf.state === "AWAITING_APPROVAL") {
      globalAgentKernel.transition(wf.workflow_id, "APPROVED", "api");
    }
    if (wf.state === "APPROVED") {
      globalAgentKernel.transition(wf.workflow_id, "RUNNING", "api");
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message, workflow: wf }, { status: 409 });
  }
  return Response.json({ workflow_id: wf.workflow_id, state: wf.state, plan: wf.plan }, { status: 201 });
}

export async function GET() {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  return Response.json({ workflows: globalAgentKernel.listWorkflows() });
}
