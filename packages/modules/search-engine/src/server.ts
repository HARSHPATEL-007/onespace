import { prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "search";

export interface SearchFilters {
  contentType?: string;
  roomId?: string;
  senderId?: string;
  from?: string;
  in?: string;
  before?: string;
  after?: string;
  has?: string[];
  sentiment?: "positive" | "negative" | "neutral";
  language?: string;
  reaction?: string;
  is?: string[];
  keyword?: string;
  owner?: string;
  threadId?: string;
  workspaceId?: string;
  limit?: number;
  offset?: number;
  queryType?: "natural" | "keyword" | "semantic" | "hybrid" | "operator";
}

export interface SearchResult {
  id: string;
  contentType: string;
  contentId: string;
  title: string;
  excerpt: string;
  score: number;
  lexicalScore: number;
  semanticScore: number;
  highlights: string[];
  metadata: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  matchReason: string;
  createdAt: string;
}

export class SearchEngine {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for search`);
    }
  }

  async search(query: string, filters: SearchFilters = {}): Promise<SearchResult[]> {
    await this.assert("READ");

    const startTime = Date.now();
    const limit = filters.limit ?? 20;

    const hasOperators = this.hasOperatorFilters(filters);
    const queryType = filters.queryType || (hasOperators ? "operator" : query.length > 20 ? "natural" : "hybrid");

    let lexicalResults: SearchResult[] = [];
    let semanticResults: SearchResult[] = [];

    if (queryType === "keyword" || queryType === "operator" || queryType === "hybrid") {
      lexicalResults = await this.lexicalSearch(query, filters);
    }

    if (queryType === "semantic" || queryType === "natural" || queryType === "hybrid") {
      semanticResults = await this.semanticSearch(query, filters);
    }

    const merged = this.hybridFusion(lexicalResults, semanticResults);
    const reranked = await this.rerank(query, merged);
    const filtered = await this.applyPermissionFilter(reranked);

    const results = filtered.slice(0, limit);

    const latencyMs = Date.now() - startTime;
    await prisma.searchQueryLog.create({
      data: { workspaceId: this.workspaceId, userId: this.userId, query, queryType: queryType as any, filters: filters as any, resultCount: results.length, topScore: results[0]?.score ?? 0, latencyMs },
    });

    return results;
  }

  private hasOperatorFilters(filters: SearchFilters): boolean {
    return !!(filters.from || filters.in || filters.before || filters.after || filters.has?.length || filters.sentiment || filters.keyword || filters.owner || filters.threadId);
  }

  private async lexicalSearch(query: string, filters: SearchFilters): Promise<SearchResult[]> {
    const where: any = { workspaceId: filters.workspaceId ?? this.workspaceId };

    if (query) {
      where.OR = [
        { title: { contains: query, mode: "insensitive" } },
        { body: { contains: query, mode: "insensitive" } },
      ];
    }

    if (filters.contentType) where.contentType = filters.contentType;
    if (filters.roomId) where.metadata = { path: ["roomId"], equals: filters.roomId };
    if (filters.threadId) where.metadata = { ...where.metadata, path: ["threadId"], equals: filters.threadId };

    const items = await prisma.searchIndex.findMany({ where, take: 100 });

    return items.map(item => {
      let score = this.computeLexicalScore(item, query);
      if (filters.keyword && item.body.toLowerCase().includes(filters.keyword.toLowerCase())) score += 0.3;

      return {
        id: item.id, contentType: item.contentType, contentId: item.contentId,
        title: item.title, excerpt: this.generateExcerpt(item.body, query),
        score, lexicalScore: score, semanticScore: 0,
        highlights: this.extractHighlights(item.body, query),
        metadata: item.metadata as any,
        matchReason: this.generateMatchReason(item, query, filters),
        createdAt: item.indexedAt.toISOString(),
      };
    });
  }

  private async semanticSearch(query: string, filters: SearchFilters): Promise<SearchResult[]> {
    const queryEmbedding = await this.generateEmbedding(query);

    const where: any = { workspaceId: filters.workspaceId ?? this.workspaceId, embedding: { not: "" } };
    if (filters.contentType) where.contentType = filters.contentType;

    const items = await prisma.searchIndex.findMany({ where, take: 200 });

    return items.map(item => {
      const itemEmbedding = this.parseEmbedding(item.embedding);
      const similarity = this.cosineSimilarity(queryEmbedding, itemEmbedding);

      return {
        id: item.id, contentType: item.contentType, contentId: item.contentId,
        title: item.title, excerpt: item.excerpt || item.body.slice(0, 200),
        score: similarity, lexicalScore: 0, semanticScore: similarity,
        highlights: [] as string[],
        metadata: item.metadata as any,
        matchReason: `Semantic match (${(similarity * 100).toFixed(0)}% similarity)`,
        createdAt: item.indexedAt.toISOString(),
      };
    });
  }

  private hybridFusion(lexical: SearchResult[], semantic: SearchResult[]): SearchResult[] {
    const scoreMap = new Map<string, SearchResult>();

    for (const result of lexical) {
      scoreMap.set(result.id, { ...result, score: result.score * 0.4 });
    }

    for (const result of semantic) {
      const existing = scoreMap.get(result.id);
      if (existing) {
        existing.score += result.score * 0.6;
        existing.semanticScore = result.semanticScore;
        existing.semanticScore = result.semanticScore;
      } else {
        scoreMap.set(result.id, { ...result, score: result.score * 0.6 });
      }
    }

    return [...scoreMap.values()].sort((a, b) => b.score - a.score);
  }

  private async rerank(query: string, candidates: SearchResult[]): Promise<SearchResult[]> {
    const topCandidates = candidates.slice(0, 50);

    return topCandidates.map(item => {
      let boost = 0;
      if (item.title.toLowerCase().includes(query.toLowerCase())) boost += 0.2;
      if (item.contentType === "DECISION") boost += 0.15;
      if (item.contentType === "THREAD") boost += 0.1;
      if (item.contentType === "ACTION_ITEM") boost += 0.1;

      return { ...item, score: Math.min(1, item.score + boost) };
    }).sort((a, b) => b.score - a.score);
  }

  private async applyPermissionFilter(results: SearchResult[]): Promise<SearchResult[]> {
    return results.filter(item => {
      const perms = item.permissions as Record<string, unknown> | undefined;
      if (!perms) return true;
      if (perms.visibility === "PRIVATE" && perms.ownerId !== this.userId) return false;
      if (perms.allowedRoles && !(perms.allowedRoles as string[]).includes(this.role)) return false;
      return true;
    });
  }

  async indexContent(data: { contentType: string; contentId: string; title: string; body: string; metadata?: Record<string, unknown>; permissions?: Record<string, unknown> }): Promise<void> {
    await this.assert("CREATE");
    const embedding = await this.generateEmbedding(data.title + " " + data.body);
    const excerpt = data.body.slice(0, 200);
    const entities = this.extractEntities(data.body);

    await prisma.searchIndex.upsert({
      where: { workspaceId_contentType_contentId: { workspaceId: this.workspaceId, contentType: data.contentType as any, contentId: data.contentId } },
      create: { workspaceId: this.workspaceId, contentType: data.contentType as any, contentId: data.contentId, title: data.title, body: data.body, excerpt, embedding: JSON.stringify(embedding), lexicalVector: data.body.toLowerCase(), entities: entities as any, metadata: (data.metadata ?? {}) as any, permissions: (data.permissions ?? {}) as any },
      update: { title: data.title, body: data.body, excerpt, embedding: JSON.stringify(embedding), lexicalVector: data.body.toLowerCase(), entities: entities as any, metadata: (data.metadata ?? {}) as any, permissions: (data.permissions ?? {}) as any },
    });
  }

  async getSuggestions(query: string, limit = 5): Promise<string[]> {
    await this.assert("READ");
    const suggestions = await prisma.searchSuggestion.findMany({
      where: { workspaceId: this.workspaceId, query: { startsWith: query, mode: "insensitive" } },
      orderBy: [{ score: "desc" }, { usageCount: "desc" }],
      take: limit,
    });
    return suggestions.map(s => s.suggestion);
  }

  async getRecentQueries(limit = 10): Promise<Array<{ query: string; resultCount: number; createdAt: string }>> {
    await this.assert("READ");
    const logs = await prisma.searchQueryLog.findMany({ where: { workspaceId: this.workspaceId, userId: this.userId }, orderBy: { createdAt: "desc" }, take: limit });
    return logs.map(l => ({ query: l.query, resultCount: l.resultCount, createdAt: l.createdAt.toISOString() }));
  }

  private computeLexicalScore(item: { title: string; body: string }, query: string): number {
    const q = query.toLowerCase();
    const title = item.title.toLowerCase();
    const body = item.body.toLowerCase();

    let score = 0;
    if (title.includes(q)) score += 0.5;
    if (body.includes(q)) score += 0.3;

    const queryTerms = q.split(/\s+/);
    const matchedTerms = queryTerms.filter(t => body.includes(t)).length;
    score += (matchedTerms / Math.max(queryTerms.length, 1)) * 0.2;

    return Math.min(1, score);
  }

  private generateEmbedding(text: string): number[] {
    const hash = this.hashString(text);
    const embedding: number[] = [];
    for (let i = 0; i < 8; i++) {
      embedding.push(((hash >> (i * 8)) & 0xFF) / 255);
    }
    return embedding;
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private parseEmbedding(embeddingStr: string): number[] {
    try { return JSON.parse(embeddingStr); } catch { return []; }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; normA += a[i]! * a[i]!; normB += b[i]! * b[i]!; }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private extractEntities(text: string): string[] {
    const entities: string[] = [];
    const mentions = text.match(/@\w+/g);
    if (mentions) entities.push(...mentions);
    const urls = text.match(/https?:\/\/[^\s]+/g);
    if (urls) entities.push(...urls);
    const emails = text.match(/[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/g);
    if (emails) entities.push(...emails);
    return [...new Set(entities)];
  }

  private extractHighlights(text: string, query: string): string[] {
    const highlights: string[] = [];
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let idx = lowerText.indexOf(lowerQuery);
    while (idx !== -1 && highlights.length < 3) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(text.length, idx + query.length + 30);
      highlights.push((start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : ""));
      idx = lowerText.indexOf(lowerQuery, idx + query.length);
    }
    return highlights;
  }

  private generateExcerpt(text: string, query: string): string {
    const lowerText = text.toLowerCase();
    const idx = lowerText.indexOf(query.toLowerCase());
    if (idx === -1) return text.slice(0, 200);
    const start = Math.max(0, idx - 50);
    return (start > 0 ? "..." : "") + text.slice(start, Math.min(text.length, start + 200));
  }

  private generateMatchReason(item: { title: string; contentType: string; body: string }, query: string, filters: SearchFilters): string {
    if (filters.from && item.body.includes(filters.from)) return `From: ${filters.from}`;
    if (filters.keyword && item.body.toLowerCase().includes(filters.keyword.toLowerCase())) return `Contains: ${filters.keyword}`;
    if (item.title.toLowerCase().includes(query.toLowerCase())) return `Title match: ${query}`;
    if (item.body.toLowerCase().includes(query.toLowerCase())) return `Body match: ${query}`;
    return `Content type: ${item.contentType}`;
  }
}
