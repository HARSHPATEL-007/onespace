/**
 * N0VA BOOKLM EDUCATION — Content Integrity + Academic Safety deep layer.
 *
 * Pure, deterministic companions to quality-checks.ts / quality.ts:
 * provenance registry records, claim-level citation audits with severity,
 * per-rule freshness assessment, proportionate safety dispositions,
 * artifact-type policy presets over the publication decision engine,
 * deterministic reading-adapt plans, decision audit entries, and approval
 * state derivation. No single opaque score anywhere: every dimension keeps
 * its own status, evidence, and reviewer.
 */
import { z } from "zod";
import {
  publicationDecision,
  type PublicationDecision,
  type PublicationInput,
  type RightsStatus,
  type SafetyFinding,
} from "./quality-checks";

// ---------------------------------------------------------------------------
// 1. Provenance registry.
// ---------------------------------------------------------------------------

export const provenanceSourceSchema = z.object({
  id: z.string().min(1).max(200),
  version: z.string().max(50).default("v1"),
  location: z.string().max(300).default(""),
  hash: z.string().max(200).default(""),
  rights: z.object({
    license: z.string().max(200).default("unknown"),
    expires_at: z.string().nullable().default(null),
    derivative_allowed: z.boolean().default(false),
    attribution_required: z.boolean().default(false),
  }).default({}),
});

export const provenanceSchema = z.object({
  content_id: z.string().min(1).max(200),
  parent_sources: z.array(provenanceSourceSchema).min(1).max(50),
  generated_by: z.string().max(200).default(""),
  model_version: z.string().max(100).default(""),
  human_review: z.string().nullable().default(null),
  publication_state: z.enum(["draft", "in_review", "approved", "published", "withdrawn"]).default("draft"),
});

export type ProvenanceRecord = z.infer<typeof provenanceSchema>;
export type ProvenanceSource = z.infer<typeof provenanceSourceSchema>;

/** Validated provenance record. Throws (zod) on missing parents or bad shape. */
export function buildProvenanceRecord(input: unknown): ProvenanceRecord {
  return provenanceSchema.parse(input);
}

/** Lineage link for a single generated span back to its source passage. */
export function lineageLink(span: { artifactId: string; spanId: string; text: string }, source: { id: string; version: string; location: string }): {
  artifact_id: string; span_id: string; excerpt: string; source_id: string; source_version: string; source_location: string;
} {
  return {
    artifact_id: span.artifactId,
    span_id: span.spanId,
    excerpt: span.text.slice(0, 200),
    source_id: source.id,
    source_version: source.version,
    source_location: source.location,
  };
}

// ---------------------------------------------------------------------------
// 2. Claim-level citation audit with severity.
// ---------------------------------------------------------------------------

const CITATION_MARKERS = [
  /doc_[\w-]*:v\d+/,
  /\bp\s?\d+\b/,
  /\bchapter\b/i,
  /\bslide_\d+\b/i,
  /\[\d+:\d+-\d+:\d+\]/,
  /\(\d{4}\)/,
  /cite_[\w-]+/i,
];

const QUANT_HINT = /\b\d+(\.\d+)?\s*(%|percent|students|kg|mg|ml|cm|mm|km|years?|days?|hours?|minutes?|seconds?|°C|degrees?)\b/i;
const DATE_HINT = /\b(19|20)\d{2}\b|\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;
const FIGURE_HINT = /\b(figure|fig\.|table|chart|graph|diagram)\s+\d+/i;

export type CitationSeverity = "critical" | "major" | "moderate" | "minor";

export interface ClaimCitationFinding {
  claim: string;
  cited: boolean;
  supported: boolean;
  severity: CitationSeverity | null;
  note: string;
}

export interface ArtifactCitationAudit {
  artifact_id: string;
  claims_total: number;
  claims_cited: number;
  supported_citations: number;
  weak_citations: number;
  missing_citations: number;
  by_severity: Record<CitationSeverity, number>;
  findings: ClaimCitationFinding[];
  status: "passed" | "review_required" | "blocked";
}

/**
 * Claim-level audit over artifact text. Quantitative claims need date, units
 * and context; quotations need balanced bounds plus an adjacent marker;
 * figure/table mentions need an origin cite. Severity follows the spec:
 * critical = unsupported high-stakes/answer-key claim, major = central
 * concept, moderate = example/statistic/comparison, minor = context wording.
 */
