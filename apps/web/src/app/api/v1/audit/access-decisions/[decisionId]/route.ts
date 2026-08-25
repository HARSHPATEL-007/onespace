// @ts-nocheck
import { actionContext, UnauthorizedError } from "@/lib/action-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ decisionId: string }> }) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { decisionId } = await params;
  const store = (globalThis as unknown as { __authzDecisions?: Map<string, unknown> }).__authzDecisions;
  const decision = store?.get(decisionId);
  if (!decision) return Response.json({ error: "Decision not found" }, { status: 404 });
  return Response.json(decision);
}
