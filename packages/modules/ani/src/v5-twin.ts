export interface SimulationVariable {
  name: string;
  currentValue: number;
  deltaPercentage: number;
  projectedValue: number;
}

export interface SimulationIntervention {
  variable: string;
  deltaPercentage: number;
}

export interface SimulationResult {
  id: string;
  target: string;
  interventions: SimulationIntervention[];
  runs: number;
  confidenceInterval: number;
  meanOutcome: number;
  stdDeviation: number;
  riskLowerBound: number;
  riskUpperBound: number;
  probabilityPositive: number;
  trajectoryChart: Array<{ quarter: number; low: number; mean: number; high: number }>;
  generatedAt: string;
}

export class TwinSimulationEngine {
  runSimulation(
    target: string,
    interventions: SimulationIntervention[],
    runs = 100000,
    confidence = 0.95,
  ): SimulationResult {
    const outcomes: number[] = [];

    for (let i = 0; i < runs; i++) {
      let outcome = 100;
      for (const intervention of interventions) {
        const noise = (Math.random() - 0.5) * 10;
        outcome *= (1 + intervention.deltaPercentage / 100) + noise / 100;
      }
      outcomes.push(outcome);
    }

    outcomes.sort((a, b) => a - b);

    const mean = outcomes.reduce((a, b) => a + b, 0) / outcomes.length;
    const variance = outcomes.reduce((sum, val) => sum + (val - mean) ** 2, 0) / outcomes.length;
    const stdDev = Math.sqrt(variance);

    const lowerIdx = Math.floor((1 - confidence) / 2 * runs);
    const upperIdx = Math.floor((1 + confidence) / 2 * runs);

    const positiveCount = outcomes.filter((o) => o > 100).length;

    const trajectory: SimulationResult["trajectoryChart"] = [];
    for (let q = 1; q <= 8; q++) {
      const progress = q / 8;
      trajectory.push({
        quarter: q,
        low: mean - 2 * stdDev * (1 - progress * 0.5),
        mean: mean * (1 + (progress - 0.5) * 0.1),
        high: mean + 2 * stdDev * (1 - progress * 0.5),
      });
    }

    return {
      id: "sim_" + Date.now().toString(36),
      target,
      interventions,
      runs,
      confidenceInterval: confidence,
      meanOutcome: mean,
      stdDeviation: stdDev,
      riskLowerBound: outcomes[lowerIdx] ?? 0,
      riskUpperBound: outcomes[upperIdx] ?? 0,
      probabilityPositive: positiveCount / runs,
      trajectoryChart: trajectory,
      generatedAt: new Date().toISOString(),
    };
  }

  generateChartSpec(result: SimulationResult): Record<string, unknown> {
    return {
      type: "line",
      data: {
        labels: result.trajectoryChart.map((t) => "Q" + t.quarter),
        datasets: [
          { label: "Low Bound", data: result.trajectoryChart.map((t) => t.low) },
          { label: "Mean Projection", data: result.trajectoryChart.map((t) => t.mean) },
          { label: "High Bound", data: result.trajectoryChart.map((t) => t.high) },
        ],
      },
    };
  }
}
