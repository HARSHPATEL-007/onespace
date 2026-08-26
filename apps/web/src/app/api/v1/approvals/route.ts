import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalApprovalService, globalRiskEngine } from "@n0va/modules-ani/risk-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { workflow_id?: string; tool?: string; args?: unknown; risk?: { financial_impact_usd?: number } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const risk = globalRiskEngine.calculate({
    actionType: body.tool ?? "generic",
    dataClassification: "confidential",
    financialUsd: body.risk?.financial_impact_usd,
    externalRecipients: 2,
  });
  const approval = globalApprovalService.createApproval({
    workflowId: body.workflow_id ?? `wf_${Date.now().toString(36)}`,
    tool: body.tool ?? "unknown",
    args: body.args ?? {},
    risk,
    triggeredRules: [{ rule_id: "mail.external_send.confidential", effect: "require_approval", reason: "External" }],
    requiredRoles: risk.action_risk === "critical" ? ["requester", "finance_manager"] : ["requester", "data_owner"],
    policyVersion: risk.policy_version,
  });
  return Response.json(approval, { status: 201 });
}

export async function GET() {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  return Response.json({ approvals: globalApprovalService.list() });
}
