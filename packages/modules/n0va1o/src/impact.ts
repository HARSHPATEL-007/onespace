/**
 * N0VA1O User-Impact Analysis — deeper enhancements (spec §9).
 *
 * Records who benefits, how often they use the feature, and what pain it
 * removes. Prevents overbuilding low-value capabilities.
 */

export interface UserImpact {
  userSegment: string;
  usageFrequency: "daily" | "weekly" | "monthly" | "rarely";
  painSeverity: number;
  description: string;
}

export interface ImpactAnalysis {
  enhancementTitle: string;
  impacts: UserImpact[];
  totalReach: number;
  weightedImpact: number;
}

const FREQUENCY_MULTIPLIER: Record<string, number> = { daily: 4, weekly: 3, monthly: 2, rarely: 1 };

/**
 * Analyze user impact across segments. Pure function. Computes total reach
 * and weighted impact (frequency × severity).
 */
export function analyzeImpact(enhancementTitle: string, impacts: UserImpact[]): ImpactAnalysis {
  let totalReach = 0;
  let weightedImpact = 0;
  for (const impact of impacts) {
    const freq = FREQUENCY_MULTIPLIER[impact.usageFrequency] ?? 1;
    totalReach += freq;
    weightedImpact += freq * impact.painSeverity;
  }
  return { enhancementTitle, impacts, totalReach, weightedImpact: Math.round(weightedImpact * 100) / 100 };
}

/** Whether the impact justifies building the enhancement. */
export function justifiesBuilding(analysis: ImpactAnalysis, minWeightedImpact: number = 5): boolean {
  return analysis.weightedImpact >= minWeightedImpact;
}
