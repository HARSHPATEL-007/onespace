import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalApprovalService } from "@n0va/modules-ani/risk-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ approvalId: string }> }) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { approvalId } = await params;
  let body: { approver?: string; mfa_method?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const approval = globalApprovalService.approve(approvalId, body.approver ?? "user_456", body.mfa_method);
  if (!approval) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(approval);
}
