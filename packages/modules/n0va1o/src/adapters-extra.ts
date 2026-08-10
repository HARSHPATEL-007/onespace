/**
 * Extended connector adapters — production integrations.
 * Merged into the main ADAPTERS record at import time.
 */
import type { Integration } from "@n0va/db";
import type { AdapterContext, AdapterResult } from "./adapters";
import { cfgOf, tokenOf, providerHeaders, fetchJson, fetchPostJson } from "./adapters";

/* ---------- Stripe ---------- */

const stripe = {
  "stripe:list_customers": async ({ integration }: AdapterContext): Promise<AdapterResult> => {
    const r = await fetchJson("https://api.stripe.com/v1/customers?limit=10", { headers: providerHeaders(integration, "stripe") });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Stripe: list_customers failed — ${r.err}` };
    const d = r.data as { data?: Array<{ email?: string }> };
    return { statusCode: 200, ok: true, message: `Stripe: ${d.data?.length ?? 0} customers${d.data?.[0]?.email ? `; first: ${d.data[0].email}` : ""}`.slice(0, 240) };
  },
  "stripe:create_charge": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const amount = Number((input as Record<string, unknown>).amount ?? 0);
    const currency = String((input as Record<string, unknown>).currency ?? "usd");
    const customer = String((input as Record<string, unknown>).customer ?? "");
    if (!amount || amount <= 0) return { statusCode: 400, ok: false, message: "Stripe: create_charge requires amount > 0" };
    const params = new URLSearchParams({ amount: String(amount), currency });
    if (customer) params.set("customer", customer);
    const r = await fetchJson("https://api.stripe.com/v1/charges", { method: "POST", headers: { ...providerHeaders(integration, "stripe"), "content-type": "application/x-www-form-urlencoded" }, body: params.toString() });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Stripe: create_charge failed — ${r.err}` };
    const d = r.data as { id: string; amount: number; status: string };
    return { statusCode: 201, ok: true, message: `Stripe: charge ${d.id} — $${d.amount / 100} ${currency} (${d.status})` };
  },
};

/* ---------- GitLab ---------- */

const gitlab = {
  "gitlab:list_projects": async ({ integration }: AdapterContext): Promise<AdapterResult> => {
    const r = await fetchJson("https://gitlab.com/api/v4/projects?per_page=20&membership=true", { headers: providerHeaders(integration, "gitlab") });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `GitLab: list_projects failed — ${r.err}` };
    const d = r.data as Array<{ path_with_namespace?: string }>;
    return { statusCode: 200, ok: true, message: `GitLab: ${d?.length ?? 0} projects${d?.[0] ? `; first: ${d[0].path_with_namespace}` : ""}`.slice(0, 240) };
  },
  "gitlab:list_merge_requests": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const projectId = String((input as Record<string, unknown>).projectId ?? "");
    const state = String((input as Record<string, unknown>).state ?? "opened");
    const path = projectId ? `/projects/${encodeURIComponent(projectId)}/merge_requests` : "/merge_requests";
    const r = await fetchJson(`https://gitlab.com/api/v4${path}?state=${state}&per_page=20`, { headers: providerHeaders(integration, "gitlab") });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `GitLab: list_merge_requests failed — ${r.err}` };
    const d = r.data as Array<{ iid?: number; title?: string }>;
    return { statusCode: 200, ok: true, message: `GitLab: ${d?.length ?? 0} MRs (${state})${d?.[0] ? `; #${d[0].iid} ${d[0].title}` : ""}`.slice(0, 240) };
  },
};

/* ---------- Linear ---------- */

