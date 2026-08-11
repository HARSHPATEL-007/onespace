/**
 * N0VA1O API Routes — Next.js route handlers for 1,000+ provider integrations.
 * These are the actual working endpoints that the web app calls.
 */
import type { Integration } from "@n0va/db";
import { executeTool, buildRestRequest, executeRestRequest, canMakeLiveCalls } from "./universal-adapter";
import { handleMcp } from "./mcp-server";
import { verifyWebhookSignature } from "./adapter-engine";
import { prisma } from "@n0va/db";

export interface ToolExecutionRequest {
  integrationId: string;
  tool: string;
  input: Record<string, unknown>;
}

export interface ToolExecutionResponse {
  ok: boolean;
  statusCode: number;
  message: string;
  data?: unknown;
  provider: string;
  tool: string;
  canMakeLiveCalls: boolean;
  timestamp: string;
}

/**
 * Execute a tool call for a connected integration.
 * This is the main API handler used by the web app.
 */
export async function executeIntegrationTool(
  workspaceId: string,
  req: ToolExecutionRequest,
): Promise<ToolExecutionResponse> {
  const integration = await prisma.integration.findFirst({
    where: { id: req.integrationId, workspaceId },
  });

  if (!integration) {
    return {
      ok: false,
      statusCode: 404,
      message: "Integration not found",
      provider: "",
      tool: req.tool,
      canMakeLiveCalls: false,
      timestamp: new Date().toISOString(),
    };
  }

  if (!integration.enabled) {
    return {
      ok: false,
      statusCode: 409,
      message: "Integration is paused",
      provider: integration.provider,
      tool: req.tool,
      canMakeLiveCalls: canMakeLiveCalls(integration.provider),
      timestamp: new Date().toISOString(),
    };
  }

  // Execute the tool call
  const result = await executeTool(integration, req.tool, req.input);

  // Update last sync time
  await prisma.integration.update({
    where: { id: integration.id },
    data: { lastSyncAt: new Date() },
  });

  return {
    ok: result.ok,
    statusCode: result.statusCode,
    message: result.message,
    data: result.data,
    provider: integration.provider,
    tool: req.tool,
    canMakeLiveCalls: canMakeLiveCalls(integration.provider),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Execute a direct REST call (for custom/self-hosted providers).
 */
export async function executeDirectRest(
  workspaceId: string,
  integrationId: string,
  tool: string,
  input: Record<string, unknown>,
): Promise<ToolExecutionResponse> {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, workspaceId },
  });

  if (!integration) {
    return {
      ok: false,
      statusCode: 404,
      message: "Integration not found",
      provider: "",
      tool,
      canMakeLiveCalls: false,
      timestamp: new Date().toISOString(),
    };
  }

  const request = buildRestRequest(integration, tool, input);
  const result = await executeRestRequest(request);

  return {
    ok: result.ok,
    statusCode: result.statusCode,
    message: result.message,
    data: result.data,
    provider: integration.provider,
    tool,
    canMakeLiveCalls: Boolean(integration.config && (integration.config as Record<string, unknown>).baseUrl),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Handle MCP JSON-RPC request via HTTP.
 */
export async function handleMcpHttp(
  workspaceId: string,
  integrationId: string,
  request: { jsonrpc: "2.0"; id?: string | number; method: string; params?: Record<string, unknown> },
): Promise<unknown> {
  const integration = await prisma.integration.findFirst({
    where: { id: integrationId, workspaceId },
  });

  if (!integration) {
    return { jsonrpc: "2.0", error: { code: -32602, message: "Integration not found" } };
  }

  return handleMcp(request, {
    integration,
    workspaceId,
    actorLabel: "api",
  });
}

/**
 * Ingest an incoming webhook from a third-party provider.
 */
export async function ingestWebhook(
  workspaceId: string,
  provider: string,
  webhookPath: string,
  rawBody: string,
  signature?: string,
): Promise<{ ok: boolean; message: string }> {
  const integration = await prisma.integration.findFirst({
    where: { workspaceId, provider, webhookPath },
  });

  if (!integration) {
    return { ok: false, message: "No integration found for this webhook path" };
  }

  if (!integration.webhookEnabled) {
    return { ok: false, message: "Webhooks disabled for this integration" };
  }

  // Verify signature
  if (integration.webhookSecret && signature) {
    if (!verifyWebhookSignature(integration.webhookSecret, rawBody, signature)) {
      return { ok: false, message: "Invalid webhook signature" };
    }
  }

  // Parse and store the event
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    parsedBody = rawBody;
  }

  await prisma.integrationLog.create({
    data: {
      workspaceId,
      integrationId: integration.id,
      level: "info",
      direction: "inbound",
      statusCode: 200,
      method: "POST",
      path: `/hooks/${webhookPath}`,
      meta: { event: parsedBody as object },
      message: `Webhook event received from ${provider}`,
    },
  });

  return { ok: true, message: "Webhook event recorded" };
}

/**
 * Batch execute multiple tool calls.
 */
export async function batchExecuteTools(
  workspaceId: string,
  calls: ToolExecutionRequest[],
): Promise<ToolExecutionResponse[]> {
  return Promise.all(calls.map((c) => executeIntegrationTool(workspaceId, c)));
}

export { canMakeLiveCalls };
