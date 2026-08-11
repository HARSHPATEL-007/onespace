/**
 * N0VA1O MCP Service Layer — Routes tool calls through the adapter registry.
 * Handles 1,000+ providers with unified execution, auth, and audit.
 */
import type { Integration } from "@n0va/db";
import { executeAdapter, getSupportedTools } from "./adapter-registry";
import { evaluatePolicy, type PolicyDecision } from "./policy";
import { isDestructiveTool } from "./catalog";
import { logAudit } from "@n0va/db";

export interface McpToolCall {
  integration: Integration;
  workspaceId: string;
  userId?: string;
  actorLabel: string;
  tool: string;
  input: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface McpToolResult {
  ok: boolean;
  statusCode: number;
  message: string;
  data?: unknown;
  durationMs: number;
  replayed: boolean;
}

/**
 * Execute a tool call through the full MCP pipeline:
 * policy check → adapter execution → audit log
 */
export async function executeToolCall(call: McpToolCall): Promise<McpToolResult> {
  const { integration, workspaceId, userId, actorLabel, tool, input } = call;
  const startedAt = Date.now();

  // Policy evaluation
  const decision = evaluatePolicy({
    provider: integration.provider,
    tool,
    actorLabel,
    isDestructive: isDestructiveTool(integration.provider, tool),
    tokenState: "ACTIVE",
    inAllowlist: true,
    healthScore: 1,
  });

  if (decision.outcome === "DENY") {
    await logAudit({
      workspaceId,
      actorId: userId ?? null,
      module: "n0va1o",
      action: "policy.deny",
      targetType: "Integration",
      targetId: integration.id,
      metadata: { tool, provider: integration.provider, disposition: decision.disposition },
    });
    return {
      ok: false,
      statusCode: 403,
      message: `Policy denied: ${decision.disposition}`,
      durationMs: Date.now() - startedAt,
      replayed: false,
    };
  }

  // Execute via adapter registry
  const result = await executeAdapter(integration, tool, input);
  const durationMs = Date.now() - startedAt;

  // Audit log
  await logAudit({
    workspaceId,
    actorId: userId ?? null,
    module: "n0va1o",
    action: result.ok ? "tool.executed" : "tool.failed",
    targetType: "Integration",
    targetId: integration.id,
    metadata: {
      tool,
      provider: integration.provider,
      statusCode: result.statusCode,
      durationMs,
    },
  });

  return {
    ok: result.ok,
    statusCode: result.statusCode,
    message: result.message,
    data: result.data,
    durationMs,
    replayed: false,
  };
}

/**
 * Get all available tools for an integration (from catalog + adapters).
 */
export function listAvailableTools(provider: string): Array<{
  name: string;
  description: string;
  destructive: boolean;
  hasAdapter: boolean;
}> {
  const supported = new Set(getSupportedTools(provider));
  // Import from catalog to get descriptions
  const { findProvider } = require("./catalog");
  const providerConfig = findProvider(provider);
  if (!providerConfig) return [];

  return providerConfig.tools.map((t: { name: string; description: string; destructive?: boolean }) => ({
    name: t.name,
    description: t.description,
    destructive: t.destructive ?? false,
    hasAdapter: supported.has(t.name),
  }));
}

export { evaluatePolicy, isDestructiveTool };
export type { PolicyDecision };