export function auditArtifactCitations(
  artifactId: string,
  text: string,
  opts: { highStakes?: boolean; answerKey?: boolean } = {},
): ArtifactCitationAudit {
  const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 20);
  const findings: ClaimCitationFinding[] = [];
  for (const s of sentences.slice(0, 200)) {
    const hasMarker = CITATION_MARKERS.some((re) => re.test(s));
    const quantitative = QUANT_HINT.test(s);
    const hasDate = DATE_HINT.test(s);
    const isQuote = /^["“]/.test(s) || (s.match(/["“”]/g) ?? []).length >= 2;
    const figureRef = FIGURE_HINT.test(s);
    const central = s.length > 80 || /is defined|means that|refers to|causes|always|never/i.test(s);
    const exampleLike = /example|for instance|such as|statistic|compar/i.test(s);
    if (!hasMarker) {
      const severity: CitationSeverity =
        opts.highStakes || opts.answerKey ? "critical"
        : central ? "major"
        : exampleLike || quantitative ? "moderate" : "minor";
      findings.push({ claim: s.slice(0, 120), cited: false, supported: false, severity, note: "No citation marker" });
      continue;
    }
    // Cited: check sufficiency → weak vs supported.
    if (quantitative && !hasDate) {
      findings.push({ claim: s.slice(0, 120), cited: true, supported: false, severity: "moderate", note: "Quantitative claim missing reference date/context" });
    } else if (isQuote && !CITATION_MARKERS.some((re) => re.test(s.slice(-60)))) {
      findings.push({ claim: s.slice(0, 120), cited: true, supported: false, severity: "moderate", note: "Quotation without adjacent bounding citation" });
    } else if (figureRef && !/origin|source|adapted from/i.test(s)) {
      findings.push({ claim: s.slice(0, 120), cited: true, supported: false, severity: "moderate", note: "Figure/table mention without origin cite" });
    } else {
      findings.push({ claim: s.slice(0, 120), cited: true, supported: true, severity: null, note: "Cited" });
    }
  }
  const by_severity: Record<CitationSeverity, number> = { critical: 0, major: 0, moderate: 0, minor: 0 };
  let cited = 0, supported = 0, weak = 0, missing = 0;
  for (const f of findings) {
    if (f.cited) cited++;
    if (f.supported) supported++;
    if (f.cited && !f.supported) weak++;
    if (!f.cited) missing++;
    if (f.severity) by_severity[f.severity]++;
  }
  return {
    artifact_id: artifactId,
    claims_total: findings.length,
    claims_cited: cited,
    supported_citations: supported,
    weak_citations: weak,
    missing_citations: missing,
    by_severity,
    findings: findings.slice(0, 50),
    status: by_severity.critical > 0 ? "blocked" : missing + weak > 0 ? "review_required" : "passed",
  };
}

// ---------------------------------------------------------------------------
// 3. Per-rule freshness assessment.
// ---------------------------------------------------------------------------

export interface FreshnessRuleInput {
  claimType: string;
  jurisdiction?: string;
  validDays: number;
  refreshDays: number;
  requiredReviewer?: string;
}

export type FreshnessMark = "unaffected" | "citation_only" | "review_recommended" | "regeneration_required" | "publication_blocked";

export interface FreshnessAssessment {
  claimType: string;
  jurisdiction: string;
  ageDays: number;
  state: "current" | "aging" | "stale";
  mark: FreshnessMark;
  requiredReviewer: string;
  note: string;
}

const STRICT_CLAIM_TYPES = new Set(["medical", "medical_guidance", "regulation", "law", "safety", "safety_instruction"]);

/**
 * Freshness per subject/claim-type rule. Historical facts tolerate age;
 * medical, legal/regulatory and safety claims block publication when stale
 * instead of merely queuing regeneration.
 */
