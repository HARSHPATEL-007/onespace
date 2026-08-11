/**
 * N0VA1O API Route Handlers — REST endpoints for adapter execution.
 * Bridges the web app to the adapter registry for 1,000+ providers.
 */
import type { Integration } from "@n0va/db";
import { executeAdapter, getSupportedTools, hasWorkingAdapter } from "./adapter-registry";
import { findProvider } from "./catalog";

export interface ApiCallRequest {
  integration: Integration;
  tool: string;
  input: Record<string, unknown>;
}

export interface ApiCallResponse {
  ok: boolean;
  statusCode: number;
  message: string;
  data?: unknown;
  provider: string;
  tool: string;
  hasAdapter: boolean;
  supportedTools: string[];
}

/**
 * Execute an API call through the adapter system.
 * Used by REST API routes and server actions.
 */
export async function apiCall(req: ApiCallRequest): Promise<ApiCallResponse> {
  const { integration, tool, input } = req;
  const result = await executeAdapter(integration, tool, input);

  return {
    ok: result.ok,
    statusCode: result.statusCode,
    message: result.message,
    data: result.data,
    provider: integration.provider,
    tool,
    hasAdapter: hasWorkingAdapter(integration.provider),
    supportedTools: getSupportedTools(integration.provider),
  };
}

/**
 * Get provider status — whether it has working adapters.
 */
export function providerStatus(provider: string): {
  provider: string;
  name: string;
  category: string;
  auth: string;
  hasAdapter: boolean;
  toolCount: number;
  supportedTools: string[];
} {
  const config = findProvider(provider);
  return {
    provider,
    name: config?.name ?? provider,
    category: config?.category ?? "unknown",
    auth: config?.auth ?? "api-key",
    hasAdapter: hasWorkingAdapter(provider),
    toolCount: config?.tools.length ?? 0,
    supportedTools: getSupportedTools(provider),
  };
}

/**
 * Batch execute multiple tool calls.
 */
export async function batchApiCall(
  calls: ApiCallRequest[],
): Promise<ApiCallResponse[]> {
  return Promise.all(calls.map((c) => apiCall(c)));
}

export { executeAdapter, getSupportedTools, hasWorkingAdapter };
