/**
 * N0VA1O MCP gateway — Model Context Protocol (JSON-RPC 2.0) server core.
 *
 * One URL per team; tools are scoped by the integration's allow/blocklists;
 * destructive tools are blocked by default and routed through the access
 * request flow (governance) instead of failing silently.
 */
import type { Integration } from "@n0va/db";
import { prisma, logAudit } from "@n0va/db";
import { providerTools, scopeTools, isDestructiveTool, discoverTools } from "./catalog";
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

/** Effective tool set with provider-prefixed names for unified gateway */
export function effectiveToolsUnified(integrations: Integration[]) {
  const all: Array<{ name: string; description: string; provider: string; destructive?: boolean }> = [];
  for (const integration of integrations) {
    if (!integration.enabled || !integration.mcpEnabled) continue;
    const tools = effectiveTools(integration);
    for (const t of tools) {
      all.push({ name: `${integration.provider}:${t.name}`, description: `[${integration.provider}] ${t.description}`, provider: integration.provider, destructive: t.destructive });
    }
  }
  return all;
}

function mcpToolFormat(tool: { name: string; description: string }) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: { type: "object", properties: {} as Record<string, unknown> },
  };
}

function unifiedToolFormat(tool: { name: string; description: string }) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: { type: "object", properties: { _provider: { type: "string", description: "Provider is encoded in tool name" } } as Record<string, unknown> },
  };
}

export interface UnifiedMcpContext {
  workspaceId: string;
  actorLabel: string;
  gateway: N0va1oGateway;
}

/**
 * Unified MCP handler — aggregates ALL enabled MCP integrations in workspace.
 * This is the N×M→1 collapse: one URL, one auth, all 1,000+ providers.
 * Tools are namespaced as `provider:tool` (e.g., `slack:post_message`).
 */
