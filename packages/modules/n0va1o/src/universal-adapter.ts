/**
 * N0VA1O Universal REST Adapter — Works for any provider automatically.
 * Maps tool names to real HTTP calls using provider config + standard REST conventions.
 */
import type { Integration } from "@n0va/db";
import { PROVIDER_DB, getProviderConfig } from "./provider-db";

export interface RestRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface RestResponse {
  ok: boolean;
  statusCode: number;
  message: string;
  data?: unknown;
}

function inferMethod(tool: string): string {
  if (tool.startsWith("create_") || tool.startsWith("send_") || tool.startsWith("add_") || tool.startsWith("post_") || tool.startsWith("start_")) return "POST";
  if (tool.startsWith("update_") || tool.startsWith("edit_") || tool.startsWith("move_") || tool.startsWith("put_")) return "PUT";
  if (tool.startsWith("patch_")) return "PATCH";
  if (tool.startsWith("delete_") || tool.startsWith("remove_") || tool.startsWith("cancel_") || tool.startsWith("kick_")) return "DELETE";
  if (tool.startsWith("complete_") || tool.startsWith("merge_") || tool.startsWith("approve_") || tool.startsWith("trigger_")) return "POST";
  if (tool.startsWith("publish_") || tool.startsWith("deploy_") || tool.startsWith("run_")) return "POST";
  return "GET";
}

function toolToPath(tool: string): string {
  // Convert tool name to REST path: "list_files" -> "/files", "create_issue" -> "/issues"
  const parts = tool.split("_");
  const action = parts[0];
  const resource = parts.slice(1).join("_");
  const plural = resource.endsWith("s") ? resource : `${resource}s`;
  if (action === "list" || action === "search" || action === "get") return `/${plural}`;
  if (action === "create" || action === "add" || action === "send" || action === "post" || action === "start") return `/${plural}`;
  if (action === "update" || action === "edit" || action === "move" || action === "patch") return `/${plural}/{id}`;
  if (action === "delete" || action === "remove" || action === "cancel" || action === "kick") return `/${plural}/{id}`;
  if (action === "complete" || action === "merge" || action === "approve") return `/${plural}/{id}/${action}`;
  if (action === "publish" || action === "deploy" || action === "run" || action === "trigger") return `/${plural}`;
  return `/${tool.replace(/_/g, "/")}`;
}

function buildUrl(baseUrl: string, path: string, input: Record<string, unknown>): string {
  let url = `${baseUrl.replace(/\/$/, "")}${path}`;
  // Replace template params from input
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "number") {
      url = url.replace(`{${key}}`, encodeURIComponent(String(value)));
    }
  }
  return url;
}

function buildHeaders(integration: Integration, config: ReturnType<typeof getProviderConfig>): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "N0VA1O-Gateway/2026.07",
    accept: "application/json",
  };
  const cfg = integration.config as Record<string, unknown> | null;
  const token = typeof cfg?.token === "string" ? cfg.token : "";

  if (token && config) {
    if (config.authType === "bearer" || config.authType === "oauth2") {
      headers.authorization = `Bearer ${token}`;
    } else if (config.authType === "basic") {
      headers.authorization = `Basic ${Buffer.from(token).toString("base64")}`;
    } else if (config.authType === "api-key" && config.apiKeyHeader) {
      headers[config.apiKeyHeader] = token;
    } else {
      headers.authorization = `Bearer ${token}`;
    }
  }
  return headers;
}

export function buildRestRequest(
  integration: Integration,
  tool: string,
  input: Record<string, unknown>,
): RestRequest {
  const config = getProviderConfig(integration.provider);
  const method = inferMethod(tool);
  const path = toolToPath(tool);
  const baseUrl = config?.baseUrl ?? "";
  const url = buildUrl(baseUrl, path, input);
  const headers = buildHeaders(integration, config);

  const body = method !== "GET" && method !== "DELETE" ? JSON.stringify(input) : undefined;
  if (body) headers["content-type"] = "application/json";

  return { method, url, headers, body };
}

export async function executeRestRequest(request: RestRequest): Promise<RestResponse> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text().catch(() => "");
    const data = text ? JSON.parse(text) : null;
    return {
      ok: res.ok,
      statusCode: res.status,
      message: `${res.status} ${res.statusText}`,
      data,
    };
  } catch (err) {
    return {
      ok: false,
      statusCode: 0,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Execute a tool call for any provider.
 * This is the main entry point that makes 1000+ adapters work.
 */
export async function executeTool(
  integration: Integration,
  tool: string,
  input: Record<string, unknown>,
): Promise<RestResponse> {
  const request = buildRestRequest(integration, tool, input);
  return executeRestRequest(request);
}

/**
 * Check if a provider has a real base URL configured (can make live calls).
 */
export function canMakeLiveCalls(providerKey: string): boolean {
  const config = PROVIDER_DB[providerKey];
  return Boolean(config && config.baseUrl);
}

export { PROVIDER_DB, getProviderConfig };
