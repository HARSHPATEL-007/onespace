/**
 * N0VA1O MCP gateway — Model Context Protocol (JSON-RPC 2.0) server core.
 *
 * One URL per team; tools are scoped by the integration's allow/blocklists;
 * destructive tools are blocked by default and routed through the access
 * request flow (governance) instead of failing silently.
 */
import type { Integration } from "@n0va/db";
import { prisma, logAudit } from "@n0va/db";
import { providerTools, scopeTools, isDestructiveTool } from "./catalog";
import { N0va1oGateway, GatewayError } from "./gateway";

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface McpContext {
  integration: Integration;
  workspaceId: string;
  actorLabel: string;
  gateway: N0va1oGateway;
}

export interface McpMessage {
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

function rpc(id: string | number | null, result?: unknown, error?: { code: number; message: string; data?: unknown }): McpResponse {
  return error ? { jsonrpc: "2.0", id, error } : { jsonrpc: "2.0", id, result };
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Effective tool set for this integration + team scoping. */
export function effectiveTools(integration: Integration) {
  const allowlist = asStringArray((integration.allowlistTools as unknown) ?? []);
  const blocklist = asStringArray((integration.blocklistTools as unknown) ?? []);
  return scopeTools(providerTools(integration.provider), { allowlist, blocklist });
}

function mcpToolFormat(tool: { name: string; description: string }) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: { type: "object", properties: {} as Record<string, unknown> },
  };
}

export async function handleMcpMessage(message: McpMessage, ctx: McpContext): Promise<McpResponse> {
  const id = message.id ?? null;
  const { integration, workspaceId, actorLabel, gateway } = ctx;
  const method = message.method;
  const params = message.params ?? {};

  switch (method) {
    case "initialize":
      return rpc(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "N0VA1O MCP Gateway", version: "2026.07" },
        instructions:
          "N0VA1O MCP gateway. Tools are scoped per team. Destructive tools require admin-approved access.",
      });

    case "notifications/initialized":
    case "ping":
      return rpc(id, {});

    case "tools/list": {
      const tools = effectiveTools(integration).map(mcpToolFormat);
      return rpc(id, { tools });
    }

    case "tools/call": {
      const toolName = typeof params.name === "string" ? params.name : "";
      const input = (params.arguments ?? {}) as Record<string, unknown>;
      const tools = effectiveTools(integration);

      const inScope = tools.some((t_) => t_.name === toolName);
      if (!inScope) {
        const destructive = isDestructiveTool(integration.provider, toolName);
        let requestId: string | null = null;
        if (destructive) {
          const reason = typeof params.reason === "string" ? params.reason : "";
          requestId = await ctxRequestAccess(ctx, toolName, reason);
        }
        return rpc(
          id,
          undefined,
          {
            code: -32001,
            message: destructive
              ? "Destructive tool blocked by default — an access request was raised for an admin to approve"
              : "Tool is not in the team's allowlist",
            data: { tool: toolName, accessRequestId: requestId },
          },
        );
      }

      try {
        const result = await gateway.call({
          integration,
          workspaceId,
          actorLabel,
          tool: toolName,
          input,
          idempotencyKey: typeof params.idempotencyKey === "string" ? params.idempotencyKey : undefined,
        });
        return rpc(id, {
          content: [
            {
              type: "text",
              text: result.ok ? result.message : `Tool call failed (${result.statusCode}): ${result.message}`,
            },
          ],
          isError: !result.ok,
          meta: { statusCode: result.statusCode, durationMs: result.durationMs, replayed: result.replayed },
        });
      } catch (err) {
        const status = err instanceof GatewayError ? err.statusCode : 500;
        return rpc(id, undefined, { code: -32002, message: err instanceof Error ? err.message : "Tool call failed", data: { statusCode: status } });
      }
    }

    case "resources/list":
      return rpc(id, {
        resources: [
          {
            uri: `n0va1o://${integration.id}`,
            name: integration.name,
            description: `Connection state for ${integration.provider}`,
            mimeType: "application/json",
          },
        ],
      });

    case "resources/read": {
      const uri = typeof params.uri === "string" ? params.uri : "";
      const resource = {
        uri,
        mimeType: "application/json",
        text: JSON.stringify({
          provider: integration.provider,
          status: integration.enabled ? "connected" : "paused",
          mcp: integration.mcpEnabled,
          lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
          scopedTools: effectiveTools(integration).map((t_) => t_.name),
        }),
      };
      return rpc(id, { contents: [resource] });
    }

    default:
      return rpc(id, undefined, { code: -32601, message: `Method not found: ${method}` });
  }
}

async function ctxRequestAccess(ctx: McpContext, tool: string, reason: string): Promise<string> {
  const request = await prisma.integrationAccessRequest.create({
    data: {
      integrationId: ctx.integration.id,
      workspaceId: ctx.workspaceId,
      requesterLabel: ctx.actorLabel,
      tool,
      reason: reason.slice(0, 500),
      status: "PENDING",
    },
  });
  await logAudit({
    workspaceId: ctx.workspaceId,
    module: "n0va1o",
    action: "mcp.access_requested",
    targetType: "IntegrationAccessRequest",
    targetId: request.id,
    metadata: { tool, requester: ctx.actorLabel },
  });
  return request.id;
}
