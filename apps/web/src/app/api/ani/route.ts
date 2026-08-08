import { actionContext } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { workspaceId, userId, role } = await actionContext();

  let body: { content?: string; conversationId?: string; stream?: boolean; intent?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const content = body.content;
  if (!content || typeof content !== "string") {
    return Response.json({ error: "Missing 'content' field" }, { status: 400 });
  }

  const svc = new AniService(workspaceId, userId, role);

  if (body.conversationId) {
    try {
      const result = await svc.send(body.conversationId, content);
      return Response.json({
        content: result.assistantMessage.content,
        toolCalls: result.toolCalls ? JSON.parse(result.toolCalls) : [],
        citations: result.citations ? JSON.parse(result.citations) : [],
        confidence: result.confidence ?? null,
      });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Send failed" }, { status: 500 });
    }
  }

  try {
    const result = await svc.processWithEngine(content);
    return Response.json({
      content: result.content,
      citations: result.citations,
      actionsTaken: result.actionsTaken ?? [],
      tokens: result.tokens,
      latencyMs: result.latencyMs,
      confidence: result.confidenceScore,
      consciousnessCoherence: result.consciousnessCoherence ?? null,
      safetyFlags: result.safetyFlags,
      recommendations: result.recommendations ?? [],
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Process failed" }, { status: 500 });
  }
}
