import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalRiskPolicyEngine } from "@n0va/modules-ani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  return Response.json({ rules: globalRiskPolicyEngine.listRules() });
}

export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { id?: string; version?: number; description?: string; when?: { tool?: string }; decision?: { effect: string } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id) return Response.json({ error: "Missing id" }, { status: 400 });
  globalRiskPolicyEngine.putRule({
    id: body.id,
    version: body.version ?? 1,
    description: body.description ?? "",
    when: body.when ?? {},
    decision: body.decision ?? { effect: "require_approval", risk: "high" },
    explanation: { title: body.id, message: body.description ?? "" },
  } as never);
  return Response.json({ ok: true, id: body.id }, { status: 201 });
}