const linear = {
  "linear:list_issues": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const team = String((input as Record<string, unknown>).team ?? "");
    const filter = team ? `{"team":{"name":{"eq":"${team}"}}}` : "";
    const query = `query { issues(first: 20${filter ? `, filter: ${filter}` : ""}) { nodes { identifier title state { name } } } }`;
    const r = await fetchPostJson("https://api.linear.app/graphql", integration, "linear", { query });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Linear: list_issues failed — ${r.err}` };
    const d = r.data as { data?: { issues?: { nodes?: Array<{ identifier?: string; title?: string }> } } };
    const issues = d.data?.issues?.nodes ?? [];
    return { statusCode: 200, ok: true, message: `Linear: ${issues.length} issues${issues[0] ? `; first: ${issues[0].identifier} ${issues[0].title}` : ""}`.slice(0, 240) };
  },
  "linear:create_issue": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const title = String((input as Record<string, unknown>).title ?? "");
    const team = String((input as Record<string, unknown>).team ?? "");
    if (!title || !team) return { statusCode: 400, ok: false, message: "Linear: create_issue requires title and team" };
    const query = `mutation { issueCreate(input: { title: "${title}", teamId: "${team}" }) { success issue { identifier } } }`;
    const r = await fetchPostJson("https://api.linear.app/graphql", integration, "linear", { query });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Linear: create_issue failed — ${r.err}` };
    return { statusCode: 201, ok: true, message: "Linear: issue created" };
  },
};

/* ---------- ClickUp ---------- */

const clickup = {
  "clickup:list_tasks": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const listId = String((input as Record<string, unknown>).listId ?? "");
    if (!listId) return { statusCode: 400, ok: false, message: "ClickUp: list_tasks requires listId" };
    const r = await fetchJson(`https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task?archived=false`, { headers: providerHeaders(integration, "clickup") });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `ClickUp: list_tasks failed — ${r.err}` };
    const d = r.data as { tasks?: Array<{ name?: string; status?: { status?: string } }> };
    const tasks = d.tasks ?? [];
    return { statusCode: 200, ok: true, message: `ClickUp: ${tasks.length} tasks${tasks[0] ? `; first: ${tasks[0].name} (${tasks[0].status?.status})` : ""}`.slice(0, 240) };
  },
};

/* ---------- Jira ---------- */

const jira = {
  "jira:list_issues": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const jql = String((input as Record<string, unknown>).jql ?? "order by created DESC");
    const c = cfgOf(integration);
    const base = typeof c.baseUrl === "string" ? c.baseUrl.replace(/\/$/, "") : "";
    if (!base) return { statusCode: 400, ok: false, message: "Jira: list_issues requires baseUrl in config" };
    const r = await fetchJson(`${base}/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=20`, { headers: providerHeaders(integration, "jira") });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Jira: list_issues failed — ${r.err}` };
    const d = r.data as { issues?: Array<{ key?: string; fields?: { summary?: string } }> };
    const issues = d.issues ?? [];
    return { statusCode: 200, ok: true, message: `Jira: ${issues.length} issues${issues[0] ? `; first: ${issues[0].key} ${issues[0].fields?.summary}` : ""}`.slice(0, 240) };
  },
  "jira:create_issue": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const project = String((input as Record<string, unknown>).project ?? "");
    const summary = String((input as Record<string, unknown>).summary ?? "");
    const c = cfgOf(integration);
    const base = typeof c.baseUrl === "string" ? c.baseUrl.replace(/\/$/, "") : "";
    if (!base || !project || !summary) return { statusCode: 400, ok: false, message: "Jira: create_issue requires baseUrl, project, and summary" };
    const r = await fetchPostJson(`${base}/rest/api/2/issue`, integration, "jira", { fields: { project: { key: project }, summary, issuetype: { name: "Task" } } });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Jira: create_issue failed — ${r.err}` };
    const d = r.data as { key?: string; id?: string };
    return { statusCode: 201, ok: true, message: `Jira: created ${d.key ?? d.id}` };
  },
};

/* ---------- Discord ---------- */

