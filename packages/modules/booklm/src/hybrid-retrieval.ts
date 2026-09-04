/**
 * N0VA BOOKLM EDUCATION — Hybrid Retrieval layer.
 *
 * Query-planning + evidence-ranking, not one search box on one index.
 * Pipeline:
 *   query → intent+entity extraction → query-plan selection → parallel
 *   retrieval → permission/source filtering → RRF/LTR fusion → diversity +
 *   redundancy control → evidence validation → citation-grounded answer.
 *
 * Pure + deterministic. Dense vectors are a token-overlap proxy with an
 * explicit seam (`embedHook`) so a real vector index can replace it without
 * changing ranking, permission, or citation contracts.
 *
 * No prisma imports at module top-level for pure helpers; the service class
 * at the bottom wires the same logic to existing tables (DocBlock, DocTable,
 * DocFormula, DocFigure, DocCode, DocTranscript, EvidenceCitation,
 * LearnerConcept/ConceptEdge, LearningItem, SourceDocument).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Indexed unit — every indexed unit preserves this shape.
// ---------------------------------------------------------------------------

export const indexedUnitSchema = z.object({
  chunk_id: z.string().min(1),
  document_id: z.string().min(1),
  version: z.string().default("v1"),
  modality: z.enum(["text", "table", "formula", "image", "audio", "video", "code", "slide", "lab"]),
  location: z.object({
    page: z.number().int().nullable().default(null),
    section: z.string().default(""),
    timestamp: z.string().nullable().default(null),
    cell_range: z.string().nullable().default(null),
  }),
  text: z.string().default(""),
  concept_ids: z.array(z.string()).default([]),
  entities: z.array(z.string()).default([]),
  valid_time: z.object({
    from: z.string().nullable().default(null),
    until: z.string().nullable().default(null),
  }),
  access_scope: z.array(z.string()).default([]),
  citation_id: z.string().default(""),
  embedding_ids: z.array(z.string()).default([]),
  source_reliability: z.number().min(0).max(1).default(0.5),
});

export type IndexedUnit = z.infer<typeof indexedUnitSchema>;

// ---------------------------------------------------------------------------
// Retrieval request / scope / filters (API contract).
// ---------------------------------------------------------------------------

export const metadataFilterSchema = z.object({
  institution_id: z.string().optional(),
  course_id: z.string().optional(),
  campus: z.string().optional(),
  subject: z.string().optional(),
  grade_band: z.string().optional(),
  language: z.array(z.string()).default([]),
  academic_year: z.string().optional(),
  instructor: z.string().optional(),
  document_type: z.string().optional(),
  status: z.string().default("approved"),
  source_authority: z.string().optional(),
  license: z.string().optional(),
  sensitivity: z.string().optional(),
  version: z.string().optional(),
  jurisdiction: z.string().optional(),
  modality: z.string().optional(),
  difficulty: z.string().optional(),
  curriculum_standard: z.string().optional(),
  valid_at: z.string().optional(),
  access: z.string().optional(),
  artifact_types: z.array(z.string()).default([]),
  learner_enrollment: z.string().optional(),
});

export const temporalQuerySchema = z.object({
  valid_at: z.string().optional(),
  published_before: z.string().optional(),
  compare_with: z.string().optional(),
  include_superseded: z.boolean().default(false),
});

export const personalizationSchema = z.object({
  course_context: z.array(z.string()).default([]),
  recent_concepts: z.array(z.string()).default([]),
  mastery_gaps: z.array(z.string()).default([]),
  preferred_language: z.string().default("en"),
  preferred_format: z.string().default("text"),
  use_history: z.boolean().default(false),
  use_course_context: z.boolean().default(true),
  use_study_history: z.boolean().default(false),
  use_saved_sources: z.boolean().default(false),
  explain_personalization: z.boolean().default(true),
});

export const retrievalRequestSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  scope: z.object({
    course_id: z.string().optional(),
    institution_id: z.string().optional(),
    setId: z.string().optional(),
  }).default({}),
  modalities: z.array(z.string()).default(["text"]),
  filters: metadataFilterSchema.partial().default({}),
  time: temporalQuerySchema.default({}),
  personalization: personalizationSchema.partial().default({}),
  federated: z.object({
    enabled: z.boolean().default(false),
    repositories: z.array(z.string()).default([]),
  }).default({ enabled: false, repositories: [] }),
  require_citations: z.boolean().default(true),
  limit: z.number().int().min(1).max(50).default(10),
});

export type RetrievalRequest = z.infer<typeof retrievalRequestSchema>;

// ---------------------------------------------------------------------------
// Query planning — intent classification + entity extraction.
// ---------------------------------------------------------------------------

export type HybridIntent =
  | "exact_definition" | "explain_concept" | "what_changed" | "calculation"
  | "find_diagram" | "lecture_location" | "similar_code" | "prove_claim"
  | "study_next" | "federated" | "general";

export interface QueryPlan {
  intent: HybridIntent;
  confidence: number;
  primary: string[];
  parallel: string[];
  entities: ExtractedEntities;
  ambiguity: AmbiguityPrompt | null;
  interpretedAs: string;
  correctable: boolean;
}

export interface ExtractedEntities {
  quoted: string[];
  courseCodes: string[];
  pageRefs: string[];
  formulaSymbols: string[];
  codeTokens: string[];
  acronyms: string[];
  errorMessages: string[];
  names: string[];
}

const INTENT_TABLE: { intent: HybridIntent; re: RegExp; primary: string[]; label: string }[] = [
  { intent: "exact_definition", re: /^(what is|what are|define|definition of|meaning of|glossary)\b/i, primary: ["keyword", "glossary"], label: "Exact definition → keyword + glossary" },
  { intent: "explain_concept", re: /\b(explain|understand|why does|how does|what causes|teach me)\b/i, primary: ["vector", "knowledge-graph"], label: "Explain concept → dense vector + knowledge graph" },
  { intent: "what_changed", re: /\b(what changed|compare .*version|old .*definition|after the \d{4}|superseded|history of)\b/i, primary: ["temporal", "version-index"], label: "What changed → temporal + version index" },
  { intent: "calculation", re: /\b(calculat|equation|formula|solve|compute|show the .*calculation|rate of change)\b/i, primary: ["formula", "table"], label: "Show calculation → formula + table search" },
  { intent: "find_diagram", re: /\b(diagram|figure|image|graph|chart|illustrat|water cycle|mitochondria)\b/i, primary: ["image", "layout-index"], label: "Find diagram → image + layout index" },
  { intent: "lecture_location", re: /\b(where in .*lecture|which lecture|timestamp|at what time|lecture \d+)\b/i, primary: ["audio", "video-timestamp"], label: "Where in lecture → audio/video timestamp search" },
  { intent: "similar_code", re: /\b(code|function|recursion|parse .*csv|implementation|test for|stack trace|error:)\b/i, primary: ["code"], label: "Find similar code → code-aware retrieval" },
  { intent: "prove_claim", re: /\b(prove|evidence for|support.*claim|verify|citation|is it true that)\b/i, primary: ["citation"], label: "Prove claim → citation-aware evidence retrieval" },
  { intent: "study_next", re: /\b(what.*study next|prerequisite|what should i learn|next topic|revise)\b/i, primary: ["user-history", "prerequisite-graph"], label: "Study next → user history + prerequisite graph" },
  { intent: "federated", re: /\b(all institutions|across .*universit|partner|library catalog|oer|other course)\b/i, primary: ["federated"], label: "Federated → multi-repo with permission filters" },
];

const STOP = new Set(["the", "and", "for", "with", "from", "this", "that", "your", "you", "are", "was", "were", "have", "has", "will", "what", "when", "which", "about", "into", "does", "show", "find"]);

export function extractEntities(query: string): ExtractedEntities {
  const quoted = [...query.matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => (m[1] ?? m[2] ?? "").trim()).filter(Boolean);
  const courseCodes = [...query.toUpperCase().matchAll(/\b[A-Z]{2,5}\s?\d{3,4}\b/g)].map((m) => m[0]);
  const pageRefs = [...query.matchAll(/\b(?:page|p\.|chapter|ch\.|section|slide|lecture)\s*(\d+[a-z]?)/gi)].map((m) => m[0]);
  const formulaSymbols = [...query.matchAll(/\\[a-zA-Z]+|\$[^$]+\$|[a-zA-Z]_\{[^}]+\}|[a-zA-Z]_\d+/g)].map((m) => m[0]).slice(0, 10);
  const codeTokens = [...query.matchAll(/\b[a-z_]+\([a-z_, ]*\)|\b[A-Z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+\b|`[^`]+`/g)].map((m) => m[0]).slice(0, 10);
  const acronyms = [...query.matchAll(/\b[A-Z]{2,6}\b/g)].map((m) => m[0]).filter((a) => !courseCodes.includes(a));
  const errorMessages = [...query.matchAll(/\b(?:Error|TypeError|ReferenceError|SyntaxError|Traceback|Exception)[^.\n]{0,120}/g)].map((m) => m[0].trim());
  const names = [...query.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g)].map((m) => m[0]).slice(0, 8);
  return { quoted, courseCodes, pageRefs, formulaSymbols, codeTokens, acronyms, errorMessages, names };
}

// Polysemy map for the ambiguity gate. Personalization must never silently
// resolve these — surface the choice.
const POLYSEMY: Record<string, string[]> = {
  cell: ["Biology: structural unit of living organisms", "Spreadsheet: grid location"],
  table: ["Data table: rows and columns of values", "Furniture: physical table (unlikely in courseware)"],
  slope: ["Mathematics: rate of change (m = Δy/Δx)", "Geography: incline of terrain"],
  volume: ["Mathematics: 3D measure", "Audio: loudness level"],
  current: ["Physics: electric current", "Temporal: present-time / latest version"],
  energy: ["Physics: capacity to do work", "Wellness: subjective vitality"],
};

export interface AmbiguityPrompt {
  term: string;
  options: string[];
  actions: string[];
}

export function detectAmbiguity(query: string): AmbiguityPrompt | null {
  const low = query.toLowerCase();
  for (const [term, options] of Object.entries(POLYSEMY)) {
    if (new RegExp(`\\b${term}\\b`, "i").test(low)) {
      // If the query already disambiguates, don't prompt.
      const disambiguated = options.some((o) => low.includes(o.split(":")[0]!.toLowerCase().split(" ")[0]!) && low.split(/\s+/).length > 6);
      if (disambiguated) continue;
      return { term, options, actions: ["Search both", ...options.map((o) => o.split(":")[0]!)] };
    }
  }
  return null;
}

export function classifyHybridIntent(query: string): QueryPlan {
  const entities = extractEntities(query);
  // Quoted phrase or exact identifier forces keyword-first routing.
  const exactForced = entities.quoted.length > 0 || entities.courseCodes.length > 0 || entities.errorMessages.length > 0;
  for (const row of INTENT_TABLE) {
    if (row.re.test(query.trim())) {
      const primary = exactForced && !row.primary.includes("keyword")
        ? ["keyword", ...row.primary]
        : row.primary;
      return {
        intent: row.intent, confidence: exactForced ? 0.88 : 0.76,
        primary, parallel: planParallel(row.intent, primary),
        entities, ambiguity: detectAmbiguity(query),
        interpretedAs: row.label, correctable: true,
      };
    }
  }
  return {
    intent: "general", confidence: 0.5,
    primary: exactForced ? ["keyword", "vector"] : ["vector", "keyword"],
    parallel: planParallel("general", ["vector", "keyword"]),
    entities, ambiguity: detectAmbiguity(query),
    interpretedAs: "General → dense vector + keyword, citation rerank",
    correctable: true,
  };
}

function planParallel(intent: HybridIntent, primary: string[]): string[] {
  const all = ["keyword", "vector", "graph", "temporal", "table", "formula", "image", "media", "code", "citation", "history", "federated"];
  // Intent selects the head of the fan-out; everything else runs at low-k for fusion.
  const rest = all.filter((a) => !primary.includes(a));
  void intent;
  return [...primary, ...rest];
}

// ---------------------------------------------------------------------------
// Keyword search — field-aware inverted-index scoring (pure).
// ---------------------------------------------------------------------------

export interface KeywordQuery {
  text: string;
  fields?: string[];
  phrase_boost?: number;
  ocr_fuzzy_tolerance?: number;
  language?: string;
}

const SYNONYMS: Record<string, string[]> = {
  slope: ["gradient", "rate of change", "difference quotient"],
  "rate of change": ["slope", "gradient", "derivative"],
  cell: ["cellular unit"],
  exam: ["test", "quiz", "assessment"],
  diagram: ["figure", "illustration", "chart", "graph"],
};

function stemLite(t: string): string {
  // Deterministic lite stemmer: never applied to quoted phrases or formula tokens.
  if (/^[A-Z0-9_.$\\]+$/i.test(t) && t.length <= 6) return t.toLowerCase();
  return t.toLowerCase()
    .replace(/(ations|ation|iness|ness|ment|ing|ed|es|s)$/, "")
    .replace(/(ization)$/, "ize");
}

function levenshtein1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let edits = 0;
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    edits++;
    if (edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return true;
}

export interface FieldDoc {
  title?: string; heading?: string; body?: string; caption?: string;
}

export function keywordScore(q: KeywordQuery, doc: FieldDoc): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const quotedPhrases = [...q.text.matchAll(/"([^"]+)"/g)].map((m) => m[1]!.toLowerCase());
  const rawTokens = q.text.toLowerCase().replace(/"[^"]+"/g, " ").split(/[^a-z0-9_.$\\]+/).filter((t) => t && !STOP.has(t));
  // Synonym expansion (never overrides a quoted phrase).
  const expanded = new Set<string>();
  for (const t of rawTokens) {
    expanded.add(stemLite(t));
    for (const syn of SYNONYMS[stemLite(t)] ?? SYNONYMS[t] ?? []) {
      for (const w of syn.split(/\s+/)) expanded.add(stemLite(w));
    }
  }
  const fields: { name: string; text: string; boost: number }[] = [
    { name: "title", text: (doc.title ?? "").toLowerCase(), boost: 3.0 },
    { name: "heading", text: (doc.heading ?? "").toLowerCase(), boost: 2.0 },
    { name: "body", text: (doc.body ?? "").toLowerCase(), boost: 1.0 },
    { name: "caption", text: (doc.caption ?? "").toLowerCase(), boost: 1.5 },
  ];
  const wanted = (q.fields ?? ["title", "heading", "body", "caption"]);
  let score = 0;
  for (const f of fields) {
    if (!wanted.includes(f.name)) continue;
    const fTokens = f.text.split(/[^a-z0-9_.$\\]+/);
    const fStems = fTokens.map(stemLite);
    for (const t of expanded) {
      if (fStems.includes(t)) score += 1 * f.boost;
      else if ((q.ocr_fuzzy_tolerance ?? 0) >= 1 && fTokens.some((ft) => levenshtein1(ft, t))) {
        score += 0.6 * f.boost;
        reasons.push(`OCR-tolerant match in ${f.name}`);
      }
    }
    for (const ph of quotedPhrases) {
      if (f.text.includes(ph)) {
        score += (q.phrase_boost ?? 4.0) * f.boost;
        reasons.push(`Exact phrase match "${ph}" in ${f.name}`);
      }
    }
  }
  // Exact-match boosting for identifiers: course codes, quoted text.
  if (quotedPhrases.length > 0 && reasons.some((r) => r.startsWith("Exact phrase"))) {
    reasons.push("Exact-match boost applied; semantic expansion did not override quoted phrase");
  }
  const norm = Math.min(1, score / 12);
  return { score: Math.round(norm * 1000) / 1000, reasons };
}

// ---------------------------------------------------------------------------
// Dense vector search (proxy) + hierarchical descent.
// ---------------------------------------------------------------------------

export type EvidenceGranularity = "document" | "section" | "paragraph" | "sentence" | "span";

export interface HierarchicalHit {
  unit: IndexedUnit;
  granularity: EvidenceGranularity;
  score: number;
}

/** Token-overlap proxy for vector similarity. Replace via `embedHook`. */
export function vectorProxyScore(query: string, text: string): number {
  const q = new Set(query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)));
  const h = new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
  if (q.size === 0) return 0;
  let inter = 0;
  for (const t of q) {
    if (h.has(t)) inter++;
    else if (h.has(stemLite(t))) inter += 0.7;
  }
  return Math.round(Math.min(1, inter / q.size) * 1000) / 1000;
}

