export type CrisisLevel = "nominal" | "elevated" | "critical" | "emergency";
export type FallbackMode = "normal" | "conservative" | "safe" | "offline";

export interface CrisisState {
  level: CrisisLevel;
  mode: FallbackMode;
  triggers: string[];
  degradedFeatures: string[];
  timestamp: string;
}

export class CrisisAutopilot {
  private state: CrisisState = {
    level: "nominal",
    mode: "normal",
    triggers: [],
    degradedFeatures: [],
    timestamp: new Date().toISOString(),
  };

  detect(metrics: {
    hallucinationRate: number;
    errorRate: number;
    latencyMs: number;
    toolAvailability: number;
  }): CrisisState {
    const triggers: string[] = [];
    let level: CrisisLevel = "nominal";

    if (metrics.hallucinationRate > 0.1) {
      triggers.push(
        "Hallucination spike: " +
          (metrics.hallucinationRate * 100).toFixed(1) +
          "%",
      );
      level = "critical";
    }
    if (metrics.errorRate > 0.3) {
      triggers.push(
        "High error rate: " + (metrics.errorRate * 100).toFixed(1) + "%",
      );
      level = level === "nominal" ? "elevated" : level;
    }
    if (metrics.latencyMs > 2000) {
      triggers.push("Latency degradation: " + metrics.latencyMs + "ms");
      level = level === "nominal" ? "elevated" : level;
    }
    if (metrics.toolAvailability < 0.5) {
      triggers.push(
        "Tool availability low: " +
          (metrics.toolAvailability * 100).toFixed(0) +
          "%",
      );
      level = "critical";
    }

    if (triggers.length >= 3) level = "emergency";

    const mode: FallbackMode =
      level === "emergency"
        ? "offline"
        : level === "critical"
          ? "safe"
          : level === "elevated"
            ? "conservative"
            : "normal";
    const degradedFeatures =
      level === "critical" || level === "emergency"
        ? ["autonomous_actions", "multi_hop_reasoning", "external_tools"]
        : level === "elevated"
          ? ["proactive_suggestions"]
          : [];

    this.state = {
      level,
      mode,
      triggers,
      degradedFeatures,
      timestamp: new Date().toISOString(),
    };
    return this.state;
  }

  getState(): CrisisState {
    return this.state;
  }

  shouldDegrade(): boolean {
    return this.state.level !== "nominal";
  }
}
