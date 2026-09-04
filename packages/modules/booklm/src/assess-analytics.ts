/**
 * Assessment-analytics mathematics — pure, dependency-free, deterministic.
 * Difficulty, discrimination, confidence intervals, gains, calibration,
 * funnels, privacy suppression, mastery criterion, early-warning rules.
 * Every metric carries sample size, uncertainty, and limitations.
 */

export interface MetricEnvelope<T = number | null> {
  metric: string; value: T; timeWindow: string; sampleSize: number;
  confidenceInterval: [number, number] | null;
  evidenceSources: string[]; limitations: string[];
}

export function envelope<T>(m: Omit<MetricEnvelope<T>, "confidenceInterval"> & { confidenceInterval?: [number, number] | null }): MetricEnvelope<T> {
  return { confidenceInterval: null, ...m };
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Wilson 95% interval for a proportion. */
export function wilson(p: number, n: number): [number, number] | null {
  if (n <= 0) return null;
  const z = 1.96;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [r2(Math.max(0, center - half)), r2(Math.min(1, center + half))];
}

/** Mean with normal-approx 95% CI. */
export function meanCI(values: number[]): { mean: number; ci: [number, number] | null; n: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, ci: null, n };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (n === 1) return { mean: r2(mean), ci: null, n };
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const half = (1.96 * sd) / Math.sqrt(n);
  return { mean: r2(mean), ci: [r2(mean - half), r2(mean + half)], n };
}

/** Item difficulty p = correct / valid (high p = easier for that population). */
export function difficulty(correct: number, valid: number): number {
  if (valid <= 0) return 0;
  return r2(correct / valid);
}

export function difficultyBand(p: number): "easy" | "moderate" | "hard" {
  if (p >= 0.75) return "easy";
  if (p >= 0.4) return "moderate";
  return "hard";
}

/**
 * Discrimination index D = p_high − p_low between upper/lower ability groups.
 * Near-zero: too easy/hard, ambiguous, or off-construct. Negative: possible
 * key error, wording problem, leak, or mismatch — hold for review, never auto-delete.
 */
export function discrimination(highCorrect: number, highN: number, lowCorrect: number, lowN: number): number {
  if (highN <= 0 || lowN <= 0) return 0;
  return r2(highCorrect / highN - lowCorrect / lowN);
}

