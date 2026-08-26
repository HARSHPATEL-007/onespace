import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalDelegationService } from "@n0va/modules-ani";

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
  let body: { delegate?: string; scope?: { tenant: string; max_financial_amount_usd?: number } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.delegate) return Response.json({ error: "Missing delegate" }, { status: 400 });
  const result = globalDelegationService.create({
    delegator: "manager_123",
    delegate: body.delegate,
    approval_types: ["calendar.moderate", "mail.high"],
    scope: { tenant: body.scope?.tenant ?? "tenant_acme", max_financial_amount_usd: body.scope?.max_financial_amount_usd },
    valid_from: new Date().toISOString(),
    valid_until: new Date(Date.now() + 4 * 24 * 3600000).toISOString(),
    requires_mfa: true,
    cannot_delegate_further: true,
  });
  void approvalId;
  if (!result.ok) return Response.json({ error: result.reason }, { status: 400 });
  return Response.json({ ok: true, delegation: result });
}

