/**
 * N0VA1O Multi-Modal Memory System — cross-modal storage & retrieval (spec §31).
 *
 * Hierarchical memory tiers: Sensory Buffer → Working Memory → Episodic Memory →
 * Semantic Memory → Procedural Memory → Collective Memory. Each tier has
 * different persistence, retrieval, and access patterns.
 */

export type MemoryTier = "sensory" | "working" | "episodic" | "semantic" | "procedural" | "collective";

export type Modality = "text" | "image" | "audio" | "video" | "structured" | "multimodal";

export interface MemoryEntry {
  id: string;
  sessionId: string;
  workspaceId: string;
  tier: MemoryTier;
  modality: Modality;
  content: unknown;
  embedding: Float32Array | number[];
  metadata: Record<string, unknown>;
  sensitivity: "public" | "internal" | "confidential" | "restricted";
  createdAt: string;
  expiresAt?: string;
  replayable: boolean;
  sourceRef?: string;
}

export interface StoreResult {
  entryId: string;
  tier: MemoryTier;
  tokensUsed: number;
}

export interface RetrieveResult {
  entry: MemoryEntry;
  score: number;
  relevance: number;
}

export interface MemoryStats {
  perTier: Record<MemoryTier, { count: number; tokens: number; bytes: number }>;
  totalEntries: number;
  totalTokens: number;
}

export interface ConsolidationResult {
  consolidated: number;
  evicted: number;
  promotions: number;
}

/** Tier capacity limits in tokens. */
export const TIER_CAPACITY: Record<MemoryTier, number> = {
  sensory: 128_000,
  working: 4_000_000,
  episodic: 1_000_000_000,
  semantic: 100_000_000_000,
  procedural: Infinity,
  collective: Infinity,
};

/** TTL in milliseconds per tier for automatic expiration. */
export const TIER_TTL: Record<MemoryTier, number> = {
  sensory: 60_000,
  working: 30 * 60_000,
  episodic: 90 * 24 * 60 * 60_000,
  semantic: 2 * 365 * 24 * 60 * 60_000,
  procedural: Infinity,
  collective: Infinity,
};

/**
 * Store a memory entry across the appropriate tier.
 * Sensory and Working tiers are in-memory (volatile); Episodic and Semantic
 * would persist to vector DB in production.
 */
