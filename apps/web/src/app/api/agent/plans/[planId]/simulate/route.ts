// @ts-nocheck
import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalAgentKernel } from "@n0va/modules-ani/agent-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ planId: string }> }) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { planId } = await params;
  // Find workflow that contains this plan
  const wf = globalAgentKernel.listWorkflows().find((w) => w.plan.plan_id === planId);
  if (!wf) return Response.json({ error: "Plan not found" }, { status: 404 });
  const sim = globalAgentKernel.simulate(wf.plan);
  return Response.json(sim);
}
