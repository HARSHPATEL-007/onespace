import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content = body.content;
  if (!content || typeof content !== "string") {
    return Response.json({ error: "Missing 'content' field" }, { status: 400 });
  }

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

  const svc = new AniService(workspaceId, userId, role);

  try {
    const result = await svc.analyzeComplexity(content);
    return Response.json({
      score: result.score,
      isAmbiguous: result.isAmbiguous,
      isTechnical: result.isTechnical,
      isHighStakes: result.isHighStakes,
      isMultiPart: result.isMultiPart,
      recommendedDepth: result.recommendedDepth,
      detectedTopics: result.detectedTopics,
      missingContext: result.missingContext,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 },
    );
  }
}