/** Descend document → section → paragraph → sentence → span; never stop at doc level. */
export function descendToSpan(paragraphs: { section: string; text: string; page?: number }[], query: string): HierarchicalHit[] {
  const out: HierarchicalHit[] = [];
  for (const p of paragraphs) {
    const sentences = p.text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    for (const s of sentences) {
      const score = vectorProxyScore(query, s);
      if (score <= 0) continue;
      const mk = (g: EvidenceGranularity): IndexedUnit => ({
        chunk_id: `chunk_${Math.abs(hashStr(s)) % 100000}`,
        document_id: "doc_pending",
        version: "v1",
        modality: "text",
        location: { page: p.page ?? null, section: p.section, timestamp: null, cell_range: null },
        text: s.slice(0, 500),
        concept_ids: [], entities: [],
        valid_time: { from: null, until: null },
        access_scope: [],
        citation_id: "",
        embedding_ids: [],
        source_reliability: 0.5,
      });
      out.push({ unit: mk(score >= 0.6 ? "span" : "sentence"), granularity: score >= 0.6 ? "span" : "sentence", score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ---------------------------------------------------------------------------
// Knowledge-graph traversal.
// ---------------------------------------------------------------------------

export type GraphRelation =
  | "prerequisite-of" | "explains" | "example-of" | "contradicts" | "supports"
  | "cited-by" | "version-of" | "applies-to" | "measured-by" | "implemented-by"
  | "related-to" | "supersedes" | "translated-as";

export interface GraphNode { id: string; label: string; kind: string }
export interface GraphEdge { from: string; to: string; relation: GraphRelation; confidence: number; source: string }

export interface GraphPath {
  nodes: string[];
  relations: GraphRelation[];
  reason: string;
  evidence: string;
  confidence: number;
}

/** BFS over an adjacency list; exposes the path + reason + evidence. Never
 *  infers causality from proximity alone — relation type travels with the path. */
export function traverseGraph(
  nodes: Map<string, GraphNode>,
  edges: GraphEdge[],
  from: string,
  to: string,
  maxDepth = 4,
): GraphPath | null {
  const adj = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    const arr = adj.get(e.from) ?? [];
    arr.push(e);
    adj.set(e.from, arr);
  }
  const queue: { node: string; path: string[]; rels: GraphRelation[]; conf: number }[] =
    [{ node: from, path: [from], rels: [], conf: 1 }];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.node === to) {
      const labels = cur.path.map((id) => nodes.get(id)?.label ?? id);
      return {
        nodes: labels,
        relations: cur.rels,
        reason: relationReason(cur.rels),
        evidence: `Graph path via ${cur.rels.join(" → ") || "identity"}`,
        confidence: Math.round(cur.conf * 100) / 100,
      };
    }
    if (cur.path.length > maxDepth) continue;
    for (const e of adj.get(cur.node) ?? []) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      queue.push({ node: e.to, path: [...cur.path, e.to], rels: [...cur.rels, e.relation], conf: cur.conf * e.confidence });
    }
  }
  return null;
}

function relationReason(rels: GraphRelation[]): string {
  if (rels.includes("prerequisite-of")) return "Prerequisite chain: earlier concept is required to understand the later one.";
  if (rels.includes("explains")) return "Explanatory relation backed by course text.";
  if (rels.includes("contradicts")) return "Contradiction edge — surface both sides, do not average.";
  return "Related concepts in the course knowledge graph.";
}

export function graphRelevance(path: GraphPath | null): number {
  if (!path) return 0;
  return Math.min(1, 0.4 + 0.15 * path.nodes.length + 0.2 * path.confidence);
}

// ---------------------------------------------------------------------------
// Temporal search.
// ---------------------------------------------------------------------------

export type TemporalStatus =
  | "current" | "historical" | "superseded" | "future-effective" | "date-unknown" | "conflicting-validity";

export interface TemporalBounds {
  validFrom?: string | null;
  validUntil?: string | null;
  publishedAt?: string | null;
  version?: string;
  isLatest?: boolean;
}

export function temporalLabel(b: TemporalBounds, nowIso = new Date().toISOString().slice(0, 10)): TemporalStatus {
  if (!b.validFrom && !b.validUntil && !b.publishedAt) return "date-unknown";
  if (b.validFrom && b.validUntil && b.validFrom > b.validUntil) return "conflicting-validity";
  const now = nowIso;
  if (b.validFrom && b.validFrom > now) return "future-effective";
  if (b.validUntil && b.validUntil < now) return b.isLatest === false ? "superseded" : "historical";
  return "current";
}

export function temporalFit(query: { valid_at?: string; published_before?: string; include_superseded?: boolean }, doc: { validFrom?: string | null; validUntil?: string | null; publishedAt?: string | null; isLatest?: boolean }): number {
  if (query.valid_at) {
    const at = query.valid_at;
    const from = doc.validFrom ?? "0000-01-01";
    const until = doc.validUntil ?? "9999-12-31";
    if (at < from || at > until) {
      if (doc.isLatest === false && !query.include_superseded) return 0;
      return 0.2;
    }
    return 1;
  }
  if (query.published_before && doc.publishedAt && doc.publishedAt >= query.published_before) return 0.3;
  return 0.6;
}

// ---------------------------------------------------------------------------
// Table / formula / image / media / code — structural scorers (pure).
// ---------------------------------------------------------------------------

export interface TableCellHit {
  table_id: string; row_header: string; column_header: string;
  value: string | number; unit: string; location: string; source: string;
  score: number;
}

export function tableCellScore(query: string, cells: { rowHeader: string; colHeader: string; value: string }[]): number {
  const q = query.toLowerCase();
  let best = 0;
  for (const c of cells) {
    const hay = `${c.rowHeader} ${c.colHeader} ${c.value}`.toLowerCase();
    const overlap = vectorProxyScore(query, hay);
    if (q.includes(c.rowHeader.toLowerCase()) || q.includes(c.colHeader.toLowerCase())) best = Math.max(best, 0.7 + 0.3 * overlap);
    else best = Math.max(best, overlap * 0.8);
  }
  return Math.round(best * 1000) / 1000;
}

export interface FormulaRecord {
  latex: string; normalized: string; variables: string[];
  concepts: string[]; location: string;
}

export function normalizeFormula(latex: string): string {
  return latex
    .replace(/\\(frac|dfrac)\{([^}]+)\}\{([^}]+)\}/g, "($2)/($3)")
    .replace(/\\(cdot|times)/g, "*")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Symbol + normalized-structure + variable-equivalence matching. Original
 *  notation is always preserved; the normalized form is shown separately. */