const discord = {
  "discord:send_message": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const channel = String((input as Record<string, unknown>).channel ?? "");
    const content = String((input as Record<string, unknown>).content ?? "");
    if (!channel || !content) return { statusCode: 400, ok: false, message: "Discord: send_message requires channel and content" };
    const r = await fetchPostJson(`https://discord.com/api/v10/channels/${encodeURIComponent(channel)}/messages`, integration, "discord", { content });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Discord: send_message failed — ${r.err}` };
    const d = r.data as { id: string };
    return { statusCode: 200, ok: true, message: `Discord: message sent to channel ${channel} (${d.id.slice(-6)})` };
  },
};

/* ---------- Telegram ---------- */

const telegram = {
  "telegram:send_message": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const token = tokenOf(integration);
    const chat = String((input as Record<string, unknown>).chat ?? "");
    const text = String((input as Record<string, unknown>).text ?? "");
    if (!token || !chat || !text) return { statusCode: 400, ok: false, message: "Telegram: send_message requires token, chat, and text" };
    const r = await fetchPostJson(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, integration, "telegram", { chat_id: chat, text });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Telegram: send_message failed — ${r.err}` };
    const d = r.data as { ok?: boolean; result?: { message_id?: number } };
    return { statusCode: 200, ok: true, message: `Telegram: message sent (id: ${d.result?.message_id ?? "n/a"})` };
  },
};

/* ---------- HubSpot ---------- */

const hubspot = {
  "hubspot:list_contacts": async ({ integration }: AdapterContext): Promise<AdapterResult> => {
    const r = await fetchJson("https://api.hubapi.com/crm/v3/objects/contacts?limit=10&properties=email,firstname,lastname", { headers: providerHeaders(integration, "hubspot") });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `HubSpot: list_contacts failed — ${r.err}` };
    const d = r.data as { results?: Array<{ properties?: { email?: string } }> };
    const contacts = d.results ?? [];
    return { statusCode: 200, ok: true, message: `HubSpot: ${contacts.length} contacts${contacts[0] ? `; first: ${contacts[0].properties?.email}` : ""}`.slice(0, 240) };
  },
  "hubspot:create_contact": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const email = String((input as Record<string, unknown>).email ?? "");
    const firstname = String((input as Record<string, unknown>).firstname ?? "");
    if (!email) return { statusCode: 400, ok: false, message: "HubSpot: create_contact requires email" };
    const r = await fetchPostJson("https://api.hubapi.com/crm/v3/objects/contacts", integration, "hubspot", { properties: { email, firstname } });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `HubSpot: create_contact failed — ${r.err}` };
    const d = r.data as { id?: string };
    return { statusCode: 201, ok: true, message: `HubSpot: contact created (${d.id ?? "n/a"})` };
  },
};

/* ---------- Shopify ---------- */

const shopify = {
  "shopify:list_products": async ({ integration }: AdapterContext): Promise<AdapterResult> => {
    const c = cfgOf(integration);
    const shop = typeof c.shop === "string" ? c.shop.replace(/\/$/, "") : "";
    if (!shop) return { statusCode: 400, ok: false, message: "Shopify: list_products requires shop in config (e.g., myshop.myshopify.com)" };
    const r = await fetchJson(`https://${shop}/admin/api/2024-01/products.json?limit=10`, { headers: providerHeaders(integration, "shopify") });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Shopify: list_products failed — ${r.err}` };
    const d = r.data as { products?: Array<{ title?: string; id?: number }> };
    const products = d.products ?? [];
    return { statusCode: 200, ok: true, message: `Shopify: ${products.length} products${products[0] ? `; first: ${products[0].title}` : ""}`.slice(0, 240) };
  },
};

/* ---------- Zendesk ---------- */

const zendesk = {
  "zendesk:list_tickets": async ({ integration }: AdapterContext): Promise<AdapterResult> => {
    const c = cfgOf(integration);
    const base = typeof c.baseUrl === "string" ? c.baseUrl.replace(/\/$/, "") : "";
    if (!base) return { statusCode: 400, ok: false, message: "Zendesk: list_tickets requires baseUrl in config" };
    const r = await fetchJson(`${base}/api/v2/tickets.json?per_page=25`, { headers: providerHeaders(integration, "zendesk") });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Zendesk: list_tickets failed — ${r.err}` };
    const d = r.data as { tickets?: Array<{ id?: number; subject?: string; status?: string }> };
    const tickets = d.tickets ?? [];
    return { statusCode: 200, ok: true, message: `Zendesk: ${tickets.length} tickets${tickets[0] ? `; #${tickets[0].id} ${tickets[0].subject}` : ""}`.slice(0, 240) };
  },
};

