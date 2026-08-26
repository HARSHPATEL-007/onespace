import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalEmergencyStop } from "@n0va/modules-ani/risk-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { scope?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const scope = (body.scope as "current_workflow" | "tenant" | "global_platform") ?? "current_workflow";
  globalEmergencyStop.activate(scope as never, body.reason ?? "manual emergency stop");
  return Response.json({ ok: true, scope, status: "stopped" }, { status: 201 });
}
