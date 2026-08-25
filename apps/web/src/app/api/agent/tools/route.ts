import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalAgentKernel } from "@n0va/modules-ani/agent-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /v1/agent/tools — register a tool (or list if no body)
export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // list
  }
  if (body && typeof body === "object" && "tool_id" in (body as Record<string, unknown>)) {
    const contract = body as unknown as import("@n0va/modules-ani").ToolContract;
    try {
      globalAgentKernel.getToolRegistry().register(contract);
      return Response.json({ ok: true, tool_id: contract.tool_id }, { status: 201 });
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  }
  return Response.json({ tools: globalAgentKernel.getToolRegistry().list() });
}

export async function GET() {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  return Response.json({ tools: globalAgentKernel.getToolRegistry().list() });
}
