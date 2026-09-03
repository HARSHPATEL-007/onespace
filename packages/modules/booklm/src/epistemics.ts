/**
 * Epistemics engine — the evidence-grounded operating system for N0VA BookLM Education.
 *
 * Pure, dependency-free, deterministic. Every generated explanation, assessment,
 * recommendation, and learner insight is classified into an epistemic state,
 * decomposed into atomic claims, verified against evidence spans, and scored
 * with multi-dimensional coverage — stored as metadata, never mere wording.
 */

export type EpistemicState =
  | "SOURCE_FACT"
  | "SOURCE_SYNTHESIS"
  | "MODEL_INFERENCE"
  | "SPECULATION"
  | "LEARNER_CONTRIBUTION";

export type VerificationLabel =
  | "DIRECTLY_SUPPORTED"
  | "QUALIFIED_SUPPORT"
  | "SYNTHESIZED"
  | "REASONED_INFERENCE"
  | "UNCERTAIN"
  | "CONFLICTING"
  | "NOT_FOUND"
  | "REQUIRES_REVIEW";

export type AnswerMode = "STRICT" | "GUIDED" | "EXPLORATORY" | "EXAM";

export type QueryType =
  | "definition" | "howto" | "historical" | "scientific" | "legal"
  | "comparison" | "why" | "research" | "exam" | "learner_note" | "general";

export type ContradictionKind =
  | "direct" | "definitions" | "populations" | "time_periods" | "methods"
  | "jurisdictions" | "abstraction" | "complementary" | "extraction_error" | "unresolved";

// ---------------------------------------------------------------------------
// Claim decomposition: answers become atomic claims before generation.
// ---------------------------------------------------------------------------

export interface AtomicClaim { text: string; normalizedKey: string; weight: number }

const CLAIM_SPLIT = /\s+(?:and|but|while|whereas|although|however|moreover|furthermore)\s+/gi;
const STRONG_CLAIM = /\b(proves?|guarantees?|always|never|all|none|every|must|cannot|impossible|certain)\b/i;
const QUANTITY = /\b\d+(\.\d+)?\s*(%|percent|mg|ml|kg|km|ms|s|patients|studies|years|days)?\b/i;
const CAUSAL = /\b(causes?|caused by|due to|leads? to|results? in|triggers?|prevents?|reduces?|increases?|improves?|worsens?)\b/i;

export function slugKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "claim";
}

/** Split text into atomic claims (sentence split, then conjunction split). */
export function decomposeClaims(text: string): AtomicClaim[] {
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/).map((s) => s.trim()).filter(Boolean);
  const out: AtomicClaim[] = [];
  for (const sent of sentences) {
    const parts = sent.split(CLAIM_SPLIT).map((p) => p.trim()).filter((p) => p.split(/\s+/).length >= 3);
    const units = parts.length > 1 ? parts : [sent];
    for (const u of units) {
      const clean = u.replace(/\s+/g, " ").trim();
      if (clean.split(/\s+/).length < 3) continue;
      let weight = 1.0;
      if (STRONG_CLAIM.test(clean)) weight += 0.8; // high-risk absolute claims matter more
      if (QUANTITY.test(clean)) weight += 0.4;
      if (CAUSAL.test(clean)) weight += 0.4;
      out.push({ text: clean, normalizedKey: slugKey(clean.split(" ").slice(0, 6).join(" ")), weight: Math.round(weight * 100) / 100 });
    }
  }
  return out.slice(0, 24);
}

// ---------------------------------------------------------------------------
// Qualifier preservation: "may" must never silently become "will".
// ---------------------------------------------------------------------------

export const QUALIFIERS = [
  "may", "might", "could", "often", "usually", "typically", "sometimes", "generally",
  "tends to", "tend to", "suggests", "indicates", "under these conditions", "in some cases",
  "possibly", "potentially", "appears to", "seems to", "likely", "unlikely", "rarely",
  "in general", "for most", "with caution", "preliminary",
];

const CORRELATION_LANG = /\b(correlat\w*|associat\w*|linked?\s+to|linked?\s+with|observed\s+with|co-occurs?)\b/i;
const CAUSAL_STRONG = /\b(causes?|proves?|proves that|demonstrates that|guarantees?|definitively|conclusively)\b/i;

export function detectQualifiers(text: string): string[] {
  const low = text.toLowerCase();
  return QUALIFIERS.filter((q) => low.includes(q));
}

