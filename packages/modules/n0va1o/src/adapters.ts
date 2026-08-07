/**
 * Real connector adapters.
 *
 * Each adapter maps a `${provider}:${tool}` pair to a real HTTP round-trip
 * against a provider API, using the credentials stored in the integration's
 * `config` (token / baseUrl / owner). Adapters are preferred over the
 * simulated transport so MCP tool calls return real data whenever a provider
 * is implemented.
 *
 * Adding a new adapter is a two-line change: pick the tool from catalog.ts,
 * then add an entry here. Each adapter is self-contained — it reads its own
 * parameters from `input` and the integration `config`.
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

const cfgOf = (i: Integration): Record<string, unknown> =>
  (i.config as Record<string, unknown> | null) ?? {};

const tokenOf = (i: Integration): string => {
  const c = cfgOf(i);
  return typeof c.token === "string" ? c.token : "";
};

/** Provider-specific default headers. Each provider API needs its own Accept
 * header and auth scheme; we centralize that here so adapters stay readable. */
export function providerHeaders(integration: Integration, provider: string, extra: Record<string, string> = {}): Record<string, string> {
  const token = tokenOf(integration);
  const h: Record<string, string> = { "User-Agent": "N0VA1O-Gateway", ...extra };
  switch (provider) {
    case "github":
      h.Accept = "application/vnd.github+json";
      if (token) h.Authorization = `Bearer ${token}`;
      break;
    case "slack":
      if (token) h.Authorization = `Bearer ${token}`;
      break;
    case "notion":
      h.Accept = "application/json";
      h["Notion-Version"] = "2022-06-28";
      if (token) h.Authorization = `Bearer ${token}`;
      break;
    case "airtable":
      h.Accept = "application/json";
      if (token) h["Authorization"] = `Bearer ${token}`;
      break;
    case "asana":
      h.Accept = "application/json";
      if (token) h.Authorization = `Bearer ${token}`;
      break;
    case "linear":
      h.Accept = "application/json";
      if (token) h.Authorization = `Bearer ${token}`;
      break;
    case "clickup":
      h.Accept = "application/json";
      if (token) h.Authorization = `Bearer ${token}`;
      break;
    case "anthropic":
    case "gemini":
    case "mistral":
    case "deepseek":
    case "groq":
    case "huggingface":
    case "replicate":
    case "openrouter":
      h.Accept = "application/json";
      if (token) h.Authorization = `Bearer ${token}`;
      break;
    default:
      if (token) h.Authorization = `Bearer ${token}`;
      break;
  }
  return h;
}

interface FetchResult {
  ok: boolean;
  status: number;
  data: unknown;
  err: string | null;
}

