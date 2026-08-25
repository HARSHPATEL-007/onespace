import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalResearchOrchestrator } from "@n0va/modules-ani/research-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ researchId: string }> },
) {
  let ctx;
  try {
    ctx = await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { researchId } = await params;
  let body: { edits?: Record<string, unknown> } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const job = globalResearchOrchestrator.approvePlan(researchId, body.edits as never);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });

  const workspaceContext = {
    workspaceId: ctx.workspaceId,
    tenantId: ctx.workspaceId,
    userId: ctx.userId,
    sessionId: `research_${researchId}`,
    activeModule: "research",
    language: "en",
    timezone: "UTC",
    locale: "en-US",
    tenantTier: "enterprise" as const,
  } as never;

  const executed = await globalResearchOrchestrator.execute(researchId, workspaceContext);
  return Response.json(executed);
}