export function assessFreshnessForRules(ageDays: number, rules: FreshnessRuleInput[]): { assessments: FreshnessAssessment[]; worst: FreshnessMark } {
  const order: FreshnessMark[] = ["unaffected", "citation_only", "review_recommended", "regeneration_required", "publication_blocked"];
  const assessments = rules.map((r) => {
    const strict = STRICT_CLAIM_TYPES.has(r.claimType.toLowerCase());
    let state: FreshnessAssessment["state"], mark: FreshnessMark, note: string;
    if (ageDays <= r.refreshDays) {
      state = "current"; mark = "unaffected"; note = `Within ${r.refreshDays}d refresh interval`;
    } else if (ageDays <= r.validDays) {
      state = "aging"; mark = strict ? "review_recommended" : "citation_only";
      note = strict ? "Aging strict-type claim — expert review before reuse" : "Aging — citation refresh suffices";
    } else {
      state = "stale"; mark = strict ? "publication_blocked" : "regeneration_required";
      note = strict ? `Stale ${r.claimType} claim — publication blocked pending ${r.requiredReviewer || "expert"} review` : "Stale — regenerate from current sources";
    }
    return {
      claimType: r.claimType, jurisdiction: r.jurisdiction ?? "", ageDays: Math.round(ageDays),
      state, mark, requiredReviewer: r.requiredReviewer ?? "", note,
    };
  });
  const worst = assessments.reduce<FreshnessMark>((w, a) => (order.indexOf(a.mark) > order.indexOf(w) ? a.mark : w), "unaffected");
  return { assessments, worst };
}

// ---------------------------------------------------------------------------
// 4. Proportionate safety dispositions.
// ---------------------------------------------------------------------------

export type SafetyAction = "pass" | "warn" | "transform" | "block" | "escalate";

export interface SafetyDisposition {
  action: SafetyAction;
  requiredReviewers: string[];
  safeAlternative: string | null;
  warnings: string[];
  notes: string[];
}

/**
 * Proportionate safety behavior: block disallowed content, transform risky
 * material into safe conceptual explanations, warn with supervision
 * requirements, escalate ambiguity. Children/minor bands upgrade medium
 * findings and add guardian/institution workflows with data minimization.
 */
export function safetyDisposition(findings: SafetyFinding[], ageBand = ""): SafetyDisposition {
  const isChild = /child|minor|kid|age_1[0-3]|under.?1[48]/i.test(ageBand);
  const high = findings.filter((f) => f.severity === "high");
  const medium = findings.filter((f) => f.severity !== "high");
  const reviewers = new Set<string>();
  const warnings: string[] = [];
  const notes: string[] = [];
  let action: SafetyAction = "pass";
  let safeAlternative: string | null = null;

  if (high.length > 0) {
    action = "block";
    reviewers.add("subject_instructor");
    reviewers.add("institutional_safety_officer");
    const alt = high.find((f) => f.alternative)?.alternative;
    if (alt) safeAlternative = alt;
    notes.push(`${high.length} high-severity finding(s) — auto-publish blocked`);
  } else if (medium.length > 0) {
    action = isChild ? "block" : "escalate";
    reviewers.add("subject_instructor");
    if (isChild) reviewers.add("institutional_safety_officer");
    const alt = medium.find((f) => f.alternative)?.alternative;
    if (alt) safeAlternative = alt;
    notes.push(`${medium.length} medium finding(s) — ${isChild ? "blocked under child defaults" : "authorized reviewer must decide"}`);
  }
  if (isChild) {
    reviewers.add("guardian_or_institution_workflow");
    warnings.push("Child band: stricter defaults, age-aware access, data minimization");
    notes.push("Decision logged without storing unnecessary sensitive prompts");
  }
  if (action === "escalate") warnings.push("Add supervision requirements and warnings on publish");
  return { action, requiredReviewers: [...reviewers], safeAlternative, warnings, notes };
}

// ---------------------------------------------------------------------------
// 5. Artifact-type policy presets over the publication decision engine.
// ---------------------------------------------------------------------------

export type StakeLevel = "low" | "standard" | "high";

export interface ArtifactPolicy {
  stake: StakeLevel;
  /** Contradiction count that forces human review (default 2). */
  maxContradictions: number;
  /** A11y warnings (non-blocking) force remediation. */
  strictA11y: boolean;
  /** Bias/cultural medium findings force specialist review. */
  strictCulture: boolean;
  instructorRequired: boolean;
}

