import { actionContext } from "@/lib/action-context";
import { createANI, createWorkspaceContext } from "@n0va/modules-ani/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { workspaceId, userId } = await actionContext();

  const url = new URL(req.url);
  const content = url.searchParams.get("content");

  if (!content) {
    return new Response("Missing 'content' parameter", { status: 400 });
  }

  const ani = createANI({ workspaceId });
  const ctx = createWorkspaceContext(workspaceId, userId, `sess_stream_${Date.now()}`, { activeModule: "ani" });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client disconnected
        }
      };

      try {
        const words = content.split(" ");
        for (let i = 0; i < words.length; i++) {
          await new Promise((r) => setTimeout(r, 50));
          send({ type: "chunk", content: words[i] + " ", chunkId: i, isFinal: false });
        }

        const result = await ani.process(content, ctx, { stream: true });
        send({
          type: "complete",
          responseId: `resp_${Date.now().toString(36)}`,
          citations: result.citations,
          tokens: result.tokens,
          latencyMs: result.latencyMs,
          confidence: result.confidenceScore,
          consciousnessCoherence: result.consciousnessCoherence ?? null,
        });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Stream failed" });
      } finally {
        controller.close();
      }

      const ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
        }
      }, 25000);

      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
      });
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