/** Point-biserial correlation (item score vs total score). */
export function pointBiserial(itemCorrect: boolean[], totals: number[]): number {
  const n = itemCorrect.length;
  if (n < 4 || n !== totals.length) return 0;
  const mean = totals.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(totals.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  if (sd === 0) return 0;
  const p = itemCorrect.filter(Boolean).length / n;
  const q = 1 - p;
  if (p === 0 || q === 0) return 0;
  const m1 = totals.filter((_, i) => itemCorrect[i]).reduce((s, v) => s + v, 0) / (p * n);
  const m0 = totals.filter((_, i) => !itemCorrect[i]).reduce((s, v) => s + v, 0) / (q * n);
  return r2(((m1 - m0) / sd) * Math.sqrt(p * q));
}

export function discriminationDiagnosis(d: number, p: number): string[] {
  const causes: string[] = [];
  if (d < 0) {
    causes.push("possible answer-key error", "wording problem", "leakage", "construct mismatch", "alternative valid interpretation");
  } else if (Math.abs(d) < 0.1) {
    if (p > 0.9) causes.push("too easy — ceiling effect");
    else if (p < 0.2) causes.push("too hard — floor effect");
    else causes.push("ambiguous wording or off-construct item");
  }
  return causes;
}

// ---------------------------------------------------------------------------
// Learning gain: absolute, normalized (cautious at ceiling), transfer, retention.
// ---------------------------------------------------------------------------

export function absoluteGain(pre: number, post: number): number {
  return r2(post - pre);
}

export function normalizedGain(pre: number, post: number): number | null {
  if (pre >= 0.95) return null; // ceiling — normalized gain misleading
  if (pre >= 1) return null;
  return r2((post - pre) / (1 - pre));
}

// ---------------------------------------------------------------------------
// Calibration: |confidence − correctness| mean + patterns (private, kind).
// ---------------------------------------------------------------------------

export function meanCalibrationError(pairs: { confidence: number; correct: boolean }[]): number {
  if (pairs.length === 0) return 0;
  return r2(pairs.reduce((s, p) => s + Math.abs(p.confidence - (p.correct ? 1 : 0)), 0) / pairs.length);
}

export type CalibrationPattern = "overconfidence" | "underconfidence" | "accurate" | "avoidance";

export function calibrationPattern(pairs: { confidence: number; correct: boolean }[]): {
  pattern: CalibrationPattern; gap: number; meanConf: number; meanPerf: number;
} {
  if (pairs.length === 0) return { pattern: "accurate", gap: 0, meanConf: 0, meanPerf: 0 };
  const meanConf = pairs.reduce((s, p) => s + p.confidence, 0) / pairs.length;
  const meanPerf = pairs.filter((p) => p.correct).length / pairs.length;
  const gap = r2(meanConf - meanPerf);
  const lows = pairs.filter((p) => p.confidence < 0.4).length / pairs.length;
  const pattern: CalibrationPattern =
    gap > 0.15 ? "overconfidence" : gap < -0.15 ? "underconfidence" : lows < 0.05 ? "avoidance" : "accurate";
  return { pattern, gap, meanConf: r2(meanConf), meanPerf: r2(meanPerf) };
}

// ---------------------------------------------------------------------------
// Funnels: stage conversion with drop counts (no emotion inference).
// ---------------------------------------------------------------------------

export function funnel(stages: { name: string; count: number }[]): {
  name: string; count: number; conversion: number | null; drop: number;
}[] {
  return stages.map((s, i) => {
    if (i === 0) return { ...s, conversion: 1, drop: 0 };
    const prev = stages[i - 1]!.count || 1;
    return {
      ...s,
      conversion: r2(s.count / prev),
      drop: stages[i - 1]!.count - s.count,
    };
  });
}

export const ABANDON_REASONS = [
  "I understood it but had to leave",
  "The question was unclear",
  "I was stuck on the concept",
  "The page or tool did not work",
  "The format was not accessible",
  "Something else",
];

// ---------------------------------------------------------------------------
// Privacy: minimum cell sizes + suppression (never rankings of individuals).
// ---------------------------------------------------------------------------

export const COHORT_MIN_CELL = 20;

export function suppressible(n: number, min = COHORT_MIN_CELL): boolean {
  return n < min;
}

// ---------------------------------------------------------------------------
// Mastery criterion: ≥0.80 ×2 occasions + no critical misconception +
// application/transfer success + retention >0.70 + calibration in range.
// ---------------------------------------------------------------------------

export interface MasteryInputs {
  recentScores: number[]; occasions: number;
  criticalMisconception?: boolean; transferSuccess?: boolean;
  retention?: number | null; calibrationError?: number | null;
}

export function meetsMastery(m: MasteryInputs): { met: boolean; unmet: string[] } {
  const unmet: string[] = [];
  const good = m.recentScores.filter((s) => s >= 0.8).length;
  if (good < 2) unmet.push(`needs ≥0.80 on two occasions (has ${good})`);
  if (m.criticalMisconception) unmet.push("critical misconception unresolved");
  if (!m.transferSuccess) unmet.push("no application/transfer success");
  if (m.retention !== null && m.retention !== undefined && m.retention <= 0.7) {
    unmet.push(`delayed retention ${Math.round(m.retention * 100)}% ≤ 70%`);
  }
  if (m.calibrationError !== null && m.calibrationError !== undefined && m.calibrationError > 0.25) {
    unmet.push("confidence calibration outside range");
  }
  return { met: unmet.length === 0, unmet };
}

// ---------------------------------------------------------------------------
// Early-warning rules over observable conditions (explainable, appealable).
// ---------------------------------------------------------------------------

export type WarningKind =
  | "prereq_failures" | "declining" | "retries_stalled" | "misconception_cluster"
  | "milestone_missed" | "practice_gap" | "confidence_mismatch" | "concept_abandonment"
  | "low_transfer" | "interrupted_work";

export interface WarningSignal {
  kind: WarningKind; evidence: string[]; severity: "watch" | "support";
}

export function evaluateWarnings(s: {
  prereqFailRate?: number; recentDelta?: number; retriesWithoutGain?: number;
  activeCluster?: boolean; milestoneOverdue?: boolean; daysSincePractice?: number;
  calibrationGap?: number; abandonmentsAtConcept?: number;
  recallHighTransferLow?: boolean; interruptedUnsubmitted?: boolean;
}): WarningSignal[] {
  const out: WarningSignal[] = [];
  const push = (kind: WarningKind, evidence: string[], severity: "watch" | "support" = "support") =>
    out.push({ kind, evidence, severity });
  if ((s.prereqFailRate ?? 0) >= 0.5) push("prereq_failures", [`${Math.round(s.prereqFailRate! * 100)}% recent failure on a prerequisite concept`]);
  if ((s.recentDelta ?? 0) <= -0.15) push("declining", [`performance down ${Math.round(Math.abs(s.recentDelta!) * 100)} points recently`]);
  if ((s.retriesWithoutGain ?? 0) >= 3) push("retries_stalled", [`${s.retriesWithoutGain} retries without improvement`]);
  if (s.activeCluster) push("misconception_cluster", ["persistent misconception pattern active"]);
  if (s.milestoneOverdue) push("milestone_missed", ["goal deadline passed with work remaining"], "watch");
  if ((s.daysSincePractice ?? 0) >= 14) push("practice_gap", [`${s.daysSincePractice} days since valid practice`], "watch");
  if ((s.calibrationGap ?? 0) >= 0.25) push("confidence_mismatch", ["high confidence with low performance recently"]);
  if ((s.abandonmentsAtConcept ?? 0) >= 2) push("concept_abandonment", ["repeated abandonment at the same concept"]);
  if (s.recallHighTransferLow) push("low_transfer", ["high recall with low transfer"]);
  if (s.interruptedUnsubmitted) push("interrupted_work", ["unsubmitted work after a technical interruption"], "watch");
  return out;
}

/** What a warning is not: anti-labels attached to every alert. */
export function warningDisclaimer(): string {
  return "This is not a judgment about ability or a final prediction. It reflects observable learning conditions only — no biometrics, no emotion labels, no demographics.";
}

// ---------------------------------------------------------------------------
// Metric definitions registry (versioned; changes are logged, not silent).
// ---------------------------------------------------------------------------

export interface MetricDef { name: string; version: string; definition: string; sources: string[] }

export const METRIC_DEFS: MetricDef[] = [
  { name: "item_difficulty_p", version: "1.0", definition: "correct / valid responses for a population × condition window", sources: ["quiz_responses"] },
  { name: "item_discrimination_d", version: "1.0", definition: "p(high group) − p(low group); point-biserial where n permits", sources: ["quiz_responses"] },
  { name: "concept_gain_absolute", version: "1.0", definition: "post − pre on concept-aligned observations", sources: ["mastery_observations"] },
  { name: "concept_gain_normalized", version: "1.0", definition: "(post − pre) / (1 − pre); suppressed at ceiling", sources: ["mastery_observations"] },
  { name: "calibration_error", version: "1.0", definition: "mean |confidence − correctness|", sources: ["quiz_responses"] },
  { name: "time_to_mastery", version: "1.0", definition: "first exposure → mastery-criterion met (calendar + active minutes + attempts)", sources: ["observations", "attempts"] },
  { name: "transfer_gain", version: "1.0", definition: "novel-context observation delta", sources: ["mastery_observations"] },
  { name: "retention_21d", version: "1.0", definition: "delayed retrieval ≥21 days after last success", sources: ["mastery_observations"] },
  { name: "intervention_effect", version: "1.0", definition: "pre/post around an intervention; associative unless experimental design", sources: ["adaptive_loops", "observations"] },
  { name: "funnel_conversion", version: "1.0", definition: "stage_n / stage_{n-1} on attempt lifecycle events", sources: ["quiz_attempts"] },
];
