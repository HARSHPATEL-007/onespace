/**
 * N0VA1O Built-in Grounding Tools — native web grounding and evidence lookup
 * to verify claims before acting or responding (spec: grounding tools).
 *
 * Reduces hallucination risk by replacing free-form generation with evidence-
 * backed reasoning. Attaches citations, blocks unsupported outputs, and
 * escalates low-evidence situations.
 */

/* ---------- evidence retrieval ---------- */

export type SourceType = "web" | "internal_kb" | "document" | "ticket" | "record" | "public";

export interface Evidence {
  id: string;
  sourceType: SourceType;
  sourceUrl: string;
  title: string;
  snippet: string;
  retrievedAt: string;
  authority: number;
  recency: number;
  relevance: number;
}

export interface RetrievalContext {
  query: string;
  tenantId: string;
  sources: SourceType[];
  maxResults?: number;
}

/**
 * Retrieve evidence from approved sources. Pure function — in production this
 * calls search APIs; here it returns normalized evidence records.
 */
export function retrieveEvidence(ctx: RetrievalContext, corpus: Evidence[]): Evidence[] {
  const max = ctx.maxResults ?? 10;
  return corpus
    .filter((e) => ctx.sources.includes(e.sourceType))
    .map((e) => ({ ...e, relevance: scoreRelevance(e, ctx.query) }))
    .sort((a, b) => b.authority * b.recency * b.relevance - a.authority * a.recency * a.relevance)
    .slice(0, max);
}

function scoreRelevance(evidence: Evidence, query: string): number {
  const terms = query.toLowerCase().split(/\s+/);
  const text = `${evidence.title} ${evidence.snippet}`.toLowerCase();
  const matches = terms.filter((t) => text.includes(t)).length;
  return terms.length > 0 ? matches / terms.length : 0;
}

/* ---------- claim verification ---------- */

export type ClaimStatus = "verified" | "inferred" | "uncertain" | "unsupported";

export interface Claim {
  text: string;
  status: ClaimStatus;
  citations: string[];
  confidence: number;
}

/**
 * Extract atomic claims from a draft answer. Pure — splits into sentences.
 */
export function extractClaims(draft: string): string[] {
  return draft
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);
}

/**
 * Verify each claim against retrieved evidence. Returns claims with status,
 * citations, and confidence. Pure.
 */
export function verifyClaims(claims: string[], evidence: Evidence[]): Claim[] {
  return claims.map((text) => {
    const supporting = evidence.filter((e) => evidenceSupports(e, text));
    if (supporting.length === 0) {
      return { text, status: "unsupported", citations: [], confidence: 0 };
    }
    const top = supporting[0]!;
    const confidence = Math.min(1, 0.4 + top.authority * top.relevance * 0.5 + supporting.length * 0.1);
    const status: ClaimStatus = confidence >= 0.7 ? "verified" : confidence >= 0.4 ? "inferred" : "uncertain";
    return { text, status, citations: supporting.map((e) => e.sourceUrl), confidence: Math.round(confidence * 100) / 100 };
  });
}

function evidenceSupports(evidence: Evidence, claim: string): boolean {
  const claimTerms = claim.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const evidenceText = `${evidence.title} ${evidence.snippet}`.toLowerCase();
  const matches = claimTerms.filter((t) => evidenceText.includes(t)).length;
  return claimTerms.length > 0 && matches / claimTerms.length >= 0.5;
}

/* ---------- citation enforcement ---------- */

export interface CitationResult {
  grounded: string;
  rejected: string[];
  claims: Claim[];
}

/**
 * Enforce citations: remove or mark unsupported claims, attach citations to
 * grounded ones. Pure.
 */
export function enforceCitations(draft: string, evidence: Evidence[]): CitationResult {
  const claims = verifyClaims(extractClaims(draft), evidence);
  const groundedParts: string[] = [];
  const rejected: string[] = [];

  for (const claim of claims) {
    if (claim.status === "unsupported") {
      rejected.push(claim.text);
    } else if (claim.citations.length > 0) {
      groundedParts.push(`${claim.text} [${claim.citations.join(", ")}]`);
    } else {
      groundedParts.push(claim.text);
    }
  }

  return { grounded: groundedParts.join(". "), rejected, claims };
}

/* ---------- confidence and fallback ---------- */

export interface GroundingDecision {
  action: "respond" | "defer" | "refuse" | "escalate";
  confidence: number;
  reason: string;
}

/**
 * Decide whether to respond, defer, refuse, or escalate based on groundedness.
 * Pure.
 */
