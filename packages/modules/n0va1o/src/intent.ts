/**
 * N0VA1O Intent Confidence Thresholds — workflow intelligence (spec §4.3).
 *
 * When intent confidence falls below a configurable threshold, the system
 * requests clarification instead of auto-executing risky actions. Thresholds
 * are tenant-configurable and adjusted by workflow type, domain, and risk.
 */

export type WorkflowType = "read" | "write" | "bulk" | "destructive" | "cross_platform";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface IntentSignal {
  /** Classified intent (e.g. "cross_platform_file_workflow"). */
  intent: string;
  /** Confidence score 0..1 from the intent classifier. */
  confidence: number;
  workflowType: WorkflowType;
  riskLevel: RiskLevel;
}

export interface ThresholdConfig {
  /** Base threshold 0..1 below which clarification is required. */
  base: number;
  /** Per-workflow-type overrides. */
  byWorkflowType: Partial<Record<WorkflowType, number>>;
  /** Per-risk-level overrides (higher risk -> higher threshold). */
  byRiskLevel: Partial<Record<RiskLevel, number>>;
}

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  base: 0.7,
  byWorkflowType: { read: 0.5, write: 0.75, destructive: 0.9, bulk: 0.85, cross_platform: 0.8 },
  byRiskLevel: { low: 0.6, medium: 0.75, high: 0.85, critical: 0.95 },
};

export type IntentDecision = "execute" | "clarify" | "block";

export interface IntentEvaluation {
  decision: IntentDecision;
  effectiveThreshold: number;
  confidence: number;
  reason: string;
  clarificationPrompt?: string;
}

/**
 * Evaluate whether an intent's confidence is sufficient to auto-execute.
 * Falls back to clarification (or blocking for critical risk) when confidence
 * is below the effective threshold.
 */
export function evaluateIntent(
  signal: IntentSignal,
  config: ThresholdConfig = DEFAULT_THRESHOLDS,
): IntentEvaluation {
  const effectiveThreshold = resolveThreshold(signal, config);
  const { confidence, riskLevel } = signal;

  if (confidence >= effectiveThreshold) {
    return {
      decision: "execute",
      effectiveThreshold,
      confidence,
      reason: `Confidence ${(confidence * 100).toFixed(0)}% meets threshold ${(effectiveThreshold * 100).toFixed(0)}%`,
    };
  }

  // Critical risk + low confidence = block outright.
  if (riskLevel === "critical" && confidence < effectiveThreshold) {
    return {
      decision: "block",
      effectiveThreshold,
      confidence,
      reason: `Critical-risk intent blocked: confidence ${(confidence * 100).toFixed(0)}% below ${(effectiveThreshold * 100).toFixed(0)}%`,
      clarificationPrompt: `This is a high-risk action (${signal.intent}). Please confirm you want to proceed.`,
    };
  }

  return {
    decision: "clarify",
    effectiveThreshold,
    confidence,
    reason: `Confidence ${(confidence * 100).toFixed(0)}% below threshold ${(effectiveThreshold * 100).toFixed(0)}% — clarification required`,
    clarificationPrompt: `I understood you want to "${signal.intent}" (confidence ${(confidence * 100).toFixed(0)}%). Could you clarify or confirm?`,
  };
}

function resolveThreshold(signal: IntentSignal, config: ThresholdConfig): number {
  // Risk level takes precedence, then workflow type, then base.
  const riskThreshold = config.byRiskLevel[signal.riskLevel];
  if (riskThreshold !== undefined) return riskThreshold;
  const typeThreshold = config.byWorkflowType[signal.workflowType];
  if (typeThreshold !== undefined) return typeThreshold;
  return config.base;
}
