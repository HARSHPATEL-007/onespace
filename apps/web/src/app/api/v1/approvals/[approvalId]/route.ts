import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalApprovalService } from "@n0va/modules-ani/risk-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ approvalId: string }> }) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { approvalId } = await params;
  const approval = globalApprovalService.get(approvalId);
  if (!approval) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(approval);
}
