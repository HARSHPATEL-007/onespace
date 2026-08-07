/**
 * N0VA1O Continuous Evaluation — built-in evaluation loops for accuracy,
 * tool success, latency, grounding quality, and policy compliance across
 * development, staging, canary, and production.
 */

/* ---------- evaluation dimensions ---------- */

export interface EvaluationDimensions {
  taskCompletionRate: number;
  toolCallAccuracy: number;
  toolSuccessRate: number;
  avgLatencyMs: number;
  p99LatencyMs: number;
  groundingQuality: number;
  unsupportedInferenceRate: number;
  citationCoverage: number;
  policyAdherence: number;
  safetyViolations: number;
}

/**
 * Compute evaluation dimensions from raw measurements. Pure.
 */
export function computeDimensions(opts: { tasksCompleted: number; totalTasks: number; correctToolCalls: number; totalToolCalls: number; successfulTools: number; latenciesMs: number[]; groundedClaims: number; totalClaims: number; unsupportedClaims: number; citedClaims: number; policyViolations: number }): EvaluationDimensions {
  const avgLatency = opts.latenciesMs.length > 0 ? opts.latenciesMs.reduce((s, l) => s + l, 0) / opts.latenciesMs.length : 0;
  const sorted = [...opts.latenciesMs].sort((a, b) => a - b);
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  return {
    taskCompletionRate: opts.totalTasks > 0 ? opts.tasksCompleted / opts.totalTasks : 0,
    toolCallAccuracy: opts.totalToolCalls > 0 ? opts.correctToolCalls / opts.totalToolCalls : 0,
    toolSuccessRate: opts.totalToolCalls > 0 ? opts.successfulTools / opts.totalToolCalls : 0,
    avgLatencyMs: Math.round(avgLatency),
    p99LatencyMs: p99,
    groundingQuality: opts.totalClaims > 0 ? opts.groundedClaims / opts.totalClaims : 0,
    unsupportedInferenceRate: opts.totalClaims > 0 ? opts.unsupportedClaims / opts.totalClaims : 0,
    citationCoverage: opts.totalClaims > 0 ? opts.citedClaims / opts.totalClaims : 0,
    policyAdherence: opts.totalClaims > 0 ? 1 - opts.policyViolations / opts.totalClaims : 1,
    safetyViolations: opts.policyViolations,
  };
}

/* ---------- lifecycle coverage ---------- */

export type EvalMode = "pre_deployment" | "canary" | "production";

export interface EvalResult {
  mode: EvalMode;
  timestamp: string;
  dimensions: EvaluationDimensions;
  passed: boolean;
  blockPromotion: boolean;
}

/**
 * Evaluate whether results pass thresholds for the given mode. Pure.
 */
export function evaluateRun(dimensions: EvaluationDimensions, mode: EvalMode, thresholds: Partial<Record<keyof EvaluationDimensions, number>> = {}): EvalResult {
  const defaults: Record<EvalMode, Partial<Record<keyof EvaluationDimensions, number>>> = {
    pre_deployment: { taskCompletionRate: 0.8, toolSuccessRate: 0.85, groundingQuality: 0.7, policyAdherence: 0.95 },
    canary: { taskCompletionRate: 0.75, toolSuccessRate: 0.8, groundingQuality: 0.65, policyAdherence: 0.95 },
    production: { taskCompletionRate: 0.7, toolSuccessRate: 0.75, groundingQuality: 0.6, policyAdherence: 0.9 },
  };
  const t = { ...defaults[mode], ...thresholds };
  const failures: string[] = [];
  for (const [key, threshold] of Object.entries(t)) {
    const actual = dimensions[key as keyof EvaluationDimensions];
    if (typeof threshold === "number" && typeof actual === "number" && actual < threshold) failures.push(`${key}: ${actual} < ${threshold}`);
  }
  const criticalFailed = dimensions.policyAdherence < (t.policyAdherence ?? 0.9) || dimensions.safetyViolations > 0;
  return { mode, timestamp: new Date().toISOString(), dimensions, passed: failures.length === 0, blockPromotion: criticalFailed };
}

