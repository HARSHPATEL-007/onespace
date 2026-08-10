/**
 * N0VA1O Client SDK — programmatic access to the N0VA1O integration gateway.
 *
 * Works in any JavaScript/TypeScript environment (Node.js, Deno, Cloudflare Workers).
 *
 * @example
 * ```ts
 * const client = new N0va1oClient({ apiKey: 'n0va_sk_...', workspaceId: 'ws_...' });
 * const result = await client.call('github', 'list_repos', { owner: 'octocat' });
 * console.log(result.message);
 * ```
 */

export interface N0va1oClientOptions {
  apiKey: string;
  workspaceId: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export interface CallOptions {
  idempotencyKey?: string;
  skipPolicyCheck?: boolean;
}

export interface CallResult {
  ok: boolean;
  statusCode: number;
  message: string;
  durationMs: number;
  retries: number;
  replayed: boolean;
}

export interface DiscoverResult {
  intent: string;
  confidence: number;
  tools: Array<{ provider: string; name: string; relevance: number; reason: string }>;
}

export class N0va1oClient {
  private readonly apiKey: string;
  private readonly workspaceId: string;
  private readonly endpoint: string;
  private readonly fetch: typeof fetch;

  constructor(opts: N0va1oClientOptions) {
    this.apiKey = opts.apiKey;
    this.workspaceId = opts.workspaceId;
    this.endpoint = opts.endpoint ?? "http://localhost:3000";
    this.fetch = opts.fetchImpl ?? globalThis.fetch;
  }

  /**
   * Call a tool through the N0VA1O gateway.
   * @param provider Provider ID (e.g., "github", "slack")
   * @param tool Tool name (e.g., "list_repos", "post_message")
   * @param input Tool-specific input parameters
   */
  async call(provider: string, tool: string, input: Record<string, unknown> = {}, opts: CallOptions = {}): Promise<CallResult> {
    const res = await this.fetch(`${this.endpoint}/api/n0va1o/mcp/${this.workspaceSlug}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `call-${Date.now()}`,
        method: "tools/call",
        params: { name: `${provider}:${tool}`, arguments: input, idempotencyKey: opts.idempotencyKey },
      }),
    });

    const data = (await res.json()) as { result?: CallResult & { content?: Array<{ text: string }> }; error?: { message: string; code: number } };

    if (data.error) {
      throw new N0va1oError(data.error.message, data.error.code);
    }

    const result = data.result;
    if (!result) throw new N0va1oError("Empty response", -32603);

    return {
      ok: !result.isError,
      statusCode: result.meta?.statusCode ?? (result.isError ? 500 : 200),
      message: result.content?.[0]?.text ?? result.message,
      durationMs: result.meta?.durationMs ?? 0,
      retries: 0,
      replayed: result.meta?.replayed ?? false,
    };
  }

  /**
   * Discover relevant tools by natural language intent.
   */
  async discover(query: string, maxTools = 5): Promise<DiscoverResult> {
    const res = await this.fetch(`${this.endpoint}/api/n0va1o/mcp/${this.workspaceSlug}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `discover-${Date.now()}`,
        method: "tools/discover",
        params: { query, maxTools },
      }),
    });
    return (await res.json()) as DiscoverResult;
  }

  /**
   * List all available tools for this workspace.
   */
  async listTools(): Promise<Array<{ name: string; description: string }>> {
    const res = await this.fetch(`${this.endpoint}/api/n0va1o/mcp/${this.workspaceSlug}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: "list", method: "tools/list" }),
    });
    const data = (await res.json()) as { result?: { tools: Array<{ name: string; description: string }> } };
    return data.result?.tools ?? [];
  }

  private get workspaceSlug(): string {
    return this.workspaceId.replace("ws-", "n0va-");
  }
}

export class N0va1oError extends Error {
  constructor(message: string, public readonly code: number) {
    super(message);
    this.name = "N0va1oError";
  }
}
