export interface DriftSignal {
  metric: string;
  baseline: number;
  current: number;
  driftPercentage: number;
  direction:
    "slower" | "faster" | "less_accurate" | "more_verbose" | "less_consistent";
}

export class BehavioralDriftDetector {
  private baselines = new Map<string, number>();
  private driftThreshold = 0.2;

  setBaseline(metric: string, value: number): void {
    this.baselines.set(metric, value);
  }

  detectDrift(metric: string, currentValue: number): DriftSignal | null {
    const baseline = this.baselines.get(metric);
    if (baseline === undefined) return null;

    const drift = Math.abs(currentValue - baseline) / baseline;
    if (drift < this.driftThreshold) return null;

    const direction: DriftSignal["direction"] =
      currentValue > baseline
        ? metric.includes("latency")
          ? "slower"
          : metric.includes("verbosity")
            ? "more_verbose"
            : "faster"
        : metric.includes("accuracy")
          ? "less_accurate"
          : "less_consistent";

    return {
      metric,
      baseline,
      current: currentValue,
      driftPercentage: drift,
      direction,
    };
  }
}