/** True when the claim states causation/strength the excerpt does not (correlation→causation, dropped qualifier). */
export function detectCausalOverreach(claim: string, excerpt: string): { overreach: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (CAUSAL_STRONG.test(claim) && !CAUSAL_STRONG.test(excerpt)) {
    if (CORRELATION_LANG.test(excerpt) || detectQualifiers(excerpt).length > 0) {
      reasons.push("Claim states strong causation; source uses correlation or qualified language.");
    }
  }
  const claimQ = detectQualifiers(claim);
  const excerptQ = detectQualifiers(excerpt);
  if (excerptQ.length > claimQ.length && excerptQ.some((q) => !claimQ.includes(q))) {
    reasons.push(`Qualifier lost: source says "${excerptQ.find((q) => !claimQ.includes(q))}" but the claim does not.`);
  }
  if (STRONG_CLAIM.test(claim) && !STRONG_CLAIM.test(excerpt)) {
    reasons.push("Absolute claim (always/never/proves) is stronger than the source wording.");
  }
  return { overreach: reasons.length > 0, reasons };
}

// ---------------------------------------------------------------------------
// Freshness: F(t) = e^(-λΔt), domain-specific decay.
// ---------------------------------------------------------------------------

export const FRESHNESS_LAMBDAS: Record<string, number> = {
  mathematics: 0.02, history: 0.05, course_notes: 0.1, general: 0.15,
  law: 0.3, medicine: 0.35, software: 0.5,
};

