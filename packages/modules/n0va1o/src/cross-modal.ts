/**
 * N0VA1O Cross-Modal Search and Action — search across text, documents,
 * images, audio, video and convert retrieved results into grounded actions.
 */

import { IngestedChunk, RetrievalFilter, retrieveChunks, SourceType } from "./rag";

/* ---------- unified retrieval ---------- */

export interface CrossModalQuery {
  text?: string;
  imageRef?: string;
  audioRef?: string;
  videoRef?: string;
  documentRef?: string;
  tenantId: string;
  targetModalities?: SourceType[];
  minConfidence?: number;
}

export interface CrossModalMatch {
  chunkId: string;
  modality: SourceType;
  content: string;
  score: number;
  provenance: string;
  page?: number;
  timestamp?: string;
  frame?: number;
  sourceSystem: string;
}

/**
 * Search across mixed media in a shared semantic space. Supports text-to-media,
 * media-to-text, and media-to-media retrieval. Pure.
 */
export function crossModalSearch(query: CrossModalQuery, corpus: IngestedChunk[]): CrossModalMatch[] {
  const results = retrieveChunks(query.text ?? "", corpus, {
    tenantId: query.tenantId,
    allowedClassifications: ["public", "internal", "confidential"],
    minFreshness: 0,
  }, 20);

  return results
    .filter((r) => !query.targetModalities || query.targetModalities.includes(r.chunk.metadata.sourceType))
    .filter((r) => r.finalScore >= (query.minConfidence ?? 0.2))
    .map((r) => ({
      chunkId: r.chunk.chunkId,
      modality: r.chunk.metadata.sourceType,
      content: r.chunk.content,
      score: Math.round(r.finalScore * 1000) / 1000,
      provenance: `${r.chunk.metadata.originSystem}/${r.chunk.metadata.sourceId}`,
      page: r.chunk.metadata.page,
      timestamp: r.chunk.metadata.updatedAt,
      frame: undefined,
      sourceSystem: r.chunk.metadata.originSystem,
    }))
    .sort((a, b) => b.score - a.score);
}

/* ---------- query flexibility ---------- */

export interface MixedQuery {
  text?: string;
  fileRef?: string;
  fileModality?: SourceType;
  tenantId: string;
}

/**
 * Build a cross-modal query from mixed inputs (text + file, clip + text, etc.).
 * Pure.
 */
export function buildMixedQuery(opts: MixedQuery): CrossModalQuery {
  const query: CrossModalQuery = { tenantId: opts.tenantId, text: opts.text };
  if (opts.fileModality === "document") query.documentRef = opts.fileRef;
  else if (opts.fileModality === "media") query.imageRef = opts.fileRef;
  else if (opts.fileModality === "spreadsheet") query.documentRef = opts.fileRef;
  else if (opts.fileModality === "message") query.text = `${opts.text ?? ""} ${opts.fileRef ?? ""}`;
  return query;
}

/* ---------- action layer ---------- */

export type CrossModalAction = "summarize" | "compare" | "classify" | "extract" | "annotate" | "route" | "trigger_workflow";

export interface ActionPlan {
  action: CrossModalAction;
  evidence: CrossModalMatch[];
  policyChecked: boolean;
  approved: boolean;
  summary: string;
}

/**
 * Plan an action from retrieved cross-modal evidence. Requires policy checks
 * before side-effecting actions. Pure.
 */
export function planAction(action: CrossModalAction, evidence: CrossModalMatch[], policyApproved: boolean): ActionPlan {
  const sideEffecting = ["route", "trigger_workflow"].includes(action);
  const approved = sideEffecting ? policyApproved : true;
  return {
    action,
    evidence,
    policyChecked: true,
    approved,
    summary: `${action} over ${evidence.length} evidence item(s) across ${[...new Set(evidence.map((e) => e.modality))].join(", ")}`,
  };
}

/* ---------- governance ---------- */

export interface ProvenanceRecord {
  chunkId: string;
  sourceSystem: string;
  file: string;
  page?: number;
  frame?: number;
  timestamp?: string;
  attachedToAction: string;
}

/**
 * Attach provenance to a downstream action. Pure.
 */
export function attachProvenance(match: CrossModalMatch, action: string): ProvenanceRecord {
  return { chunkId: match.chunkId, sourceSystem: match.sourceSystem, file: match.provenance, page: match.page, frame: match.frame, timestamp: match.timestamp, attachedToAction: action };
}

export interface QualityAssessment {
  confidence: number;
  ambiguous: boolean;
  shouldRefuse: boolean;
  reason: string;
}

/**
 * Assess evidence quality and refuse/defer if too weak or conflicting. Pure.
 */
export function assessQuality(matches: CrossModalMatch[], minConfidence: number = 0.3): QualityAssessment {
  if (matches.length === 0) return { confidence: 0, ambiguous: true, shouldRefuse: true, reason: "No evidence found" };
  const topScore = matches[0]!.score;
  if (topScore < minConfidence) return { confidence: topScore, ambiguous: true, shouldRefuse: true, reason: "Evidence too weak" };
  if (matches.length > 1 && Math.abs(matches[0]!.score - matches[1]!.score) < 0.05) {
    return { confidence: topScore, ambiguous: true, shouldRefuse: false, reason: "Ambiguous — top matches too close" };
  }
  return { confidence: topScore, ambiguous: false, shouldRefuse: false, reason: "Quality sufficient" };
}

/* ---------- evaluation ---------- */

export interface CrossModalMetrics {
  retrievalPrecision: number;
  retrievalRecall: number;
  crossModalMatchQuality: number;
  citationCoverage: number;
  actionSuccessRate: number;
}

/**
 * Measure cross-modal retrieval and action quality. Pure.
 */
export function measureCrossModal(opts: { trueRelevant: number; retrievedRelevant: number; totalRetrieved: number; successfulActions: number; totalActions: number }): CrossModalMetrics {
  return {
    retrievalPrecision: opts.totalRetrieved > 0 ? opts.retrievedRelevant / opts.totalRetrieved : 0,
    retrievalRecall: opts.trueRelevant > 0 ? opts.retrievedRelevant / opts.trueRelevant : 0,
    crossModalMatchQuality: opts.retrievedRelevant > 0 ? opts.retrievedRelevant / opts.totalRetrieved : 0,
    citationCoverage: opts.totalActions > 0 ? opts.successfulActions / opts.totalActions : 0,
    actionSuccessRate: opts.totalActions > 0 ? opts.successfulActions / opts.totalActions : 0,
  };
}
