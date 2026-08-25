import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { PolicyAsCodeEngine } from "@n0va/modules-ani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const engine = new PolicyAsCodeEngine();
engine.putPolicy({
  policy_id: "crm_external_draft",
  version: 4,
  description: "Restrict CRM data used in external email drafts",
  subject: { authenticated: true, tenant_match: true },
  resource: { type: "crm_opportunity", classification: { allowed: ["public", "internal", "confidential"] } },
  request: { operation: "read", purpose: { in: ["draft_external_message"] } },
  destination: { type: "external_email" },
  field_rules: { allow: ["customer.name", "opportunity.stage"], mask: ["customer.phone"], redact: ["opportunity.internal_legal_notes"] },
  obligations: ["validate_external_recipient", "audit_decision"],
  deny_if: ["legal_privilege_detected"],
  audit: { severity: "high" },
});

export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { policy_id?: string; subject?: { id: string }; resource?: { classification: string; type: string }; operation?: string; purpose?: string; destination?: { type: string } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const result = engine.evaluate(body.policy_id ?? "crm_external_draft", {
    subject: { type: "user", id: body.subject?.id ?? "user_456", tenant_id: "tenant_acme", roles: [], groups: [] },
    resource: { classification: (body.resource?.classification as "public" | "internal" | "confidential" | "restricted") ?? "confidential", type: body.resource?.type ?? "crm_opportunity" },
    operation: body.operation ?? "read",
    purpose: body.purpose ?? "draft_external_message",
    destination: (body.destination as { type: "external_email" }) ?? { type: "external_email" },
  });
  return Response.json({ simulation: result, policy_id: body.policy_id ?? "crm_external_draft" });
}

