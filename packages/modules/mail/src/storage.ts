/**
 * N0VA MAIL — Storage Engine
 *
 * Metadata store, blob storage, full-text search indexer,
 * deduplication engine, and caching layer.
 */

// ── Types ──────────────────────────────────────────────────

export interface BlobRef {
  key: string;
  bucket: string;
  sizeBytes: number;
  checksum: string;
  contentType: string;
  encryptionKeyId?: string;
  createdAt: Date;
}

export interface SearchDocument {
  id: string;
  messageId: string;
  threadId: string;
  subject: string;
  body: string;
  fromEmail: string;
  fromName: string;
  toEmails: string[];
  date: Date;
  hasAttachments: boolean;
  folder: string;
  labels: string[];
  workspaceId: string;
}

export interface SearchQuery {
  text?: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  folder?: string;
  labels?: string[];
  after?: Date;
  before?: Date;
  workspaceId: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  documents: SearchDocument[];
  total: number;
  facets: {
    senders: Array<{ value: string; count: number }>;
    folders: Array<{ value: string; count: number }>;
    dates: Array<{ value: string; count: number }>;
  };
}

export interface ThreadGroup {
  threadId: string;
  subject: string;
  participants: string[];
  messageCount: number;
  lastMessageAt: Date;
  folders: string[];
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// ── Blob Storage ──────────────────────────────────────────

export class BlobStorage {
  private bucket: string;
  private encryptionKey?: string;

  constructor(bucket: string, encryptionKey?: string) {
    this.bucket = bucket;
    this.encryptionKey = encryptionKey;
  }

  async put(key: string, data: Buffer | string, contentType: string): Promise<BlobRef> {
    const buffer = typeof data === "string" ? Buffer.from(data) : data;
    const checksum = await this.computeChecksum(buffer);

    return {
      key: `${this.bucket}/${key}`,
      bucket: this.bucket,
      sizeBytes: buffer.length,
      checksum,
      contentType,
      encryptionKeyId: this.encryptionKey,
      createdAt: new Date(),
    };
  }

  async get(key: string): Promise<Buffer> {
    return Buffer.alloc(0);
  }

  async delete(key: string): Promise<void> {
    // Delete from storage
  }

  async exists(key: string): Promise<boolean> {
    return false;
  }

  async getSignedUrl(key: string, expirySeconds: number = 3600): Promise<string> {
    return `https://blob.n0va.io/${key}?expiry=${expirySeconds}`;
  }

  private async computeChecksum(data: Buffer): Promise<string> {
    const crypto = await import("crypto");
    return crypto.createHash("sha256").update(data).digest("hex");
  }
}

// ── Deduplication Engine ──────────────────────────────────

export class DeduplicationEngine {
  private seenHashes: Map<string, BlobRef> = new Map();

  async dedup(data: Buffer, contentType: string): Promise<{ isDuplicate: boolean; ref?: BlobRef }> {
    const hash = await this.hash(data);
    const existing = this.seenHashes.get(hash);
    if (existing) {
      return { isDuplicate: true, ref: existing };
    }
    return { isDuplicate: false };
  }

  register(hash: string, ref: BlobRef): void {
    this.seenHashes.set(hash, ref);
  }

  async hash(data: Buffer): Promise<string> {
    const crypto = await import("crypto");
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  clear(): void {
    this.seenHashes.clear();
  }
}

// ── Full-Text Search Engine ──────────────────────────────

export class SearchEngine {
  private docs: Map<string, SearchDocument> = new Map();

  async index(doc: SearchDocument): Promise<void> {
    this.docs.set(doc.id, doc);
  }

  async remove(messageId: string): Promise<void> {
    this.docs.forEach((doc, key) => {
      if (doc.messageId === messageId) {
        this.docs.delete(key);
      }
    });
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    let docs = [...this.docs.values()].filter(d => d.workspaceId === query.workspaceId);

    if (query.text) {
      const lower = query.text.toLowerCase();
      docs = docs.filter(d =>
        d.subject.toLowerCase().includes(lower) ||
        d.body.toLowerCase().includes(lower) ||
        d.fromEmail.toLowerCase().includes(lower) ||
        d.fromName.toLowerCase().includes(lower)
      );
    }
    if (query.from) {
      docs = docs.filter(d => d.fromEmail.includes(query.from!) || d.fromName.includes(query.from!));
    }
    if (query.to) {
      docs = docs.filter(d => d.toEmails.some(e => e.includes(query.to!)));
    }
    if (query.subject) {
      docs = docs.filter(d => d.subject.toLowerCase().includes(query.subject!.toLowerCase()));
    }
    if (query.hasAttachment !== undefined) {
      docs = docs.filter(d => d.hasAttachments === query.hasAttachment);
    }
    if (query.folder) {
      docs = docs.filter(d => d.folder === query.folder);
    }
    if (query.labels && query.labels.length > 0) {
      docs = docs.filter(d => query.labels!.some(l => d.labels.includes(l)));
    }
    if (query.after) {
      docs = docs.filter(d => d.date >= query.after!);
    }
    if (query.before) {
      docs = docs.filter(d => d.date <= query.before!);
    }

    const total = docs.length;
    const offset = query.offset || 0;
    const limit = query.limit || 50;
    const paginated = docs.slice(offset, offset + limit);

    return {
      documents: paginated,
      total,
      facets: this.computeFacets(docs),
    };
  }

