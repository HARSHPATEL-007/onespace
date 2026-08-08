export type ModelTier = "small" | "medium" | "frontier";

export interface ModelRoute {
  tier: ModelTier;
  modelName: string;
  costPerToken: number;
  maxContext: number;
  speedMs: number;
}

export class ModelPortfolioStrategy {
  private portfolio: Record<ModelTier, ModelRoute> = {
    small: {
      tier: "small",
      modelName: "llama-3.1-8b",
      costPerToken: 0.0001,
      maxContext: 32000,
      speedMs: 50,
    },
    medium: {
      tier: "medium",
      modelName: "mistral-large",
      costPerToken: 0.001,
      maxContext: 128000,
      speedMs: 150,
    },
    frontier: {
      tier: "frontier",
      modelName: "n0va-lm-transcendent",
      costPerToken: 0.01,
      maxContext: 4000000,
      speedMs: 500,
    },
  };

  route(
    taskClass: string,
    urgency: "low" | "medium" | "high",
    complexity: number,
  ): ModelRoute {
    if (urgency === "high" && complexity < 0.5) return this.portfolio.small;
    if (
      complexity > 0.8 ||
      taskClass === "research" ||
      taskClass === "analysis"
    )
      return this.portfolio.frontier;
    if (
      complexity > 0.4 ||
      taskClass === "drafting" ||
      taskClass === "summarization"
    )
      return this.portfolio.medium;
    return this.portfolio.small;
  }
}
