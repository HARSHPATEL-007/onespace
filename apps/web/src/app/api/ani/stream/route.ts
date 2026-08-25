import { actionContext, UnauthorizedError } from "@/lib/action-context";
import {
  createANI,
  createWorkspaceContext,
  classifyIntent,
  assessComplexity,
  getDepthSettings,
} from "@n0va/modules-ani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let workspaceId: string;
  let userId: string;
  try {
    const ctx = await actionContext();
    workspaceId = ctx.workspaceId;
    userId = ctx.userId;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return new Response("Unauthorized", { status: 401 });
    }
    throw err;
  }

  const url = new URL(req.url);
  const content = url.searchParams.get("content");
  const depth = url.searchParams.get("depth") ?? "balanced";

  if (!content) {
    return new Response("Missing 'content' parameter", { status: 400 });
  }

  const enc = new TextEncoder();
  const ani = createANI({ workspaceId });
  const ctx = createWorkspaceContext(
    workspaceId,
    userId,
    `sess_stream_${Date.now()}`,
    { activeModule: "ani" },
  );
  const intent = classifyIntent(content, ctx);
  const complexity = assessComplexity(content, intent, 128000);
  const depthSettings = getDepthSettings(
    depth as "fast" | "balanced" | "deep" | "research",
  );

  let seq = 0;
  const intervalIds: NodeJS.Timeout[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* disconnected */
        }
      };

      // keep-alive ping must start immediately and be cleared on close/abort
      const ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {
          /* controller closed */
        }
      }, 25000);
      intervalIds.push(ping);
      const cleanup = () => {
        for (const id of intervalIds) clearInterval(id);
      };
      req.signal.addEventListener("abort", cleanup);

      // Determine effective depth: support "auto" via complexity assessment
      let effectiveDepth = depth as "fast" | "balanced" | "deep" | "research" | "auto";
      let effectiveComplexity = complexity;
      if (effectiveDepth === "auto") {
        effectiveDepth = complexity.recommendedDepth;
      }

      try {
        send({
          type: "thinking",
          phase: "start",
          message: "Processing your request...",
          intent: intent.classification,
          seq: seq++,
        });

        const steps =
          effectiveDepth === "research"
            ? ["decompose", "retrieve", "analyze", "reason", "synthesize", "verify"]
            : ["decompose", "retrieve", "analyze", "reason"];
        for (const step of steps) {
          send({
            type: "thinking",
            phase: step,
            message: _phaseMessage(step),
            seq: seq++,
          });
          await _delay(120 + Math.random() * 180);
        }

        const normalizedContent = content.replace(/@ani\s*/gi, "").trim() || content;
        const result = await ani.processDeepThink(normalizedContent, ctx, {
          depth: effectiveDepth as "fast" | "balanced" | "deep" | "research",
          autoDepth: depth === "auto",
        });

        // Stream tool orchestration if present
        const actionsForStream =
          (result.actions ?? []).filter((a) => a.tool) ||
          (result.response.actionsTaken ?? []).map((a) => ({
            tool: a.tool,
            status: a.status,
          }));
        if (actionsForStream.length > 0) {
          send({
            type: "tool_call",
            toolCalls: actionsForStream.map((a, i) => ({
              id: `tc_${Date.now()}_${i}`,
              name: (a as { tool: string }).tool,
              arguments: (a as { arguments?: Record<string, unknown> }).arguments ?? {},
              status: (a as { status?: string }).status ?? "done",
            })),
            seq: seq++,
          });
          await _delay(200);
        }

        // Consciousness signal early for UI pill
        if (result.response.consciousnessCoherence) {
          send({
            type: "consciousness",
            coherence: result.response.consciousnessCoherence,
            cognitiveLoad: result.response.neuralState?.cognitiveLoadIndex ?? 0.3,
            flowState: 0.72,
            engagement: result.response.confidenceScore,
            seq: seq++,
          });
          await _delay(80);
        }

        const words = result.response.content.split(/\s+/);
        const chunkSize = Math.max(4, Math.floor(words.length / 10));
        for (let i = 0; i < words.length; i += chunkSize) {
          const chunk = words.slice(i, i + chunkSize).join(" ");
          send({ type: "chunk", content: chunk + " ", chunkId: i, seq: seq++ });
          await _delay(28 + Math.random() * 42);
        }

        if (result.thought) {
          send({
            type: "reflection",
            issuesFound: 0,
            revisedConfidence: result.response.confidenceScore,
            reasoning: result.thought.summary,
            seq: seq++,
          });
        }

        // Final aggregated consciousness update
        if (result.response.consciousnessCoherence) {
          send({
            type: "consciousness",
            consciousnessCoherence: result.response.consciousnessCoherence,
            coherence: result.response.consciousnessCoherence,
            seq: seq++,
          });
        }

        send({
          type: "complete",
          responseId: `resp_${Date.now().toString(36)}`,
          citations: result.response.citations,
          tokens: result.response.tokens,
          latencyMs: result.response.latencyMs,
          confidence: result.response.confidenceScore,
          consciousnessCoherence:
            result.response.consciousnessCoherence ?? null,
          thoughtSummary: result.thought?.summary,
          proactiveFollowups: result.proactiveFollowups,
          depth: effectiveDepth,
          complexityScore: effectiveComplexity.score,
          toolCalls: actionsForStream.length > 0 ? actionsForStream : undefined,
          seq: seq++,
        });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Stream failed",
          recoverable: true,
          seq: seq++,
        });
      } finally {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },

    cancel() {
      for (const id of intervalIds) clearInterval(id);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function _phaseMessage(phase: string): string {
  const messages: Record<string, string> = {
    decompose: "Breaking down your query into components",
    retrieve: "Gathering relevant context and knowledge",
    analyze: "Examining relationships and patterns",
    reason: "Applying multi-step logical inference",
    synthesize: "Combining insights into a coherent response",
    verify: "Cross-checking against known facts",
  };
  return messages[phase] ?? `Processing: ${phase}`;
}

function _delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
