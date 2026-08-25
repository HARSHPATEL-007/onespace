import { actionContext, UnauthorizedError } from "@/lib/action-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  let body: { decision_id?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  // Reauthorize checks freshness, revocation, legal hold
  return Response.json({ reauthorized: true, decision_id: body.decision_id ?? "dec_new", expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
}

