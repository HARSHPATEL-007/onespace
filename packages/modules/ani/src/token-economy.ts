export interface TokenBudget {
  contextWindow: number;
  retrievalCalls: number;
  toolCalls: number;
  reasoningSteps: number;
  used: { context: number; retrieval: number; tool: number; reasoning: number };
}

export class TokenEconomyManager {
  private budget: TokenBudget = {
    contextWindow: 128000,
    retrievalCalls: 10,
    toolCalls: 5,
    reasoningSteps: 20,
    used: { context: 0, retrieval: 0, tool: 0, reasoning: 0 },
  };

  allocate(partial: Partial<TokenBudget>): void {
    this.budget = { ...this.budget, ...partial, used: { ...this.budget.used } };
  }

  spend(
    category: "context" | "retrieval" | "tool" | "reasoning",
    amount: number,
  ): boolean {
    const limits = {
      context: this.budget.contextWindow,
      retrieval: this.budget.retrievalCalls,
      tool: this.budget.toolCalls,
      reasoning: this.budget.reasoningSteps,
    };
    if (this.budget.used[category] + amount > limits[category]) return false;
    this.budget.used[category] += amount;
    return true;
  }

  getUtilization(): Record<string, number> {
    return {
      context: this.budget.used.context / this.budget.contextWindow,
      retrieval: this.budget.used.retrieval / this.budget.retrievalCalls,
      tool: this.budget.used.tool / this.budget.toolCalls,
      reasoning: this.budget.used.reasoning / this.budget.reasoningSteps,
    };
  }

  shouldReduceDepth(): boolean {
    const util = this.getUtilization();
    return Object.values(util).some((v) => v > 0.8);
  }
}
