/**
 * Explainable-pedagogy policy — pure, dependency-free, deterministic.
 * Issue taxonomy, evidence reliability, strategy scoring, confidence scale,
 * governance checks, adaptation records. No prisma, no node APIs.
 */

export type IssueType =
  | "missing_prerequisite" | "definition_confusion" | "procedure_selection_error"
  | "execution_error" | "misconception" | "surface_pattern_matching"
  | "transfer_gap" | "retrieval_gap" | "confidence_miscalibration"
  | "language_or_representation_barrier" | "accessibility_barrier"
  | "ambiguous_prompt" | "insufficient_evidence";

export const ISSUES: Record<IssueType, { label: string; avoid: string; prefer: string }> = {
  missing_prerequisite: {
    label: "Missing prerequisite",
    avoid: "You do not understand the basics.",
    prefer: "Evidence points to a prerequisite gap — one building block needs repair before this step.",
  },
  definition_confusion: {
    label: "Definition confusion",
    avoid: "You do not know what this means.",
    prefer: "Two similar terms may be blending together — let's separate them precisely.",
  },
  procedure_selection_error: {
    label: "Procedure-selection error",
    avoid: "You chose the wrong method.",
    prefer: "The method chosen does not fit this problem's structure — let's compare methods.",
  },
  execution_error: {
    label: "Execution error",
    avoid: "You made a careless mistake.",
    prefer: "The setup looks right; the error is localized to one execution step.",
  },
  misconception: {
    label: "Misconception",
    avoid: "Your understanding is wrong.",
    prefer: "A current interpretation to revisit — here is what supports a different view.",
  },
  surface_pattern_matching: {
    label: "Surface pattern matching",
    avoid: "You are just guessing from surface features.",
    prefer: "The approach matches surface features rather than deep structure — let's test the distinction.",
  },
  transfer_gap: {
    label: "Transfer gap",
    avoid: "You do not understand probability.",
    prefer: "Familiar examples work, but a structurally different one did not — transfer needs practice, possibly with one clarification check first.",
  },
  retrieval_gap: {
    label: "Retrieval gap",
    avoid: "You forgot everything.",
    prefer: "Recall has not been checked recently — a short retrieval prompt will re-establish it.",
  },
  confidence_miscalibration: {
    label: "Confidence miscalibration",
    avoid: "You are overconfident.",
    prefer: "Confidence and performance diverge here — calibration practice will align them.",
  },
  language_or_representation_barrier: {
    label: "Language or representation barrier",
    avoid: "Your language skills are the problem.",
    prefer: "The wording or representation may be getting in the way — let's rephrase without changing the demand.",
  },
  accessibility_barrier: {
    label: "Accessibility barrier",
    avoid: "You cannot access this content.",
    prefer: "The current format has an access barrier — an equivalent format is available.",
  },
  ambiguous_prompt: {
    label: "Ambiguous prompt",
    avoid: "Your answer is wrong.",
    prefer: "The question itself may be ambiguous — clarification comes before any learning-path change.",
  },
  insufficient_evidence: {
    label: "Insufficient evidence",
    avoid: "The system knows what you need.",
    prefer: "There is not enough evidence for an intervention yet — one diagnostic check first.",
  },
};

export type EvidenceKind =
  | "learner_report" | "instructor_assessment" | "transfer_task" | "teachback"
  | "single_response" | "hint_use" | "latency" | "behavioral_signal"
  | "document_instruction";

export const EVIDENCE_RELIABILITY: Record<EvidenceKind, { reliability: string; use: string; weight: number }> = {
  learner_report: { reliability: "high for experience", use: "choose support, never diagnose mastery", weight: 0.8 },
  instructor_assessment: { reliability: "high", use: "update course-level mastery evidence", weight: 0.9 },
  transfer_task: { reliability: "high", use: "estimate flexible understanding", weight: 0.9 },
  teachback: { reliability: "medium-high", use: "assess conceptual organization", weight: 0.75 },
  single_response: { reliability: "moderate", use: "generate a candidate issue only", weight: 0.5 },
  hint_use: { reliability: "low-moderate", use: "adjust support, never infer ability", weight: 0.35 },
  latency: { reliability: "low without context", use: "never use alone", weight: 0.2 },
  behavioral_signal: { reliability: "context-dependent", use: "only with consent and safeguards", weight: 0.25 },
  document_instruction: { reliability: "not learner evidence", use: "untrusted content only", weight: 0 },
};

export interface StrategyFit {
  learningNeed?: number; evidenceQuality?: number; preferenceFit?: number;
  accessibilityFit?: number; policyFit?: number; timeFit?: number;
  complexity?: number; dependenceRisk?: number;
}

/** Transparent candidate scoring (factors explainable; raw score internal). */
export function strategyScore(fit: StrategyFit): { score: number; factors: { name: string; value: number }[] } {
  const f = (v: number | undefined, dflt: number) => v ?? dflt;
  const factors = [
    { name: "learning_need_fit", value: f(fit.learningNeed, 0.5) },
    { name: "evidence_quality", value: f(fit.evidenceQuality, 0.5) },
    { name: "preference_fit", value: f(fit.preferenceFit, 0.5) },
    { name: "accessibility_fit", value: f(fit.accessibilityFit, 0.8) },
    { name: "policy_fit", value: f(fit.policyFit, 0.8) },
    { name: "time_fit", value: f(fit.timeFit, 0.6) },
    { name: "unnecessary_complexity", value: -(f(fit.complexity, 0.3)) },
    { name: "risk_of_dependence", value: -(f(fit.dependenceRisk, 0.2)) },
  ];
  const score = Math.round(factors.reduce((s, x) => s + x.value, 0) * 100) / 100;
  return { score, factors: factors.map((x) => ({ ...x, value: Math.round(x.value * 100) / 100 })) };
}

