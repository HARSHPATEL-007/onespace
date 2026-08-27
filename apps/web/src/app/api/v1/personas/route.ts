import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const svc = new AniService(workspaceId, userId, role);
    const profiles = (await svc.listPersonalizationProfiles()).filter(p=>p.type==='team_persona' || p.type==='department_policy');
    return Response.json({ personas: profiles });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
export async function POST(req: Request) {
  try {
    const { workspaceId, userId, role } = await actionContext();
    const body = await req.json();
    const svc = new AniService(workspaceId, userId, role);
    const lint = await svc.validatePersona(body.text ?? body.persona ?? "");
    if (lint.decision === "reject") return Response.json({ lint, publishable: false }, { status: 400 });
    return Response.json({ lint, publishable: lint.passed });
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
