import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /v1/personalization/preview
export async function POST(req: Request) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const body = await req.json() as { prompt: string; task?: string; module?: string; personalization?: unknown };
    if (!body.prompt) return Response.json({ error: "Missing prompt" }, { status: 400 });
    const svc = new AniService(workspaceId, userId, role);
    const preview = await svc.previewPersonalization({
      prompt: body.prompt,
      task: body.task ?? "rewrite",
      module: body.module,
      personalization: body.personalization as never,
    });
    return Response.json(preview);
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