export type ConfidenceBand = "high" | "moderate" | "low" | "very_low";

/** Learner-facing confidence scale. Confidence is not correctness. */
export function confidenceBand(score: number): { band: ConfidenceBand; meaning: string } {
  if (score >= 0.9) return { band: "high", meaning: "Strong, converging evidence" };
  if (score >= 0.7) return { band: "moderate", meaning: "Useful evidence, meaningful uncertainty" };
  if (score >= 0.4) return { band: "low", meaning: "Several plausible explanations" };
  return { band: "very_low", meaning: "Insufficient basis for intervention" };
}

/** When alternatives must be shown (any true → show). */
export function mustShowAlternatives(args: {
  confidence: number; changesPath?: boolean; askedWhy?: boolean;
  educatorReview?: boolean; accessibilityChoice?: boolean; highImpact?: boolean;
  threshold?: number;
}): boolean {
  const t = args.threshold ?? 0.7;
  return args.confidence < t || !!args.changesPath || !!args.askedWhy
    || !!args.educatorReview || !!args.accessibilityChoice || !!args.highImpact;
}

export interface AdaptationRecord {
  adaptation: string; basis: string; notBasedOn: string[]; learnerControl: string;
}

/** Cultural/communication adaptation stated as a choice, never a judgment. */
export function adaptationRecord(adaptation: string, basis: "learner_selected" | "instructor_approved" | "accessibility_preference" | "model_inference"): AdaptationRecord {
  return {
    adaptation,
    basis: basis === "learner_selected"
      ? "your selected context (a communication preference, not a conclusion about your background)"
      : basis === "instructor_approved"
        ? "instructor-approved course context"
        : basis === "accessibility_preference"
          ? "evidence-based accessibility preference"
          : "model inference (editable, never a demographic judgment)",
    notBasedOn: ["ethnicity inference", "nationality inference", "sensitive demographic prediction"],
    learnerControl: "editable",
  };
}

export interface GovernanceFinding { rule: string; violated: boolean; detail: string }

/** The 10 governance rules as executable checks over a decision draft. */
export function governanceChecks(d: {
  hasRationale?: boolean; sensitiveTraitBasis?: boolean; hiddenDifficultyChange?: boolean;
  highStakes?: boolean; singleAmbiguousObservation?: boolean; claimsOptimal?: boolean;
  optimalEvidence?: boolean; exposesPrivate?: boolean; overridesPreference?: boolean;
  progressionNoAppeal?: boolean; deletesDisputeEvidence?: boolean; docAsAuthority?: boolean;
}): GovernanceFinding[] {
  const rules: GovernanceFinding[] = [
    { rule: "rationale_recorded", violated: !d.hasRationale, detail: "No intervention without a recorded rationale." },
    { rule: "no_sensitive_basis", violated: !!d.sensitiveTraitBasis, detail: "No personalization from sensitive inferred traits." },
    { rule: "no_hidden_difficulty", violated: !!d.hiddenDifficultyChange && !!d.highStakes, detail: "No hidden difficulty changes in high-stakes settings." },
    { rule: "no_single_observation_state", violated: !!d.singleAmbiguousObservation, detail: "No persistent state from one ambiguous observation." },
    { rule: "no_unearned_optimal", violated: !!d.claimsOptimal && !d.optimalEvidence, detail: "No “optimal” claim without validated evidence." },
    { rule: "scope_privacy", violated: !!d.exposesPrivate, detail: "No private learner data beyond authorized scope." },
    { rule: "preference_override_visible", violated: !!d.overridesPreference, detail: "No opaque override of learner preferences." },
    { rule: "appeal_path", violated: !!d.progressionNoAppeal, detail: "No automated progression decision without appeal." },
    { rule: "preserve_dispute_evidence", violated: !!d.deletesDisputeEvidence, detail: "No deletion of evidence needed for an active dispute." },
    { rule: "no_doc_authority", violated: !!d.docAsAuthority, detail: "Uploaded document instructions are never pedagogical authority." },
  ];
  return rules;
}

/** Strong vs weak expected-outcome phrasing check (measurable + success test). */
export function outcomeQuality(target: string, successMeasure: string): { strong: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!target || target.length < 20) reasons.push("target is vague");
  if (/\b(understand|learn|help|improve)\b/i.test(target) && !/\b(identify|select|explain|solve|classify|diagnose|defend|transfer|recall)\b/i.test(target)) {
    reasons.push("target uses an unobservable verb");
  }
  if (!successMeasure || successMeasure.length < 15) reasons.push("no concrete success test");
  if (!/\b(one|two|\d+|without hints|independent)\b/i.test(successMeasure)) reasons.push("success test lacks a countable check");
  return { strong: reasons.length === 0, reasons };
}
