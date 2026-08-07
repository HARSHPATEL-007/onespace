/**
 * N0VA1O Performance Baselining — deeper enhancements (spec §7).
 *
 * Records current throughput, latency, error rate, and support burden before
 * changes, then defines target improvements for objective measurement.
 */

export interface PerformanceBaseline {
  metric: string;
  current: number;
  target: number;
  unit: string;
  measuredAt: string;
}

export interface BaselineComparison {
  metric: string;
  before: number;
  after: number;
  improvement: number;
  targetMet: boolean;
  unit: string;
}

/**
 * Compare post-enhancement measurements against the baseline. Pure function.
 */
export function compareToBaseline(baseline: PerformanceBaseline, after: number): BaselineComparison {
  const improvement = baseline.current !== 0 ? ((after - baseline.current) / baseline.current) * 100 : 0;
  // For metrics where lower is better (latency, error rate), improvement is negative.
  const lowerIsBetter = /latency|error|failure|rate|time/.test(baseline.metric);
  const targetMet = lowerIsBetter ? after <= baseline.target : after >= baseline.target;
  return { metric: baseline.metric, before: baseline.current, after, improvement: Math.round(improvement * 100) / 100, targetMet, unit: baseline.unit };
}