async function fetchJson(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, status: res.status, data: null, err: `${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 200)}` : ""}` };
    try {
      return { ok: true, status: res.status, data: text ? JSON.parse(text) : null, err: null };
    } catch {
      return { ok: true, status: res.status, data: text || null, err: null };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, data: null, err: msg.includes("aborted") ? `Timeout after ${timeoutMs}ms` : msg };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPostJson(url: string, integration: Integration, provider: string, body: unknown): Promise<FetchResult> {
  return fetchJson(url, {
    method: "POST",
    headers: { ...providerHeaders(integration, provider), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ------------------------------------------------------------------ */
/*  GitHub                                                             */
/* ------------------------------------------------------------------ */

export const ADAPTERS: Record<string, (ctx: AdapterContext) => Promise<AdapterResult>> = {
  "github:list_repos": async ({ integration, input }) => {
    const c = cfgOf(integration);
    const owner =
      typeof (input as Record<string, unknown>).owner === "string"
        ? String((input as Record<string, unknown>).owner)
        : typeof c.owner === "string"
          ? c.owner
          : "octocat";
    const r = await fetchJson(
      `https://api.github.com/users/${encodeURIComponent(owner)}/repos?per_page=100`,
      { headers: providerHeaders(integration, "github") },
    );
    if (!r.ok) return { statusCode: r.status, ok: false, message: `GitHub: list_repos failed — ${r.err}` };
    const data = r.data as Array<{ full_name?: string; description?: string; stargazers_count?: number }>;
    const count = data?.length ?? 0;
    const first = data?.[0];
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
    const r = await fetchJson(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { headers: providerHeaders(integration, "github") },
    );
    if (!r.ok) return { statusCode: r.status, ok: false, message: `GitHub: get_repo failed — ${r.err}` };
    const d = r.data as { full_name?: string; stargazers_count?: number; archived?: boolean };
    const line = d ? `${d.full_name} · ${d.stargazers_count ?? 0} stars · ${d.archived ? "archived" : "active"}` : "";
    return { statusCode: 200, ok: true, message: `GitHub: get_repo — ${line}` };
  },

  "github:list_issues": async ({ integration, input }) => {
    const c = cfgOf(integration);
    const owner = typeof (input as Record<string, unknown>).owner === "string" ? String((input as Record<string, unknown>).owner) : typeof c.owner === "string" ? c.owner : "octocat";
    const repo = typeof (input as Record<string, unknown>).repo === "string" ? String((input as Record<string, unknown>).repo) : "";
    if (!repo) return { statusCode: 400, ok: false, message: "GitHub: list_issues requires `repo`" };
    const state = (typeof (input as Record<string, unknown>).state === "string" ? (input as Record<string, unknown>).state : "open") as string;
    const r = await fetchJson(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?state=${encodeURIComponent(state)}&per_page=30`,
      { headers: providerHeaders(integration, "github") },
    );
    if (!r.ok) return { statusCode: r.status, ok: false, message: `GitHub: list_issues failed — ${r.err}` };
    const data = r.data as Array<{ number?: number; title?: string; state?: string }>;
    const count = data?.length ?? 0;
    const titles = (data ?? []).slice(0, 5).map((i) => `#${i.number} ${i.title}`).join("; ");
    return {
      statusCode: 200,
      ok: true,
      message: `GitHub: list_issues — ${count} issues (${state}) in ${owner}/${repo}${titles ? `; first: ${titles.slice(0, 180)}` : ""}`.slice(0, 240),
    };
  },

  "github:create_issue": async ({ integration, input }) => {
    const c = cfgOf(integration);
    const owner = typeof (input as Record<string, unknown>).owner === "string" ? String((input as Record<string, unknown>).owner) : typeof c.owner === "string" ? c.owner : "octocat";
    const repo = typeof (input as Record<string, unknown>).repo === "string" ? String((input as Record<string, unknown>).repo) : "";
    const title = typeof (input as Record<string, unknown>).title === "string" ? String((input as Record<string, unknown>).title) : "";
    const body = typeof (input as Record<string, unknown>).body === "string" ? String((input as Record<string, unknown>).body) : "";
    if (!repo || !title) return { statusCode: 400, ok: false, message: "GitHub: create_issue requires `repo` and `title`" };
    const r = await fetchPostJson(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
      integration,
      "github",
      { title, body },
    );
    if (!r.ok) return { statusCode: r.status, ok: false, message: `GitHub: create_issue failed — ${r.err}` };
    const d = r.data as { number?: number; html_url?: string };
    return {
      statusCode: 201,
      ok: true,
      message: `GitHub: created issue #${d.number} — ${d.html_url ?? ""}`.slice(0, 240),
    };
  },

  "github:merge_pr": async ({ integration, input }) => {
    const c = cfgOf(integration);
    const owner = typeof (input as Record<string, unknown>).owner === "string" ? String((input as Record<string, unknown>).owner) : typeof c.owner === "string" ? c.owner : "octocat";
    const repo = typeof (input as Record<string, unknown>).repo === "string" ? String((input as Record<string, unknown>).repo) : "";
    const pr = typeof (input as Record<string, unknown>).pr === "number" ? Number((input as Record<string, unknown>).pr) : Number((input as Record<string, unknown>).pull_number ?? (input as Record<string, unknown>).number ?? 0);
    if (!repo || !pr) return { statusCode: 400, ok: false, message: "GitHub: merge_pr requires `repo` and `pr`" };
    const r = await fetchPostJson(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${pr}/merge`,
      integration,
      "github",
      {},
    );
    if (!r.ok) return { statusCode: r.status, ok: false, message: `GitHub: merge_pr failed — ${r.err}` };
    const d = r.data as { sha?: string; merged?: boolean };
    return { statusCode: 200, ok: true, message: `GitHub: PR #${pr} merged${d.merged ? "" : " (status check)"} — ${d.sha ?? ""}` };
  },

  /* ------------------------------------------------------------------ */
  /*  Slack                                                            */
  /* ------------------------------------------------------------------ */

  "slack:post_message": async ({ integration, input }) => {
    const c = cfgOf(integration);
    const channel = typeof (input as Record<string, unknown>).channel === "string" ? String((input as Record<string, unknown>).channel) : typeof c.channel === "string" ? c.channel : "";
    const text = typeof (input as Record<string, unknown>).text === "string" ? String((input as Record<string, unknown>).text) : "Hello from N0VA1O";
    if (!channel) return { statusCode: 400, ok: false, message: "Slack: post_message requires `channel`" };
    const r = await fetchPostJson("https://slack.com/api/chat.postMessage", integration, "slack", { channel, text });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Slack: post_message failed — ${r.err}` };
    const d = r.data as { ok?: boolean; channel?: string; ts?: string; error?: string };
    if (!d.ok) return { statusCode: 200, ok: false, message: `Slack: post_message rejected — ${d.error ?? "unknown"}` };
    return { statusCode: 200, ok: true, message: `Slack: message sent to ${d.channel ?? channel} (ts: ${d.ts?.slice(-6) ?? "n/a"})` };
  },

  "slack:list_channels": async ({ integration }) => {
    const r = await fetchJson("https://slack.com/api/conversations.list?limit=100&types=public_channel", {
      headers: providerHeaders(integration, "slack"),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Slack: list_channels failed — ${r.err}` };
    const d = r.data as { ok?: boolean; channels?: Array<{ id: string; name: string; is_private?: boolean }>; error?: string };
    if (!d.ok) return { statusCode: 200, ok: false, message: `Slack: list_channels rejected — ${d.error ?? "unknown"}` };
    const count = d.channels?.length ?? 0;
    const names = (d.channels ?? []).slice(0, 5).map((c) => c.name).join(", ");
    return {
      statusCode: 200,
      ok: true,
      message: `Slack: ${count} channels found${names ? `; first: ${names.slice(0, 180)}` : ""}`.slice(0, 240),
    };
  },

  "slack:read_thread": async ({ integration, input }) => {
    const channel = typeof (input as Record<string, unknown>).channel === "string" ? String((input as Record<string, unknown>).channel) : "";
    const ts = typeof (input as Record<string, unknown>).ts === "string" ? String((input as Record<string, unknown>).ts) : "";
    if (!channel || !ts) return { statusCode: 400, ok: false, message: "Slack: read_thread requires `channel` and `ts`" };
    const r = await fetchJson(
      `https://slack.com/api/conversations.replies?channel=${encodeURIComponent(channel)}&ts=${encodeURIComponent(ts)}&limit=50`,
      { headers: providerHeaders(integration, "slack") },
    );
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Slack: read_thread failed — ${r.err}` };
    const d = r.data as { ok?: boolean; messages?: Array<{ user?: string; text?: string; ts?: string }>; error?: string };
    if (!d.ok) return { statusCode: 200, ok: false, message: `Slack: read_thread rejected — ${d.error ?? "unknown"}` };
    const count = d.messages?.length ?? 0;
    const first = d.messages?.[0];
    return {
      statusCode: 200,
      ok: true,
      message: `Slack: ${count} messages in thread${first?.text ? `; latest: ${first.text.slice(0, 160)}` : ""}`.slice(0, 240),
    };
  },

  /* ------------------------------------------------------------------ */
  /*  Notion                                                           */
  /* ------------------------------------------------------------------ */

  "notion:search": async ({ integration, input }) => {
    const query = typeof (input as Record<string, unknown>).query === "string" ? String((input as Record<string, unknown>).query) : "";
    const body: Record<string, unknown> = { page_size: 20 };
    if (query) (body as Record<string, unknown>).query = query;
    const r = await fetchJson("https://api.notion.com/v1/search", {
      method: "POST",
      headers: { ...providerHeaders(integration, "notion"), "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Notion: search failed — ${r.err}` };
    const d = r.data as { results?: Array<{ id?: string; title?: { plain_text?: string }[]; object?: string }>; total_results?: number };
    const results = d.results ?? [];
    const titles = results.slice(0, 5).map((r) => r.title?.[0]?.plain_text ?? "").filter(Boolean);
    return {
      statusCode: 200,
      ok: true,
      message: `Notion: found ${d.total_results ?? results.length} results${titles.length ? `; first: ${titles[0]!.slice(0, 120)}` : ""}`.slice(0, 240),
    };
  },

  "notion:read_page": async ({ integration, input }) => {
    const pageId = typeof (input as Record<string, unknown>).pageId === "string" ? String((input as Record<string, unknown>).pageId) : typeof (input as Record<string, unknown>).id === "string" ? String((input as Record<string, unknown>).id) : "";
    if (!pageId) return { statusCode: 400, ok: false, message: "Notion: read_page requires `pageId`" };
    const cleanId = pageId.includes("-") ? pageId : `${pageId.slice(0, 8)}-${pageId.slice(8, 12)}-${pageId.slice(12, 16)}-${pageId.slice(16, 20)}-${pageId.slice(20)}`;
    const r = await fetchJson(`https://api.notion.com/v1/pages/${encodeURIComponent(cleanId)}`, { headers: providerHeaders(integration, "notion") });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Notion: read_page failed — ${r.err}` };
    const d = r.data as { id?: string; created_time?: string; properties?: Record<string, unknown> };
    const propCount = d.properties ? Object.keys(d.properties).length : 0;
    const titleProp = (d.properties?.title as { title?: Array<{ plain_text?: string }> })?.title;
    const title = titleProp?.[0]?.plain_text ?? "";
    return {
      statusCode: 200,
      ok: true,
      message: `Notion: page ${d.id?.slice(-8)} — ${propCount} properties${title ? `; "${title.slice(0, 80)}"` : ""}`.slice(0, 240),
    };
  },

  "notion:create_page": async ({ integration, input }) => {
    const c = cfgOf(integration);
    const parentPageId = typeof (input as Record<string, unknown>).parentPageId === "string" ? String((input as Record<string, unknown>).parentPageId) : typeof c.workspaceId === "string" ? c.workspaceId : "";
    const title = typeof (input as Record<string, unknown>).title === "string" ? String((input as Record<string, unknown>).title) : "New page";
    if (!parentPageId) return { statusCode: 400, ok: false, message: "Notion: create_page requires `parentPageId`" };
    const parent = parentPageId.includes("-") ? { page_id: parentPageId } : { page_id: parentPageId };
    const r = await fetchPostJson("https://api.notion.com/v1/pages", integration, "notion", {
      parent,
      properties: { title: { title: [{ text: { content: title } }] } },
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Notion: create_page failed — ${r.err}` };
    const d = r.data as { id?: string; url?: string };
    return {
      statusCode: 200,
      ok: true,
      message: `Notion: created page ${d.id?.slice(-8)} — ${d.url?.slice(0, 150) ?? ""}`.slice(0, 240),
    };
  },

  /* ------------------------------------------------------------------ */
  /*  Airtable                                                         */
  /* ------------------------------------------------------------------ */

  "airtable:list_records": async ({ integration, input }) => {
    const c = cfgOf(integration);
    const baseId = typeof (input as Record<string, unknown>).baseId === "string" ? String((input as Record<string, unknown>).baseId) : typeof c.baseId === "string" ? c.baseId : "";
    const tableName = typeof (input as Record<string, unknown>).tableName === "string" ? String((input as Record<string, unknown>).tableName) : typeof c.tableName === "string" ? c.tableName : "";
    if (!baseId || !tableName) return { statusCode: 400, ok: false, message: "Airtable: list_records requires `baseId` and `tableName`" };
    const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}?pageSize=10`;
    const r = await fetchJson(url, { headers: providerHeaders(integration, "airtable") });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Airtable: list_records failed — ${r.err}` };
    const d = r.data as { records?: Array<{ id: string; fields?: Record<string, unknown>; createdTime?: string }> };
    const count = d.records?.length ?? 0;
    const first = d.records?.[0];
    const firstSummary = first ? JSON.stringify(Object.keys(first.fields ?? {}).slice(0, 5)) : "";
    return {
      statusCode: 200,
      ok: true,
      message: `Airtable: ${count} records in ${baseId}/${tableName}${firstSummary ? ` — fields: ${firstSummary.slice(0, 120)}` : ""}`.slice(0, 240),
    };
  },

  "airtable:create_record": async ({ integration, input }) => {
    const c = cfgOf(integration);
    const baseId = typeof (input as Record<string, unknown>).baseId === "string" ? String((input as Record<string, unknown>).baseId) : typeof c.baseId === "string" ? c.baseId : "";
    const tableName = typeof (input as Record<string, unknown>).tableName === "string" ? String((input as Record<string, unknown>).tableName) : typeof c.tableName === "string" ? c.tableName : "";
    const fields = (input as Record<string, unknown>).fields as Record<string, unknown> | undefined;
    if (!baseId || !tableName) return { statusCode: 400, ok: false, message: "Airtable: create_record requires `baseId` and `tableName`" };
    const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableName)}`;
    const r = await fetchPostJson(url, integration, "airtable", { fields: fields ?? {} });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Airtable: create_record failed — ${r.err}` };
    const d = r.data as { id?: string };
    return {
      statusCode: 201,
      ok: true,
      message: `Airtable: created record ${d.id ?? "rec-…"} in ${baseId}/${tableName}`,
    };
  },

  /* ------------------------------------------------------------------ */
  /*  Asana                                                            */
  /* ------------------------------------------------------------------ */

  "asana:list_projects": async ({ integration, input }) => {
    const c = cfgOf(integration);
    const workspace = typeof (input as Record<string, unknown>).workspace === "string" ? String((input as Record<string, unknown>).workspace) : typeof c.workspace === "string" ? c.workspace : "";
    if (!workspace) return { statusCode: 400, ok: false, message: "Asana: list_projects requires `workspace`" };
    const r = await fetchJson(
      `https://app.asana.com/api/1.0/workspaces/${encodeURIComponent(workspace)}/projects?opt_fields=name,archived`,
      { headers: providerHeaders(integration, "asana") },
    );
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Asana: list_projects failed — ${r.err}` };
    const d = r.data as { data?: Array<{ name?: string; archived?: boolean; gid?: string }> };
    const all = d.data ?? [];
    const active = all.filter((p) => !p.archived);
    return {
      statusCode: 200,
      ok: true,
      message: `Asana: ${active.length} active projects (of ${all.length}) in workspace ${workspace}`.slice(0, 240),
    };
  },

  "asana:list_tasks": async ({ integration, input }) => {
    const c = cfgOf(integration);
    const workspace = typeof (input as Record<string, unknown>).workspace === "string" ? String((input as Record<string, unknown>).workspace) : typeof c.workspace === "string" ? c.workspace : "";
    const projectId = typeof (input as Record<string, unknown>).projectId === "string" ? String((input as Record<string, unknown>).projectId) : typeof c.projectId === "string" ? c.projectId : "";
    if (!workspace || !projectId) return { statusCode: 400, ok: false, message: "Asana: list_tasks requires `workspace` and `projectId`" };
    const r = await fetchJson(
      `https://app.asana.com/api/1.0/tasks?workspace=${encodeURIComponent(workspace)}&project=${encodeURIComponent(projectId)}&opt_fields=name,assignee,status,completed&limit=30`,
      { headers: providerHeaders(integration, "asana") },
    );
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Asana: list_tasks failed — ${r.err}` };
    const d = r.data as { data?: Array<{ name?: string; completed?: boolean }> };
    const tasks = d.data ?? [];
    return {
      statusCode: 200,
      ok: true,
      message: `Asana: ${tasks.length} tasks found; ${tasks.filter((t) => !t.completed).length} open`.slice(0, 240),
    };
  },

  /* ------------------------------------------------------------------ */
  /*  Linear                                                           */
  /* ------------------------------------------------------------------ */

  "linear:list_issues": async ({ integration, input }) => {
    const teamKey = typeof (input as Record<string, string>).team === "string" ? String((input as Record<string, unknown>).team) : "ENG";
    const query = `query { team(key: "${teamKey}") { issues(first: 25, states: [Triage, Unscheduled, Backlog, Todo, InProgress, InReview, Done, Canceled]) { nodes { identifier title state { name type } } } } }`;
    const r = await fetchPostJson("https://api.linear.app/graphql", integration, "linear", { query });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Linear: list_issues failed — ${r.err}` };
    const d = r.data as { data?: { team?: { issues?: { nodes?: Array<{ identifier?: string; title?: string; state?: { name?: string } }> } } }; errors?: Array<{ message?: string }> };
    if (d.errors?.[0]) return { statusCode: 200, ok: false, message: `Linear: list_issues rejected — ${d.errors[0].message ?? "unknown error"}` };
    const issues = d.data?.team?.issues?.nodes ?? [];
    const open = issues.filter((i) => i.state?.name !== "Done" && i.state?.name !== "Canceled");
    return {
      statusCode: 200,
      ok: true,
      message: `Linear: ${issues.length} issues in ${teamKey} (${open.length} open)${issues[0] ? `; #${issues[0].identifier} ${issues[0].title?.slice(0, 100)}` : ""}`.slice(0, 240),
    };
  },

  "linear:create_issue": async ({ integration, input }) => {
    const c = cfgOf(integration);
    const teamKey = typeof (input as Record<string, unknown>).team === "string" ? String((input as Record<string, unknown>).team) : typeof c.team === "string" ? c.team : "ENG";
    const title = typeof (input as Record<string, unknown>).title === "string" ? String((input as Record<string, unknown>).title) : "Untitled";
    const description = typeof (input as Record<string, unknown>).description === "string" ? String((input as Record<string, unknown>).description) : "";
    const query = `mutation { issueCreate(input: { teamId: null, teamKey: "${teamKey}", title: "${title.replace(/"/g, '\\"')}", description: "${description.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" }) { success identifier } }`;
    const r = await fetchPostJson("https://api.linear.app/graphql", integration, "linear", { query });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Linear: create_issue failed — ${r.err}` };
    const d = r.data as { data?: { issueCreate?: { success?: boolean; identifier?: string } }; errors?: Array<{ message?: string }> };
    if (d.errors?.[0]) return { statusCode: 200, ok: false, message: `Linear: create_issue rejected — ${d.errors[0].message ?? "unknown error"}` };
    return {
      statusCode: 201,
      ok: d.data?.issueCreate?.success ?? false,
      message: `Linear: ${d.data?.issueCreate?.success ? "created" : "failed"} ${d.data?.issueCreate?.identifier ?? ""} — ${title.slice(0, 100)}`.slice(0, 240),
    };
  },

  /* ------------------------------------------------------------------ */
  /*  ClickUp                                                          */
  /* ------------------------------------------------------------------ */

  "clickup:list_tasks": async ({ integration, input }) => {
    const c = cfgOf(integration);
    const listId = typeof (input as Record<string, unknown>).listId === "string" ? String((input as Record<string, unknown>).listId) : typeof c.listId === "string" ? c.listId : "";
    if (!listId) return { statusCode: 400, ok: false, message: "ClickUp: list_tasks requires `listId`" };
    const r = await fetchJson(
      `https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task?archived=false&assignees=&tags=`,
      { headers: providerHeaders(integration, "clickup") },
    );
    if (!r.ok) return { statusCode: r.status, ok: false, message: `ClickUp: list_tasks failed — ${r.err}` };
    const d = r.data as { tasks?: Array<{ id?: string; name?: string; status?: { status?: string } }> };
    const tasks = d.tasks ?? [];
    const statuses = tasks.map((t) => t.status?.status ?? "?").reduce((acc, s) => { acc[s] = (acc[s] ?? 0) + 1; return acc; }, {} as Record<string, number>);
    return {
      statusCode: 200,
      ok: true,
      message: `ClickUp: ${tasks.length} tasks — ${JSON.stringify(statuses)}`.slice(0, 240),
    };
  },

  /* ------------------------------------------------------------------ */
  /*  OpenAI (already existed, kept as-is)                              */
  /* ------------------------------------------------------------------ */

  "openai:chat": async ({ integration, input }) => {
    const c = cfgOf(integration);
    const token = tokenOf(integration);
    if (!token) return { statusCode: 400, ok: false, message: "OpenAI: chat requires an API key (paste it into the token field on connect)" };
    const model = (input as Record<string, unknown>).model ?? c.model ?? "gpt-4o-mini";
    const prompt = String((input as Record<string, unknown>).prompt ?? "Hello from N0VA1O");
    const r = await fetchPostJson("https://api.openai.com/v1/chat/completions", integration, "openai", {
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 128,
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `OpenAI: chat failed — ${r.err}` };
    const d = r.data as { choices?: Array<{ message?: { content?: string } }> };
    const text = d.choices?.[0]?.message?.content?.slice(0, 160) ?? "";
    return { statusCode: 200, ok: true, message: `OpenAI: chat completed (${model}) — ${text || "(empty reply)"}`.slice(0, 240) };
  },

  "openai:list_assistants": async ({ integration }) => {
    const r = await fetchJson("https://api.openai.com/v1/assistants?limit=100", { headers: providerHeaders(integration, "openai") });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `OpenAI: list_assistants failed — ${r.err}` };
    const d = r.data as { data?: Array<{ id: string; name?: string; model?: string }> };
    const count = d.data?.length ?? 0;
    const names = (d.data ?? []).slice(0, 5).map((a) => a.name ?? a.id).join(", ");
    return {
      statusCode: 200,
      ok: true,
      message: `OpenAI: ${count} assistants found${names ? `; first: ${names.slice(0, 180)}` : ""}`.slice(0, 240),
    };
  },

  "anthropic:chat": async ({ integration, input }) => {
    const token = tokenOf(integration);
    if (!token) return { statusCode: 400, ok: false, message: "Anthropic: chat requires an API key" };
    const model = (input as Record<string, unknown>).model ?? cfgOf(integration).model ?? "claude-3-5-sonnet-20241022";
    const prompt = String((input as Record<string, unknown>).prompt ?? "Hello from N0VA1O");
    const r = await fetchPostJson("https://api.anthropic.com/v1/messages", integration, "anthropic", {
      model,
      max_tokens: 128,
      messages: [{ role: "user", content: prompt }],
    });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Anthropic: chat failed — ${r.err}` };
    const d = r.data as { content?: Array<{ text?: string }> };
    const text = d.content?.[0]?.text?.slice(0, 160) ?? "";
    return { statusCode: 200, ok: true, message: `Anthropic: chat completed (${model}) — ${text || "(empty reply)"}`.slice(0, 240) };
  },

  "gemini:chat": async ({ integration, input }) => {
    const token = tokenOf(integration);
    if (!token) return { statusCode: 400, ok: false, message: "Gemini: chat requires an API key" };
    const model = String((input as Record<string, unknown>).model ?? cfgOf(integration).model ?? "gemini-1.5-flash");
    const prompt = String((input as Record<string, unknown>).prompt ?? "Hello from N0VA1O");
    const r = await fetchPostJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(token)}`,
      integration,
      "gemini",
      { contents: [{ role: "user", parts: [{ text: prompt }] }] },
    );
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Gemini: chat failed — ${r.err}` };
    const d = r.data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 160) ?? "";
    return { statusCode: 200, ok: true, message: `Gemini: chat completed (${model}) — ${text || "(empty reply)"}`.slice(0, 240) };
  },
};
