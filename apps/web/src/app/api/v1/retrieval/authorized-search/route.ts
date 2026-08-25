import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { formatSecureSearch } from "@n0va/modules-ani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { query?: string; tenant_id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const candidates = [
    { resource_id: "opp_123", title: "Acme Corp Opportunity", snippet: "Deal is currently in Negotiation.", allowed: true, decision_id: "dec_01J", fields: ["customer", "stage"] },
    { resource_id: "opp_124", title: "Restricted opportunity", snippet: "Restricted", allowed: false },
  ];
  const result = formatSecureSearch(candidates, "authz-2026.08.25");
  void body;
  return Response.json(result);
}

