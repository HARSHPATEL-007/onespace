// @ts-nocheck
import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalRiskEngine } from "@n0va/modules-ani/risk-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ workflowId: string }> }) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { workflowId } = await params;
  // Mock risk for workflow — in production would load workflow and evaluate
  void workflowId;
  const risk = globalRiskEngine.calculate({
    actionType: "workflow",
    dataClassification: "confidential",
    financialUsd: 12500,
    affectedRecords: 240,
    externalRecipients: 2,
  });
  return Response.json({ workflow_id: workflowId, risk });
}
