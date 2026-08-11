/**
 * N0VA1O Adapter Registry — Maps 1,000+ providers to executable adapters.
 * Combines explicit adapters, provider configs, and generic REST fallback.
 */
import type { Integration } from "@n0va/db";
import { ADAPTERS } from "./adapters";
import { PROVIDER_API_CONFIGS, generateGenericConfig, type ProviderApiConfig } from "./provider-configs";
import { adapterRequest, buildRequestConfig, type AdapterResult } from "./adapter-engine";
import { EXTRA_ADAPTERS } from "./adapters-extra";
import { CLOUD_ADAPTERS } from "./adapters-cloud";

export interface AdapterContext {
  integration: Integration;
  input: Record<string, unknown>;
}

type AdapterFn = (ctx: AdapterContext) => Promise<AdapterResult>;

// Merge all explicit adapters (hand-crafted, real API calls)
const ALL_EXPLICIT_ADAPTERS: Record<string, AdapterFn> = {
  ...ADAPTERS,
  ...EXTRA_ADAPTERS,
  ...CLOUD_ADAPTERS,
};

/**
 * Execute a tool call through the adapter system.
 * Priority: explicit adapter > provider config > generic REST fallback.
 */
export async function executeAdapter(
  integration: Integration,
  tool: string,
  input: Record<string, unknown>,
): Promise<AdapterResult> {
  const adapterKey = `${integration.provider}:${tool}`;

  // 1. Try explicit adapter (hand-crafted, real API)
  const explicit = ALL_EXPLICIT_ADAPTERS[adapterKey];
  if (explicit) {
    return explicit({ integration, input });
  }

  // 2. Try provider config (generic REST via config)
  const config = PROVIDER_API_CONFIGS[integration.provider];
  if (config) {
    return executeViaConfig(integration, config, tool, input);
  }

  // 3. Try generic REST fallback
  return executeGeneric(integration, tool, input);
}

/**
 * Execute via explicit provider API config.
 */
async function executeViaConfig(
  integration: Integration,
  config: ProviderApiConfig,
  tool: string,
  input: Record<string, unknown>,
): Promise<AdapterResult> {
  const endpoint = config.endpoints[tool];
  if (!endpoint) {
    return {
      ok: false,
      statusCode: 501,
      message: `${integration.provider}: ${tool} has no endpoint config`,
    };
  }

  const reqConfig = buildRequestConfig(integration);
  const baseUrl = config.baseUrl || reqConfig.baseUrl;
  if (!baseUrl) {
    return { ok: false, statusCode: 400, message: `No baseUrl for ${integration.provider}` };
  }

  // Build path with template params
  let path = endpoint.path;
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      path = path.replace(`{${key}}`, encodeURIComponent(value));
    }
  }

  return adapterRequest(
    { ...reqConfig, baseUrl, authType: config.authType, apiKeyHeader: config.apiKeyHeader },
    { method: endpoint.method, path, body: input, query: undefined },
  );
}

/**
 * Generic REST fallback using standard conventions.
 * Constructs endpoint from tool name and provider base URL.
 */
async function executeGeneric(
  integration: Integration,
  tool: string,
  input: Record<string, unknown>,
): Promise<AdapterResult> {
  const reqConfig = buildRequestConfig(integration);
  if (!reqConfig.baseUrl) {
    return {
      ok: false,
      statusCode: 501,
      message: `${integration.provider}: ${tool} — connect an account or implement the adapter to enable this action.`,
    };
  }

  // Infer method from tool name
  const method = inferMethod(tool);
  const path = inferPath(tool, input);

  return adapterRequest(reqConfig, { method, path, body: input });
}

function inferMethod(tool: string): "GET" | "POST" | "PUT" | "PATCH" | "DELETE" {
  if (tool.startsWith("create_") || tool.startsWith("send_") || tool.startsWith("add_") || tool.startsWith("post_")) return "POST";
  if (tool.startsWith("update_") || tool.startsWith("edit_") || tool.startsWith("move_")) return "PUT";
  if (tool.startsWith("delete_") || tool.startsWith("remove_") || tool.startsWith("cancel_")) return "DELETE";
  if (tool.startsWith("complete_") || tool.startsWith("merge_")) return "POST";
  return "GET";
}

function inferPath(tool: string, input: Record<string, unknown>): string {
  // Convert tool name to REST path: "list_files" -> "/files", "create_issue" -> "/issues"
  const parts = tool.split("_");
  const action = parts[0];
  const resource = parts.slice(1).join("_");

  const pluralResource = resource.endsWith("s") ? resource : `${resource}s`;

  if (action === "list" || action === "get" || action === "search") {
    const id = input.id ?? input[`${resource}_id`];
    return id ? `/${pluralResource}/${id}` : `/${pluralResource}`;
  }
  if (action === "create" || action === "add" || action === "send" || action === "post") {
    return `/${pluralResource}`;
  }
  if (action === "update" || action === "edit" || action === "move") {
    const id = input.id ?? input[`${resource}_id`] ?? "";
    return `/${pluralResource}/${id}`;
  }
  if (action === "delete" || action === "remove" || action === "cancel") {
    const id = input.id ?? input[`${resource}_id`] ?? "";
    return `/${pluralResource}/${id}`;
  }
  return `/${tool.replace(/_/g, "/")}`;
}

/**
 * Check if a provider has any working adapter (explicit or config).
 */
export function hasWorkingAdapter(provider: string): boolean {
  return provider in PROVIDER_API_CONFIGS ||
    Object.keys(ALL_EXPLICIT_ADAPTERS).some((k) => k.startsWith(`${provider}:`));
}

/**
 * Get the list of supported tools for a provider.
 */
export function getSupportedTools(provider: string): string[] {
  const explicit = Object.keys(ALL_EXPLICIT_ADAPTERS)
    .filter((k) => k.startsWith(`${provider}:`))
    .map((k) => k.slice(provider.length + 1));
  const config = PROVIDER_API_CONFIGS[provider];
  const configTools = config ? Object.keys(config.endpoints) : [];
  return [...new Set([...explicit, ...configTools])];
}
