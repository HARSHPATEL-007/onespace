import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalEmergencyStop } from "@n0va/modules-ani/risk-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  return Response.json({ status: globalEmergencyStop.status() });
}
