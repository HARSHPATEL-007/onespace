import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalResearchOrchestrator } from "@n0va/modules-ani/research-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ researchId: string }> },
) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { researchId } = await params;
  const job = globalResearchOrchestrator.getJob(researchId);
  if (!job) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ research_id: researchId, events: job.events });
}
