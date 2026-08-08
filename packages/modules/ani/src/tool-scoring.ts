export interface ToolScore {
  toolName: string;
  latencyMs: number;
  confidence: number;
  pastSuccessRate: number;
  compositeScore: number;
}

export class ToolSelectionScorer {
  private history: Map<
    string,
    { successes: number; failures: number; avgLatency: number }
  > = new Map();

  scoreTools(
    candidates: Array<{
      toolName: string;
      latencyMs: number;
      confidence: number;
    }>,
  ): ToolScore[] {
    return candidates
      .map((c) => {
        const history = this.history.get(c.toolName);
        const pastSuccessRate = history
          ? history.successes /
            Math.max(1, history.successes + history.failures)
          : 0.5;
        const latencyScore = Math.max(0, 1 - c.latencyMs / 1000);
        const composite =
          c.confidence * 0.4 + pastSuccessRate * 0.3 + latencyScore * 0.3;
        return { ...c, pastSuccessRate, compositeScore: composite };
      })
      .sort((a, b) => b.compositeScore - a.compositeScore);
  }

  recordOutcome(toolName: string, success: boolean, latencyMs: number): void {
    const h = this.history.get(toolName) ?? {
      successes: 0,
      failures: 0,
      avgLatency: 0,
    };
    if (success) h.successes++;
    else h.failures++;
    h.avgLatency = (h.avgLatency + latencyMs) / 2;
    this.history.set(toolName, h);
  }
}
