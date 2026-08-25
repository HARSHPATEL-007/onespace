import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { signDecision, type AuthorizationDecision } from "@n0va/modules-ani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-memory decision store for audit retrieval (per spec §15, would be WORM store)
const decisionStore = (globalThis as unknown as { __authzDecisions?: Map<string, AuthorizationDecision> });
if (!decisionStore.__authzDecisions) decisionStore.__authzDecisions = new Map<string, AuthorizationDecision>();

export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }

  let body: {
    tenant_id?: string;
    subject?: { type: string; id: string };
    agent?: { id: string; delegation_id: string };
    query?: string;
    operation?: string;
    purpose?: string;
    destination?: { type: string; recipient_domain?: string; recipients?: string[] };
    requested_resources?: Array<{ type: string; id: string }>;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.tenant_id || !body.subject?.id) {
    return Response.json({ error: "Missing tenant_id or subject.id" }, { status: 400 });
  }

  const tenantId = body.tenant_id;
  const subjectId = body.subject.id;
  const resource = body.requested_resources?.[0];
  const operation = (body.operation as AuthorizationDecision["operation"]) ?? "read";
  const purpose = body.purpose ?? "internal_analysis";
  const destination = (body.destination as AuthorizationDecision["destination"]) ?? { type: "internal" as const };
  const classification = body.query?.toLowerCase().includes("legal") ? "restricted" as const : "confidential" as const;

  const decision = signDecision({
    subject: {
      type: (body.subject.type as "user" | "agent") ?? "user",
      id: subjectId,
      tenant_id: tenantId,
      roles: ["sales_manager"],
      groups: ["regional_sales"],
      delegated_by: body.agent?.id ?? null,
    },
    resource: {
      type: resource?.type ?? "crm_opportunity",
      id: resource?.id ?? "opp_123",
      tenant_id: tenantId,
      region: "IN",
      classification,
    },
    operation,
    purpose,
    downstream_action: operation === "read" && purpose.includes("external") ? "draft_external_email" : "internal_analysis",
    destination: destination as AuthorizationDecision["destination"],
    decision: classification === "restricted" && destination.type === "external_email" ? "allow_with_field_constraints" : "allow",
    policy_version: "authz-2026.08.25",
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    field_policy_ref: "crm_opportunity_sales_v4",
    obligations: classification === "restricted" ? ["mask_internal_notes", "exclude_health_data", "audit_access"] : ["audit_access"],
  });

  decisionStore.__authzDecisions!.set(decision.decision_id, decision);

  // Per spec §18 example response
  return Response.json({
    status: decision.decision === "allow_with_field_constraints" ? "allow_with_constraints" : decision.decision,
    decision_id: decision.decision_id,
    context_lease_id: `lease_${decision.decision_id.slice(4)}`,
    authorized_fields: ["customer.name", "opportunity.stage", "opportunity.next_action"],
    redacted_fields: decision.decision === "allow_with_field_constraints" ? [
      { field: "opportunity.internal_legal_notes", reason: "insufficient_scope" },
      { field: "customer.health_status", reason: "purpose_not_permitted" },
    ] : [],
    obligations: decision.obligations,
    expires_at: decision.expires_at,
    decision,
  });
}

