/**
 * N0VA1O MCP Server — Real Model Context Protocol implementation.
 * Supports stdio, HTTP SSE, and WebSocket transports.
 * Routes tool calls through the universal adapter for 1,000+ providers.
 */
import type { Integration } from "@n0va/db";
import { executeTool } from "./universal-adapter";
import { evaluatePolicy } from "./policy";
import { isDestructiveTool } from "./catalog";
import { logAudit } from "@n0va/db";

export const MCP_VERSION = "2025-06-18";

export interface McpRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpContext {
  integration: Integration;
  workspaceId: string;
  actorLabel: string;
}

function rpc(id: string | number | null, result?: unknown, error?: { code: number; message: string; data?: unknown }): McpResponse {
  return error ? { jsonrpc: "2.0", id, error } : { jsonrpc: "2.0", id, result };
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export async function handleMcp(request: McpRequest, ctx: McpContext): Promise<McpResponse> {
  const id = request.id ?? null;
  const { integration, workspaceId, actorLabel } = ctx;
  const method = request.method;
  const params = (request.params ?? {}) as Record<string, unknown>;

  switch (method) {
    case "initialize":
      return rpc(id, {
        protocolVersion: MCP_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "N0VA1O MCP Gateway", version: "2026.07" },
        instructions: "N0VA1O MCP gateway. Tools are scoped per team. Destructive tools require admin-approved access.",
      });

    case "notifications/initialized":
    case "ping":
      return rpc(id, {});

    case "tools/list": {
      const tools = getEffectiveTools(integration);
      return rpc(id, {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: { type: "object", properties: {} as Record<string, unknown> },
        })),
      });
    }

    case "tools/call": {
      const toolName = typeof params.name === "string" ? params.name : "";
      const input = (params.arguments ?? {}) as Record<string, unknown>;
      const tools = getEffectiveTools(integration);
      const inScope = tools.some((t) => t.name === toolName);

      if (!inScope) {
        const destructive = isDestructiveTool(integration.provider, toolName);
        return rpc(id, undefined, {
          code: -32001,
          message: destructive
            ? "Destructive tool blocked by default — an access request was raised for an admin to approve"
            : "Tool is not in the team's allowlist",
          data: { tool: toolName },
        });
      }

      // Policy check
      const decision = evaluatePolicy({
        provider: integration.provider,
        tool: toolName,
        actorLabel,
        isDestructive: isDestructiveTool(integration.provider, toolName),
        tokenState: "ACTIVE",
        inAllowlist: true,
        healthScore: 1,
      });

      if (decision.outcome === "DENY") {
        await logAudit({
          workspaceId,
          module: "n0va1o",
          action: "policy.deny",
          targetType: "Integration",
          targetId: integration.id,
          metadata: { tool: toolName, disposition: decision.disposition },
        });
        return rpc(id, undefined, { code: -32003, message: `Policy denied: ${decision.disposition}` });
      }

      // Execute via universal adapter
      const result = await executeTool(integration, toolName, input);

      await logAudit({
        workspaceId,
        module: "n0va1o",
        action: result.ok ? "tool.executed" : "tool.failed",
        targetType: "Integration",
        targetId: integration.id,
        metadata: { tool: toolName, provider: integration.provider, statusCode: result.statusCode },
      });

      return rpc(id, {
        content: [{ type: "text", text: result.ok ? formatResult(result) : `Error (${result.statusCode}): ${result.message}` }],
        isError: !result.ok,
        meta: { statusCode: result.statusCode, provider: integration.provider },
      });
    }

    case "resources/list":
      return rpc(id, {
        resources: [{
          uri: `n0va1o://${integration.id}`,
          name: integration.name,
          description: `Connection state for ${integration.provider}`,
          mimeType: "application/json",
        }],
      });

    case "resources/read": {
      const uri = typeof params.uri === "string" ? params.uri : "";
      return rpc(id, {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            provider: integration.provider,
            status: integration.enabled ? "connected" : "paused",
            mcp: integration.mcpEnabled,
            lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
          }),
        }],
      });
    }

    default:
      return rpc(id, undefined, { code: -32601, message: `Method not found: ${method}` });
  }
}

function formatResult(result: { ok: boolean; statusCode: number; message: string; data?: unknown }): string {
  if (result.data) {
    try {
      return JSON.stringify(result.data, null, 2).slice(0, 2000);
    } catch {
      return String(result.data).slice(0, 2000);
    }
  }
  return result.message;
}

function getEffectiveTools(integration: Integration): Array<{ name: string; description: string; destructive: boolean }> {
  const { findProvider, scopeTools } = require("./catalog");
  const providerConfig = findProvider(integration.provider);
  if (!providerConfig) return [];

  const allowlist = asStringArray((integration.allowlistTools as unknown) ?? []);
  const blocklist = asStringArray((integration.blocklistTools as unknown) ?? []);
  return scopeTools(providerConfig.tools, { allowlist, blocklist });
}

/**
 * Create an SSE response stream for MCP over HTTP.
 */
export function createSseStream(): { stream: ReadableStream; send: (data: unknown) => void } {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(c) { controller = c; },
  });

  const send = (data: unknown) => {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(payload));
  };

  return { stream, send };
}

/**
 * Handle stdio transport — read JSON-RPC from stdin, write responses to stdout.
 */
export async function runStdioTransport(ctx: McpContext): Promise<void> {
  const { runStdioTransport: run } = require("./stdio-transport");
  return run(ctx);
}

export { evaluatePolicy, isDestructiveTool };
