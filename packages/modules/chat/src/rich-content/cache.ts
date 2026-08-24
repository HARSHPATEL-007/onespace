/**
 * Preview Cache — TTL + refresh hooks, permission-aware
 * Backed by Prisma ChatUnfurlCache (migrated) with in-memory LRU fallback for same-process hits.
 */

import { prisma } from "@n0va/db";

const MEM_TTL_MS = 5 * 60_000;
const DEFAULT_TTL_MS = 30 * 60_000; // 30m external, 6h N0VA objects (policy layer may extend)

type CacheEntry<T> = { value: T; expiresAt: number; staleAt: number };

class LruTtl<K, V> {
  private map = new Map<K, CacheEntry<V>>();
  private max: number;
  constructor(max = 500) { this.max = max; }
  get(key: K): V | null {
    const e = this.map.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) { this.map.delete(key); return null; }
    // LRU bump
    this.map.delete(key); this.map.set(key, e);
    return e.value;
  }
  isStale(key: K): boolean {
    const e = this.map.get(key);
    return !!e && Date.now() > e.staleAt;
  }
  set(key: K, value: V, ttlMs: number) {
    if (this.map.size >= this.max) {
      const first = this.map.keys().next().value as K;
      this.map.delete(first);
    }
    const now = Date.now();
    this.map.set(key, { value, expiresAt: now + ttlMs, staleAt: now + Math.floor(ttlMs * 0.7) });
  }
  del(key: K) { this.map.delete(key); }
}

export interface PreviewCacheRecord {
  url: string;
  workspaceId: string;
  kind: string; // "og" | "n0va_doc" | "n0va_sheet" | "crm" | "github" | "jira" | "file"
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  structured: Record<string, unknown> | null; // adapter-specific fields
  fetchedAt: string;
  expiresAt: string;
  etag?: string | null;
  policyVersion?: number;
}

const mem = new LruTtl<string, PreviewCacheRecord>(800);

function cacheKey(workspaceId: string, url: string): string {
  return `${workspaceId}::${url}`;
}

function ttlFor(url: string, kind: string): number {
  if (kind.startsWith("n0va_") || kind === "crm" || kind === "file") return 6 * 60 * 60_000; // 6h internal, caller may refresh on change events
  if (kind === "github" || kind === "jira") return 10 * 60_000; // 10m external tickets/PRs
  return DEFAULT_TTL_MS;
}

// Try Prisma table if migrated, else fallback to memory-only.
// Table ChatUnfurlCache is optional for first deploy — code works without it.
async function readDb(workspaceId: string, url: string): Promise<PreviewCacheRecord | null> {
  try {
    const row = await prisma.chatUnfurlCache.findUnique({
      where: { workspaceId_url: { workspaceId, url } },
    });
    if (!row) return null;
    if (new Date(row.expiresAt).getTime() < Date.now()) return null;
    return {
      url: row.url,
      workspaceId: row.workspaceId,
      kind: row.kind,
      title: row.title,
      description: row.description,
      imageUrl: row.imageUrl,
      siteName: row.siteName,
      structured: row.structured as unknown as Record<string, unknown> | null,
      fetchedAt: new Date(row.fetchedAt).toISOString(),
      expiresAt: new Date(row.expiresAt).toISOString(),
      etag: row.etag,
    };
  } catch {
    return null;
  }
}

async function writeDb(rec: PreviewCacheRecord): Promise<void> {
  try {
    await prisma.chatUnfurlCache.upsert({
      where: { workspaceId_url: { workspaceId: rec.workspaceId, url: rec.url } },
      create: {
        workspaceId: rec.workspaceId,
        url: rec.url,
        kind: rec.kind,
        title: rec.title,
        description: rec.description,
        imageUrl: rec.imageUrl,
        siteName: rec.siteName,
        structured: rec.structured as unknown as object,
        fetchedAt: new Date(rec.fetchedAt),
        expiresAt: new Date(rec.expiresAt),
        etag: rec.etag ?? null,
      },
      update: {
        kind: rec.kind,
        title: rec.title,
        description: rec.description,
        imageUrl: rec.imageUrl,
        siteName: rec.siteName,
        structured: rec.structured as unknown as object,
        fetchedAt: new Date(rec.fetchedAt),
        expiresAt: new Date(rec.expiresAt),
        etag: rec.etag ?? null,
      },
    });
  } catch {
    // best-effort
  }
}

export async function getCachedPreview(workspaceId: string, url: string): Promise<PreviewCacheRecord | null> {
  const key = cacheKey(workspaceId, url);
  const hit = mem.get(key);
  if (hit) return hit;
  const db = await readDb(workspaceId, url);
  if (db) { mem.set(key, db, Math.max(1000, new Date(db.expiresAt).getTime() - Date.now())); return db; }
  return null;
}

export async function setCachedPreview(rec: PreviewCacheRecord): Promise<void> {
  const key = cacheKey(rec.workspaceId, rec.url);
  const ttl = Math.max(1000, new Date(rec.expiresAt).getTime() - Date.now());
  mem.set(key, rec, ttl);
  await writeDb(rec);
}

export function makePreviewRecord(
  workspaceId: string,
  url: string,
  kind: string,
  data: { title?: string | null; description?: string | null; imageUrl?: string | null; siteName?: string | null; structured?: Record<string, unknown> | null; etag?: string | null },
): PreviewCacheRecord {
  const ttl = ttlFor(url, kind);
  const now = new Date();
  return {
    workspaceId,
    url,
    kind,
    title: data.title ?? null,
    description: data.description ?? null,
    imageUrl: data.imageUrl ?? null,
    siteName: data.siteName ?? null,
    structured: data.structured ?? null,
    fetchedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
    etag: data.etag ?? null,
  };
}

export async function invalidateWorkspaceUrl(workspaceId: string, url: string): Promise<void> {
  mem.del(cacheKey(workspaceId, url));
  try {
    await prisma.chatUnfurlCache.deleteMany({ where: { workspaceId, url } });
  } catch {}
}

export async function invalidateByObjectId(workspaceId: string, objectType: string, objectId: string): Promise<number> {
  // Invalidate all cached previews that reference this objectId in structured.objectId
  // Best-effort scan of mem; DB sweep is optional (requires JSON query)
  let n = 0;
  for (const [k, entry] of (mem as unknown as { map: Map<string, CacheEntry<PreviewCacheRecord>> }).map.entries()) {
    if (k.startsWith(workspaceId + "::") && (entry.value.structured as Record<string, unknown> | null)?.objectId === objectId) {
      mem.del(k); n++;
    }
  }
  void objectType; // reserved for future scoped invalidation
  return n;
}

// Refresh hook: caller can pass a fetcher that re-unfurls and updates cache
export async function getOrRefresh<T extends PreviewCacheRecord>(
  workspaceId: string,
  url: string,
  fetcher: () => Promise<T | null>,
  opts: { force?: boolean } = {},
): Promise<T | null> {
  const cached = await getCachedPreview(workspaceId, url) as T | null;
  if (cached && !opts.force && !mem.isStale(cacheKey(workspaceId, url))) return cached;
  // Background refresh pattern: return stale while revalidating if we have stale
  if (cached && mem.isStale(cacheKey(workspaceId, url))) {
    // fire-and-forget refresh
    void fetcher().then((fresh) => { if (fresh) void setCachedPreview(fresh); }).catch(() => {});
    return cached;
  }
  const fresh = await fetcher();
  if (fresh) await setCachedPreview(fresh);
  return fresh ?? cached;
}
