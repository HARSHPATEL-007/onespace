import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { CrossAppDataFlowChecker } from "@n0va/modules-ani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checker = new CrossAppDataFlowChecker();
// Seed example per §14
checker.addEdge({
  source_app: "crm",
  source_field: "customer.name",
  destination_app: "mail",
  destination_field: "recipient",
  purpose: "customer_followup",
  classification: "internal",
  policy_decision: "allow",
  approval_required: false,
  retention: "session",
  reversible: true,
});

export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { source_app?: string; source_field?: string; destination_app?: string; destination_field?: string; classification?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const result = checker.checkFlow(
    body.source_app ?? "crm",
    body.source_field ?? "customer.name",
    body.destination_app ?? "mail",
    body.destination_field ?? "recipient",
    body.classification ?? "internal",
  );
  return Response.json(result);
}

