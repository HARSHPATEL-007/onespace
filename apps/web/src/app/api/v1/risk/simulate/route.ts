import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalRiskPolicyEngine } from "@n0va/modules-ani/risk-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { policy_version_before?: string; policy_version_after?: string; sample_period?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const result = globalRiskPolicyEngine.simulate(
    body.policy_version_before ?? "risk-policy-2026.07",
    body.policy_version_after ?? "risk-policy-2026.08",
    body.sample_period ?? "2026-08-01/2026-08-25",
  );
  return Response.json({ simulation: result });
}