export const ARTIFACT_POLICIES: Record<string, ArtifactPolicy> = {
  glossary: { stake: "low", maxContradictions: 2, strictA11y: false, strictCulture: false, instructorRequired: true },
  summary: { stake: "low", maxContradictions: 2, strictA11y: false, strictCulture: false, instructorRequired: true },
  revision_sheet: { stake: "low", maxContradictions: 2, strictA11y: false, strictCulture: false, instructorRequired: true },
  practice_test: { stake: "high", maxContradictions: 1, strictA11y: true, strictCulture: true, instructorRequired: true },
  coding_assignment: { stake: "high", maxContradictions: 1, strictA11y: true, strictCulture: true, instructorRequired: true },
  lab: { stake: "high", maxContradictions: 1, strictA11y: true, strictCulture: true, instructorRequired: true },
  medical: { stake: "high", maxContradictions: 0, strictA11y: true, strictCulture: true, instructorRequired: true },
};

export const DEFAULT_ARTIFACT_POLICY: ArtifactPolicy =
  { stake: "standard", maxContradictions: 2, strictA11y: false, strictCulture: false, instructorRequired: true };

export interface ArtifactDecisionInput {
  artifactType: string;
  rights: RightsStatus;
  safetyHigh?: boolean;
  safetyDisallowed?: boolean;
  criticalMissing?: boolean;
  contradictionCount?: number;
  a11yBlocking?: boolean;
  a11yWarnings?: number;
  biasHigh?: boolean;
  biasFindings?: number;
  culturalHigh?: boolean;
  culturalFindings?: number;
  instructorApproved?: boolean;
}

/**
 * Policy-driven release gate. A low-stakes glossary and a graded medical lab
 * never share a release threshold: high-stakes artifacts trip human review
 * at one contradiction, treat a11y warnings as remediation, and treat any
 * bias/cultural finding as specialist review.
 */
export function publicationDecisionForArtifact(input: ArtifactDecisionInput): {
  decision: PublicationDecision; reasons: string[]; policy: ArtifactPolicy;
} {
  const policy = ARTIFACT_POLICIES[input.artifactType] ?? DEFAULT_ARTIFACT_POLICY;
  const pubInput: PublicationInput = {
    rights: input.rights,
    safetyHigh: input.safetyHigh,
    safetyDisallowed: input.safetyDisallowed,
    criticalMissing: input.criticalMissing,
    majorContradictions: (input.contradictionCount ?? 0) >= policy.maxContradictions,
    a11yBlocking: input.a11yBlocking || (policy.strictA11y && (input.a11yWarnings ?? 0) > 0),
    biasHigh: input.biasHigh || (policy.strictCulture && (input.biasFindings ?? 0) > 0),
    culturalHigh: input.culturalHigh || (policy.strictCulture && (input.culturalFindings ?? 0) > 0),
    instructorApproved: policy.instructorRequired ? input.instructorApproved : true,
  };
  // High-stakes critical rule: any missing citation on graded/safety content blocks.
  if (policy.stake === "high" && input.criticalMissing) {
    return { decision: "blocked", reasons: [`citations: critical missing (high-stakes ${input.artifactType})`], policy };
  }
  const res = publicationDecision(pubInput);
  return { ...res, policy, reasons: [`policy: ${input.artifactType} (${policy.stake} stakes)`, ...res.reasons] };
}

// ---------------------------------------------------------------------------
// 6. Deterministic reading-adapt plan (instructor-approvable edit ops).
// ---------------------------------------------------------------------------

export type ReadingAdaptOp =
  | { op: "split"; sentence: string; words: number }
  | { op: "define"; terms: string[] }
  | { op: "break_paragraph"; index: number; words: number }
  | { op: "convert_passive"; sentence: string };

/**
 * Adapt mode without silent rewriting: returns concrete edit operations that
 * preserve concepts, citations, formulas and objectives for instructor
 * approval. Measure-only and suggest modes are the profile + its actions.
 */
export function readingAdaptPlan(text: string, targetBand: string): { target: string; ops: ReadingAdaptOp[]; note: string } {
  const ops: ReadingAdaptOp[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  for (const s of sentences) {
    const words = s.split(/\s+/).length;
    if (words > 24) ops.push({ op: "split", sentence: s.slice(0, 120), words });
    if (/\b(was|were|is|are|been|being)\s+\w+ed\b/i.test(s)) ops.push({ op: "convert_passive", sentence: s.slice(0, 120) });
  }
  const terms = [...new Set(
    text.split(/\s+/).map((w) => w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "")).filter((w) => w.length > 12),
  )].slice(0, 8);
  if (terms.length > 0) ops.push({ op: "define", terms });
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim());
  paras.forEach((p, i) => {
    const words = p.split(/\s+/).length;
    if (words > 150) ops.push({ op: "break_paragraph", index: i, words });
  });
  return {
    target: targetBand,
    ops: ops.slice(0, 20),
    note: "Adapt preserves concepts, citations, formulas and objectives — instructor approves each op; scores never measure learner ability.",
  };
}