  async aggregateThreads(workspaceId: string): Promise<ThreadGroup[]> {
    const docs = [...this.docs.values()].filter(d => d.workspaceId === workspaceId);
    const threadMap = new Map<string, SearchDocument[]>();

    for (const doc of docs) {
      const t = threadMap.get(doc.threadId) || [];
      t.push(doc);
      threadMap.set(doc.threadId, t);
    }

    return [...threadMap.entries()].map(([threadId, messages]) => {
      const sorted = messages.sort((a, b) => b.date.getTime() - a.date.getTime());
      return {
        threadId,
        subject: sorted[0]?.subject || "(no subject)",
        participants: [...new Set(messages.flatMap(m => [m.fromEmail, ...m.toEmails]))],
        messageCount: messages.length,
        lastMessageAt: sorted[0]?.date || new Date(),
        folders: [...new Set(messages.map(m => m.folder))],
      };
    });
  }

  private computeFacets(docs: SearchDocument[]): SearchResult["facets"] {
    const senderCounts = new Map<string, number>();
    const folderCounts = new Map<string, number>();
    const dateCounts = new Map<string, number>();

    for (const doc of docs) {
      senderCounts.set(doc.fromEmail, (senderCounts.get(doc.fromEmail) || 0) + 1);
      folderCounts.set(doc.folder, (folderCounts.get(doc.folder) || 0) + 1);
      const dateKey = doc.date.toISOString().slice(0, 7);
      dateCounts.set(dateKey, (dateCounts.get(dateKey) || 0) + 1);
    }

    const toArray = (m: Map<string, number>) => [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count).slice(0, 10);

    return { senders: toArray(senderCounts), folders: toArray(folderCounts), dates: toArray(dateCounts) };
  }

  async reindex(docs: SearchDocument[]): Promise<void> {
    this.docs.clear();
    for (const doc of docs) {
      await this.index(doc);
    }
  }
}

// ── Cache Layer ───────────────────────────────────────────

export class CacheLayer {
  private store: Map<string, CacheEntry<unknown>> = new Map();
  private hitCount = 0;
  private missCount = 0;

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) { this.missCount++; return null; }
    if (Date.now() > entry.expiresAt) { this.store.delete(key); this.missCount++; return null; }
    this.hitCount++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number = 60000): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  getStats(): { hits: number; misses: number; hitRate: number; size: number } {
    const total = this.hitCount + this.missCount;
    return { hits: this.hitCount, misses: this.missCount, hitRate: total > 0 ? this.hitCount / total : 0, size: this.store.size };
  }

  // TTL-based rate limiting
  async checkRateLimit(key: string, maxRequests: number, windowMs: number): Promise<{ allowed: boolean; remaining: number }> {
    const cacheKey = `ratelimit:${key}`;
    const current = this.get<{ count: number; resetAt: number }>(cacheKey);
    const now = Date.now();

    if (!current || now > current.resetAt) {
      this.set(cacheKey, { count: 1, resetAt: now + windowMs }, windowMs);
      return { allowed: true, remaining: maxRequests - 1 };
    }

    if (current.count >= maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    this.set(cacheKey, { count: current.count + 1, resetAt: current.resetAt }, current.resetAt - now);
    return { allowed: true, remaining: maxRequests - current.count - 1 };
  }
}

// ── Unified Storage Facade ────────────────────────────────

export class StorageEngine {
  readonly blobs: BlobStorage;
  readonly dedup: DeduplicationEngine;
  readonly search: SearchEngine;
  readonly cache: CacheLayer;

  constructor(bucket: string = "n0va-mail") {
    this.blobs = new BlobStorage(bucket);
    this.dedup = new DeduplicationEngine();
    this.search = new SearchEngine();
    this.cache = new CacheLayer();
  }

  async storeMessage(messageId: string, rawMime: string, doc: SearchDocument): Promise<void> {
    await this.search.index(doc);
    this.cache.delete(`thread:${doc.threadId}`);
  }

  async removeMessage(messageId: string): Promise<void> {
    await this.search.remove(messageId);
  }

  async searchMessages(query: SearchQuery): Promise<SearchResult> {
    return this.search.search(query);
  }

  async getThreads(workspaceId: string): Promise<ThreadGroup[]> {
    const cached = this.cache.get<ThreadGroup[]>(`threads:${workspaceId}`);
    if (cached) return cached;
    const threads = await this.search.aggregateThreads(workspaceId);
    this.cache.set(`threads:${workspaceId}`, threads, 30000);
    return threads;
  }
}
