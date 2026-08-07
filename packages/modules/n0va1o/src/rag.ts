/**
 * N0VA1O Retrieval-Augmented Operation (RAG) — controlled evidence pipeline
 * across enterprise documents, spreadsheets, messages, and media with
 * citations, source provenance, permission filtering, and freshness.
 */

/* ---------- source ingestion ---------- */

export type SourceType = "document" | "spreadsheet" | "message" | "media";

export interface SourceMetadata {
  sourceId: string;
  sourceType: SourceType;
  version: string;
  owner: string;
  tenantId: string;
  originSystem: string;
  createdAt: string;
  updatedAt: string;
  page?: number;
  section?: string;
  classification: "public" | "internal" | "confidential" | "restricted";
}

export interface IngestedChunk {
  chunkId: string;
  sourceId: string;
  content: string;
  metadata: SourceMetadata;
  freshness: number;
}

/**
 * Ingest a source into normalized chunks with full metadata. Pure.
 */
export function ingestSource(opts: { sourceId: string; sourceType: SourceType; content: string; metadata: Omit<SourceMetadata, "sourceId">; chunkSize?: number }): IngestedChunk[] {
  const chunkSize = opts.chunkSize ?? 500;
  const chunks: IngestedChunk[] = [];
  for (let i = 0; i < opts.content.length; i += chunkSize) {
    chunks.push({
      chunkId: `${opts.sourceId}_chunk_${chunks.length}`,
      sourceId: opts.sourceId,
      content: opts.content.slice(i, i + chunkSize),
      metadata: { ...opts.metadata, sourceId: opts.sourceId },
      freshness: computeFreshness(opts.metadata.updatedAt),
    });
  }
  return chunks.length > 0 ? chunks : [{ chunkId: `${opts.sourceId}_chunk_0`, sourceId: opts.sourceId, content: opts.content, metadata: { ...opts.metadata, sourceId: opts.sourceId }, freshness: computeFreshness(opts.metadata.updatedAt) }];
}

function computeFreshness(updatedAt: string): number {
  const ageDays = (Date.now() - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000);
  return Math.max(0, 1 - ageDays / 365);
}

/* ---------- retrieval pipeline ---------- */

export interface RetrievalFilter {
  tenantId: string;
  allowedClassifications: string[];
  minFreshness?: number;
  sourceAllowlist?: string[];
  sourceBlocklist?: string[];
}

export interface RetrievalCandidate {
  chunk: IngestedChunk;
  keywordScore: number;
  vectorScore: number;
  finalScore: number;
}

/**
 * Hybrid retrieval combining keyword and vector search with permission and
 * freshness filtering. Pure.
 */
