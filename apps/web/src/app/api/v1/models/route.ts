import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalModelGateway } from "@n0va/modules-ani/model-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  // Access registry via gateway internals — for demo, return mock list
  void globalModelGateway;
  return Response.json({ models: [{ model_id: "n0va-lm-small-local", version: "2.4.1" }, { model_id: "n0va-lm-medium-private", version: "1.2.0" }] });
}
