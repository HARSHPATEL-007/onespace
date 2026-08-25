import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalAgentKernel } from "@n0va/modules-ani/agent-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /v1/agent/plans — create a plan
export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { goal?: string; context_refs?: string[]; limits?: { max_steps?: number; max_duration_seconds?: number; max_cost?: number } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.goal) return Response.json({ error: "Missing goal" }, { status: 400 });
  const plan = globalAgentKernel.compilePlan(body.goal, body.context_refs ?? [], body.limits);
  const validation = globalAgentKernel.validatePlan(plan);
  if (!validation.valid) return Response.json({ error: "Validation failed", details: validation.errors }, { status: 422 });
  // Store as workflow in CREATED->PLANNED for simulate/approval
  const wf = globalAgentKernel.createWorkflow(plan);
  // Move to VALIDATING → SIMULATING for preview
  try {
    globalAgentKernel.transition(wf.workflow_id, "VALIDATING", "api");
    globalAgentKernel.transition(wf.workflow_id, "SIMULATING", "api");
  } catch {}
  return Response.json({ plan, workflow_id: wf.workflow_id, validation }, { status: 201 });
}

export async function GET() {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  return Response.json({ workflows: globalAgentKernel.listWorkflows().map((w) => ({ workflow_id: w.workflow_id, goal: w.plan.goal, state: w.state })) });
}
