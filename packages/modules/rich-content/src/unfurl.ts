export interface UnfurlResult {
  url: string;
  title: string;
  description: string;
  imageUrl: string | null;
  siteName: string;
  favicon: string | null;
  type: "web" | "document" | "file" | "product" | "n0va_object";
  metadata: Record<string, string>;
  cachedAt: number;
  expiresAt: number;
}

const CACHE = new Map<string, UnfurlResult>();
const CACHE_TTL = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 500;

const BLOCKED_DOMAINS = ["localhost", "127.0.0.1", "0.0.0.0", "10.", "192.168."];

export async function unfurlUrl(url: string): Promise<UnfurlResult | null> {
  const cached = CACHE.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached;

  try {
    const parsed = new URL(url);
    if (BLOCKED_DOMAINS.some(d => parsed.hostname.startsWith(d) || parsed.hostname === d)) {
      return null;
    }

    const result = await fetchMetadata(url, parsed);

    if (CACHE.size >= MAX_CACHE_SIZE) {
      const oldest = CACHE.keys().next().value;
      if (oldest) CACHE.delete(oldest);
    }
    CACHE.set(url, result);
    return result;
  } catch {
    return null;
  }
}

async function fetchMetadata(url: string, parsed: URL): Promise<UnfurlResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "N0VA-Bot/1.0 (+https://n0va.ai/bot)", "Accept": "text/html,application/json" },
    });

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const data = await response.json() as Record<string, unknown>;
      return {
        url, title: (data.title as string) ?? data.name as string ?? parsed.hostname,
        description: (data.description as string) ?? data.body as string ?? "",
        imageUrl: null, siteName: parsed.hostname, favicon: null, type: "web",
        metadata: flattenMetadata(data), cachedAt: Date.now(), expiresAt: Date.now() + CACHE_TTL,
      };
    }

    if (contentType.startsWith("image/")) {
      return {
        url, title: parsed.pathname.split("/").pop() ?? "Image", description: "",
        imageUrl: url, siteName: parsed.hostname, favicon: null, type: "file",
        metadata: { contentType }, cachedAt: Date.now(), expiresAt: Date.now() + CACHE_TTL,
      };
    }

    const html = await response.text();
    const og = parseOpenGraph(html);

    return {
      url, title: og.title || parsed.hostname,
      description: og.description || "",
      imageUrl: og.image || null,
      siteName: og.siteName || parsed.hostname,
      favicon: og.favicon || null,
      type: detectContentType(parsed, og),
      metadata: (og as Record<string, string>).metadata ? {} : {},
      cachedAt: Date.now(),
      expiresAt: Date.now() + CACHE_TTL,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseOpenGraph(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const ogFields = ["og:title", "og:description", "og:image", "og:site_name", "og:type", "twitter:title", "twitter:description", "twitter:image", "description", "title"];

  for (const field of ogFields) {
    const patterns = [
      new RegExp(`<meta[^>]+property=["']${field}["'][^>]+content=["']([^"']*)["']`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${field}["']`, "i"),
      new RegExp(`<meta[^>]+name=["']${field}["'][^>]+content=["']([^"']*)["']`, "i"),
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const key = field.replace("og:", "").replace("twitter:", "");
        if (!meta[key]) meta[key] = match[1];
        break;
      }
    }
  }

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch?.[1] && !meta.title) meta.title = titleMatch[1];

  const faviconMatch = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']*)["']/i);
  if (faviconMatch?.[1]) meta.favicon = faviconMatch[1];

  return meta;
}

function detectContentType(parsed: URL, og: Record<string, string>): UnfurlResult["type"] {
  if (parsed.hostname.includes("docs.google") || parsed.hostname.includes("notion")) return "document";
  if (parsed.hostname.includes("figma") || parsed.hostname.includes("dropbox")) return "file";
  if (og.type?.includes("product") || parsed.hostname.includes("shopify")) return "product";
  if (parsed.hostname.includes("n0va.ai")) return "n0va_object";
  return "web";
}

function flattenMetadata(data: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") result[key] = value;
    else if (typeof value === "number" || typeof value === "boolean") result[key] = String(value);
  }
  return result;
}

export function clearCache(): void {
  CACHE.clear();
}

export function getCacheSize(): number {
  return CACHE.size;
}
