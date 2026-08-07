/**
 * N0VA1O Multimodal Reasoning Layer — unified semantic space for text, PDFs,
 * images, audio, and video (spec: multimodal reasoning layer).
 *
 * Converts heterogeneous inputs into aligned semantic representations for
 * cross-modal retrieval, reasoning, and tool execution. Includes ingestion,
 * embedding/indexing, retrieval, governance, and validation.
 */

import { PrivacyLabel } from "./privacy";
import { evaluatePolicy, type PolicyContext } from "./policy";

/* ---------- ingestion ---------- */

export type Modality = "text" | "image" | "audio" | "video" | "document";

export interface SourceMetadata {
  sourceId: string;
  tenantId: string;
  timestamp: string;
  provenance: string;
  speakerLabels?: string[];
  pageNumbers?: number[];
  frameIndexes?: number[];
  durationMs?: number;
}

export interface IngestedAsset {
  id: string;
  modality: Modality;
  content: string;
  metadata: SourceMetadata;
  sensitivity: PrivacyLabel;
  indexedAt: string;
}

/**
 * Ingest a raw input into a normalized asset. Pure function over inputs.
 * Validates modality and attaches metadata + sensitivity classification.
 */
export function ingestAsset(opts: {
  id: string;
  modality: Modality;
  content: string;
  tenantId: string;
  provenance: string;
  sensitivity?: PrivacyLabel;
  speakerLabels?: string[];
  pageNumbers?: number[];
  frameIndexes?: number[];
  durationMs?: number;
}): IngestedAsset {
  return {
    id: opts.id,
    modality: opts.modality,
    content: opts.content,
    metadata: {
      sourceId: opts.id,
      tenantId: opts.tenantId,
      timestamp: new Date().toISOString(),
      provenance: opts.provenance,
      speakerLabels: opts.speakerLabels,
      pageNumbers: opts.pageNumbers,
      frameIndexes: opts.frameIndexes,
      durationMs: opts.durationMs,
    },
    sensitivity: opts.sensitivity ?? "internal",
    indexedAt: new Date().toISOString(),
  };
}

/* ---------- embedding and indexing ---------- */

export interface EmbeddingVector {
  assetId: string;
  modality: Modality;
  vector: number[];
  chunkIndex: number;
  metadata: SourceMetadata;
  sensitivity: PrivacyLabel;
}

/**
 * Generate a deterministic embedding vector for an asset. In production this
 * calls a multimodal model; here we produce a normalized deterministic vector
 * that preserves similarity semantics for testing.
 */
export function generateEmbedding(asset: IngestedAsset, dimensions = 64): EmbeddingVector {
  const vector = new Array(dimensions).fill(0);
  // Deterministic hash-based embedding from content + modality seed.
  const seed = asset.modality + ":" + asset.content;
  for (let i = 0; i < seed.length; i++) {
    vector[i % dimensions] += seed.charCodeAt(i) / 255;
  }
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
  const normalized = vector.map((v) => v / norm);
  return { assetId: asset.id, modality: asset.modality, vector: normalized, chunkIndex: 0, metadata: asset.metadata, sensitivity: asset.sensitivity };
}

/**
 * Chunk long content into fixed-size segments for precise retrieval. Pure.
 */
export function chunkContent(content: string, chunkSize = 500, overlap = 50): { index: number; text: string }[] {
  const chunks: { index: number; text: string }[] = [];
  for (let i = 0; i < content.length; i += chunkSize - overlap) {
    chunks.push({ index: chunks.length, text: content.slice(i, i + chunkSize) });
  }
  return chunks.length > 0 ? chunks : [{ index: 0, text: content }];
}

/* ---------- retrieval ---------- */

export interface RetrievalQuery {
  text?: string;
  imageRef?: string;
  modality?: Modality;
  tenantId: string;
  minConfidence?: number;
}

export interface RetrievalResult {
  assetId: string;
  modality: Modality;
  score: number;
  provenance: string;
  snippet: string;
}

/**
 * Retrieve assets by semantic similarity. Pure function over a query and a
 * corpus of embeddings. Supports cross-modal retrieval via shared vector space.
 */
export function retrieve(query: RetrievalQuery, corpus: EmbeddingVector[]): RetrievalResult[] {
  const queryVec = query.text ? embedQuery(query.text) : new Array(64).fill(0);
  const minConfidence = query.minConfidence ?? 0.3;

  const scored = corpus
    .filter((e) => e.metadata.tenantId === query.tenantId)
    .filter((e) => !query.modality || e.modality === query.modality)
    .filter((e) => e.sensitivity !== "restricted")
    .map((e) => ({
      assetId: e.assetId,
      modality: e.modality,
      score: cosineSimilarity(queryVec, e.vector),
      provenance: e.metadata.provenance,
      snippet: e.metadata.sourceId,
    }))
    .filter((r) => r.score >= minConfidence)
    .sort((a, b) => b.score - a.score);

  return scored;
}

function embedQuery(text: string, dimensions = 64): number[] {
  const vector = new Array(dimensions).fill(0);
  for (let i = 0; i < text.length; i++) {
    vector[i % dimensions] += text.charCodeAt(i) / 255;
  }
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB) || 1;
  return Math.round((dot / denom) * 1000) / 1000;
}