export async function handleUnifiedMcpMessage(message: McpMessage, ctx: UnifiedMcpContext): Promise<McpResponse> {
  const id = message.id ?? null;
  const method = message.method;
  const params = message.params ?? {};
  const integrations = await prisma.integration.findMany({
    where: { workspaceId: ctx.workspaceId, mcpEnabled: true, enabled: true },
    orderBy: { updatedAt: "desc" },
  });

  switch (method) {
    case "initialize":
      return rpc(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "N0VA1O MCP Gateway", version: "2026.07" },
        instructions: `N0VA1O Unified Gateway — ${integrations.length} connected providers, ${PROVIDERS_COUNT}+ in catalog. Tools are namespaced as provider:tool. One auth, zero SDK drift.`,
      });
    case "notifications/initialized":
    case "ping":
      return rpc(id, {});
    case "tools/list": {
      const tools = effectiveToolsUnified(integrations).map(unifiedToolFormat);
      // Also include pure discoverable catalog for unconnected providers (for intent routing)
      return rpc(id, { tools, count: tools.length, providers: integrations.map((i) => i.provider) });
    }
    case "tools/discover": {
      const query = typeof params.query === "string" ? params.query : "";
      const max = typeof params.maxTools === "number" ? Math.max(1, Math.min(20, params.maxTools)) : 5;
      const discovered = discoverTools(query, { maxTools: max });
      const top = discovered[0];
      const connectedTools = new Set(effectiveToolsUnified(integrations).map((t) => t.name));
      return rpc(id, {
        intent: query.toLowerCase().trim(),
        confidence: top ? top.relevance : 0,
        tools: discovered.map((d) => ({
          provider: d.providerKey,
          name: `${d.providerKey}:${d.name}`,
          relevance: d.relevance,
          reason: d.reason,
          connected: connectedTools.has(`${d.providerKey}:${d.name}`),
        })),
        contextTokensSaved: Math.max(0, 100 - discovered.length),
        suggested_workflow: discovered.slice(0, 4).map((d) => `${d.providerKey}:${d.name}`).join(" → "),
      });
    }
    case "tools/call": {
      const rawName = typeof params.name === "string" ? params.name : "";
      const input = (params.arguments ?? {}) as Record<string, unknown>;
      // Parse provider:tool
      let provider = "";
      let toolName = rawName;
      if (rawName.includes(":")) {
        const parts = rawName.split(":");
        provider = parts[0]!;
        toolName = parts.slice(1).join(":");
      }
      // Find target integration
      let target: Integration | undefined;
      if (provider) {
        target = integrations.find((i) => i.provider === provider);
        if (!target) {
          // Try to find any integration that provides this tool via catalog (for catalog-only providers)
          const anyProvider = integrations.find((i) => effectiveTools(i).some((t) => t.name === toolName));
          if (anyProvider) {
            target = anyProvider;
            provider = anyProvider.provider;
          }
        }
      } else {
        target = integrations.find((i) => effectiveTools(i).some((t) => t.name === toolName));
        if (target) provider = target.provider;
      }
      if (!target) {
        return rpc(id, undefined, { code: -32001, message: `No connected integration for tool ${rawName}. Connect ${provider || "the provider"} in N0VA1O first.`, data: { tool: rawName, hint: "Connect the provider then retry — one click, zero re-auth" } });
      }
      const scoped = effectiveTools(target);
      const inScope = scoped.some((t) => t.name === toolName);
      if (!inScope) {
        const destructive = isDestructiveTool(provider, toolName);
        let requestId: string | null = null;
        if (destructive) {
          const reason = typeof params.reason === "string" ? params.reason : "Unified gateway policy";
          requestId = await ctxRequestAccessUnified(ctx, target, toolName, reason, input);
        }
        return rpc(id, undefined, { code: -32001, message: destructive ? "Destructive tool blocked — access request raised" : "Tool not in allowlist", data: { tool: rawName, accessRequestId: requestId } });
      }
      try {
        const result = await ctx.gateway.call({ integration: target, workspaceId: ctx.workspaceId, actorLabel: ctx.actorLabel, tool: toolName, input, idempotencyKey: typeof params.idempotencyKey === "string" ? params.idempotencyKey : undefined });
        return rpc(id, { content: [{ type: "text", text: result.ok ? result.message : `Failed (${result.statusCode}): ${result.message}` }], isError: !result.ok, meta: { provider, statusCode: result.statusCode, durationMs: result.durationMs, replayed: result.replayed } });
      } catch (err) {
        const status = err instanceof GatewayError ? err.statusCode : 500;
        const msg = err instanceof Error ? err.message : "Tool call failed";
        if (status === 403 || status === 409) {
          const reqId = await ctxRequestAccessUnified(ctx, target, toolName, msg, input);
          return rpc(id, undefined, { code: -32003, message: msg, data: { statusCode: status, policy: true, accessRequestId: reqId } });
        }
        return rpc(id, undefined, { code: -32002, message: msg, data: { statusCode: status } });
      }
    }
    case "resources/list": {
      return rpc(id, { resources: integrations.map((i) => ({ uri: `n0va1o://${i.id}`, name: i.name, description: `${i.provider} — ${i.enabled ? "connected" : "paused"}`, mimeType: "application/json" })) });
    }
    case "resources/read": {
      const uri = typeof params.uri === "string" ? params.uri : "";
      const target = integrations.find((i) => uri.includes(i.id)) ?? integrations[0];
      if (!target) return rpc(id, { contents: [] });
      return rpc(id, { contents: [{ uri, mimeType: "application/json", text: JSON.stringify({ provider: target.provider, status: target.enabled ? "connected" : "paused", mcp: target.mcpEnabled, scopedTools: effectiveTools(target).map((t) => `${target.provider}:${t.name}`) }) }] });
    }
    default:
      return rpc(id, undefined, { code: -32601, message: `Method not found: ${method}` });
  }
}