/* ---------- Twilio ---------- */

const twilio = {
  "twilio:send_sms": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const c = cfgOf(integration);
    const accountSid = typeof c.accountSid === "string" ? c.accountSid : "";
    const token = tokenOf(integration);
    const to = String((input as Record<string, unknown>).to ?? "");
    const body = String((input as Record<string, unknown>).body ?? "");
    if (!accountSid || !token || !to || !body) return { statusCode: 400, ok: false, message: "Twilio: send_sms requires accountSid in config + token + to + body" };
    const r = await fetchJson(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, { method: "POST", headers: { authorization: `Basic ${Buffer.from(`${accountSid}:${token}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ to, body, from: String((input as Record<string, unknown>).from ?? "") }).toString() });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Twilio: send_sms failed — ${r.err}` };
    const d = r.data as { sid?: string; status?: string };
    return { statusCode: 201, ok: true, message: `Twilio: SMS sent (${d.sid ?? "n/a"}) — ${d.status ?? "queued"}` };
  },
};

/* ---------- SendGrid ---------- */

const sendgrid = {
  "sendgrid:send_email": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const to = String((input as Record<string, unknown>).to ?? "");
    const subject = String((input as Record<string, unknown>).subject ?? "");
    const text = String((input as Record<string, unknown>).text ?? "");
    if (!to || !subject) return { statusCode: 400, ok: false, message: "SendGrid: send_email requires to and subject" };
    const r = await fetchPostJson("https://api.sendgrid.com/v3/mail/send", integration, "sendgrid", { personalizations: [{ to: [{ email: to }] }], from: { email: String((input as Record<string, unknown>).from ?? "noreply@n0va.io") }, subject, content: [{ type: "text/plain", value: text }] });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `SendGrid: send_email failed — ${r.err}` };
    return { statusCode: 202, ok: true, message: `SendGrid: email sent to ${to} — "${subject}"` };
  },
};

/* ---------- Calendly ---------- */

const calendly = {
  "calendly:list_events": async ({ integration }: AdapterContext): Promise<AdapterResult> => {
    const r = await fetchJson("https://api.calendly.com/scheduled_events?status=active&count=10", { headers: providerHeaders(integration, "calendly") });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Calendly: list_events failed — ${r.err}` };
    const d = r.data as { collection?: Array<{ name?: string; start_time?: string }> };
    const events = d.collection ?? [];
    return { statusCode: 200, ok: true, message: `Calendly: ${events.length} upcoming events${events[0] ? `; next: ${events[0].name} at ${events[0].start_time}` : ""}`.slice(0, 240) };
  },
};

/* ---------- Cal.com ---------- */

