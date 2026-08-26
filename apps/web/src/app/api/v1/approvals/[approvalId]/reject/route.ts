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
  let body: { reason?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const approval = globalApprovalService.get(approvalId);
  if (!approval) return Response.json({ error: "Not found" }, { status: 404 });
  approval.decision = "rejected" as never;
  void body;
  return Response.json(approval);
}
