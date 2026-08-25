import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { signDecision } from "@n0va/modules-ani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { requests?: Array<{ tenant_id: string; subject: { id: string; type: string }; resource: { type: string; id: string }; operation: string; purpose: string; destination: { type: string } }> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const requests = body.requests ?? [];
  const decisions = requests.map((r) =>
    signDecision({
      subject: { type: (r.subject.type as "user") ?? "user", id: r.subject.id, tenant_id: r.tenant_id, roles: [], groups: [] },
      resource: { type: r.resource.type, id: r.resource.id, tenant_id: r.tenant_id, region: "IN", classification: "internal" },
      operation: (r.operation as "read") ?? "read",
      purpose: r.purpose,
      downstream_action: "internal_analysis",
      destination: r.destination as { type: "internal" },
      decision: "allow",
      policy_version: "authz-2026.08.25",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      field_policy_ref: "batch_v1",
      obligations: ["audit_access"],
    }),
  );
  return Response.json({ decisions });
}

