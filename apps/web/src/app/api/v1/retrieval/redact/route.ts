import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AuthorizationAwareRedactionEngine } from "@n0va/modules-ani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const engine = new AuthorizationAwareRedactionEngine();

export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { field?: string; value?: unknown; mode?: "null" | "typed_marker" | "general_marker" | "format_preserving_mask" | "token_substitution" | "aggregation" | "differential_disclosure" | "field_removal"; reason?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.field) return Response.json({ error: "Missing field" }, { status: 400 });
  const result = engine.redact(body.field, body.value ?? null, body.mode ?? "typed_marker", body.reason ?? "policy");
  return Response.json(result);
}

