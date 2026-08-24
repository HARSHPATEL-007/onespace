/**
 * Unfurl Service — server-side link metadata fetching, OG/custom tags, cache
 * Only initial HTML, no script execution. Permission-aware via security.ts.
 */

import { getCachedPreview, setCachedPreview, makePreviewRecord, type PreviewCacheRecord } from "./cache";
import { canUnfurl, logPreviewAccess } from "./security";
import { prisma } from "@n0va/db";

const FETCH_TIMEOUT_MS = 3500;
const MAX_HTML_BYTES = 400 * 1024; // 400KB
const USER_AGENT = "N0VA-Unfurl/1.0 (+https://n0va.local/bot)";

export interface UnfurlOptions {
  workspaceId: string;
  userId: string;
  role: import("@n0va/authz").Role;
  channelId?: string;
  messageId?: string;
  actorName?: string;
  forceRefresh?: boolean;
}

export interface UnfurlResult extends PreviewCacheRecord {
  collapsed: boolean; // UX rule: collapse low-value
}

function extractMeta(html: string, url: string): { title: string | null; description: string | null; imageUrl: string | null; siteName: string | null } {
  const pick = (re: RegExp): string | null => {
    const m = re.exec(html);
    return m?.[1] ? decodeEntities(m[1].trim().slice(0, 500)) : null;
  };
  // Prefer OG
  const ogTitle = pick(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i) ?? pick(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i);
  const ogDesc = pick(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i) ?? pick(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:description["'][^>]*>/i);
  const ogImage = pick(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ?? pick(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i);
  const ogSite = pick(/<meta[^>]+property=["']og:site_name["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const twTitle = pick(/<meta[^>]+name=["']twitter:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const twDesc = pick(/<meta[^>]+name=["']twitter:description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const twImage = pick(/<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const titleTag = pick(/<title[^>]*>([^<]+)<\/title>/i);

  // N0VA custom preview tags (prefer over OG if present for internal)
  const n0vaTitle = pick(/<meta[^>]+name=["']n0va:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  const n0vaDesc = pick(/<meta[^>]+name=["']n0va:description["'][^>]*content=["']([^"']+)["'][^>]*>/i);

  let image = ogImage ?? twImage ?? null;
  if (image && image.startsWith("/")) {
    try { image = new URL(image, url).toString(); } catch { /* keep as is */ }
  }

  return {
    title: n0vaTitle ?? ogTitle ?? twTitle ?? titleTag,
    description: n0vaDesc ?? ogDesc ?? twDesc,
    imageUrl: image,
    siteName: ogSite,
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

async function fetchHtml(url: string): Promise<{ html: string; etag: string | null; status: number } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok || !res.headers.get("content-type")?.includes("text/html")) return null;
    const buf = await res.arrayBuffer();
    const slice = buf.slice(0, MAX_HTML_BYTES);
    const html = new TextDecoder().decode(slice);
    // Only server-rendered head — ignore scripts
    const head = html.slice(0, 80_000); // head is early
    return { html: head, etag: res.headers.get("etag"), status: res.status };
  } catch {
    clearTimeout(t);
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Public API
export async function unfurlUrl(url: string, opts: UnfurlOptions): Promise<UnfurlResult | null> {
  // Relative N0VA links are handled by adapters, not here
  if (url.startsWith("/m/")) return null;

  const kind = "og";
  const policy = await canUnfurl({ workspaceId: opts.workspaceId, userId: opts.userId, role: opts.role, url, kind });
  if (!policy.allowed) {
    await logPreviewAccess({ workspaceId: opts.workspaceId, actorId: opts.userId, actorName: opts.actorName, url, kind, channelId: opts.channelId, messageId: opts.messageId, allowed: false, reason: policy.reason });
    return null;
  }

  if (!opts.forceRefresh) {
    const cached = await getCachedPreview(opts.workspaceId, url);
    if (cached) {
      await logPreviewAccess({ workspaceId: opts.workspaceId, actorId: opts.userId, actorName: opts.actorName, url, kind: cached.kind, channelId: opts.channelId, messageId: opts.messageId, allowed: true });
      return { ...cached, collapsed: false } as UnfurlResult;
    }
  }

  // Try N0VA1O gateway for external fetch first (rate-limit mediation, audit, token control)
  // For generic web, look for a workspace connector that can proxy web fetches; fallback to direct fetch with gateway audit
  let fetched: { html: string; etag: string | null; status: number } | null = null;
  try {
    const domain = new URL(url).hostname;
    const connector = await prisma.integration.findFirst({
      where: { workspaceId: opts.workspaceId, provider: { in: ["web", "generic", "jigsawstack", "exa"] } },
    });
    if (connector) {
      const { chatGatewayCall } = await import("../n0va1o/bridge");
      const gw = await chatGatewayCall({
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        connectorId: connector.id,
        provider: connector.provider,
        action: "unfurl",
        input: { url },
        messageId: opts.messageId,
        channelId: opts.channelId,
      });
      if (gw.ok && (gw.data as Record<string, unknown>)?.html) {
        const d = gw.data as Record<string, unknown>;
        fetched = { html: String(d.html).slice(0, 80_000), etag: (d.etag as string | null) ?? null, status: (d.status as number) ?? 200 };
      }
    }
  } catch {}
  if (!fetched) fetched = await fetchHtml(url);
  if (!fetched) return null;

  const meta = extractMeta(fetched.html, url);
  if (!meta.title && !meta.description) return null; // low-value, collapse

  const rec = makePreviewRecord(opts.workspaceId, url, kind, {
    title: meta.title,
    description: meta.description,
    imageUrl: meta.imageUrl,
    siteName: meta.siteName,
    structured: { fetchedStatus: fetched.status, via: "n0va1o" },
    etag: fetched.etag,
  });
  await setCachedPreview(rec);
  await logPreviewAccess({ workspaceId: opts.workspaceId, actorId: opts.userId, actorName: opts.actorName, url, kind, channelId: opts.channelId, messageId: opts.messageId, allowed: true });
  return { ...rec, collapsed: false };
}

export async function unfurlMany(urls: string[], opts: UnfurlOptions): Promise<UnfurlResult[]> {
  // One primary unfurl per UX rule, rest compact — cap at 3 external fetches per message
  const slice = urls.slice(0, 4);
  const results: UnfurlResult[] = [];
  for (const url of slice) {
    if (results.length >= 3) break;
    try {
      const r = await unfurlUrl(url, opts);
      if (r) results.push(r);
    } catch { /* per-url best-effort */ }
  }
  // UX: if >1, mark all but first as collapsed by default (expand on demand)
  return results.map((r, i) => ({ ...r, collapsed: i > 0 }));
}
