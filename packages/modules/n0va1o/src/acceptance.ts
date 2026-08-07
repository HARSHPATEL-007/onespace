/**
 * N0VA1O Measurable Acceptance Criteria — deeper enhancements (spec §1).
 *
 * Every major capability includes explicit success metrics (latency, failure
 * rate, recovery time, approval turnaround) so the spec is testable.
 */

export type MetricType = "latency" | "failureRate" | "recoveryTime" | "approvalTurnaround" | "throughput" | "availability";

export interface AcceptanceCriterion {
  id: string;
  capability: string;
  metric: MetricType;
  target: number;
  unit: string;
  /** Minimum acceptable value (test passes if result >= minimum). */
  minimum?: number;
}

export interface CriterionEvaluation {
  criterionId: string;
  capability: string;
  metric: MetricType;
  target: number;
  actual: number;
  passed: boolean;
  unit: string;
}

/**
 * Evaluate a measurement against acceptance criteria. Pure function.
 */
export function evaluateCriterion(criterion: AcceptanceCriterion, actual: number): CriterionEvaluation {
  const passed = criterion.minimum !== undefined
    ? actual >= criterion.minimum
    : actual <= criterion.target;
  return {
    criterionId: criterion.id,
    capability: criterion.capability,
    metric: criterion.metric,
    target: criterion.target,
    actual,
    passed,
    unit: criterion.unit,
  };
}

/** Evaluate a batch of criteria against measurements. */
export function evaluateAll(criteria: AcceptanceCriterion[], measurements: Record<string, number>): CriterionEvaluation[] {
  return criteria.map((c) => evaluateClause(c, measurements[c.id] ?? 0));
}

function evaluateClause(criterion: AcceptanceCriterion, actual: number): CriterionEvaluation {
  const passed = criterion.minimum !== undefined
    ? actual >= criterion.minimum
    : actual <= criterion.target;
  return { criterionId: criterion.id, capability: criterion.capability, metric: criterion.metric, target: criterion.target, actual, passed, unit: criterion.unit };
}