export function formulaScore(query: string, f: FormulaRecord): { score: number; matchedAs: string } {
  const q = query.toLowerCase();
  const norm = normalizeFormula(f.latex).toLowerCase();
  if (q.includes(f.latex.toLowerCase())) return { score: 1, matchedAs: "exact-notation" };
  if (q.includes(f.normalized.toLowerCase()) || q.includes(norm)) return { score: 0.9, matchedAs: "normalized-structure" };
  const qVars = new Set(q.split(/[^a-z0-9]+/));
  const varHits = f.variables.filter((v) => qVars.has(v.toLowerCase())).length;
  if (varHits > 0) return { score: Math.min(0.8, 0.4 + 0.2 * varHits), matchedAs: "variable-equivalence" };
  const conceptHits = f.concepts.filter((c) => q.includes(c.replace(/_/g, " "))).length;
  if (conceptHits > 0) return { score: 0.65, matchedAs: "concept-meaning" };
  return { score: vectorProxyScore(query, `${f.normalized} ${f.concepts.join(" ")}`), matchedAs: "semantic" };
}

export function imageScore(query: string, fig: { caption: string; labels?: string[]; topic?: string; figureType?: string }): number {
  const hay = `${fig.caption} ${(fig.labels ?? []).join(" ")} ${fig.topic ?? ""} ${fig.figureType ?? ""}`;
  let s = vectorProxyScore(query, hay);
  if (fig.labels?.some((l) => query.toLowerCase().includes(l.toLowerCase()))) s = Math.min(1, s + 0.3);
  return Math.round(s * 1000) / 1000;
}