export function storeEntry(entry: Omit<MemoryEntry, "id" | "createdAt"> & { id?: string }): StoreResult {
  const id = entry.id ?? `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const ttl = TIER_TTL[entry.tier];
  const expiresAt = entry.expiresAt ?? (ttl === Infinity ? undefined : new Date(Date.now() + ttl).toISOString());

  const tokens = estimateTokens(entry.content);
  const entrySize: StoreResult = { entryId: id, tier: entry.tier, tokensUsed: tokens };

  MEMORY_STORE.set(id, { ...entry, id, createdAt: now, expiresAt, replayable: entry.replayable !== false });
  MEMORY_INDEX.add(entry.tier, id, tokens);

  return entrySize;
}

/**
 * Retrieve entries from a specific tier by vector similarity.
 */
export function retrieveEntries(
  queryEmbedding: Float32Array | number[],
  opts: { tier: MemoryTier; limit?: number; minRelevance?: number; sessionId?: string },
): RetrieveResult[] {
  const now = Date.now();
  const results: RetrieveResult[] = [];

  for (const [id, entry] of MEMORY_STORE) {
    if (entry.tier !== opts.tier) continue;
    if (entry.expiresAt && Date.parse(entry.expiresAt) < now) continue;
    if (opts.sessionId && entry.sessionId !== opts.sessionId) continue;

    const score = cosineSimilarity(entry.embedding, queryEmbedding);
    if (score < (opts.minRelevance ?? 0)) continue;

    results.push({ entry, score, relevance: score });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, opts.limit ?? 10);
}

/**
 * Retrieve from all tiers with hierarchical fallback.
 */
export function retrieveHyperContext(
  queryEmbedding: Float32Array | number[],
  opts: { limit?: number; sessionId?: string },
): RetrieveResult[] {
  const tiers: MemoryTier[] = ["sensory", "working", "episodic", "semantic", "procedural", "collective"];
  const results: RetrieveResult[] = [];

  for (const tier of tiers) {
    const tierResults = retrieveEntries(queryEmbedding, {
      tier,
      limit: opts.limit ?? 5,
      minRelevance: 0.3,
      sessionId: opts.sessionId,
    });
    results.push(...tierResults);
    if (results.length >= (opts.limit ?? 10)) break;
  }

  return results.sort((a, b) => b.score - a.score).slice(0, opts.limit ?? 10);
}

/**
 * Consolidate from lower tiers to higher tiers (e.g., episodic → semantic).
 * Evicts expired entries and applies forgetting curves.
 */
export function consolidateMemory(workspaceId: string): ConsolidationResult {
  let consolidated = 0;
  let evicted = 0;
  const promotions = 0;
  const now = Date.now();

  for (const [id, entry] of MEMORY_STORE) {
    if (entry.workspaceId !== workspaceId) continue;

    if (entry.expiresAt && Date.parse(entry.expiresAt) < now) {
      MEMORY_STORE.delete(id);
      MEMORY_INDEX.remove(entry.tier, id);
      evicted++;
      continue;
    }

    if (entry.tier === "episodic" && entry.replayable) {
      storeEntry({
        tier: "semantic",
        sessionId: entry.sessionId,
        workspaceId: entry.workspaceId,
        modality: entry.modality,
        content: entry.content,
        embedding: entry.embedding,
        metadata: { ...entry.metadata, archived: true },
        sensitivity: entry.sensitivity,
        replayable: false,
        sourceRef: id,
      });
      consolidated++;
    }
  }

  return { consolidated, evicted, promotions };
}

/**
 * Get memory statistics per tier.
 */
export function getMemoryStats(workspaceId?: string): MemoryStats {
  const perTier: Record<MemoryTier, { count: number; tokens: number; bytes: number }> = {
    sensory: { count: 0, tokens: 0, bytes: 0 },
    working: { count: 0, tokens: 0, bytes: 0 },
    episodic: { count: 0, tokens: 0, bytes: 0 },
    semantic: { count: 0, tokens: 0, bytes: 0 },
    procedural: { count: 0, tokens: 0, bytes: 0 },
    collective: { count: 0, tokens: 0, bytes: 0 },
  };

  for (const entry of MEMORY_STORE.values()) {
    if (workspaceId && entry.workspaceId !== workspaceId) continue;
    const stats = perTier[entry.tier];
    stats.count++;
    stats.tokens += estimateTokens(entry.content);
    stats.bytes += JSON.stringify(entry.content).length;
  }

  return {
    perTier,
    totalEntries: Object.values(perTier).reduce((sum, s) => sum + s.count, 0),
    totalTokens: Object.values(perTier).reduce((sum, s) => sum + s.tokens, 0),
  };
}

/**
 * Check if a memory entry can be replayed (privacy check).
 */
export function canReplay(entry: MemoryEntry): boolean {
  if (!entry.replayable) return false;
  if (entry.sensitivity === "restricted") return false;
  if (entry.sensitivity === "confidential") return false;
  if (entry.expiresAt && Date.parse(entry.expiresAt) < Date.now()) return false;
  return true;
}

/**
 * Apply retention policy — separate ephemeral (auto-expire) from durable.
 */
export function applyRetention(entries: MemoryEntry[], retention: Record<MemoryTier, number>): { ephemeral: MemoryEntry[]; durable: MemoryEntry[] } {
  const now = Date.now();
  const ephemeral: MemoryEntry[] = [];
  const durable: MemoryEntry[] = [];

  for (const entry of entries) {
    const ttl = retention[entry.tier];
    if (ttl === Infinity || (entry.expiresAt && Date.parse(entry.expiresAt) >= now)) {
      if (entry.sensitivity !== "restricted") {
        durable.push(entry);
      }
    } else if (entry.expiresAt && Date.parse(entry.expiresAt) >= now) {
      ephemeral.push(entry);
    }
  }

  return { ephemeral, durable };
}

function estimateTokens(content: unknown): number {
  return Math.ceil(JSON.stringify(content ?? "").length / 4);
}

function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    magA += (a[i] ?? 0) ** 2;
    magB += (b[i] ?? 0) ** 2;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

class MemoryIndex {
  private byTier = new Map<MemoryTier, Set<string>>();
  private tokenCount = new Map<MemoryTier, number>();

  add(tier: MemoryTier, id: string, tokens: number): void {
    if (!this.byTier.has(tier)) this.byTier.set(tier, new Set());
    this.byTier.get(tier)!.add(id);
    this.tokenCount.set(tier, (this.tokenCount.get(tier) ?? 0) + tokens);
  }

  remove(tier: MemoryTier, id: string): void {
    this.byTier.get(tier)?.delete(id);
  }

  has(tier: MemoryTier, id: string): boolean {
    return this.byTier.get(tier)?.has(id) ?? false;
  }

  tokensInTier(tier: MemoryTier): number {
    return this.tokenCount.get(tier) ?? 0;
  }
}

const MEMORY_STORE = new Map<string, MemoryEntry>();
const MEMORY_INDEX = new MemoryIndex();
