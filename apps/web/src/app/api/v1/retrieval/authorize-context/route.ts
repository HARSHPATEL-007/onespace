import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { buildContextEnvelope, signDecision } from "@n0va/modules-ani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { purpose?: string; destination?: { type: string }; records?: Array<{ resource: string; fields: Record<string, unknown> }> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const decision = signDecision({
    subject: { type: "user", id: "user_456", tenant_id: "tenant_acme", roles: ["sales_manager"], groups: [] },
    resource: { type: "crm_opportunity", id: "opp_123", tenant_id: "tenant_acme", region: "IN", classification: "confidential" },
    operation: "read",
    purpose: body.purpose ?? "draft_external_email",
    downstream_action: "draft_external_email",
    destination: (body.destination as { type: "external_email" }) ?? { type: "external_email" },
    decision: "allow_with_field_constraints",
    policy_version: "authz-2026.08.25",
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    field_policy_ref: "crm_opportunity_sales_v4",
    obligations: ["audit_access"],
  });
  const envelope = buildContextEnvelope(body.purpose ?? "draft_external_email", decision.destination, decision, (body.records as never) ?? []);
  return Response.json(envelope);
}

