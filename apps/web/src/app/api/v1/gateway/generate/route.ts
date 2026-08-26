import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalModelGateway } from "@n0va/modules-ani/model-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { prompt?: string; task?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.prompt) return Response.json({ error: "Missing prompt" }, { status: 400 });
  const result = await globalModelGateway.route({
    request_id: `req_${Date.now().toString(36)}`,
    workspace: { workspaceId: "ws_test", tenantId: "tenant_acme", userId: "user_123", sessionId: "sess_test", activeModule: "test", language: "en", timezone: "UTC", locale: "en-US", tenantTier: "enterprise" } as never,
    task: body.task ?? "general",
    modality: "text",
    prompt: body.prompt,
    data_classification: "internal",
    region: "IN",
    latency_budget_ms: 2000,
    quality_floor: 0.8,
    budget_remaining_usd: 10,
  } as never);
  return Response.json({ output: result.output, model_id: result.model_id, cost_usd: result.cost_usd });
}