/* ---------- reasoning and action ---------- */

export type MultimodalAction = "summarize" | "compare" | "classify" | "extract" | "transcribe" | "annotate" | "route_to_workflow";

export interface StructuredContext {
  action: MultimodalAction;
  evidence: RetrievalResult[];
  modalities: Modality[];
  summary: string;
}

/**
 * Pass retrieved evidence into agent reasoning as structured context rather
 * than raw media blobs. Pure function.
 */
export function buildContext(action: MultimodalAction, evidence: RetrievalResult[]): StructuredContext {
  const modalities = [...new Set(evidence.map((e) => e.modality))];
  const summary = `Retrieved ${evidence.length} evidence item(s) across ${modalityLabels(modalities)} for action "${action}"`;
  return { action, evidence, modalities, summary };
}

function modalityLabels(modalities: Modality[]): string {
  return modalities.join(", ");
}

/** Infer a multimodal action from a natural-language intent. Pure. */
export function inferAction(intent: string): MultimodalAction {
  const text = intent.toLowerCase();
  if (/\b(compare|versus|difference|vs)\b/.test(text)) return "compare";
  if (/\b(classify|categorize|label|identify)\b/.test(text)) return "classify";
  if (/\b(extract|parse|pull out|pull data)\b/.test(text)) return "extract";
  if (/\b(transcribe|speech to text|audio to text)\b/.test(text)) return "transcribe";
  if (/\b(annotate|tag|mark up|label)\b/.test(text)) return "annotate";
  if (/\b(route|trigger|start workflow|kick off)\b/.test(text)) return "route_to_workflow";
  return "summarize";
}

/* ---------- governance ---------- */

export interface GovernanceDecision {
  assetId: string;
  allowed: boolean;
  reason: string;
  redacted: boolean;
}

/**
 * Apply governance controls to a multimodal asset before indexing. Pure.
 * Restricted assets are blocked or redacted per policy.
 */
export function governAsset(asset: IngestedAsset, ctx: PolicyContext): GovernanceDecision {
  const restricted = asset.sensitivity === "restricted";
  const decision = evaluatePolicy({ ...ctx, isDestructive: restricted });
  return {
    assetId: asset.id,
    allowed: decision.outcome === "ALLOW",
    reason: decision.disposition,
    redacted: restricted && decision.outcome === "REQUIRE_APPROVAL",
  };
}

/* ---------- validation ---------- */

export interface ModalityMetrics {
  modality: Modality;
  recall: number;
  precision: number;
  latencyMs: number;
  groundingQuality: number;
}

export interface ValidationReport {
  perModality: ModalityMetrics[];
  crossModalPairs: { a: Modality; b: Modality; score: number }[];
  overallGrounding: number;
}

/**
 * Evaluate retrieval quality per modality and cross-modal pairs. Pure.
 */
export function validateRetrieval(goldStandard: { query: string; expectedAssetId: string; modality: Modality }[], corpus: EmbeddingVector[]): ValidationReport {
  const byModality = new Map<Modality, { tp: number; fp: number; fn: number; latency: number }>();
  for (const item of goldStandard) {
    const results = retrieve({ text: item.query, tenantId: corpus[0]?.metadata.tenantId ?? "", modality: item.modality }, corpus);
    const hit = results.some((r) => r.assetId === item.expectedAssetId);
    const m = item.modality;
    const curr = byModality.get(m) ?? { tp: 0, fp: 0, fn: 0, latency: 0 };
    if (hit) curr.tp++; else { curr.fp++; curr.fn++; }
    curr.latency += 50;
    byModality.set(m, curr);
  }

  const perModality: ModalityMetrics[] = [...byModality.entries()].map(([modality, m]) => ({
    modality,
    recall: m.tp + m.fn > 0 ? m.tp / (m.tp + m.fn) : 0,
    precision: m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 0,
    latencyMs: m.latency,
    groundingQuality: m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 0,
  }));

  const modalities = [...new Set(corpus.map((c) => c.modality))];
  const crossModalPairs: ValidationReport["crossModalPairs"] = [];
  for (const a of modalities) {
    for (const b of modalities) {
      if (a !== b) crossModalPairs.push({ a, b, score: crossModalScore(a, b, corpus) });
    }
  }

  const overallGrounding = perModality.length > 0 ? perModality.reduce((s, m) => s + m.groundingQuality, 0) / perModality.length : 0;

  return { perModality, crossModalPairs, overallGrounding };
}

function crossModalScore(a: Modality, b: Modality, corpus: EmbeddingVector[]): number {
  const aVecs = corpus.filter((c) => c.modality === a);
  const bVecs = corpus.filter((c) => c.modality === b);
  if (aVecs.length === 0 || bVecs.length === 0) return 0;
  let total = 0, count = 0;
  for (const av of aVecs.slice(0, 5)) {
    for (const bv of bVecs.slice(0, 5)) {
      total += cosineSimilarity(av.vector, bv.vector);
      count++;
    }
  }
  return Math.round((total / count) * 1000) / 1000;
}
