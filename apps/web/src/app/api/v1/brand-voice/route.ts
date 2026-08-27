import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const svc = new AniService(workspaceId, userId, role);
    const rules = svc.getGovernance().brandEngine.getRules();
    return Response.json({ rules });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const { text } = await req.json() as { text: string };
    const svc = new AniService(workspaceId, userId, role);
    const result = await svc.validateBrandVoice(text);
    return Response.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
