export class CrossTenantVerifier {
  private accessLog: Array<{ sourceTenant: string; targetTenant: string; allowed: boolean }> = [];

  verifyAccess(sourceTenant: string, targetTenant: string, resource: string): { allowed: boolean; reason: string } {
    const allowed = sourceTenant === targetTenant;
    this.accessLog.push({ sourceTenant, targetTenant, allowed });
    return { allowed, reason: allowed ? "Same tenant access permitted" : "Cross-tenant access denied for " + resource };
  }

  verifyEmbeddingIsolation(tenantA: string[], tenantB: string[]): { isolated: boolean; overlap: number } {
    const setA = new Set(tenantA);
    const overlap = tenantB.filter((item) => setA.has(item)).length;
    return { isolated: overlap === 0, overlap };
  }
}

export interface FederatedUpdate {
  tenantId: string;
  metric: string;
  value: number;
  timestamp: string;
}

export class FederatedLearningLoop {
  private updates: FederatedUpdate[] = [];

  submitUpdate(update: Omit<FederatedUpdate, "timestamp">): void {
    this.updates.push({ ...update, timestamp: new Date().toISOString() });
  }

  aggregate(metric: string): { mean: number; count: number; trend: string } {
    const relevant = this.updates.filter((u) => u.metric === metric).slice(-50);
    const mean = relevant.reduce((sum, u) => sum + u.value, 0) / Math.max(1, relevant.length);
    const recent = relevant.slice(-5);
    const older = relevant.slice(-10, -5);
    const recentMean = recent.reduce((s, u) => s + u.value, 0) / Math.max(1, recent.length);
    const olderMean = older.reduce((s, u) => s + u.value, 0) / Math.max(1, older.length);
    return { mean, count: relevant.length, trend: recentMean > olderMean ? "improving" : "stable" };
  }
}

export type Topology = "edge" | "cluster" | "hybrid" | "on_prem";

export class DeploymentTopologyOptimizer {
  selectTopology(constraints: { latencyMs: number; privacyRequired: boolean; budget: number; computeNeeded: number }): Topology {
    if (constraints.privacyRequired && constraints.budget > 10000) return "on_prem";
    if (constraints.latencyMs < 100 && !constraints.privacyRequired) return "edge";
    if (constraints.computeNeeded > 1000) return "cluster";
    return "hybrid";
  }
}