export function decideGrounding(claims: Claim[], requireHighConfidence: boolean = false): GroundingDecision {
  if (claims.length === 0) return { action: "refuse", confidence: 0, reason: "No claims to verify" };
  const verified = claims.filter((c) => c.status === "verified").length;
  const unsupported = claims.filter((c) => c.status === "unsupported").length;
  const avgConfidence = claims.reduce((s, c) => s + c.confidence, 0) / claims.length;

  if (unsupported > verified) {
    return { action: "escalate", confidence: avgConfidence, reason: "More unsupported than verified claims" };
  }
  if (requireHighConfidence && avgConfidence < 0.7) {
    return { action: "defer", confidence: avgConfidence, reason: "High-stakes task requires stronger evidence" };
  }
  return { action: "respond", confidence: avgConfidence, reason: "Sufficiently grounded" };
}

/* ---------- high-stakes gating ---------- */

export type RiskDomain = "compliance" | "finance" | "security" | "medical" | "production" | "general";

export interface GateResult {
  approved: boolean;
  reason: string;
  requiresHumanReview: boolean;
}

/**
 * Gate high-stakes actions with mandatory grounding. Pure.
 */
export function gateHighStakes(opts: { domain: RiskDomain; claims: Claim[] }): GateResult {
  const highStakes: RiskDomain[] = ["compliance", "finance", "security", "medical", "production"];
  if (!highStakes.includes(opts.domain)) {
    return { approved: true, reason: "General domain — standard grounding", requiresHumanReview: false };
  }
  const verified = opts.claims.filter((c) => c.status === "verified").length;
  const total = opts.claims.length;
  const coverage = total > 0 ? verified / total : 0;

  if (coverage >= 0.8) {
    return { approved: true, reason: `${opts.domain}: ${(coverage * 100).toFixed(0)}% claims verified`, requiresHumanReview: false };
  }
  return { approved: false, reason: `${opts.domain}: only ${(coverage * 100).toFixed(0)}% verified — human review required`, requiresHumanReview: true };
}

/* ---------- governance ---------- */

export interface SourceRanking {
  source: string;
  authority: number;
  recency: number;
  relevance: number;
  score: number;
}

/**
 * Rank evidence by authority, recency, and relevance. Internal sources boost
 * authority for enterprise decisions. Pure.
 */
export function rankSources(evidence: Evidence[]): SourceRanking[] {
  return evidence
    .map((e) => ({
      source: e.sourceUrl,
      authority: e.authority * (e.sourceType === "internal_kb" || e.sourceType === "record" ? 1.3 : 1),
      recency: e.recency,
      relevance: e.relevance,
      score: Math.round(e.authority * e.recency * e.relevance * 1000) / 1000,
    }))
    .sort((a, b) => b.score - a.score);
}

/** Detect conflicting evidence (same topic, opposite signals). Pure. */
export function detectConflicts(evidence: Evidence[]): { topic: string; conflicting: Evidence[] }[] {
  const negated = evidence.filter((e) => /\b(not|never|no|denied|rejected|false)\b/i.test(e.snippet));
  if (negated.length > 0) {
    return [{ topic: "detected", conflicting: negated }];
  }
  return [];
}

export interface GroundingAudit {
  claimsChecked: number;
  sourcesUsed: string[];
  groundednessResult: string;
  verifiedAt: string;
}

/** Create an audit record for a grounded answer. Pure. */
export function auditGrounding(claims: Claim[], evidence: Evidence[]): GroundingAudit {
  return {
    claimsChecked: claims.length,
    sourcesUsed: [...new Set(evidence.map((e) => e.sourceUrl))],
    groundednessResult: `${claims.filter((c) => c.status === "verified").length}/${claims.length} verified`,
    verifiedAt: new Date().toISOString(),
  };
}

/* ---------- evaluation ---------- */

export interface GroundingMetrics {
  precision: number;
  citationCoverage: number;
  unsupportedRate: number;
  refusalRate: number;
}

/**
 * Measure grounding quality. Pure.
 */
export function measureGrounding(results: { claims: Claim[]; action: string }[]): GroundingMetrics {
  const allClaims = results.flatMap((r) => r.claims);
  const verified = allClaims.filter((c) => c.status === "verified").length;
  const unsupported = allClaims.filter((c) => c.status === "unsupported").length;
  const refusals = results.filter((r) => r.action === "refuse" || r.action === "escalate").length;
  const withCitations = allClaims.filter((c) => c.citations.length > 0).length;

  return {
    precision: allClaims.length > 0 ? verified / allClaims.length : 0,
    citationCoverage: allClaims.length > 0 ? withCitations / allClaims.length : 0,
    unsupportedRate: allClaims.length > 0 ? unsupported / allClaims.length : 0,
    refusalRate: results.length > 0 ? refusals / results.length : 0,
  };
}
