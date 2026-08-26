// @ts-nocheck
import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { needsRevalidation } from "@n0va/modules-ani/risk-approval";

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
  let body: { current?: { toolVersion: string; policyVersion: string; recipients: string[]; amount: number; classification: string } };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const mockApproval = { expires_at: new Date(Date.now() + 3600000).toISOString() } as never;
  const result = needsRevalidation(
    mockApproval,
    body.current ?? { toolVersion: "2.1.0", policyVersion: "risk-policy-2026.08", recipients: ["a@b.com"], amount: 100, classification: "internal" },
    { toolVersion: "2.1.0", policyVersion: "risk-policy-2026.08", recipients: ["a@b.com"], amount: 100, classification: "internal" },
  );
  void workflowId;
  return Response.json(result);
}
