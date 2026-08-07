import { prisma } from "@n0va/db";
import { N0va1oGateway } from "@n0va/modules-n0va1o/gateway";
import { handleMcpMessage, effectiveTools, type McpMessage } from "@n0va/modules-n0va1o/mcp";
import { NextResponse, type NextRequest } from "next/server";

/**
 * N0VA1O MCP gateway — one URL per team.
 *   GET  /api/n0va1o/mcp/<workspaceSlug>            discovery (server info + tool count)
 *   POST /api/n0va1o/mcp/<workspaceSlug>?integration=<id>   JSON-RPC 2.0 session
 * Auth: Authorization: Bearer <workspace mcp key>
 */
async function resolve(
  req: NextRequest,
  slug: string,
): Promise<{ error: NextResponse } | { workspace: { id: string; slug: string }; integration: { id: string; provider: string; name: string; enabled: boolean; mcpEnabled: boolean }; actorLabel: string }> {
  const workspace = await prisma.workspace.findUnique({ where: { slug } });
  if (!workspace) {
    return { error: NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32002, message: "Unknown workspace" } }, { status: 404 }) };
  }
  const auth = req.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!workspace.mcpKey || key !== workspace.mcpKey) {
    return { error: NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Invalid or missing N0VA1O MCP key" } }, { status: 401 }) };
  }

  const integrationId = req.nextUrl.searchParams.get("integration");
  const integration = integrationId
    ? await prisma.integration.findFirst({ where: { id: integrationId, workspaceId: workspace.id, mcpEnabled: true } })
    : await prisma.integration.findFirst({ where: { workspaceId: workspace.id, mcpEnabled: true }, orderBy: { updatedAt: "desc" } });

  if (!integration) {
    return {
      error: NextResponse.json(
        { jsonrpc: "2.0", id: null, error: { code: -32003, message: "No MCP-enabled integration in this workspace (enable it in N0VA1O)" } },
        { status: 400 },
      ),
    };
  }

  return {
    workspace: { id: workspace.id, slug: workspace.slug },
    integration: {
      id: integration.id,
      provider: integration.provider,
      name: integration.name,
      enabled: integration.enabled,
      mcpEnabled: integration.mcpEnabled,
    },
    actorLabel: "mcp-agent",
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const resolved = await resolve(request, workspaceSlug);
  if ("error" in resolved) return resolved.error;

  let message: McpMessage;
  try {
    const parsed = (await request.json()) as unknown;
    if (Array.isArray(parsed)) {
      return NextResponse.json(
        { jsonrpc: "2.0", id: null, error: { code: -32600, message: "JSON-RPC batches are not supported; send one message per request" } },
        { status: 400 },
      );
    }
    message = parsed as McpMessage;
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON-RPC payload" } }, { status: 400 });
  }

  const gateway = new N0va1oGateway();

  // Re-fetch the full integration inside the workspace so the gateway has the
  // complete record (webhook secret, config, rate limits, allowlists).
  const integration = await prisma.integration.findFirst({
    where: { id: resolved.integration.id, workspaceId: resolved.workspace.id },
  });
  if (!integration) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32003, message: "Integration missing" } }, { status: 400 });
  }

  const response = await handleMcpMessage(message, {
    integration,
    workspaceId: resolved.workspace.id,
    actorLabel: resolved.actorLabel,
    gateway,
  });

  return NextResponse.json(response);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const resolved = await resolve(request, workspaceSlug);
  if ("error" in resolved) return resolved.error;

  return NextResponse.json({
    name: "N0VA1O MCP Gateway",
    protocolVersion: "2025-06-18",
    endpoint: `/api/n0va1o/mcp/${resolved.workspace.slug}?integration=${resolved.integration.id}`,
    integration: {
      id: resolved.integration.id,
      provider: resolved.integration.provider,
      name: resolved.integration.name,
      status: resolved.integration.enabled ? "connected" : "paused",
    },
    instruction:
      "Send initialize, then tools/list. Destructive tools are blocked by default and raise an access request for an admin.",
  });
}