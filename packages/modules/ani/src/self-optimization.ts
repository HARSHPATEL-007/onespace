export interface PerformanceSnapshot {
  timestamp: string;
  latencyMs: number;
  accuracy: number;
  costUsd: number;
  hallucinationRate: number;
}

export class SelfOptimizationGovernor {
  private history: PerformanceSnapshot[] = [];
  private latencyThreshold = 500;
  private accuracyThreshold = 0.85;
  private hallucinationThreshold = 0.05;

  record(snapshot: PerformanceSnapshot): void {
    this.history.push(snapshot);
  }

  getTrends(): {
    latencyTrend: "improving" | "stable" | "degrading";
    accuracyTrend: string;
    hallucinationTrend: string;
  } {
    if (this.history.length < 2)
      return {
        latencyTrend: "stable",
        accuracyTrend: "stable",
        hallucinationTrend: "stable",
      };
    const recent = this.history.slice(-5);
    const avgLatency =
      recent.reduce((s, r) => s + r.latencyMs, 0) / recent.length;
    const avgAccuracy =
      recent.reduce((s, r) => s + r.accuracy, 0) / recent.length;

    return {
      latencyTrend:
        avgLatency > this.latencyThreshold
          ? "degrading"
          : avgLatency < this.latencyThreshold * 0.5
            ? "improving"
            : "stable",
      accuracyTrend:
        avgAccuracy < this.accuracyThreshold ? "degrading" : "stable",
      hallucinationTrend:
        (recent[recent.length - 1]?.hallucinationRate ??
        0 > this.hallucinationThreshold)
          ? "degrading"
          : "stable",
    };
  }

  shouldAdjustRouting(): boolean {
    const trends = this.getTrends();
    return (
      trends.latencyTrend === "degrading" ||
      trends.accuracyTrend === "degrading" ||
      trends.hallucinationTrend === "degrading"
    );
  }
}
