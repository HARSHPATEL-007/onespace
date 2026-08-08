export interface CoherenceMetrics {
  attentionAlignment: number;
  cognitiveLoad: number;
  responseStability: number;
  overallCoherence: number;
}

export class NeuralCoherenceMonitor {
  private window: number[] = [];

  update(
    sessionEvents: Array<{
      attentionScore: number;
      loadScore: number;
      stabilityScore: number;
    }>,
  ): CoherenceMetrics {
    for (const event of sessionEvents) {
      this.window.push(
        (event.attentionScore + (1 - event.loadScore) + event.stabilityScore) /
          3,
      );
    }
    if (this.window.length > 100) this.window = this.window.slice(-100);

    const recent = this.window.slice(-10);
    const avg =
      recent.length > 0
        ? recent.reduce((a, b) => a + b, 0) / recent.length
        : 0.8;

    return {
      attentionAlignment: avg,
      cognitiveLoad: 1 - avg,
      responseStability: recent.length > 1 ? 1 - this._stddev(recent) : 0.9,
      overallCoherence: avg,
    };
  }

  private _stddev(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, val) => sum + (val - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }
}