const cal = {
  "cal:list_bookings": async ({ integration }: AdapterContext): Promise<AdapterResult> => {
    const r = await fetchJson("https://api.cal.com/v1/bookings?status=accepted&take=10", { headers: providerHeaders(integration, "cal") });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Cal.com: list_bookings failed — ${r.err}` };
    const d = r.data as { bookings?: Array<{ id?: number; title?: string }> };
    const bookings = d.bookings ?? [];
    return { statusCode: 200, ok: true, message: `Cal.com: ${bookings.length} bookings${bookings[0] ? `; next: ${bookings[0].title}` : ""}`.slice(0, 240) };
  },
};

/* ---------- Resend ---------- */

const resend = {
  "resend:send_email": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const to = String((input as Record<string, unknown>).to ?? "");
    const subject = String((input as Record<string, unknown>).subject ?? "");
    const html = String((input as Record<string, unknown>).html ?? "");
    if (!to || !subject) return { statusCode: 400, ok: false, message: "Resend: send_email requires to and subject" };
    const r = await fetchPostJson("https://api.resend.com/emails", integration, "resend", { from: String((input as Record<string, unknown>).from ?? "N0VA1O <onboarding@resend.dev>"), to: [to], subject, html: html || `<p>${subject}</p>` });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Resend: send_email failed — ${r.err}` };
    const d = r.data as { id?: string };
    return { statusCode: 200, ok: true, message: `Resend: email sent to ${to} (${d.id ?? "n/a"})` };
  },
};

/* ---------- AI: Anthropic extra ---------- */

