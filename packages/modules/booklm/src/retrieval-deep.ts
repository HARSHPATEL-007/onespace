/**
 * N0VA BOOKLM EDUCATION — Hybrid Retrieval deep enhancements.
 *
 * Closes the gaps between the pure `hybrid-retrieval.ts` core and the full
 * spec: hard metadata/permission pre-filtering across every filter dimension,
 * geospatial hook, temporal compare ("what changed"), structured table
 * predicates, code-safety gate, media/image rights helpers, citation-grounded
 * answer builder (claim → span → source → location → version → access check),
 * federated connector registry (capability discovery, provenance, rate
 * limits, deletion propagation, audit), deep evaluation metrics (nDCG,
 * citation-support rate, location accuracy, no-answer calibration), benchmark
 * harness, and an in-memory query store seam for the
 * GET /v1/retrieval/{query_id}/evidence|explanation endpoints.
 *
 * Pure + deterministic. Persistence is injected via seams so Prisma wiring
 * stays in the service/route layer.
 */
import { z } from "zod";
import {
  indexedUnitSchema,
  temporalLabel,
  type EvidenceCard,
  type FusionSignals,
  type IndexedUnit,
  type TemporalStatus,
} from "./hybrid-retrieval";

// ---------------------------------------------------------------------------
// 1. Full metadata pre-filtering (hard constraints before semantic ranking).
// ---------------------------------------------------------------------------

export const deepFilterSchema = z.object({
  institution_id: z.string().optional(),
  campus: z.string().optional(),
  course_id: z.string().optional(),
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
  geo_within: z
    .object({
      lat_min: z.number(),
      lat_max: z.number(),
      lon_min: z.number(),
      lon_max: z.number(),
    })
    .optional(),
});

export type DeepFilters = z.infer<typeof deepFilterSchema>;

/** Flat metadata view carried alongside an IndexedUnit for filtering. */
export interface FilterableMeta {
  institution_id?: string;
  campus?: string;
  course_id?: string;
  subject?: string;
  grade_band?: string;
  language?: string;
  academic_year?: string;
  instructor?: string;
  document_type?: string;
  status?: string;
  source_authority?: string;
  license?: string;
  sensitivity?: string;
  version?: string;
  jurisdiction?: string;
  modality?: string;
  difficulty?: string;
  curriculum_standard?: string;
  artifact_type?: string;
  learner_enrollment?: string;
  lat?: number;
  lon?: number;
  valid_from?: string | null;
  valid_until?: string | null;
}

export interface FilterVerdict {
  pass: boolean;
  excludedBy: string[];
}

/**
 * Hard-constraint pre-filter. Permissions / status / validity / enrollment
 * are enforced here; soft signals (authority, recency) stay in fusion.
 * Returns pass=false with the excluding dimension named for explainability.
 */
