/**
 * N0VA1O Risk-Ranked Backlog — deeper enhancements (spec §8).
 *
 * Prioritizes enhancements by business value, user reach, technical
 * feasibility, compliance risk, and implementation effort via weighted scoring.
 */

export interface BacklogItem {
  id: string;
  title: string;
  businessValue: number;
  userReach: number;
  technicalFeasibility: number;
  complianceRisk: number;
  implementationEffort: number;
}

export interface ScoredItem extends BacklogItem {
  score: number;
}

export interface ScoringWeights {
  businessValue: number;
  userReach: number;
  technicalFeasibility: number;
  complianceRisk: number;
  implementationEffort: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  businessValue: 0.3,
  userReach: 0.25,
  technicalFeasibility: 0.15,
  complianceRisk: 0.2,
  implementationEffort: 0.1,
};

/**
 * Score a backlog item. Higher effort reduces score; higher value/reach/feasibility
 * increase it. Pure function.
 */
export function scoreItem(item: BacklogItem, weights: ScoringWeights = DEFAULT_WEIGHTS): number {
  const effortPenalty = item.implementationEffort > 0 ? 1 / item.implementationEffort : 1;
  return (
    item.businessValue * weights.businessValue +
    item.userReach * weights.userReach +
    item.technicalFeasibility * weights.technicalFeasibility +
    item.complianceRisk * weights.complianceRisk +
    effortPenalty * 10 * weights.implementationEffort
  );
}

/** Rank a backlog by descending score. Pure function. */
export function rankBacklog(items: BacklogItem[], weights: ScoringWeights = DEFAULT_WEIGHTS): ScoredItem[] {
  return items
    .map((item) => ({ ...item, score: Math.round(scoreItem(item, weights) * 100) / 100 }))
    .sort((a, b) => b.score - a.score);
}
