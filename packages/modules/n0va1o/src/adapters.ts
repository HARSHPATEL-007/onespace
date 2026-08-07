/**
 * Real connector adapters.
 *
 * Each adapter maps a `${provider}:${tool}` pair to a real HTTP round-trip
 * against a provider API, using the credentials stored in the integration's
 * `config` (token / baseUrl / owner). Adapters are preferred over the
 * simulated transport so MCP tool calls return real data whenever a provider
 * is implemented.
 */
import type { Integration } from "@n0va/db";

export interface AdapterContext {
  integration: Integration;
  input: Record<string, unknown>;
}
export interface AdapterResult {
  statusCode: number;
  ok: boolean;
  message: string;
}

const headers = (integration: Integration, extra: Record<string, string> = {}): Record<string, string> => {
  const cfg = (integration.config as Record<string, unknown> | null) ?? {};
  const token = typeof cfg.token === "string" ? cfg.token : "";
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "N0VA1O-Gateway",
    ...extra,
  };
  if (token) {
    if (!h.Authorization) h.Authorization = `Bearer ${token}`;
  }
  return h;
};

async function json<T>(url: string, integration: Integration): Promise<{ ok: boolean; status: number; data: T | null; err: string | null }> {
  try {
    const res = await fetch(url, { headers: headers(integration) });
    if (!res.ok) return { ok: false, status: res.status, data: null, err: `${res.status} ${res.statusText}` };
    return { ok: true, status: res.status, data: (await res.json()) as T, err: null };
  } catch (e) {
    return { ok: false, status: 0, data: null, err: e instanceof Error ? e.message : String(e) };
  }
}

export const ADAPTERS: Record<string, (ctx: AdapterContext) => Promise<AdapterResult>> = {
  "github:list_repos": async ({ integration, input }) => {
    const cfg = (integration.config as Record<string, unknown> | null) ?? {};
    const owner =
      typeof (input as Record<string, unknown>).owner === "string"
        ? String((input as Record<string, unknown>).owner)
        : typeof cfg.owner === "string"
          ? cfg.owner
          : "octocat";
    const r = await json<any[]>(
      `https://api.github.com/users/${encodeURIComponent(owner)}/repos?per_page=100`,
      integration,
    );
    if (!r.ok) return { statusCode: r.status, ok: false, message: `GitHub: list_repos failed — ${r.err}` };
    const count = r.data?.length ?? 0;
    const first = r.data?.[0];
    const firstLine = first ? `${first.full_name} (${first.description ?? "no description"})` : "";
    return {
      statusCode: 200,
      ok: true,
      message: `GitHub: list_repos completed — fetched ${count} repositories from ${owner}${firstLine ? `; first: ${firstLine}` : ""}`.slice(0, 240),
    };
  },

  "github:get_repo": async ({ integration, input }) => {
    const owner = typeof (input as Record<string, unknown>).owner === "string" ? String((input as Record<string, unknown>).owner) : "octocat";
    const repo = typeof (input as Record<string, unknown>).repo === "string" ? String((input as Record<string, unknown>).repo) : "";
    if (!repo) return { statusCode: 400, ok: false, message: "GitHub: get_repo requires `repo`" };
    const r = await json<any>(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, integration);
    if (!r.ok) return { statusCode: r.status, ok: false, message: `GitHub: get_repo failed — ${r.err}` };
    const d = r.data as any;
    const line = d ? `${d.full_name} · ${d.stargazers_count} stars · ${d.archived ? "archived" : "active"}` : "";
    return { statusCode: 200, ok: true, message: `GitHub: get_repo — ${line}` };
  },

  "openai:chat": async ({ integration, input }) => {
    const cfg = (integration.config as Record<string, unknown> | null) ?? {};
    const token = cfg.token ? String(cfg.token) : "";
    if (!token) return { statusCode: 400, ok: false, message: "OpenAI: chat requires an API key (paste it into the token field on connect)" };
    const model = (input as Record<string, unknown>).model ?? cfg.model ?? "gpt-4o-mini";
    const prompt = String((input as Record<string, unknown>).prompt ?? "Hello from N0VA1O");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 128 }),
    });
    if (!res.ok) {
      const txt = (await res.text()).slice(0, 200);
      return { statusCode: res.status, ok: false, message: `OpenAI: chat failed — ${res.status} ${txt}` };
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.slice(0, 160) ?? "";
    return { statusCode: 200, ok: true, message: `OpenAI: chat completed (${model}) — ${text || "(empty reply)"}`.slice(0, 240) };
  },
};
