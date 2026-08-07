import { prisma } from "@n0va/db";
import { handleMcpMessage, type McpMessage } from "@n0va/modules-n0va1o/mcp";
import { N0va1oGateway } from "@n0va/modules-n0va1o/gateway";
import { NextResponse, type NextRequest } from "next/server";

/**
 * N0VA1O MCP gateway — Server-Sent Events (SSE) transport.
 *   GET /api/n0va1o/sse/<workspaceSlug>?integration=<id>
 * Streams JSON-RPC responses as SSE events for real-time agent interaction.
 * Auth: Authorization: Bearer <workspace mcp key>
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const workspace = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
  if (!workspace) return NextResponse.json({ error: "Unknown workspace" }, { status: 404 });

  const auth = request.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!workspace.mcpKey || key !== workspace.mcpKey) {
    return NextResponse.json({ error: "Invalid key" }, { status: 401 });
  }

  const integrationId = request.nextUrl.searchParams.get("integration");
  const integration = integrationId
    ? await prisma.integration.findFirst({ where: { id: integrationId, workspaceId: workspace.id, mcpEnabled: true } })
    : await prisma.integration.findFirst({ where: { workspaceId: workspace.id, mcpEnabled: true }, orderBy: { updatedAt: "desc" } });

  if (!integration) return NextResponse.json({ error: "No MCP integration" }, { status: 400 });

  const encoder = new TextEncoder();
  const gateway = new N0va1oGateway();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Initial connected event
      send("connected", {
        endpoint: `/api/n0va1o/sse/${workspaceSlug}`,
        integration: { id: integration.id, provider: integration.provider, name: integration.name },
        timestamp: new Date().toISOString(),
      });

      // Handle incoming messages via POST mirror (SSE is one-way; client sends via POST)
      // Keep connection alive with periodic pings
      const pingInterval = setInterval(() => {
        try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch { /* closed */ }
      }, 25_000);

      // Demo: stream a tools/list response
      try {
        const fullIntegration = await prisma.integration.findFirst({ where: { id: integration.id } });
        if (fullIntegration) {
          const listReq: McpMessage = { jsonrpc: "2.0", id: "sse-init", method: "tools/list" };
          const tools = await handleMcpMessage(listReq, {
            integration: fullIntegration,
            workspaceId: workspace.id,
            actorLabel: "sse-client",
            gateway,
          });
          send("tools", tools.result);
        }
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Init failed" });
      }

      // Cleanup on disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/** Reject other methods. */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: "Use GET for SSE stream; send JSON-RPC via /api/n0va1o/mcp/:slug" }, { status: 405 });
}