// ---------------------------------------------------------------------------
// 7. Decision audit entry (measurable control, not aspiration).
// ---------------------------------------------------------------------------

export interface DecisionAuditEntry {
  rule_version: string;
  input_artifact_version: string;
  evidence: string[];
  confidence: number;
  uncertainty: string[];
  decision: string;
  reviewer_override: string | null;
  timestamp: string;
  final_disposition: string;
  downstream_affected: string[];
}

export function decisionAuditEntry(args: {
  ruleVersion: string;
  artifactVersion: string | number;
  evidence?: string[];
  confidence?: number;
  uncertainty?: string[];
  decision: string;
  reviewerOverride?: string | null;
  disposition?: string;
  downstream?: string[];
}): DecisionAuditEntry {
  return {
    rule_version: args.ruleVersion,
    input_artifact_version: String(args.artifactVersion),
    evidence: args.evidence ?? [],
    confidence: Math.max(0, Math.min(1, args.confidence ?? 0.5)),
    uncertainty: args.uncertainty ?? [],
    decision: args.decision,
    reviewer_override: args.reviewerOverride ?? null,
    timestamp: new Date().toISOString(),
    final_disposition: args.disposition ?? args.decision,
    downstream_affected: args.downstream ?? [],
  };
}

// ---------------------------------------------------------------------------
// 8. Approval state derivation (stateful, auditable, granular).
// ---------------------------------------------------------------------------

export type ApprovalState = "approved" | "blocked" | "changes_requested" | "pending" | "no_reviews";

export interface ApprovalStateResult {
  state: ApprovalState;
  perQueue: { queue: string; status: string }[];
  blocking: number;
  overdue: boolean;
  summary: string;
}

/**
 * Derives the workflow state from required queue reviews: any REJECTED
 * blocks; any CHANGES_REQUESTED (without rejection) requests changes; all
 * APPROVED/WAIVED approves; otherwise pending. Overdue is caller-supplied
 * deadline vs now — no hidden clock.
 */
export function approvalStateFromReviews(
  reviews: { queue: string; status: string }[],
  requiredQueues: string[],
  deadlineIso?: string | null,
  nowIso?: string,
): ApprovalStateResult {
  const byQueue = new Map(reviews.map((r) => [r.queue, r.status]));
  const perQueue = requiredQueues.map((q) => ({ queue: q, status: byQueue.get(q) ?? "PENDING" }));
  const missing = requiredQueues.filter((q) => !byQueue.has(q));
  let state: ApprovalState;
  let blocking = 0;
  if (requiredQueues.length === 0) {
    state = "no_reviews";
  } else if (perQueue.some((p) => p.status === "REJECTED")) {
    state = "blocked";
    blocking = perQueue.filter((p) => p.status === "REJECTED").length;
  } else if (perQueue.some((p) => p.status === "CHANGES_REQUESTED")) {
    state = "changes_requested";
    blocking = perQueue.filter((p) => p.status === "CHANGES_REQUESTED").length;
  } else if (perQueue.every((p) => p.status === "APPROVED" || p.status === "WAIVED")) {
    state = "approved";
  } else {
    state = "pending";
    blocking = perQueue.filter((p) => p.status === "PENDING").length + missing.length;
  }
  const overdue = !!deadlineIso && (nowIso ?? new Date().toISOString()) > deadlineIso && state !== "approved";
  return {
    state, perQueue, blocking, overdue,
    summary: state === "approved" ? "All required reviews approved"
      : state === "blocked" ? `${blocking} rejection(s) block publication`
      : state === "changes_requested" ? `${blocking} queue(s) request changes`
      : state === "no_reviews" ? "No reviews required"
      : `${blocking} review(s) pending${overdue ? " — overdue" : ""}`,
  };
}