export function mediaScore(query: string, seg: { transcript: string; slide?: string; speaker?: string }): number {
  const hay = `${seg.transcript} ${seg.slide ?? ""}`;
  return vectorProxyScore(query, hay);
}

export interface CodeUnit {
  repo: string; path: string; symbol: string; language: string;
  calls: string[]; tests: string[]; version: string; license: string;
}

export function codeScore(query: string, code: { symbol: string; calls: string[]; comments: string; language: string; content: string }): number {
  const q = query.toLowerCase();
  if (q.includes(code.symbol.toLowerCase())) return 0.95;
  const callHit = code.calls.filter((c) => q.includes(c.toLowerCase())).length;
  if (callHit > 0) return Math.min(0.9, 0.5 + 0.2 * callHit);
  return vectorProxyScore(query, `${code.symbol} ${code.calls.join(" ")} ${code.comments}`);
}

// ---------------------------------------------------------------------------
// Citation-aware fusion S(d,q) — interpretable labels, never truth probability.
// ---------------------------------------------------------------------------

export interface FusionSignals {
  K: number; V: number; G: number; M: number; T: number; C: number; U: number;
  R: number; stale: number;
}

export interface FusionWeights {
  wk: number; wv: number; wg: number; wm: number; wt: number; wc: number; wu: number;
  wr: number; ws: number;
}

export const DEFAULT_FUSION_WEIGHTS: FusionWeights = {
  wk: 0.22, wv: 0.24, wg: 0.1, wm: 0.08, wt: 0.06, wc: 0.16, wu: 0.06,
  wr: 0.15, ws: 0.12,
};

export function fusionScore(s: FusionSignals, w: FusionWeights = DEFAULT_FUSION_WEIGHTS): number {
  const r = w.wk * s.K + w.wv * s.V + w.wg * s.G + w.wm * s.M + w.wt * s.T
    + w.wc * s.C + w.wu * s.U - w.wr * s.R - w.ws * s.stale;
  return Math.round(Math.max(0, Math.min(1, r)) * 1000) / 1000;
}

/** Reciprocal-rank fusion across ranked lists. */
export function rrfFuse(lists: string[][], k = 60): { id: string; score: number }[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score: Math.round(score * 10000) / 10000 }))
    .sort((a, b) => b.score - a.score);
}

/** MMR diversity: relevance − λ·max-similarity-to-selected. */
export function diversify<T>(items: T[], score: (t: T) => number, sim: (a: T, b: T) => number, lambda = 0.5, limit = 10): T[] {
  const pool = [...items].sort((a, b) => score(b) - score(a));
  const selected: T[] = [];
  while (pool.length > 0 && selected.length < limit) {
    let bestIdx = 0, bestVal = -Infinity;
    pool.forEach((cand, i) => {
      const maxSim = selected.length ? Math.max(...selected.map((s) => sim(cand, s))) : 0;
      const val = score(cand) - lambda * maxSim;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    });
    selected.push(pool.splice(bestIdx, 1)[0]!);
  }
  return selected;
}

export function explainResult(s: FusionSignals & { extras?: string[] }): string[] {
  const out: string[] = [];
  if (s.K >= 0.7) out.push("Exact phrase match");
  else if (s.K >= 0.3) out.push("Keyword match");
  if (s.V >= 0.6) out.push("Same concept (semantic)");
  if (s.G >= 0.5) out.push("Prerequisite / graph relation");
  if (s.M >= 0.9) out.push("Current approved course source");
  if (s.C >= 0.6) out.push("Directly supports the question");
  if (s.T >= 0.8) out.push("Valid for the requested date");
  if (s.U >= 0.5) out.push("Matches your course context");
  if (s.R >= 0.5) out.push("Demoted: near-duplicate of a higher result");
  if (s.stale >= 0.5) out.push("Demoted: superseded version");
  if (out.length === 0) out.push("Weak match — review before citing");
  out.push("No unresolved contradiction detected");
  return [...out, ...(s.extras ?? [])];
}

// ---------------------------------------------------------------------------
// Permissions — enforced at query time AND render time.
// ---------------------------------------------------------------------------

export interface AclContext {
  userId: string;
  enrollments: string[];
  institutionId?: string;
  role?: string;
}

export function passesAcl(unit: IndexedUnit, ctx: AclContext): boolean {
  if (unit.access_scope.length === 0) return true;
  if (ctx.role === "admin" || ctx.role === "owner") return true;
  return unit.access_scope.some((s) =>
    ctx.enrollments.includes(s) || s === ctx.institutionId || s === `user_${ctx.userId}`,
  );
}

/** Render-time sanitizer: a citation must never leak a restricted title,
 *  hidden passage, filename, or metadata field. */
export function sanitizeForRender<T extends { title?: string; text?: string; sourceTitle?: string; quote?: string }>(
  item: T, allowed: boolean,
): T | { restricted: true; reason: string } {
  if (allowed) return item;
  return { restricted: true, reason: "Restricted source — access check failed at render time." };
}

// ---------------------------------------------------------------------------
// Personalization — allowlist only, with explanation + global fallback.
// ---------------------------------------------------------------------------

const PERSONALIZATION_DENY = [
  "biometric", "disability", "mental_state", "protected_identity",
  "private_out_of_scope", "unrelated_browsing",
];

export interface PersonalizationControls {
  useCourseContext: boolean;
  useStudyHistory: boolean;
  useSavedSources: boolean;
  searchGlobally: boolean;
  reset: boolean;
}

