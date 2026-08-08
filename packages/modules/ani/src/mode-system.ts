export type ANIMode =
  "researcher" | "executor" | "collaborator" | "reviewer" | "quiet";

export interface ModeConfig {
  mode: ANIMode;
  autoExecuteThreshold: number;
  proactiveSuggestions: boolean;
  verbosity: "concise" | "balanced" | "detailed";
  riskTolerance: "low" | "medium" | "high";
  swarmSize: number;
}

const MODE_PRESETS: Record<ANIMode, ModeConfig> = {
  researcher: {
    mode: "researcher",
    autoExecuteThreshold: 0.99,
    proactiveSuggestions: true,
    verbosity: "detailed",
    riskTolerance: "low",
    swarmSize: 5,
  },
  executor: {
    mode: "executor",
    autoExecuteThreshold: 0.7,
    proactiveSuggestions: true,
    verbosity: "concise",
    riskTolerance: "medium",
    swarmSize: 3,
  },
  collaborator: {
    mode: "collaborator",
    autoExecuteThreshold: 0.5,
    proactiveSuggestions: true,
    verbosity: "balanced",
    riskTolerance: "low",
    swarmSize: 2,
  },
  reviewer: {
    mode: "reviewer",
    autoExecuteThreshold: 1.0,
    proactiveSuggestions: false,
    verbosity: "detailed",
    riskTolerance: "low",
    swarmSize: 4,
  },
  quiet: {
    mode: "quiet",
    autoExecuteThreshold: 1.0,
    proactiveSuggestions: false,
    verbosity: "concise",
    riskTolerance: "low",
    swarmSize: 1,
  },
};

export class ModeSystem {
  private currentMode: ANIMode = "collaborator";

  getMode(): ANIMode {
    return this.currentMode;
  }
  setMode(mode: ANIMode): void {
    this.currentMode = mode;
  }
  getConfig(): ModeConfig {
    return MODE_PRESETS[this.currentMode];
  }

  shouldAutoExecute(confidence: number): boolean {
    return confidence >= this.getConfig().autoExecuteThreshold;
  }

  shouldProactiveSuggest(): boolean {
    return this.getConfig().proactiveSuggestions;
  }

  getVerbosity(): string {
    return this.getConfig().verbosity;
  }
}