/** Freshness score in [0,1]; 1 = published/verified now. Unknown date → 0.5 (explicit ignorance). */
export function freshnessScore(sourceDate: Date | null | undefined, now: Date, domain = "general"): number {
  if (!sourceDate) return 0.5;
  const lambda = FRESHNESS_LAMBDAS[domain] ?? FRESHNESS_LAMBDAS.general!;
  const years = Math.max(0, (now.getTime() - new Date(sourceDate).getTime()) / 86_400_000 / 365.25);
  return Math.round(Math.exp(-lambda * years) * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Composite rerank: R = Σw·S − Σw·P, weights configurable per course.
// ---------------------------------------------------------------------------

export interface RerankFeatures {
  semantic: number; lexical: number; authority: number; freshness: number;
  coverage: number; temporal: number; contradiction: number; duplicate: number;
}

export interface RerankWeights {
  ws: number; wl: number; wa: number; wf: number; wc: number; wt: number; wx: number; wd: number;
}

export const DEFAULT_WEIGHTS: RerankWeights = {
  ws: 0.3, wl: 0.25, wa: 0.12, wf: 0.08, wc: 0.1, wt: 0.05, wx: 0.15, wd: 0.2,
};

export function compositeRerank(f: RerankFeatures, w: RerankWeights = DEFAULT_WEIGHTS): number {
  const r = w.ws * f.semantic + w.wl * f.lexical + w.wa * f.authority
    + w.wf * f.freshness + w.wc * f.coverage + w.wt * f.temporal
    - w.wx * f.contradiction - w.wd * f.duplicate;
  return Math.round(Math.max(0, Math.min(1, r)) * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Query-type routing: different questions need different evidence policies.
// ---------------------------------------------------------------------------

const QUERY_PATTERNS: { type: QueryType; re: RegExp }[] = [
  { type: "definition", re: /^(what is|what are|define|definition of|meaning of)\b/i },
  { type: "howto", re: /\b(how (do|can|should|to)|steps? to|guide|tutorial|procedure)\b/i },
  { type: "historical", re: /\b(in \d{4}|history of|historical|when did|timeline|century|before the|after the)\b/i },
  { type: "scientific", re: /\b(study|studies|research shows|evidence for|clinical|trial|efficacy|mechanism|hypothesis)\b/i },
  { type: "legal", re: /\b(law|legal|regulation|compliance|statute|contract|liab\w*|jurisdiction|policy requires)\b/i },
  { type: "comparison", re: /\b(vs\.?|versus|compare|comparison|difference between|better than|pros and cons)\b/i },
  { type: "why", re: /^(why|what causes|what caused|explain why)\b/i },
  { type: "research", re: /\b(disagreement|debate|controvers\w*|open question|unknown|gaps? in|future research|state of the art)\b/i },
  { type: "exam", re: /\b(exam|test me|quiz me|practice (question|exam)|past paper)\b/i },
  { type: "learner_note", re: /\b(my notes?|what did i|according to my|i wrote|my (answer|interpretation))\b/i },
];

export function detectQueryType(question: string): QueryType {
  for (const { type, re } of QUERY_PATTERNS) if (re.test(question.trim())) return type;
  return "general";
}

/** Retrieval policy hints per query type (advisory unless course policy restricts). */
export function policyForQueryType(t: QueryType): {
  preferProcedures?: boolean; dateFilter?: boolean; requirePrimary?: boolean;
  requireCurrentJurisdiction?: boolean; needAllDimensions?: boolean; needCausal?: boolean;
  includeDisagreement?: boolean; approvedOnly?: boolean; learnerScope?: boolean; preferGlossary?: boolean;
} {
  switch (t) {
    case "definition": return { preferGlossary: true };
    case "howto": return { preferProcedures: true };
    case "historical": return { dateFilter: true };
    case "scientific": return { requirePrimary: true };
    case "legal": return { requireCurrentJurisdiction: true };
    case "comparison": return { needAllDimensions: true };
    case "why": return { needCausal: true };
    case "research": return { includeDisagreement: true };
    case "exam": return { approvedOnly: true };
    case "learner_note": return { learnerScope: true };
    default: return {};
  }
}

// ---------------------------------------------------------------------------
// Verification labels from entailment signals.
// ---------------------------------------------------------------------------

export interface EntailmentSignals {
  directSupport: number; qualifiedSupport: number; contradicting: number;
  synthesized: boolean; isInference: boolean; foundNothing: boolean;
}

export function deriveVerificationLabel(s: EntailmentSignals): VerificationLabel {
  if (s.foundNothing) return "NOT_FOUND";
  if (s.contradicting > 0 && s.directSupport > 0) return "CONFLICTING";
  if (s.isInference && s.directSupport === 0) return "REASONED_INFERENCE";
  if (s.synthesized && s.directSupport >= 2) return "SYNTHESIZED";
  if (s.directSupport > 0 && s.qualifiedSupport > 0) return "QUALIFIED_SUPPORT";
  if (s.directSupport > 0) return "DIRECTLY_SUPPORTED";
  if (s.qualifiedSupport > 0) return "QUALIFIED_SUPPORT";
  if (s.contradicting > 0) return "CONFLICTING";
  return "UNCERTAIN";
}

export function epistemicStateFor(args: {
  fromLearner?: boolean; speculative?: boolean; inference?: boolean; multiSource?: boolean;
}): EpistemicState {
  if (args.fromLearner) return "LEARNER_CONTRIBUTION";
  if (args.speculative) return "SPECULATION";
  if (args.inference) return "MODEL_INFERENCE";
  if (args.multiSource) return "SOURCE_SYNTHESIS";
  return "SOURCE_FACT";
}

// ---------------------------------------------------------------------------
// Multi-dimensional evidence-quality scores (never a "truth score").
// ---------------------------------------------------------------------------

export interface ClaimScoreInput {
  weight: number; adequate: boolean; entailment: number;
  sourceIds: string[]; hasHash: boolean; hasVersion: boolean;
}

export interface EvidenceQualityScores {
  claimCoverage: number; entailment: number; completeness: number;
  diversity: number; contradictionExposure: number; provenanceIntegrity: number;
  conflictingDetected: boolean;
}

/**
 * Claim coverage C = Σωᵢ·1(adequateᵢ)/Σωᵢ. Diversity = 1 − max source share
 * (independent sources, not one document). Provenance = citations resolving
 * to stable hashed + versioned evidence objects.
 */
export function scoreEvidenceQuality(
  claims: ClaimScoreInput[],
  meta: { totalClaims: number; contradictionsConsidered: number; contradictionsPresent: number },
): EvidenceQualityScores {
  const wSum = claims.reduce((s, c) => s + c.weight, 0) || 1;
  const claimCoverage = claims.reduce((s, c) => s + c.weight * (c.adequate ? 1 : 0), 0) / wSum;
  const entailment = claims.length ? claims.reduce((s, c) => s + c.entailment, 0) / claims.length : 0;
  const completeness = meta.totalClaims ? claims.filter((c) => c.adequate).length / meta.totalClaims : 0;
  const counts = new Map<string, number>();
  for (const c of claims) for (const id of c.sourceIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const totalRefs = [...counts.values()].reduce((s, n) => s + n, 0);
  const diversity = totalRefs === 0 ? 0 : 1 - Math.max(...counts.values()) / totalRefs;
  const contradictionExposure = meta.contradictionsPresent === 0
    ? 1
    : meta.contradictionsConsidered / meta.contradictionsPresent;
  const provenanceIntegrity = claims.length
    ? claims.filter((c) => c.hasHash && c.hasVersion).length / claims.length : 0;
  const r = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100) / 100;
  return {
    claimCoverage: r(claimCoverage), entailment: r(entailment), completeness: r(completeness),
    diversity: r(diversity), contradictionExposure: r(Math.min(1, contradictionExposure)),
    provenanceIntegrity: r(provenanceIntegrity),
    conflictingDetected: meta.contradictionsPresent > 0,
  };
}

// ---------------------------------------------------------------------------
// Contradiction taxonomy: not all disagreement is true contradiction.
// ---------------------------------------------------------------------------

const YEAR_RE = /\b(19|20)\d{2}\b/g;
const POP_WORDS = /\b(adults|children|elderly|men|women|patients|students|athletes|pregnant|neonates|adolescents)\b/i;
const METHOD_WORDS = /\b(randomized|placebo|cohort|survey|meta-analysis|case study|in vitro|in vivo|measured|methodology|dosage|dose)\b/i;
const JURIS_WORDS = /\b(EU|UK|US|California|GDPR|FDA|NHS|federal|state law|directive|article \d+)\b/i;
const DEFINITIONAL = /\b(is defined as|defined as|refers to|means that|definition)\b/i;

export function classifyContradiction(a: string, b: string, extractionConfidence = 1): ContradictionKind {
  if (extractionConfidence < 0.4) return "extraction_error";
  const yearsA = new Set(a.match(YEAR_RE) ?? []);
  const yearsB = new Set(b.match(YEAR_RE) ?? []);
  if (yearsA.size > 0 && yearsB.size > 0 && ![...yearsA].some((y) => yearsB.has(y))) return "time_periods";
  const popA = a.match(POP_WORDS)?.[0]?.toLowerCase();
  const popB = b.match(POP_WORDS)?.[0]?.toLowerCase();
  if (popA && popB && popA !== popB) return "populations";
  if (JURIS_WORDS.test(a) || JURIS_WORDS.test(b)) return "jurisdictions";
  if (METHOD_WORDS.test(a) || METHOD_WORDS.test(b)) return "methods";
  if (DEFINITIONAL.test(a) || DEFINITIONAL.test(b)) return "definitions";
  const hedge = /\b(may|sometimes|in some|can also|alternatively|complement)\b/i;
  if (hedge.test(a) || hedge.test(b)) return "complementary";
  const abstract = /\b(in principle|theoretically|in practice|pragmatically|at scale)\b/i;
  if (abstract.test(a) || abstract.test(b)) return "abstraction";
  const overlap = tokenOverlap(a, b);
  if (overlap < 0.15) return "unresolved";
  return "direct";
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
  const tb = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

// ---------------------------------------------------------------------------
// Answer-mode rules: hallucination-resistant generation policies.
// ---------------------------------------------------------------------------

export interface ModeRules {
  allowInference: boolean; allowSpeculation: boolean; requireApprovedOnly: boolean;
  refuseBelowCoverage: number; externalSources: boolean; hintsInsteadOfAnswers: boolean;
}

export const MODE_RULES: Record<AnswerMode, ModeRules> = {
  STRICT: { allowInference: false, allowSpeculation: false, requireApprovedOnly: true, refuseBelowCoverage: 0.5, externalSources: false, hintsInsteadOfAnswers: false },
  GUIDED: { allowInference: true, allowSpeculation: false, requireApprovedOnly: false, refuseBelowCoverage: 0.25, externalSources: true, hintsInsteadOfAnswers: false },
  EXPLORATORY: { allowInference: true, allowSpeculation: true, requireApprovedOnly: false, refuseBelowCoverage: 0, externalSources: true, hintsInsteadOfAnswers: false },
  EXAM: { allowInference: false, allowSpeculation: false, requireApprovedOnly: true, refuseBelowCoverage: 0, externalSources: false, hintsInsteadOfAnswers: true },
};

/** Exam-mode retrieval practice: hints + questions instead of direct answers. */
export function examHints(question: string, claims: AtomicClaim[]): string[] {
  return claims.slice(0, 4).map((c) => `What evidence in your course materials supports: "${c.text}"?`);
}
