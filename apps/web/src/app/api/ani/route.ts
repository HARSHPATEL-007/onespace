import { actionContext } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { workspaceId, userId, role } = await actionContext();

  let body: {
    content?: string;
    conversationId?: string;
    stream?: boolean;
    intent?: string;
    depth?: string;
    autoDepth?: string | boolean;
  };
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

  const depth = (body.depth as "fast" | "balanced" | "deep" | "research" | "auto" | undefined) ?? undefined;
  const autoDepth = body.autoDepth === true || body.autoDepth === "true" || depth === "auto";

  if (depth && depth !== "auto") {
    try {
      const result = await svc.deepThink(content, { depth, autoDepth: false });
      return Response.json({
        content: result.response.content,
        citations: result.response.citations,
        actionsTaken: result.response.actionsTaken ?? [],
        tokens: result.response.tokens,
        latencyMs: result.response.latencyMs,
        confidence: result.response.confidenceScore,
        consciousnessCoherence: result.response.consciousnessCoherence ?? null,
        safetyFlags: result.response.safetyFlags,
        recommendations: result.response.recommendations ?? [],
        thoughtSummary: result.thought.summary,
        thoughtSteps: result.thought.steps.map((s) => s.label),
        complexityScore: result.thought.complexity.score,
        depth: result.thought.depth,
        multiPassRounds: result.thought.multiPassRounds,
        proactiveFollowups: result.proactiveFollowups,
        memoryMarks: result.memoryMarks,
        feedbackPanel: result.feedbackPanel,
        clarificationNeeded: !result.thought.passedClarification,
        clarificationQuestion: result.response.content.includes("?") ? result.response.content : undefined,
      });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Deep think failed" }, { status: 500 });
    }
  }

  if (autoDepth) {
    try {
      const result = await svc.deepThink(content, { autoDepth: true });
      return Response.json({
        content: result.response.content,
        citations: result.response.citations,
        actionsTaken: result.response.actionsTaken ?? [],
        tokens: result.response.tokens,
        latencyMs: result.response.latencyMs,
        confidence: result.response.confidenceScore,
        consciousnessCoherence: result.response.consciousnessCoherence ?? null,
        safetyFlags: result.response.safetyFlags,
        recommendations: result.response.recommendations ?? [],
        thoughtSummary: result.thought.summary,
        thoughtSteps: result.thought.steps.map((s) => s.label),
        complexityScore: result.thought.complexity.score,
        depth: result.thought.depth,
        multiPassRounds: result.thought.multiPassRounds,
        proactiveFollowups: result.proactiveFollowups,
        memoryMarks: result.memoryMarks,
        feedbackPanel: result.feedbackPanel,
        clarificationNeeded: !result.thought.passedClarification,
      });
    } catch (err) {
      return Response.json({ error: err instanceof Error ? err.message : "Auto-think failed" }, { status: 500 });
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
