import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /v1/personalization/feedback
export async function POST(req: Request) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const body = await req.json() as { original: string; edited: string; task_type: string; detectedKey: string; value: unknown; explicit_instruction?: string };
    if (!body.original || !body.edited) return Response.json({ error: "Missing fields" }, { status: 400 });
    const svc = new AniService(workspaceId, userId, role);
    const candidate = await svc.submitPersonalizationFeedback(
      { original: body.original, edited: body.edited, task_type: body.task_type ?? "status_update", explicit_instruction: body.explicit_instruction },
      body.detectedKey ?? "format",
      body.value ?? body.edited,
    );
    if (!candidate) return Response.json({ candidate: null, message: "No candidate — one-off or sensitive" });
    return Response.json({ candidate });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