export function applyMetadataFilters(meta: FilterableMeta, f: DeepFilters): FilterVerdict {
  const excludedBy: string[] = [];
  const eq = (a?: string, b?: string) => !b || (a ?? "").toLowerCase() === b.toLowerCase();

  if (f.status && meta.status && meta.status.toLowerCase() !== f.status.toLowerCase()) {
    // "approved" filter rejects drafts/archived; explicit status pass-through otherwise.
    excludedBy.push(`status:${meta.status}`);
  }
  if (f.sensitivity === "public" && meta.sensitivity && !["public", "open"].includes(meta.sensitivity.toLowerCase())) {
    excludedBy.push(`sensitivity:${meta.sensitivity}`);
  }
  if (!eq(meta.institution_id, f.institution_id)) excludedBy.push("institution_id");
  if (!eq(meta.campus, f.campus)) excludedBy.push("campus");
  if (!eq(meta.course_id, f.course_id)) excludedBy.push("course_id");
  if (!eq(meta.subject, f.subject)) excludedBy.push("subject");
  if (!eq(meta.grade_band, f.grade_band)) excludedBy.push("grade_band");
  if (!eq(meta.academic_year, f.academic_year)) excludedBy.push("academic_year");
  if (!eq(meta.instructor, f.instructor)) excludedBy.push("instructor");
  if (!eq(meta.document_type, f.document_type)) excludedBy.push("document_type");
  if (!eq(meta.source_authority, f.source_authority)) excludedBy.push("source_authority");
  if (!eq(meta.license, f.license)) excludedBy.push("license");
  if (!eq(meta.version, f.version)) excludedBy.push("version");
  if (!eq(meta.jurisdiction, f.jurisdiction)) excludedBy.push("jurisdiction");
  if (!eq(meta.modality, f.modality)) excludedBy.push("modality");
  if (!eq(meta.difficulty, f.difficulty)) excludedBy.push("difficulty");
  if (!eq(meta.curriculum_standard, f.curriculum_standard)) excludedBy.push("curriculum_standard");
  if (!eq(meta.learner_enrollment, f.learner_enrollment)) excludedBy.push("learner_enrollment");

  if (f.language.length > 0) {
    const lang = (meta.language ?? "en").toLowerCase();
    if (!f.language.map((l) => l.toLowerCase()).includes(lang)) excludedBy.push(`language:${meta.language}`);
  }
  if (f.artifact_types.length > 0 && meta.artifact_type) {
    if (!f.artifact_types.map((a) => a.toLowerCase()).includes(meta.artifact_type.toLowerCase())) {
      excludedBy.push(`artifact_type:${meta.artifact_type}`);
    }
  }
  // Validity window: hard constraint when valid_at is supplied.
  if (f.valid_at) {
    const from = meta.valid_from ?? "0000-01-01";
    const until = meta.valid_until ?? "9999-12-31";
    if (f.valid_at < from || f.valid_at > until) excludedBy.push(`valid_at:${f.valid_at}`);
  }
  // Geospatial bounding box.
  if (f.geo_within) {
    const g = f.geo_within;
    if (meta.lat == null || meta.lon == null) excludedBy.push("geo:unknown-location");
    else if (meta.lat < g.lat_min || meta.lat > g.lat_max || meta.lon < g.lon_min || meta.lon > g.lon_max) {
      excludedBy.push("geo:outside-bounds");
    }
  }
  return { pass: excludedBy.length === 0, excludedBy };
}

/** Metadata-fit signal M(d,q): 1 when no hard filters, decaying per exclusion. */
export function metadataFitScore(verdict: FilterVerdict): number {
  if (verdict.pass) return 1;
  return Math.max(0, 1 - 0.35 * verdict.excludedBy.length);
}

// ---------------------------------------------------------------------------
// 2. Geospatial retrieval hook.
// ---------------------------------------------------------------------------

export interface GeoPoint {
  lat: number;
  lon: number;
  label?: string;
}

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(s1));
}