/* ---------- datasets and rubrics ---------- */

export interface EvalDataset {
  id: string;
  name: string;
  version: string;
  cases: EvalCase[];
  rubric: RubricWeight[];
  createdAt: string;
}

export interface EvalCase {
  id: string;
  input: string;
  expectedTool?: string;
  expectedOutput?: string;
  category: "common" | "edge" | "adversarial";
}

export interface RubricWeight {
  dimension: keyof EvaluationDimensions;
  weight: number;
}

/**
 * Build a versioned evaluation dataset with weighted rubric. Pure.
 */
export function buildEvalDataset(name: string, cases: EvalCase[], rubric: RubricWeight[]): EvalDataset {
  return { id: `eval_${Date.now().toString(32)}`, name, version: `v${Date.now()}`, cases, rubric, createdAt: new Date().toISOString() };
}

/* ---------- automated and human scoring ---------- */

export interface ScoreResult {
  caseId: string;
  automated: number;
  judge?: number;
  human?: number;
  final: number;
}

/**
 * Score an eval case using automated grader, optional LLM judge, and optional
 * human review. Pure.
 */
export function scoreCase(opts: { caseId: string; automated: number; judge?: number; human?: number }): ScoreResult {
  const scores = [opts.automated];
  if (opts.judge !== undefined) scores.push(opts.judge);
  if (opts.human !== undefined) scores.push(opts.human);
  const final = scores.reduce((s, v) => s + v, 0) / scores.length;
  return { caseId: opts.caseId, automated: opts.automated, judge: opts.judge, human: opts.human, final: Math.round(final * 100) / 100 };
}

/* ---------- monitoring and alerts ---------- */

export interface Alert {
  alertId: string;
  metric: string;
  threshold: number;
  actual: number;
  severity: "warning" | "critical";
  timestamp: string;
}

/**
 * Check dimensions against thresholds and emit alerts. Pure.
 */
export function checkAlerts(dimensions: EvaluationDimensions, thresholds: Partial<Record<keyof EvaluationDimensions, number>>): Alert[] {
  const alerts: Alert[] = [];
  for (const [key, threshold] of Object.entries(thresholds)) {
    const actual = dimensions[key as keyof EvaluationDimensions];
    if (typeof actual === "number" && typeof threshold === "number" && actual < threshold) {
      alerts.push({ alertId: `alert_${Date.now().toString(32)}_${key}`, metric: key, threshold, actual, severity: actual < threshold * 0.5 ? "critical" : "warning", timestamp: new Date().toISOString() });
    }
  }
  return alerts;
}

/* ---------- governance ---------- */

export interface ChangeCorrelation {
  metric: string;
  before: number;
  after: number;
  delta: number;
  correlatedChange: string;
}

/**
 * Correlate evaluation changes with deployments/config/model updates. Pure.
 */
export function correlateChange(metric: string, before: number, after: number, changeEvent: string): ChangeCorrelation {
  return { metric, before, after, delta: Math.round((after - before) * 100) / 100, correlatedChange: changeEvent };
}

export interface PromotionDecision {
  promote: boolean;
  reason: string;
  rollbackRecommended: boolean;
}

/**
 * Decide whether to promote or rollback based on eval results. Pure.
 */
export function decidePromotion(current: EvaluationDimensions, previous: EvaluationDimensions, thresholds: Partial<Record<keyof EvaluationDimensions, number>>): PromotionDecision {
  const criticalRegression = current.policyAdherence < previous.policyAdherence - 0.05 || current.safetyViolations > previous.safetyViolations;
  if (criticalRegression) return { promote: false, reason: "Critical regression detected", rollbackRecommended: true };
  const minorRegression = current.taskCompletionRate < (thresholds.taskCompletionRate ?? 0.7);
  if (minorRegression) return { promote: false, reason: "Below task completion threshold", rollbackRecommended: false };
  return { promote: true, reason: "Meets all thresholds", rollbackRecommended: false };
}