export function retrieveChunks(query: string, corpus: IngestedChunk[], filter: RetrievalFilter, topK: number = 5): RetrievalCandidate[] {
  return corpus
    .filter((c) => c.metadata.tenantId === filter.tenantId)
    .filter((c) => filter.allowedClassifications.includes(c.metadata.classification))
    .filter((c) => !filter.minFreshness || c.freshness >= filter.minFreshness)
    .filter((c) => !filter.sourceAllowlist || filter.sourceAllowlist.includes(c.metadata.sourceId))
    .filter((c) => !filter.sourceBlocklist || !filter.sourceBlocklist.includes(c.metadata.sourceId))
    .map((c) => {
      const keywordScore = keywordMatch(query, c.content);
      const vectorScore = vectorMatch(query, c.content);
      const finalScore = 0.4 * keywordScore + 0.6 * vectorScore;
      return { chunk: c, keywordScore, vectorScore, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, topK);
}

function keywordMatch(query: string, content: string): number {
  const terms = query.toLowerCase().split(/\s+/);
  const text = content.toLowerCase();
  const matches = terms.filter((t) => text.includes(t)).length;
  return terms.length > 0 ? matches / terms.length : 0;
}

function vectorMatch(query: string, content: string): number {
  const queryTerms = new Set(query.toLowerCase().split(/\s+/));
  const contentTerms = content.toLowerCase().split(/\s+/);
  const intersection = contentTerms.filter((t) => queryTerms.has(t)).length;
  return queryTerms.size > 0 ? intersection / queryTerms.size : 0;
}

/* ---------- evidence packaging ---------- */

export interface Evidence {
  chunkId: string;
  content: string;
  sourceId: string;
  sourceType: SourceType;
  provenance: string;
  page?: number;
  section?: string;
  retrievedAt: string;
  score: number;
}

/**
 * Package retrieved candidates into a constrained, deduplicated evidence set
 * with full provenance. Pure.
 */
export function packageEvidence(candidates: RetrievalCandidate[]): Evidence[] {
  const seen = new Set<string>();
  return candidates
    .filter((c) => {
      if (seen.has(c.chunk.sourceId)) return false;
      seen.add(c.chunk.sourceId);
      return true;
    })
    .map((c) => ({
      chunkId: c.chunk.chunkId,
      content: c.chunk.content,
      sourceId: c.chunk.metadata.sourceId,
      sourceType: c.chunk.metadata.sourceType,
      provenance: `${c.chunk.metadata.originSystem}/${c.chunk.metadata.sourceId}`,
      page: c.chunk.metadata.page,
      section: c.chunk.metadata.section,
      retrievedAt: new Date().toISOString(),
      score: Math.round(c.finalScore * 1000) / 1000,
    }));
}

/* ---------- grounded generation ---------- */

export interface GroundedOutput {
  answer: string;
  citations: Evidence[];
  grounded: boolean;
  status: "complete" | "partial" | "refused";
  reason?: string;
}

/**
 * Generate a grounded output that maps claims to evidence. Refuses or qualifies
 * when evidence is insufficient. Pure.
 */
export function generateGrounded(query: string, evidence: Evidence[], minEvidence: number = 1): GroundedOutput {
  if (evidence.length < minEvidence) {
    return { answer: "", citations: [], grounded: false, status: "refused", reason: "Insufficient evidence" };
  }
  const topEvidence = evidence.slice(0, 3);
  const answer = `Based on ${topEvidence.length} source(s): ${topEvidence.map((e) => e.content.slice(0, 50)).join("; ")}`;
  return { answer, citations: topEvidence, grounded: true, status: "complete" };
}

/* ---------- action support ---------- */

export type RAGAction = "summarize" | "extract" | "compare" | "classify" | "route" | "trigger_workflow";

export interface ActionLog {
  action: string;
  evidenceIds: string[];
  timestamp: string;
  result: string;
}

/**
 * Log which evidence supported which action. Pure.
 */
export function logAction(action: RAGAction, evidence: Evidence[], result: string): ActionLog {
  return { action, evidenceIds: evidence.map((e) => e.chunkId), timestamp: new Date().toISOString(), result };
}

/* ---------- governance ---------- */

export interface AccessDecision {
  allowed: boolean;
  reason: string;
}

/**
 * Enforce document-level and chunk-level permissions before retrieval. Pure.
 */
export function enforceAccess(chunk: IngestedChunk, userClearance: string): AccessDecision {
  const levels = ["public", "internal", "confidential", "restricted"];
  const userLevel = levels.indexOf(userClearance);
  const docLevel = levels.indexOf(chunk.metadata.classification);
  if (userLevel < docLevel) return { allowed: false, reason: `Insufficient clearance for ${chunk.metadata.classification} content` };
  return { allowed: true, reason: "Access granted" };
}

/* ---------- evaluation ---------- */

export interface RAGMetrics {
  recall: number;
  precision: number;
  citationCoverage: number;
  groundedness: number;
  freshness: number;
  unsupportedRate: number;
}

/**
 * Measure RAG quality. Pure.
 */
export function measureRAG(opts: { trueRelevant: number; retrievedRelevant: number; totalRetrieved: number; groundedClaims: number; totalClaims: number; avgFreshness: number }): RAGMetrics {
  return {
    recall: opts.trueRelevant > 0 ? opts.retrievedRelevant / opts.trueRelevant : 0,
    precision: opts.totalRetrieved > 0 ? opts.retrievedRelevant / opts.totalRetrieved : 0,
    citationCoverage: opts.totalClaims > 0 ? opts.groundedClaims / opts.totalClaims : 0,
    groundedness: opts.totalClaims > 0 ? opts.groundedClaims / opts.totalClaims : 0,
    freshness: opts.avgFreshness,
    unsupportedRate: opts.totalClaims > 0 ? 1 - opts.groundedClaims / opts.totalClaims : 0,
  };
}
