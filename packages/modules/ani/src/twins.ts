export type TwinType = "enterprise" | "employee" | "system" | "physical";

export interface DigitalTwin {
  id: string;
  type: TwinType;
  workspaceId: string;
  name: string;
  state: Record<string, unknown>;
  telemetrySources: string[];
  updateFrequencyMs: number;
  lastSync: string;
  status: "syncing" | "synced" | "stale" | "error";
}

export interface TwinSimulation {
  id: string;
  twinId: string;
  scenario: string;
  branches: number;
  results: Array<{ branch: number; outcome: string; probability: number; impact: Record<string, number> }>;
  createdAt: string;
}

export class TwinManager {
  private twins: Map<string, DigitalTwin> = new Map();

  createTwin(config: Omit<DigitalTwin, "id" | "lastSync" | "status">): DigitalTwin {
    const twin: DigitalTwin = { ...config, id: "twin_" + Date.now().toString(36), lastSync: new Date().toISOString(), status: "synced" };
    this.twins.set(twin.id, twin);
    return twin;
  }

  simulate(twinId: string, scenario: string, branches = 10): TwinSimulation {
    const results = Array.from({ length: branches }, (_, i) => ({
      branch: i + 1, outcome: "Simulated outcome " + (i + 1) + " for: " + scenario, probability: 1 / branches, impact: { cost: Math.random() * 1000, risk: Math.random() },
    }));
    return { id: "sim_" + Date.now().toString(36), twinId, scenario, branches, results, createdAt: new Date().toISOString() };
  }

  rollback(twinId: string, timestamp: string): boolean {
    const twin = this.twins.get(twinId);
    if (!twin) return false;
    twin.lastSync = timestamp;
    twin.status = "synced";
    return true;
  }
}