const PROVIDERS_COUNT = 1094;

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

    case "tools/discover": {
      const query = typeof params.query === "string" ? params.query : "";
      const max = typeof params.maxTools === "number" ? Math.max(1, Math.min(20, params.maxTools)) : 5;
      const discovered = discoverTools(query, { providers: [integration.provider], maxTools: max });
      const top = discovered[0];
      return rpc(id, {
        intent: query.toLowerCase().trim(),
        confidence: top ? top.relevance : 0,
        tools: discovered.map((d) => ({
          provider: d.providerKey,
          name: d.name,
          relevance: d.relevance,
          reason: d.reason,
        })),
        contextTokensSaved: Math.max(0, effectiveTools(integration).length - discovered.length),
      });
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
          const reasoningChain = Array.isArray(params.reasoningChain) ? params.reasoningChain : undefined;
          const sessionContext = Array.isArray(params.sessionContext) ? params.sessionContext : undefined;
          requestId = await ctxRequestAccess(ctx, toolName, reason, input, reasoningChain, sessionContext);
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
        const message = err instanceof Error ? err.message : "Tool call failed";
        // Policy denials escalate as access requests so humans can approve.
        if (status === 403 || status === 409) {
          const requestId = await ctxRequestAccess(ctx, toolName, message, input);
          return rpc(id, undefined, { code: -32003, message, data: { statusCode: status, policy: true, accessRequestId: requestId } });
        }
        return rpc(id, undefined, { code: -32002, message, data: { statusCode: status } });
      }
    }

    case "n0va1o.approve_access": {
      const requestId = typeof params.requestId === "string" ? params.requestId : "";
      const approve = params.approve === true;
      const signature = typeof params.signature === "string" ? params.signature : "";
      if (!requestId) {
        return rpc(id, undefined, { code: -32602, message: "n0va1o.approve_access requires requestId" });
      }
      const result = await approveAccessRequest({
        workspaceId,
        integrationId: integration.id,
        requestId,
        approve,
        signature,
        actorLabel,
      });
      return rpc(id, result);
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

/** Resolve an access request — approve/deny with a digital signature (Interrogation Room). */
async function approveAccessRequest(input: {
  workspaceId: string;
  integrationId: string;
  requestId: string;
  approve: boolean;
  signature: string;
  actorLabel: string;
}): Promise<{ ok: boolean; status: string; message: string }> {
  const request = await prisma.integrationAccessRequest.findFirst({
    where: { id: input.requestId, workspaceId: input.workspaceId },
    include: { integration: true },
  });
  if (!request) return { ok: false, status: "not_found", message: "Access request not found" };
  if (request.status !== "PENDING") return { ok: false, status: String(request.status), message: "Access request already decided" };

  if (input.approve) {
    if (!input.signature) return { ok: false, status: "PENDING", message: "Approval requires a digital signature" };
    const allowlist = Array.isArray((request.integration.allowlistTools as unknown) ?? [])
      ? (request.integration.allowlistTools as unknown as string[])
      : [];
    if (!allowlist.includes(request.tool)) allowlist.push(request.tool);
    await prisma.integration.update({
      where: { id: request.integration.id },
      data: { allowlistTools: allowlist },
    });
    await prisma.integrationAccessRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        decidedById: null,
        decidedAt: new Date(),
        approvedSignature: input.signature,
      },
    });
    await logAudit({
      workspaceId: input.workspaceId,
      module: "n0va1o",
      action: "mcp.access_approved",
      targetType: "IntegrationAccessRequest",
      targetId: request.id,
      metadata: { tool: request.tool, requestId: request.id, signer: input.actorLabel, signature: input.signature },
    });
    return { ok: true, status: "APPROVED", message: `Access approved: ${request.tool} added to allowlist (signed: ${input.signature.slice(0, 16)}…)` };
  } else {
    await prisma.integrationAccessRequest.update({
      where: { id: request.id },
      data: { status: "DENIED", decidedById: null, decidedAt: new Date() },
    });
    await logAudit({
      workspaceId: input.workspaceId,
      module: "n0va1o",
      action: "mcp.access_denied",
      targetType: "IntegrationAccessRequest",
      targetId: request.id,
      metadata: { tool: request.tool, requester: input.actorLabel },
    });
    return { ok: true, status: "DENIED", message: `Access denied: ${request.tool} remains blocked` };
  }
}

async function ctxRequestAccess(
  ctx: McpContext,
  tool: string,
  reason: string,
  args?: Record<string, unknown>,
  reasoningChain?: unknown,
  sessionContext?: unknown,
): Promise<string> {
  const request = await prisma.integrationAccessRequest.create({
    data: {
      integrationId: ctx.integration.id,
      workspaceId: ctx.workspaceId,
      requesterLabel: ctx.actorLabel,
      tool,
      reason: reason.slice(0, 500),
      toolArguments: args as unknown as never,
      reasoningChain: reasoningChain as unknown as never,
      sessionContext: sessionContext as unknown as never,
      status: "PENDING",
    },
  });
  await logAudit({
    workspaceId: ctx.workspaceId,
    module: "n0va1o",
    action: "mcp.access_requested",
    targetType: "IntegrationAccessRequest",
    targetId: request.id,
    metadata: { tool, actor: ctx.actorLabel, hasArguments: Boolean(args), arguments: args },
  });
  return request.id;
}

async function ctxRequestAccessUnified(
  ctx: UnifiedMcpContext,
  integration: Integration,
  tool: string,
  reason: string,
  args?: Record<string, unknown>,
): Promise<string> {
  const request = await prisma.integrationAccessRequest.create({
    data: {
      integrationId: integration.id,
      workspaceId: ctx.workspaceId,
      requesterLabel: ctx.actorLabel,
      tool,
      reason: reason.slice(0, 500),
      toolArguments: args as unknown as never,
      status: "PENDING",
    },
  });
  await logAudit({
    workspaceId: ctx.workspaceId,
    module: "n0va1o",
    action: "mcp.access_requested",
    targetType: "IntegrationAccessRequest",
    targetId: request.id,
    metadata: { tool, provider: integration.provider, actor: ctx.actorLabel },
  });
  return request.id;
}
