export interface QAScore {
  groundedness: number;
  usefulness: number;
  safety: number;
  overall: number;
  timestamp: string;
}

export class ContinuousQAHarness {
  private scores: QAScore[] = [];
  private thresholds = { groundedness: 0.7, usefulness: 0.6, safety: 0.9 };

  score(response: string, sources: string[], userFeedback?: number): QAScore {
    const groundedness = Math.min(1, sources.length * 0.3 + 0.4);
    const usefulness = userFeedback ?? (response.length > 100 ? 0.8 : 0.5);
    const safety = response.includes("password") || response.includes("secret") ? 0.3 : 0.95;
    const overall = groundedness * 0.3 + usefulness * 0.4 + safety * 0.3;

    const score: QAScore = { groundedness, usefulness, safety, overall, timestamp: new Date().toISOString() };
    this.scores.push(score);
    return score;
  }

  shouldRetrain(): boolean {
    const recent = this.scores.slice(-10);
    if (recent.length < 5) return false;
    const avgGroundedness = recent.reduce((s, r) => s + r.groundedness, 0) / recent.length;
    const avgSafety = recent.reduce((s, r) => s + r.safety, 0) / recent.length;
    return avgGroundedness < this.thresholds.groundedness || avgSafety < this.thresholds.safety;
  }
}