/** Proximity signal in [0,1]; 1 at the anchor, decaying to 0 at radiusKm. */
export function geoScore(anchor: GeoPoint, doc: GeoPoint | null, radiusKm = 50): number {
  if (!doc) return 0;
  const d = haversineKm(anchor, doc);
  if (d >= radiusKm) return 0;
  return Math.round((1 - d / radiusKm) * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// 3. Temporal compare ("what changed between v_old and v_now").
// ---------------------------------------------------------------------------

export interface TemporalDoc {
  id: string;
  version: string;
  validFrom?: string | null;
  validUntil?: string | null;
  publishedAt?: string | null;
  isLatest?: boolean;
  text: string;
}

export interface TemporalComparison {
  oldStatus: TemporalStatus;
  newStatus: TemporalStatus;
  changed: boolean;
  summary: string;
  oldExcerpt: string;
  newExcerpt: string;
}

export function compareTemporalVersions(oldDoc: TemporalDoc, newDoc: TemporalDoc, nowIso = new Date().toISOString().slice(0, 10)): TemporalComparison {
  const oldStatus = temporalLabel(
    { validFrom: oldDoc.validFrom ?? null, validUntil: oldDoc.validUntil ?? null, publishedAt: oldDoc.publishedAt ?? null, isLatest: false },
    nowIso,
  );
  const newStatus = temporalLabel(
    { validFrom: newDoc.validFrom ?? null, validUntil: newDoc.validUntil ?? null, publishedAt: newDoc.publishedAt ?? null, isLatest: newDoc.isLatest ?? true },
    nowIso,
  );
  const changed = oldDoc.text.trim() !== newDoc.text.trim() || oldDoc.version !== newDoc.version;
  return {
    oldStatus,
    newStatus,
    changed,
    summary: changed
      ? `Version ${oldDoc.version} (${oldStatus}) → ${newDoc.version} (${newStatus}): text or validity differs.`
      : `Version ${oldDoc.version} and ${newDoc.version} are text-identical; only metadata may differ.`,
    oldExcerpt: oldDoc.text.slice(0, 300),
    newExcerpt: newDoc.text.slice(0, 300),
  };
}

// ---------------------------------------------------------------------------
// 4. Structured table predicates (units, percentages, year-over-year).
// ---------------------------------------------------------------------------

export interface StructuredCell {
  rowHeader: string;
  colHeader: string;
  value: number;
  unit: string;
  location: string;
  source: string;
}

export function tableYearMax(cells: StructuredCell[]): StructuredCell | null {
  let best: StructuredCell | null = null;
  for (const c of cells) {
    if (!/^\d{4}$/.test(c.rowHeader.trim()) && !/^\d{4}$/.test(c.colHeader.trim())) continue;
    if (!best || c.value > best.value) best = c;
  }
  return best;
}

export function tablePercentCells(cells: StructuredCell[]): StructuredCell[] {
  return cells.filter((c) => c.unit === "%" || c.unit.toLowerCase().includes("percent"));
}

export function tableYearDelta(cells: StructuredCell[], yearA: string, yearB: string): { a: number | null; b: number | null; delta: number | null } {
  const pick = (y: string) => cells.find((c) => c.rowHeader === y || c.colHeader === y)?.value ?? null;
  const a = pick(yearA);
  const b = pick(yearB);
  return { a, b, delta: a == null || b == null ? null : Math.round((b - a) * 1000) / 1000 };
}

// ---------------------------------------------------------------------------
// 5. Code-safety gate (licenses, secrets, hidden solutions).
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = [
  /sk-(live|test)-[A-Za-z0-9]{8,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (RSA )?PRIVATE KEY-----/,
  /xox[bap]-[A-Za-z0-9-]{8,}/,
  /ghp_[A-Za-z0-9]{20,}/,
];

const APPROVED_CODE_LICENSES = new Set(["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "CC-BY-4.0", "CC0-1.0", "course-internal"]);

export interface CodeSafetyVerdict {
  ok: boolean;
  reasons: string[];
  redacted: boolean;
}

export function codeSafetyCheck(code: { content: string; license: string; isHiddenSolution?: boolean; requesterRole?: string }): CodeSafetyVerdict {
  const reasons: string[] = [];
  const hasSecret = SECRET_PATTERNS.some((re) => re.test(code.content));
  if (hasSecret) reasons.push("Possible embedded secret — block and rotate, never display.");
  if (!APPROVED_CODE_LICENSES.has(code.license)) reasons.push(`License ${code.license || "unknown"} is not on the approved list — show metadata only.`);
  if (code.isHiddenSolution && !["instructor", "admin", "owner"].includes(code.requesterRole ?? "learner")) {
    reasons.push("Hidden assignment solution — withheld under academic-integrity policy.");
  }
  return { ok: reasons.length === 0, reasons, redacted: reasons.length > 0 };
}

// ---------------------------------------------------------------------------
// 6. Media + image helpers (jump-to-segment, rights, figure roles).
// ---------------------------------------------------------------------------

export type FigureRole = "decorative" | "explanatory" | "data-bearing";

export function mediaCitation(videoId: string, startSec: number, endSec: number): { citation: string; jump: string } {
  const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return {
    citation: `${videoId}@${fmt(startSec)}`,
    jump: `/m/videos/${videoId}?t=${Math.floor(startSec)}&end=${Math.floor(endSec)}`,
  };
}

export function figureRole(caption: string, labelCount: number, hasAxes: boolean): FigureRole {
  if (hasAxes || labelCount >= 4 || /\b(fig|table|chart|graph|plot)\b.*\b(data|result|value|axis)\b/i.test(caption)) return "data-bearing";
  if (labelCount > 0 || caption.trim().length > 20) return "explanatory";
  return "decorative";
}

export interface RightsInfo {
  status: string;
  canDisplay: boolean;
  note: string;
}

export function rightsFor(status: string): RightsInfo {
  const s = (status || "").toLowerCase();
  if (["open", "cc0-1.0", "cc-by-4.0", "public"].includes(s)) return { status, canDisplay: true, note: "Open license — display with attribution." };
  if (["institution-only", "course-private", "authenticated_preview"].includes(s)) {
    return { status, canDisplay: true, note: "Restricted to enrolled learners — no public redistribution." };
  }
  return { status: status || "unknown", canDisplay: false, note: "Rights unclear — show metadata only until cleared." };
}

// ---------------------------------------------------------------------------
// 7. Citation-grounded answer builder.
// ---------------------------------------------------------------------------

export interface RetrievalGroundedClaim {
  claim: string;
  evidenceId: string;
  quote: string;
  sourceTitle: string;
  location: string;
  version: string;
  accessOk: boolean;
}

export interface GroundedAnswer {
  claims: RetrievalGroundedClaim[];
  unsupported: string[];
  refused: boolean;
  refusal: string | null;
}

export const NO_EVIDENCE_MESSAGE_DEEP =
  "I found related material, but not enough approved evidence to support a definite answer.";

/**
 * claim → evidence span → source → location → version → access check.
 * Claims without an accessible evidence span land in `unsupported`; when NO
 * claim is supported the answer refuses rather than hallucinating.
 */
export function buildCitationGroundedAnswer(
  claims: { claim: string; evidenceId: string | null }[],
  evidenceById: Map<string, { quote: string; sourceTitle: string; location: string; version: string; accessOk: boolean }>,
): GroundedAnswer {
  const supported: RetrievalGroundedClaim[] = [];
  const unsupported: string[] = [];
  for (const c of claims) {
    const ev = c.evidenceId ? evidenceById.get(c.evidenceId) : undefined;
    if (!ev || !ev.quote.trim() || !ev.accessOk) {
      unsupported.push(c.claim);
      continue;
    }
    supported.push({
      claim: c.claim,
      evidenceId: c.evidenceId!,
      quote: ev.quote,
      sourceTitle: ev.sourceTitle,
      location: ev.location,
      version: ev.version,
      accessOk: true,
    });
  }
  const refused = supported.length === 0;
  return { claims: supported, unsupported, refused, refusal: refused ? NO_EVIDENCE_MESSAGE_DEEP : null };
}

// ---------------------------------------------------------------------------
// 8. Federated connector registry.
// ---------------------------------------------------------------------------

export interface ConnectorCaps {
  fullText: boolean;
  metadata: boolean;
  temporal: boolean;
  rights: boolean;
  deletionPropagation: boolean;
}

export interface RegistryConnector {
  repository: string;
  capabilities: ConnectorCaps;
  rateLimitPerMin: number;
  lastIndexed: string;
  query: (q: string) => Promise<{ document_id: string; title: string; relevance: number; authority: number; rights: string }[]>;
  deleteDoc?: (documentId: string) => Promise<void>;
}

export interface FederatedAuditEntry {
  at: string;
  repository: string;
  query: string;
  hits: number;
  ok: boolean;
}

export class FederatedRegistry {
  private connectors = new Map<string, RegistryConnector>();
  private calls: { repo: string; minute: string }[] = [];
  audit: FederatedAuditEntry[] = [];

  register(c: RegistryConnector): void {
    this.connectors.set(c.repository, c);
  }

  capabilities(): Record<string, ConnectorCaps> {
    return Object.fromEntries([...this.connectors.entries()].map(([k, v]) => [k, v.capabilities]));
  }

  private rateLimited(repo: string, limit: number): boolean {
    const minute = new Date().toISOString().slice(0, 16);
    const n = this.calls.filter((c) => c.repo === repo && c.minute === minute).length;
    return n >= limit;
  }

  async search(
    query: string,
    repos: string[] = [],
  ): Promise<{ hits: { repository: string; document_id: string; title: string; relevance: number; rights: string }[]; deduped: DedupedFederatedHit[]; unavailable: string[] }> {
    const targets = repos.length > 0 ? repos : [...this.connectors.keys()];
    const hits: { repository: string; document_id: string; title: string; relevance: number; rights: string }[] = [];
    const unavailable: string[] = [];
    await Promise.all(
      targets.map(async (repo) => {
        const c = this.connectors.get(repo);
        if (!c) {
          unavailable.push(repo);
          return;
        }
        if (this.rateLimited(repo, c.rateLimitPerMin)) {
          unavailable.push(repo);
          this.audit.push({ at: new Date().toISOString(), repository: repo, query, hits: 0, ok: false });
          return;
        }
        try {
          this.calls.push({ repo, minute: new Date().toISOString().slice(0, 16) });
          const r = await c.query(query);
          // Metadata normalization + provenance.
          for (const h of r) {
            hits.push({ repository: repo, document_id: h.document_id, title: h.title, relevance: h.relevance, rights: h.rights });
          }
          this.audit.push({ at: new Date().toISOString(), repository: repo, query, hits: r.length, ok: true });
        } catch {
          unavailable.push(repo);
          this.audit.push({ at: new Date().toISOString(), repository: repo, query, hits: 0, ok: false });
        }
      }),
    );
    hits.sort((a, b) => b.relevance - a.relevance);
    // Cross-repository deduplication: same document via two repos collapses
    // to one entry that keeps every repository in its provenance.
    return { hits, deduped: dedupeFederatedHits(hits), unavailable };
  }

  async propagateDeletion(documentId: string): Promise<{ deleted: string[]; failed: string[] }> {
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const [repo, c] of this.connectors) {
      if (!c.capabilities.deletionPropagation || !c.deleteDoc) continue;
      try {
        await c.deleteDoc(documentId);
        deleted.push(repo);
      } catch {
        failed.push(repo);
      }
    }
    return { deleted, failed };
  }
}

// ---------------------------------------------------------------------------
// 9. Deep evaluation metrics (retrieval quality ≠ answer quality).
// ---------------------------------------------------------------------------

export interface DeepEvalInput {
  relevant: Set<string>;
  gradedRelevance?: Map<string, number>;
  retrieved: string[];
  k?: number;
  citedIds?: Set<string>;
  locationExact?: Map<string, boolean>;
  permissionLeaks?: number;
  staleCount?: number;
  duplicateCount?: number;
  noAnswerExpected?: boolean;
  noAnswerGiven?: boolean;
  // Modality accuracy probes (spec §Retrieval Evaluation). Each is an
  // independent probe scored 0..1 by the caller (exact cell, formula
  // equivalence, timestamp window, diagram label, code symbol, cross-language
  // quality, federated coverage, personalization benefit/harm). Absent probes
  // stay null — never zero-filled, so aggregates never fake precision.
  tableCellAccuracy?: number;
  formulaMatchAccuracy?: number;
  timestampAccuracy?: number;
  diagramLabelAccuracy?: number;
  codeSymbolAccuracy?: number;
  crossLanguageQuality?: number;
  federatedCoverage?: number;
  personalizationBenefit?: number;
  personalizationHarm?: number;
}

export interface DeepEvalResult {
  recallAtK: number;
  precisionAtK: number;
  mrr: number;
  ndcg: number;
  citationSupportRate: number;
  exactLocationAccuracy: number;
  permissionLeakageRate: number;
  staleRate: number;
  duplicateRate: number;
  noAnswerCalibration: number;
  tableCellAccuracy: number | null;
  formulaMatchAccuracy: number | null;
  timestampAccuracy: number | null;
  diagramLabelAccuracy: number | null;
  codeSymbolAccuracy: number | null;
  crossLanguageQuality: number | null;
  federatedCoverage: number | null;
  personalizationBenefit: number | null;
  personalizationHarm: number | null;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function dcgAtK(retrieved: string[], graded: Map<string, number>, k: number): number {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, retrieved.length); i++) {
    const rel = graded.get(retrieved[i]!) ?? 0;
    dcg += (2 ** rel - 1) / Math.log2(i + 2);
  }
  return dcg;
}

export function evaluateRetrievalDeep(input: DeepEvalInput): DeepEvalResult {
  const k = input.k ?? input.retrieved.length;
  const top = input.retrieved.slice(0, k);
  const hits = top.filter((id) => input.relevant.has(id)).length;
  const recallAtK = input.relevant.size ? hits / input.relevant.size : 0;
  const precisionAtK = top.length ? hits / top.length : 0;
  const firstRank = top.findIndex((id) => input.relevant.has(id));
  const mrr = firstRank >= 0 ? 1 / (firstRank + 1) : 0;

  const graded = input.gradedRelevance ?? new Map([...input.relevant].map((id) => [id, 1] as [string, number]));
  const ideal = [...graded.values()].sort((a, b) => b - a);
  const idealDcg = (() => {
    let d = 0;
    for (let i = 0; i < Math.min(k, ideal.length); i++) d += (2 ** ideal[i]! - 1) / Math.log2(i + 2);
    return d;
  })();
  const ndcg = idealDcg === 0 ? 0 : dcgAtK(top, graded, k) / idealDcg;

  const cited = input.citedIds;
  const citationSupportRate = !cited || cited.size === 0 ? 0 : top.filter((id) => cited.has(id)).length / Math.max(1, top.length);
  const loc = input.locationExact;
  const exactLocationAccuracy = !loc || loc.size === 0 ? 0 : [...loc.values()].filter(Boolean).length / loc.size;

  const noAnswerCalibration =
    input.noAnswerExpected == null || input.noAnswerGiven == null
      ? 1
      : input.noAnswerExpected === input.noAnswerGiven
        ? 1
        : 0;

  const probe = (v: number | undefined) => (v == null ? null : r3(Math.max(0, Math.min(1, v))));
  return {
    recallAtK: r3(recallAtK),
    precisionAtK: r3(precisionAtK),
    mrr: r3(mrr),
    ndcg: r3(ndcg),
    citationSupportRate: r3(citationSupportRate),
    exactLocationAccuracy: r3(exactLocationAccuracy),
    permissionLeakageRate: r3((input.permissionLeaks ?? 0) / Math.max(1, top.length)),
    staleRate: r3((input.staleCount ?? 0) / Math.max(1, top.length)),
    duplicateRate: r3((input.duplicateCount ?? 0) / Math.max(1, top.length)),
    noAnswerCalibration,
    tableCellAccuracy: probe(input.tableCellAccuracy),
    formulaMatchAccuracy: probe(input.formulaMatchAccuracy),
    timestampAccuracy: probe(input.timestampAccuracy),
    diagramLabelAccuracy: probe(input.diagramLabelAccuracy),
    codeSymbolAccuracy: probe(input.codeSymbolAccuracy),
    crossLanguageQuality: probe(input.crossLanguageQuality),
    federatedCoverage: probe(input.federatedCoverage),
    personalizationBenefit: probe(input.personalizationBenefit),
    personalizationHarm: probe(input.personalizationHarm),
  };
}

/**
 * Cross-repository deduplication: normalize titles (case, punctuation,
 * edition markers) and collapse same-document hits to the highest-relevance
 * entry, keeping provenance of every repository that carried it.
 */
export interface DedupedFederatedHit {
  document_id: string;
  title: string;
  relevance: number;
  rights: string;
  repositories: string[];
}

export function dedupeFederatedHits(
  hits: { repository: string; document_id: string; title: string; relevance: number; rights: string }[],
): DedupedFederatedHit[] {
  const norm = (t: string) =>
    t.toLowerCase().replace(/\b(\d+(st|nd|rd|th)\s+edition|edition|ed\.|vol\.?\s*\d+)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const byKey = new Map<string, DedupedFederatedHit>();
  for (const h of hits) {
    const key = `${norm(h.title)}::${h.document_id}`;
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, { document_id: h.document_id, title: h.title, relevance: h.relevance, rights: h.rights, repositories: [h.repository] });
    } else {
      cur.relevance = Math.max(cur.relevance, h.relevance);
      if (!cur.repositories.includes(h.repository)) cur.repositories.push(h.repository);
    }
  }
  return [...byKey.values()].sort((a, b) => b.relevance - a.relevance);
}

export interface FeedbackTally {
  chunkId: string;
  correct: number;
  incorrect: number;
  /** Mean fused score at serve time (for calibration checks). */
  meanScore?: number;
}

/**
 * Learning-to-rank weight nudge from learner feedback. Deterministic and
 * conservative: each net-incorrect chunk down-weights citation-trust (wc)
 * slightly and up-weights lexical grounding (wk); net-correct does the
 * reverse. Bounded to ±0.05 per call so one feedback batch can never
 * destabilize ranking. Returns the adjusted weights (original untouched).
 */
export function tuneWeightsFromFeedback(
  base: { wk: number; wv: number; wg: number; wm: number; wt: number; wc: number; wu: number; wr: number; ws: number },
  tallies: FeedbackTally[],
): typeof base {
  let net = 0;
  for (const t of tallies) net += t.correct - t.incorrect;
  if (net === 0 || tallies.length === 0) return { ...base };
  const step = Math.max(-0.05, Math.min(0.05, 0.01 * Math.sign(net)));
  const clamp = (v: number) => Math.round(Math.max(0.02, Math.min(0.6, v)) * 1000) / 1000;
  // net>0 (trusted): wc up, wk down a touch. net<0: wk up, wc down.
  return { ...base, wk: clamp(base.wk - step), wc: clamp(base.wc + step) };
}

// ---------------------------------------------------------------------------
// 10. Benchmark harness across the 13 spec benchmark sets.
// ---------------------------------------------------------------------------

export const RETRIEVAL_BENCHMARK_SETS = [
  "exact_lookup",
  "conceptual_explanation",
  "multi_hop_prerequisite",
  "temporal_comparison",
  "table_calculation",
  "formula_equivalence",
  "diagram_retrieval",
  "lecture_timestamp",
  "code_search",
  "citation_verification",
  "restricted_content",
  "ambiguous_term",
  "multilingual_query",
] as const;

export type BenchmarkSet = (typeof RETRIEVAL_BENCHMARK_SETS)[number];

export interface BenchmarkCase {
  set: BenchmarkSet;
  query: string;
  relevant: string[];
  graded?: [string, number][];
}

export interface BenchmarkReport {
  perSet: Record<BenchmarkSet, DeepEvalResult | null>;
  macroNdcg: number;
  macroRecall: number;
  failures: { set: BenchmarkSet; query: string }[];
}

/** Runs a retriever fn over benchmark cases and aggregates DeepEval metrics. */
export async function runBenchmarkSuite(
  cases: BenchmarkCase[],
  retrieve: (query: string, set: BenchmarkSet) => Promise<string[]> | string[],
): Promise<BenchmarkReport> {
  const perSet = {} as Record<BenchmarkSet, DeepEvalResult | null>;
  const failures: { set: BenchmarkSet; query: string }[] = [];
  const bySet = new Map<BenchmarkSet, DeepEvalResult[]>();
  for (const c of cases) {
    let retrieved: string[] = [];
    try {
      retrieved = await retrieve(c.query, c.set);
    } catch {
      failures.push({ set: c.set, query: c.query });
      continue;
    }
    const res = evaluateRetrievalDeep({
      relevant: new Set(c.relevant),
      gradedRelevance: new Map(c.graded ?? c.relevant.map((id) => [id, 1] as [string, number])),
      retrieved,
      k: Math.max(5, retrieved.length),
    });
    const arr = bySet.get(c.set) ?? [];
    arr.push(res);
    bySet.set(c.set, arr);
  }
  const avg = (rs: DeepEvalResult[], pick: (r: DeepEvalResult) => number) =>
    rs.length ? r3(rs.reduce((s, r) => s + pick(r), 0) / rs.length) : 0;
  const avgNull = (rs: DeepEvalResult[], pick: (r: DeepEvalResult) => number | null): number | null => {
    const vs = rs.map(pick).filter((v): v is number => v != null);
    return vs.length ? r3(vs.reduce((s, v) => s + v, 0) / vs.length) : null;
  };
  let ndcgSum = 0;
  let recSum = 0;
  let n = 0;
  for (const set of RETRIEVAL_BENCHMARK_SETS) {
    const rs = bySet.get(set) ?? [];
    if (rs.length === 0) {
      perSet[set] = null;
      continue;
    }
    perSet[set] = {
      recallAtK: avg(rs, (r) => r.recallAtK),
      precisionAtK: avg(rs, (r) => r.precisionAtK),
      mrr: avg(rs, (r) => r.mrr),
      ndcg: avg(rs, (r) => r.ndcg),
      citationSupportRate: avg(rs, (r) => r.citationSupportRate),
      exactLocationAccuracy: avg(rs, (r) => r.exactLocationAccuracy),
      permissionLeakageRate: avg(rs, (r) => r.permissionLeakageRate),
      staleRate: avg(rs, (r) => r.staleRate),
      duplicateRate: avg(rs, (r) => r.duplicateRate),
      noAnswerCalibration: avg(rs, (r) => r.noAnswerCalibration),
      tableCellAccuracy: avgNull(rs, (r) => r.tableCellAccuracy),
      formulaMatchAccuracy: avgNull(rs, (r) => r.formulaMatchAccuracy),
      timestampAccuracy: avgNull(rs, (r) => r.timestampAccuracy),
      diagramLabelAccuracy: avgNull(rs, (r) => r.diagramLabelAccuracy),
      codeSymbolAccuracy: avgNull(rs, (r) => r.codeSymbolAccuracy),
      crossLanguageQuality: avgNull(rs, (r) => r.crossLanguageQuality),
      federatedCoverage: avgNull(rs, (r) => r.federatedCoverage),
      personalizationBenefit: avgNull(rs, (r) => r.personalizationBenefit),
      personalizationHarm: avgNull(rs, (r) => r.personalizationHarm),
    };
    ndcgSum += perSet[set]!.ndcg;
    recSum += perSet[set]!.recallAtK;
    n++;
  }
  return {
    perSet,
    macroNdcg: n ? r3(ndcgSum / n) : 0,
    macroRecall: n ? r3(recSum / n) : 0,
    failures,
  };
}

// ---------------------------------------------------------------------------
// 11. Query store seam (query_id → evidence + explanation).
// ---------------------------------------------------------------------------

export interface StoredQuery {
  queryId: string;
  workspaceId: string;
  query: string;
  cards: EvidenceCard[];
  explanation: Record<string, unknown>;
  federatedUnavailable: string[];
  createdAt: string;
  feedback: { unitId: string; verdict: string; note: string; at: string }[];
  /**
   * ACL binding for render-time re-checks. Units travel with the stored
   * query so GET /evidence|explanation can re-run the access check against
   * the *current* caller context instead of trusting serve-time state.
   */
  acl?: { userId: string; enrollments: string[]; institutionId?: string; role?: string };
  units?: IndexedUnit[];
}

/** In-memory store; replace with a DB-backed impl in production. */
export class RetrievalQueryStore {
  private map = new Map<string, StoredQuery>();

  save(q: Omit<StoredQuery, "createdAt" | "feedback">): StoredQuery {
    const full: StoredQuery = { ...q, createdAt: new Date().toISOString(), feedback: [] };
    this.map.set(q.queryId, full);
    // Bound memory: keep the newest 500.
    if (this.map.size > 500) {
      const first = this.map.keys().next().value!;
      this.map.delete(first);
    }
    return full;
  }

  get(queryId: string): StoredQuery | null {
    return this.map.get(queryId) ?? null;
  }

  addFeedback(queryId: string, unitId: string, verdict: string, note: string): StoredQuery | null {
    const q = this.map.get(queryId);
    if (!q) return null;
    q.feedback.push({ unitId, verdict, note: note.slice(0, 1000), at: new Date().toISOString() });
    return q;
  }
}

export const globalQueryStore = new RetrievalQueryStore();

// ---------------------------------------------------------------------------
// 12. Indexed-unit validation (every unit preserves the spec shape).
// ---------------------------------------------------------------------------

export function validateIndexedUnit(u: unknown): { ok: boolean; issues: string[] } {
  const parsed = indexedUnitSchema.safeParse(u);
  if (parsed.success) {
    const issues: string[] = [];
    const v = parsed.data as IndexedUnit;
    if (!v.citation_id) issues.push("missing citation_id — answer generation must not use this unit as proof");
    if (v.source_reliability < 0.3) issues.push("low source_reliability — rerank down");
    return { ok: issues.length === 0, issues };
  }
  return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
}

export function fusionExplainDeep(s: FusionSignals): { labels: string[]; stale: boolean; duplicate: boolean } {
  const labels: string[] = [];
  if (s.K >= 0.7) labels.push("Exact phrase match");
  else if (s.K >= 0.3) labels.push("Keyword match");
  if (s.V >= 0.6) labels.push("Same concept (semantic)");
  if (s.G >= 0.5) labels.push("Prerequisite / graph relation");
  if (s.M >= 0.9) labels.push("Current approved course source");
  if (s.C >= 0.6) labels.push("Directly supports the question");
  if (s.T >= 0.8) labels.push("Valid for the requested date");
  if (s.U >= 0.5) labels.push("Matches course context");
  return { labels, stale: s.stale >= 0.5, duplicate: s.R >= 0.5 };
}