const anthropicExtra = {
  "anthropic:count_tokens": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const text = String((input as Record<string, unknown>).text ?? "");
    if (!text) return { statusCode: 400, ok: false, message: "Anthropic: count_tokens requires text" };
    const r = await fetchPostJson("https://api.anthropic.com/v1/messages/count_tokens", integration, "anthropic", { model: "claude-3-5-sonnet-20241022", messages: [{ role: "user", content: text }] });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Anthropic: count_tokens failed — ${r.err}` };
    const d = r.data as { input_tokens?: number };
    return { statusCode: 200, ok: true, message: `Anthropic: ${d.input_tokens ?? 0} input tokens` };
  },
};

/* ---------- AI: OpenAI extra ---------- */

const openaiExtra = {
  "openai:generate_image": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const prompt = String((input as Record<string, unknown>).prompt ?? "");
    if (!prompt) return { statusCode: 400, ok: false, message: "OpenAI: generate_image requires prompt" };
    const r = await fetchPostJson("https://api.openai.com/v1/images/generations", integration, "openai", { prompt, n: 1, size: "512x512" });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `OpenAI: generate_image failed — ${r.err}` };
    const d = r.data as { data?: Array<{ url?: string }> };
    return { statusCode: 200, ok: true, message: `OpenAI: image generated — ${d.data?.[0]?.url?.slice(0, 100) ?? "n/a"}...` };
  },
};

/* ---------- AI: Other providers ---------- */

const aiExtra = {
  "mistral:chat": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const prompt = String((input as Record<string, unknown>).prompt ?? "Hello");
    const r = await fetchPostJson("https://api.mistral.ai/v1/chat/completions", integration, "mistral", { model: "mistral-small-latest", messages: [{ role: "user", content: prompt }], max_tokens: 128 });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Mistral: chat failed — ${r.err}` };
    const d = r.data as { choices?: Array<{ message?: { content?: string } }> };
    return { statusCode: 200, ok: true, message: `Mistral: ${d.choices?.[0]?.message?.content?.slice(0, 160) ?? "(empty)"}` };
  },
  "deepseek:chat": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const prompt = String((input as Record<string, unknown>).prompt ?? "Hello");
    const r = await fetchPostJson("https://api.deepseek.com/v1/chat/completions", integration, "deepseek", { model: "deepseek-chat", messages: [{ role: "user", content: prompt }], max_tokens: 128 });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `DeepSeek: chat failed — ${r.err}` };
    const d = r.data as { choices?: Array<{ message?: { content?: string } }> };
    return { statusCode: 200, ok: true, message: `DeepSeek: ${d.choices?.[0]?.message?.content?.slice(0, 160) ?? "(empty)"}` };
  },
  "groq:chat": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const prompt = String((input as Record<string, unknown>).prompt ?? "Hello");
    const r = await fetchPostJson("https://api.groq.com/openai/v1/chat/completions", integration, "groq", { model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], max_tokens: 128 });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Groq: chat failed — ${r.err}` };
    const d = r.data as { choices?: Array<{ message?: { content?: string } }> };
    return { statusCode: 200, ok: true, message: `Groq: ${d.choices?.[0]?.message?.content?.slice(0, 160) ?? "(empty)"}` };
  },
  "huggingface:inference": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const prompt = String((input as Record<string, unknown>).prompt ?? "");
    const model = String((input as Record<string, unknown>).model ?? "meta-llama/Llama-3.1-8B-Instruct");
    if (!prompt) return { statusCode: 400, ok: false, message: "HuggingFace: inference requires prompt" };
    const r = await fetchPostJson(`https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`, integration, "huggingface", { inputs: prompt, parameters: { max_new_tokens: 128 } });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `HuggingFace: inference failed — ${r.err}` };
    const d = r.data as Array<{ generated_text?: string }> | { generated_text?: string };
    const text = Array.isArray(d) ? d[0]?.generated_text : (d as { generated_text?: string }).generated_text;
    return { statusCode: 200, ok: true, message: `HuggingFace (${model}): ${text?.slice(0, 160) ?? "(empty)"}` };
  },
  "replicate:run": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const model = String((input as Record<string, unknown>).model ?? "meta/meta-llama-3.1-405b-instruct");
    const prompt = String((input as Record<string, unknown>).prompt ?? "");
    if (!prompt) return { statusCode: 400, ok: false, message: "Replicate: run requires prompt" };
    const r = await fetchPostJson("https://api.replicate.com/v1/predictions", integration, "replicate", { version: "latest", input: { prompt, max_tokens: 128 } });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Replicate: run failed — ${r.err}` };
    const d = r.data as { id?: string; status?: string };
    return { statusCode: 201, ok: true, message: `Replicate: prediction started (${d.id ?? "n/a"}) — ${d.status ?? "starting"}` };
  },
  "openrouter:chat": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const prompt = String((input as Record<string, unknown>).prompt ?? "Hello");
    const r = await fetchPostJson("https://openrouter.ai/api/v1/chat/completions", integration, "openrouter", { model: "google/gemini-2.0-flash-001", messages: [{ role: "user", content: prompt }], max_tokens: 128 });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `OpenRouter: chat failed — ${r.err}` };
    const d = r.data as { choices?: Array<{ message?: { content?: string } }> };
    return { statusCode: 200, ok: true, message: `OpenRouter: ${d.choices?.[0]?.message?.content?.slice(0, 160) ?? "(empty)"}` };
  },
  "tavily:search": async ({ integration, input }: AdapterContext): Promise<AdapterResult> => {
    const query = String((input as Record<string, unknown>).query ?? "");
    if (!query) return { statusCode: 400, ok: false, message: "Tavily: search requires query" };
    const r = await fetchPostJson("https://api.tavily.com/search", integration, "tavily", { query, max_results: 5, include_answer: true });
    if (!r.ok) return { statusCode: r.status, ok: false, message: `Tavily: search failed — ${r.err}` };
    const d = r.data as { answer?: string; results?: Array<{ title?: string }> };
    const answer = d.answer ? d.answer.slice(0, 100) : "";
    return { statusCode: 200, ok: true, message: `Tavily: ${d.results?.length ?? 0} results${answer ? ` — ${answer}` : ""}`.slice(0, 240) };
  },
};

export const EXTRA_ADAPTERS: Record<string, (ctx: AdapterContext) => Promise<AdapterResult>> = {
  ...stripe, ...gitlab, ...linear, ...clickup, ...jira, ...discord, ...telegram,
  ...hubspot, ...shopify, ...zendesk, ...twilio, ...sendgrid, ...calendly, ...cal,
  ...resend, ...anthropicExtra, ...openaiExtra, ...aiExtra,
};
