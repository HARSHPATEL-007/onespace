import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw err;
  }
  const { workspaceId, userId, role } = ctx;

  let body: { messageId?: string; conversationId?: string; rating?: number; content?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rating = typeof body.rating === "number" ? body.rating : 0;
  // Map rating -1..1 to satisfaction 0..1 and explicit/implicit feedback
  const satisfaction = rating > 0 ? 0.95 : rating < 0 ? 0.25 : 0.5;

  try {
    const svc = new AniService(workspaceId, userId, role);
    // Record to adaptive engine via service's implicit feedback path
    // Directly use svc helper if available, otherwise persist as outcome
    await svc.recordOutcome(
      "ani_feedback",
      (body.messageId ?? "unknown") + (rating > 0 ? ":up" : rating < 0 ? ":down" : ":clear"),
      0,
      satisfaction,
    );

    // Also attempt to record to AniService adaptive via audit trail best-effort
    // (service already records implicit feedback on send; this is explicit)
  } catch (e) {
    // feedback should never break UX — log and return ok
    console.error("ANI feedback error", e);
  }

  return Response.json({ ok: true, satisfaction });
}