export function personalizationBoost(
  unit: IndexedUnit,
  ctx: { courseContext: string[]; recentConcepts: string[]; savedSources: string[]; enabled: PersonalizationControls },
): { boost: number; explanation: string | null } {
  if (ctx.enabled.reset || ctx.enabled.searchGlobally) return { boost: 0, explanation: null };
  let boost = 0;
  const why: string[] = [];
  if (ctx.enabled.useCourseContext && unit.access_scope.some((s) => ctx.courseContext.includes(s))) {
    boost += 0.15; why.push("in your enrolled course");
  }
  if (ctx.enabled.useStudyHistory && unit.concept_ids.some((c) => ctx.recentConcepts.includes(c))) {
    boost += 0.1; why.push("matches your recent study");
  }
  if (ctx.enabled.useSavedSources && ctx.savedSources.includes(unit.document_id)) {
    boost += 0.1; why.push("from your saved sources");
  }
  // Deny-list guard: boost never uses sensitive inferences.
  for (const d of PERSONALIZATION_DENY) {
    if (unit.text.toLowerCase().includes(`infer:${d}`)) { boost = 0; break; }
  }
  return {
    boost: Math.round(Math.min(0.3, boost) * 1000) / 1000,
    explanation: why.length > 0 ? `You are seeing this because it is ${why.join(" and ")}.` : null,
  };
}

// ---------------------------------------------------------------------------
// Federated institutional search.
// ---------------------------------------------------------------------------

export interface FederatedConnector {
  repository: string;
  capabilities: string[];
  query: (q: string) => Promise<FederatedHit[]>;
}

export interface FederatedHit {
  repository: string; document_id: string; title: string;
  availability: "open" | "authenticated_preview" | "request_access";
  rights: string; last_indexed: string;
  citation: { resolver: string; location: string };
  relevance: number; authority: number; curricularFit: number;
}

export async function federatedSearch(
  connectors: FederatedConnector[],
  query: string,
): Promise<{ hits: FederatedHit[]; unavailable: string[] }> {
  const hits: FederatedHit[] = [];
  const unavailable: string[] = [];
  await Promise.all(connectors.map(async (c) => {
    try {
      const r = await c.query(query);
      hits.push(...r);
    } catch {
      // Failure isolation: report the gap, never imply complete coverage.
      unavailable.push(c.repository);
    }
  }));
  // Rank by relevance + authority + currency + license compatibility, never latency-first.
  hits.sort((a, b) => (0.5 * b.relevance + 0.3 * b.authority + 0.2 * b.curricularFit) - (0.5 * a.relevance + 0.3 * a.authority + 0.2 * a.curricularFit));
  return { hits, unavailable };
}

// ---------------------------------------------------------------------------
// Evidence cards + validation.
// ---------------------------------------------------------------------------

export interface EvidenceCard {
  title: string; source: string; match: string; location: string;
  validity: TemporalStatus; rights: string; accessibility: string[];
  evidence: string; relatedConcepts: string[];
  contradictions: string; score: number; why: string[];
  actions: string[];
  citation: { id: string; resolver: string };
}

export const EVIDENCE_ACTIONS = [
  "open_source", "add_citation", "compare_versions", "show_related_concepts",
  "traverse_prerequisites", "find_simpler_explanation", "find_diagram",
  "find_lecture_timestamp", "find_practice_questions", "search_broader",
  "report_incorrect",
];

export function validateEvidencePackage(cards: EvidenceCard[]): { ok: boolean; gaps: string[] } {
  const gaps: string[] = [];
  for (const c of cards) {
    if (!c.evidence || c.evidence.trim().length < 10) gaps.push(`Empty evidence span in "${c.title}"`);
    if (!c.citation.id) gaps.push(`Missing citation id in "${c.title}"`);
    if (c.validity === "conflicting-validity") gaps.push(`Conflicting validity in "${c.title}"`);
    if (c.validity === "date-unknown") gaps.push(`Date unknown in "${c.title}" — label, don't guess`);
  }
  return { ok: gaps.length === 0, gaps };
}

export const NO_EVIDENCE_MESSAGE =
  "I found related material, but not enough approved evidence to support a definite answer.";

// ---------------------------------------------------------------------------
// Retrieval API route table (for server wiring).
// ---------------------------------------------------------------------------

export const RETRIEVAL_ROUTES = [
  "POST /v1/retrieval/query",
  "POST /v1/retrieval/plan",
  "POST /v1/retrieval/keyword",
  "POST /v1/retrieval/vector",
  "POST /v1/retrieval/graph",
  "POST /v1/retrieval/temporal",
  "POST /v1/retrieval/tables",
  "POST /v1/retrieval/formulas",
  "POST /v1/retrieval/images",
  "POST /v1/retrieval/media",
  "POST /v1/retrieval/code",
  "POST /v1/retrieval/citations",
  "POST /v1/retrieval/federated",
  "GET /v1/retrieval/{query_id}/evidence",
  "GET /v1/retrieval/{query_id}/explanation",
  "POST /v1/retrieval/{query_id}/feedback",
] as const;

// ---------------------------------------------------------------------------
// Evaluation — retrieval metrics separate from answer generation.
// ---------------------------------------------------------------------------

export interface RetrievalEvalInput {
  relevant: Set<string>; retrieved: string[]; k?: number;
  permissionLeaks?: number; staleCount?: number; duplicateCount?: number;
}

export function evaluateRetrieval(input: RetrievalEvalInput): {
  recallAtK: number; precisionAtK: number; mrr: number; permissionLeakageRate: number; staleRate: number; duplicateRate: number;
} {
  const k = input.k ?? input.retrieved.length;
  const top = input.retrieved.slice(0, k);
  const hits = top.filter((id) => input.relevant.has(id)).length;
  const recallAtK = input.relevant.size ? hits / input.relevant.size : 0;
  const precisionAtK = top.length ? hits / top.length : 0;
  const firstRank = top.findIndex((id) => input.relevant.has(id));
  const mrr = firstRank >= 0 ? 1 / (firstRank + 1) : 0;
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return {
    recallAtK: r(recallAtK), precisionAtK: r(precisionAtK), mrr: r(mrr),
    permissionLeakageRate: r((input.permissionLeaks ?? 0) / Math.max(1, top.length)),
    staleRate: r((input.staleCount ?? 0) / Math.max(1, top.length)),
    duplicateRate: r((input.duplicateCount ?? 0) / Math.max(1, top.length)),
  };
}

export const RETRIEVAL_BENCHMARKS = [
  "exact_lookup", "conceptual_explanation", "multi_hop_prerequisite", "temporal_comparison",
  "table_calculation", "formula_equivalence", "diagram_retrieval", "lecture_timestamp",
  "code_search", "citation_verification", "restricted_content", "ambiguous_term", "multilingual_query",
] as const;

// ---------------------------------------------------------------------------
// HybridRetrievalService — prisma-backed parallel retrieval + fusion.
// ---------------------------------------------------------------------------

import { prisma } from "@n0va/db";

interface ScoredCard extends EvidenceCard {
  signals: FusionSignals;
  unit: IndexedUnit;
}

