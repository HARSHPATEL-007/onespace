import { actionContext } from "@/lib/action-context";
import { createANI, createWorkspaceContext, classifyIntent, assessComplexity, getDepthSettings } from "@n0va/modules-ani";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { workspaceId, userId } = await actionContext();

  const url = new URL(req.url);
  const content = url.searchParams.get("content");
  const depth = url.searchParams.get("depth") ?? "balanced";

  if (!content) {
    return new Response("Missing 'content' parameter", { status: 400 });
  }

  const enc = new TextEncoder();
  const ani = createANI({ workspaceId });
  const ctx = createWorkspaceContext(workspaceId, userId, `sess_stream_${Date.now()}`, { activeModule: "ani" });
  const intent = classifyIntent(content, ctx);
  const complexity = assessComplexity(content, intent, 128000);
  const depthSettings = getDepthSettings(depth as "fast" | "balanced" | "deep" | "research");

  let seq = 0;
  const intervalIds: NodeJS.Timeout[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* disconnected */ }
      };

      try {
        send({ type: "thinking", phase: "start", message: "Processing your request...", seq: seq++ });

        for (const step of ["decompose", "retrieve", "analyze", "reason"]) {
          send({ type: "thinking", phase: step, message: _phaseMessage(step), seq: seq++ });
          await _delay(150 + Math.random() * 200);
        }

        const result = await ani.processDeepThink(content, ctx, { depth: depth as "fast" | "balanced" | "deep" | "research" });

        const words = result.response.content.split(" ");
        const chunkSize = Math.max(1, Math.floor(words.length / 8));
        for (let i = 0; i < words.length; i += chunkSize) {
          const chunk = words.slice(i, i + chunkSize).join(" ");
          send({ type: "chunk", content: chunk + " ", chunkId: i, seq: seq++ });
          await _delay(30 + Math.random() * 50);
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

        if (result.response.consciousnessCoherence) {
          send({
            type: "consciousness",
            coherence: result.response.consciousnessCoherence,
            cognitiveLoad: 0.3,
            flowState: 0.7,
            engagement: result.response.confidenceScore,
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
          consciousnessCoherence: result.response.consciousnessCoherence ?? null,
          thoughtSummary: result.thought?.summary,
          proactiveFollowups: result.proactiveFollowups,
          depth: depth,
          complexityScore: complexity.score,
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
        controller.close();
      }

      const ping = setInterval(() => {
        try { controller.enqueue(enc.encode(`: ping\n\n`)); } catch { /* ok */ }
      }, 25000);
      intervalIds.push(ping);

      req.signal.addEventListener("abort", () => {
        for (const id of intervalIds) clearInterval(id);
      });
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