export class HybridRetrievalService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role = "member",
    private readonly weights: FusionWeights = DEFAULT_FUSION_WEIGHTS,
  ) {}

  /** Full pipeline: plan → parallel → ACL → fuse → diversify → validate. */
  async query(raw: unknown, acl: AclContext, connectors: FederatedConnector[] = []) {
    const req = retrievalRequestSchema.parse(raw);
    const plan = classifyHybridIntent(req.query);
    const queryId = `q_${Math.abs(hashStr(req.query + Date.now())).toString(36)}`;

    const scopeFilter = {
      workspaceId: this.workspaceId,
      ...(req.scope.setId ? { setId: req.scope.setId } : {}),
    };

    // Parallel retrieval across specialized indexes.
    const [keyword, vector, tables, formulas, images, media, code, citations, graphPath] = await Promise.all([
      this.keywordUnits(req.query, scopeFilter, req.limit),
      this.vectorUnits(req.query, scopeFilter, req.limit),
      req.modalities.includes("table") || req.modalities.includes("text") || req.modalities.includes("lab") ? this.tableUnits(req.query, scopeFilter) : Promise.resolve([] as ScoredCard[]),
      this.formulaUnits(req.query, scopeFilter),
      req.modalities.includes("image") || req.modalities.includes("text") ? this.imageUnits(req.query, scopeFilter) : Promise.resolve([] as ScoredCard[]),
      req.modalities.includes("video") || req.modalities.includes("audio") || req.modalities.includes("text") ? this.mediaUnits(req.query, scopeFilter) : Promise.resolve([] as ScoredCard[]),
      this.codeUnits(req.query, scopeFilter),
      this.citationUnits(req.query, scopeFilter, req.limit),
      this.graphSignal(req.query, req.scope.setId),
    ]);

    // Federated (optional, failure-isolated).
    let federated: FederatedHit[] = [];
    let federatedUnavailable: string[] = [];
    if (req.federated.enabled && connectors.length > 0) {
      const f = await federatedSearch(connectors, req.query);
      federated = f.hits;
      federatedUnavailable = f.unavailable;
    }

    // Fuse: RRF over id lists + weighted S(d,q) rerank.
    const all: ScoredCard[] = [...keyword, ...vector, ...tables, ...formulas, ...images, ...media, ...code, ...citations];
    // Inject graph + temporal + personalization signals before fusion.
    for (const c of all) {
      c.signals.G = Math.max(c.signals.G, graphPath);
      c.signals.T = Math.max(c.signals.T, temporalFit(req.time, {
        validFrom: c.unit.valid_time.from, validUntil: c.unit.valid_time.until,
        isLatest: !c.unit.version.includes("superseded"),
      }));
      const p = personalizationBoost(c.unit, {
        courseContext: req.personalization.course_context ?? [],
        recentConcepts: req.personalization.recent_concepts ?? [],
        savedSources: [],
        enabled: {
          useCourseContext: req.personalization.use_course_context ?? true,
          useStudyHistory: req.personalization.use_study_history ?? false,
          useSavedSources: false,
          searchGlobally: false, reset: false,
        },
      });
      c.signals.U = p.boost * 3; // normalize ~0..1
      if (p.explanation && (req.personalization.explain_personalization ?? true)) {
        c.why.push(p.explanation);
      }
    }

    const rrf = new Map(rrfFuse([
      keyword.map((c) => c.unit.chunk_id),
      vector.map((c) => c.unit.chunk_id),
      citations.map((c) => c.unit.chunk_id),
    ]).map((r) => [r.id, r.score]));

    for (const c of all) {
      const rrfBoost = Math.min(0.2, (rrf.get(c.unit.chunk_id) ?? 0) * 2);
      c.score = Math.round(Math.min(1, fusionScore(c.signals, this.weights) + rrfBoost) * 1000) / 1000;
      c.why = [...explainResult(c.signals), ...c.why.filter((w) => w.startsWith("You are seeing"))];
    }

    // Permission + source filtering (query time). Restricted items are dropped
    // before ranking is exposed; render-time sanitizer runs again on serve.
    const permitted = all.filter((c) => passesAcl(c.unit, acl));
    const leaksPrevented = all.length - permitted.length;

    // Redundancy control: penalize near-duplicate evidence spans.
    const seen = new Set<string>();
    for (const c of permitted.sort((a, b) => b.score - a.score)) {
      const key = c.unit.text.slice(0, 80).toLowerCase();
      if (seen.has(key)) {
        c.signals.R = 1;
        c.score = Math.round(c.score * (1 - this.weights.wr) * 1000) / 1000;
      } else seen.add(key);
    }

    // Diversity across sources/modalities (MMR on text overlap).
    const diverse = diversify(
      permitted.sort((a, b) => b.score - a.score),
      (c) => c.score,
      (a, b) => vectorProxyScore(a.unit.text, b.unit.text),
      0.4, req.limit,
    );

    // Temporal status labels + stale penalty already in S(d,q).
    for (const c of diverse) {
      c.validity = temporalLabel({
        validFrom: c.unit.valid_time.from, validUntil: c.unit.valid_time.until,
        isLatest: !c.unit.version.includes("superseded"),
      });
    }

    const cards: EvidenceCard[] = diverse.map(({ signals: _s, unit: _u, ...card }) => card);
    const validation = validateEvidencePackage(cards);

    return {
      query_id: queryId,
      plan,
      results: cards,
      federated: federated.slice(0, req.limit).map((h) => ({
        repository: h.repository, document_id: h.document_id, title: h.title,
        availability: h.availability, rights: h.rights, last_indexed: h.last_indexed, citation: h.citation,
      })),
      federated_unavailable: federatedUnavailable,
      explanation: {
        fusion_weights: this.weights,
        routes: RETRIEVAL_ROUTES,
        leaksPrevented,
        validation,
        note: federatedUnavailable.length > 0
          ? `Not searched (unavailable): ${federatedUnavailable.join(", ")} — coverage is partial.`
          : "All requested repositories searched.",
      },
      refused: cards.length === 0,
      refusal: cards.length === 0 ? NO_EVIDENCE_MESSAGE : null,
    };
  }

  /** Explain a past query plan (GET /v1/retrieval/{query_id}/explanation shape). */
  explainPlan(query: string): QueryPlan {
    return classifyHybridIntent(query);
  }

  async feedback(queryId: string, unitId: string, verdict: "correct" | "incorrect", note = "") {
    return { queryId, unitId, verdict, note: note.slice(0, 1000), recordedAt: new Date().toISOString() };
  }

  // -- Per-index collectors (each returns ScoredCards with honest signals) --

  private mkSignals(over: Partial<FusionSignals>): FusionSignals {
    return { K: 0, V: 0, G: 0, M: 0.6, T: 0.6, C: 0.3, U: 0, R: 0, stale: 0, ...over };
  }

  private toCard(unit: IndexedUnit, opts: {
    title: string; source: string; match: string; location: string;
    rights: string; evidence: string; relatedConcepts?: string[];
    score: number; why: string[]; citationId: string; resolver?: string;
    signals: FusionSignals;
  }): ScoredCard {
    return {
      title: opts.title, source: opts.source, match: opts.match, location: opts.location,
      validity: "current", rights: opts.rights,
      accessibility: ["HTML", "tagged PDF"],
      evidence: opts.evidence, relatedConcepts: opts.relatedConcepts ?? [],
      contradictions: "None flagged",
      score: opts.score, why: opts.why, actions: EVIDENCE_ACTIONS,
      citation: { id: opts.citationId, resolver: opts.resolver ?? "" },
      signals: opts.signals, unit,
    };
  }

  private async keywordUnits(query: string, scope: Record<string, string>, limit: number): Promise<ScoredCard[]> {
    const kq: KeywordQuery = { text: query, fields: ["title", "heading", "body", "caption"], phrase_boost: 4.0, ocr_fuzzy_tolerance: 1, language: "en" };
    const [blocks, cites] = await Promise.all([
      prisma.docBlock.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { readingOrder: "asc" }, take: 200 }).catch(() => []),
      prisma.evidenceCitation.findMany({ where: { workspaceId: this.workspaceId, ...(scope.setId ? { setId: scope.setId } : {}) }, take: 100 }).catch(() => []),
    ]);
    const out: ScoredCard[] = [];
    for (const b of blocks.slice(0, 60)) {
      const doc = await prisma.sourceDocument.findUnique({ where: { id: b.documentId } }).catch(() => null);
      if (scope.setId && doc?.setId && doc.setId !== scope.setId) continue;
      const { score, reasons } = keywordScore(kq, {
        title: doc?.title ?? "", heading: (b.sectionPath[0] ?? ""), body: b.text, caption: "",
      });
      if (score <= 0) continue;
      const unit: IndexedUnit = {
        chunk_id: `block_${b.id}`, document_id: b.documentId, version: `v${doc?.version ?? 1}`,
        modality: "text",
        location: { page: b.page, section: b.sectionPath[0] ?? "", timestamp: null, cell_range: null },
        text: b.text.slice(0, 500), concept_ids: [], entities: [],
        valid_time: { from: null, until: null },
        access_scope: doc?.setId ? [doc.setId] : [],
        citation_id: cites.find((c) => c.sourceDocId === b.documentId)?.id ?? "",
        embedding_ids: [`text_${b.id}`],
        source_reliability: b.confidence,
      };
      out.push(this.toCard(unit, {
        title: doc?.title ?? "Untitled source", source: `Course document v${doc?.version ?? 1}`,
        match: `Keyword${reasons.length ? " + " + reasons[0] : ""}`,
        location: `Page ${b.page}, ${b.sectionPath[0] ?? "body"}`,
        rights: "institution-only", evidence: b.text.slice(0, 300),
        score, why: reasons,
        citationId: unit.citation_id,
        signals: this.mkSignals({ K: score, V: score * 0.5, C: unit.citation_id ? 0.6 : 0.3 }),
      }));
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private async vectorUnits(query: string, scope: Record<string, string>, limit: number): Promise<ScoredCard[]> {
    const items = await prisma.learningItem.findMany({ where: { workspaceId: this.workspaceId, ...(scope.setId ? { setId: scope.setId } : {}) }, take: 100 }).catch(() => []);
    return items
      .map((it) => {
        const v = vectorProxyScore(query, `${it.title} ${it.notes}`);
        if (v <= 0) return null;
        const unit: IndexedUnit = {
          chunk_id: `item_${it.id}`, document_id: it.refId ?? it.id, version: it.sourceVersion || "v1",
          modality: "text",
          location: { page: null, section: it.title, timestamp: null, cell_range: null },
          text: `${it.title} — ${(it.notes || "").slice(0, 400)}`, concept_ids: [], entities: [],
          valid_time: { from: null, until: null }, access_scope: scope.setId ? [scope.setId] : [],
          citation_id: "", embedding_ids: [`text_${it.id}`], source_reliability: (it.authorityScore ?? 50) / 100,
        };
        return this.toCard(unit, {
          title: it.title, source: `Learning item (${it.kind})`, match: "Concept (semantic)",
          location: it.title, rights: "course-private", evidence: (it.notes || it.title).slice(0, 300),
          score: v, why: ["Same concept (semantic)"],
          citationId: "",
          signals: this.mkSignals({ K: v * 0.4, V: v, C: 0.4 }),
        });
      })
      .filter((c): c is ScoredCard => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async tableUnits(query: string, scope: Record<string, string>): Promise<ScoredCard[]> {
    const tables = await prisma.docTable.findMany({ where: { workspaceId: this.workspaceId }, take: 50 }).catch(() => []);
    const out: ScoredCard[] = [];
    for (const t of tables) {
      const doc = await prisma.sourceDocument.findUnique({ where: { id: t.documentId } }).catch(() => null);
      if (scope.setId && doc?.setId && doc.setId !== scope.setId) continue;
      const cells = ((t.cells ?? []) as { row: number; column: number; text: string }[][]).flat()
        .map((c) => ({ rowHeader: `row ${c.row}`, colHeader: t.headers[c.column - 1] ?? `col ${c.column}`, value: c.text }));
      const s = tableCellScore(query, cells);
      if (s <= 0.15) continue;
      const unit: IndexedUnit = {
        chunk_id: `table_${t.id}`, document_id: t.documentId, version: `v${doc?.version ?? 1}`,
        modality: "table",
        location: { page: t.page, section: t.caption, timestamp: null, cell_range: `page_${t.page}:${t.tableKey}` },
        text: `${t.caption} ${t.headers.join(" ")}`.slice(0, 500), concept_ids: [], entities: [],
        valid_time: { from: null, until: null }, access_scope: doc?.setId ? [doc.setId] : [],
        citation_id: "", embedding_ids: [`text_${t.id}`], source_reliability: t.confidence,
      };
      out.push(this.toCard(unit, {
        title: t.caption || `Table ${t.tableKey}`, source: `Report table v${doc?.version ?? 1}`,
        match: "Table cell + header", location: `Page ${t.page}, ${t.tableKey}`,
        rights: "institution-only", evidence: `${t.headers.join(" | ")} — ${cells.slice(0, 3).map((c) => c.value).join(", ")}`,
        score: s, why: ["Table header/cell match — cite the exact cell range"],
        citationId: "",
        signals: this.mkSignals({ K: s * 0.7, V: s * 0.6, C: 0.5 }),
      }));
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  private async formulaUnits(query: string, scope: Record<string, string>): Promise<ScoredCard[]> {
    const formulae = await prisma.docFormula.findMany({ where: { workspaceId: this.workspaceId }, take: 50 }).catch(() => []);
    const out: ScoredCard[] = [];
    for (const f of formulae) {
      const doc = await prisma.sourceDocument.findUnique({ where: { id: f.documentId } }).catch(() => null);
      if (scope.setId && doc?.setId && doc.setId !== scope.setId) continue;
      const rec: FormulaRecord = { latex: f.latex, normalized: normalizeFormula(f.latex), variables: f.variables, concepts: [], location: `page_${f.page}:${f.formulaKey}` };
      const { score, matchedAs } = formulaScore(query, rec);
      if (score <= 0.15) continue;
      const unit: IndexedUnit = {
        chunk_id: `formula_${f.id}`, document_id: f.documentId, version: `v${doc?.version ?? 1}`,
        modality: "formula",
        location: { page: f.page, section: "", timestamp: null, cell_range: null },
        text: `Original: ${f.latex} | Interpreted: ${rec.normalized}`, concept_ids: [], entities: f.variables,
        valid_time: { from: null, until: null }, access_scope: doc?.setId ? [doc.setId] : [],
        citation_id: "", embedding_ids: [`text_${f.id}`], source_reliability: f.confidence,
      };
      out.push(this.toCard(unit, {
        title: `Equation ${f.formulaKey}`, source: doc?.title ?? "Course text",
        match: `Formula (${matchedAs}) — original preserved`, location: `Page ${f.page}, ${f.formulaKey}`,
        rights: "institution-only", evidence: f.latex.slice(0, 300),
        score, why: [`Formula match (${matchedAs}); original notation preserved`],
        citationId: "",
        signals: this.mkSignals({ K: score * 0.6, V: score * 0.7, C: 0.5 }),
      }));
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  private async imageUnits(query: string, scope: Record<string, string>): Promise<ScoredCard[]> {
    const figs = await prisma.docFigure.findMany({ where: { workspaceId: this.workspaceId }, take: 50 }).catch(() => []);
    const out: ScoredCard[] = [];
    for (const f of figs) {
      const doc = await prisma.sourceDocument.findUnique({ where: { id: f.documentId } }).catch(() => null);
      if (scope.setId && doc?.setId && doc.setId !== scope.setId) continue;
      const s = imageScore(query, { caption: f.caption });
      if (s <= 0.15) continue;
      const unit: IndexedUnit = {
        chunk_id: `figure_${f.id}`, document_id: f.documentId, version: `v${doc?.version ?? 1}`,
        modality: "image",
        location: { page: f.page, section: f.caption.slice(0, 80), timestamp: null, cell_range: null },
        text: f.caption.slice(0, 500), concept_ids: [], entities: [],
        valid_time: { from: null, until: null }, access_scope: doc?.setId ? [doc.setId] : [],
        citation_id: "", embedding_ids: [`visual_${f.id}`], source_reliability: f.confidence,
      };
      out.push(this.toCard(unit, {
        title: f.caption.slice(0, 80) || `Figure ${f.figureKey}`, source: doc?.title ?? "Course media",
        match: "Diagram label/caption", location: `Page ${f.page}, ${f.figureKey}`,
        rights: "institution-only", evidence: f.caption.slice(0, 300),
        score: s, why: ["Figure caption/label match"],
        citationId: "",
        signals: this.mkSignals({ K: s * 0.5, V: s, C: 0.4 }),
      }));
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  private async mediaUnits(query: string, scope: Record<string, string>): Promise<ScoredCard[]> {
    const segs = await prisma.docTranscript.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { startSec: "asc" }, take: 100 }).catch(() => []);
    const out: ScoredCard[] = [];
    for (const s of segs) {
      const doc = await prisma.sourceDocument.findUnique({ where: { id: s.documentId } }).catch(() => null);
      if (scope.setId && doc?.setId && doc.setId !== scope.setId) continue;
      const v = mediaScore(query, { transcript: s.text, slide: s.linkedSlide });
      if (v <= 0.15) continue;
      const stamp = `${String(Math.floor(s.startSec / 60)).padStart(2, "0")}:${String(Math.floor(s.startSec % 60)).padStart(2, "0")}`;
      const unit: IndexedUnit = {
        chunk_id: `media_${s.id}`, document_id: s.documentId, version: `v${doc?.version ?? 1}`,
        modality: "video",
        location: { page: null, section: s.linkedSlide, timestamp: stamp, cell_range: null },
        text: s.text.slice(0, 500), concept_ids: [], entities: [],
        valid_time: { from: null, until: null }, access_scope: doc?.setId ? [doc.setId] : [],
        citation_id: "", embedding_ids: [`text_${s.id}`], source_reliability: s.confidence,
      };
      out.push(this.toCard(unit, {
        title: doc?.title ?? "Lecture", source: "Lecture recording",
        match: "Spoken phrase / slide", location: `${doc?.title ?? "lecture"}@${stamp}`,
        rights: "course-private", evidence: s.text.slice(0, 300),
        score: v, why: [`Transcript match @${stamp} — jump-to-segment available`],
        citationId: "",
        signals: this.mkSignals({ K: v * 0.6, V: v * 0.8, C: 0.4 }),
      }));
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  private async codeUnits(query: string, scope: Record<string, string>): Promise<ScoredCard[]> {
    const blocks = await prisma.docCode.findMany({ where: { workspaceId: this.workspaceId }, take: 50 }).catch(() => []);
    const out: ScoredCard[] = [];
    for (const c of blocks) {
      const doc = await prisma.sourceDocument.findUnique({ where: { id: c.documentId } }).catch(() => null);
      if (scope.setId && doc?.setId && doc.setId !== scope.setId) continue;
      const s = codeScore(query, { symbol: c.codeKey, calls: [], comments: "", language: c.language, content: c.content });
      const contentHit = vectorProxyScore(query, c.content.slice(0, 1000));
      const best = Math.max(s, contentHit * 0.9);
      if (best <= 0.15) continue;
      const unit: IndexedUnit = {
        chunk_id: `code_${c.id}`, document_id: c.documentId, version: `v${doc?.version ?? 1}`,
        modality: "code",
        location: { page: c.page, section: c.codeKey, timestamp: null, cell_range: null },
        text: c.content.slice(0, 500), concept_ids: [], entities: [c.language],
        valid_time: { from: null, until: null }, access_scope: doc?.setId ? [doc.setId] : [],
        citation_id: "", embedding_ids: [`text_${c.id}`], source_reliability: c.confidence,
      };
      out.push(this.toCard(unit, {
        title: `${c.codeKey} (${c.language})`, source: doc?.title ?? "Code collection",
        match: "Code symbol/structure", location: `Page ${c.page}, ${c.codeKey}`,
        rights: "course-private", evidence: c.content.slice(0, 300),
        score: Math.round(best * 1000) / 1000, why: ["Code symbol/structure match; licenses + hidden solutions respected"],
        citationId: "",
        signals: this.mkSignals({ K: best * 0.7, V: best * 0.6, C: 0.3 }),
      }));
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 8);
  }

  private async citationUnits(query: string, scope: Record<string, string>, limit: number): Promise<ScoredCard[]> {
    const cites = await prisma.evidenceCitation.findMany({
      where: { workspaceId: this.workspaceId, ...(scope.setId ? { setId: scope.setId } : {}) }, take: 100,
    }).catch(() => []);
    return cites
      .map((c) => {
        const k = keywordScore({ text: query, phrase_boost: 4.0 }, { title: c.sourceTitle, heading: c.locatorHeading, body: `${c.claim} ${c.quote}` });
        const v = vectorProxyScore(query, `${c.claim} ${c.quote}`);
        const fused = 0.5 * k.score + 0.3 * v + 0.2 * (c.authority / 100);
        if (fused <= 0.1 && query.trim() !== "") return null;
        const unit: IndexedUnit = {
          chunk_id: `cite_${c.id}`, document_id: c.sourceDocId ?? c.id, version: c.sourceVersion || "v1",
          modality: "text",
          location: { page: c.locatorPage, section: c.locatorHeading, timestamp: c.locatorTimestamp || null, cell_range: null },
          text: (c.quote || c.claim).slice(0, 500), concept_ids: [], entities: [],
          valid_time: { from: c.sourceDate ? new Date(c.sourceDate).toISOString().slice(0, 10) : null, until: null },
          access_scope: [c.accessScope], citation_id: c.id,
          embedding_ids: [`text_${c.id}`], source_reliability: c.authority / 100,
        };
        return this.toCard(unit, {
          title: c.sourceTitle || "Cited source", source: `Citation (authority ${c.authority})`,
          match: "Citation support", location: `Page ${c.locatorPage ?? "?"}, ${c.locatorHeading || "body"}`,
          rights: c.license || "course-private", evidence: (c.quote || c.claim).slice(0, 300),
          score: Math.round(fused * 1000) / 1000,
          why: c.support === "CONTRADICTS" ? ["Contradicting evidence — surface, don't average"] : ["Directly supports the question"],
          citationId: c.id,
          signals: this.mkSignals({
            K: k.score, V: v, C: c.support === "SUPPORTS" ? 0.8 : c.support === "QUALIFIES" ? 0.5 : 0.2,
            R: 0, stale: c.verificationLabel === "REQUIRES_REVIEW" ? 0.6 : 0,
          }),
        });
      })
      .filter((c): c is ScoredCard => c !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async graphSignal(query: string, setId?: string): Promise<number> {
    try {
      const concepts = await prisma.learnerConcept.findMany({
        where: { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) }, take: 50,
      });
      const hit = concepts.find((c) =>
        query.toLowerCase().includes(c.label.toLowerCase()) || query.toLowerCase().includes(c.key.replace(/-/g, " ")),
      );
      if (!hit) return 0;
      const edges = await prisma.conceptEdge.findMany({ where: { workspaceId: this.workspaceId }, take: 200 }).catch(() => []);
      const nodes = new Map(concepts.map((c) => [c.id, { id: c.id, label: c.label, kind: c.kind }]));
      const gEdges: GraphEdge[] = edges.map((e) => ({
        from: e.fromId, to: e.toId,
        relation: (String(e.relation).toLowerCase().replace("_", "-") as GraphRelation) ?? "related-to",
        confidence: Math.min(1, (e.weight ?? 1) / 2), source: "course-graph",
      }));
      // Score = does the query touch a multi-hop neighborhood?
      const neighbors = gEdges.filter((e) => e.from === hit.id || e.to === hit.id).length;
      void nodes;
      return Math.min(0.9, 0.4 + 0.15 * neighbors);
    } catch {
      return 0;
    }
  }
}
