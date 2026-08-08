export interface IntegrationHealth {
  integrationId: string;
  name: string;
  uptime: number;
  errorRate: number;
  latencyP95: number;
  authStatus: "active" | "expired" | "revoked";
  lastCheck: string;
}

export class ToolHealthSentinel {
  private health: Map<string, IntegrationHealth> = new Map();

  register(integration: IntegrationHealth): void {
    this.health.set(integration.integrationId, integration);
  }

  updateHealth(
    id: string,
    metrics: { errorRate?: number; latency?: number; authStatus?: string },
  ): void {
    const current = this.health.get(id);
    if (!current) return;
    if (metrics.errorRate !== undefined) current.errorRate = metrics.errorRate;
    if (metrics.latency !== undefined) current.latencyP95 = metrics.latency;
    if (metrics.authStatus)
      current.authStatus = metrics.authStatus as typeof current.authStatus;
    current.lastCheck = new Date().toISOString();
  }

  getUnhealthy(): IntegrationHealth[] {
    return [...this.health.values()].filter(
      (h) =>
        h.errorRate > 0.1 || h.latencyP95 > 2000 || h.authStatus !== "active",
    );
  }

  shouldDefer(integrationId: string): boolean {
    const health = this.health.get(integrationId);
    if (!health) return true;
    return (
      health.errorRate > 0.3 ||
      health.latencyP95 > 5000 ||
      health.authStatus === "revoked"
    );
  }
}

export interface DecisionJustification {
  decisionId: string;
  chosenTool: string;
  rejectedAlternatives: Array<{ tool: string; reason: string }>;
  evidence: Array<{ source: string; relevance: number }>;
  confidence: number;
  timestamp: string;
}

export class DecisionJustificationChain {
  private decisions: DecisionJustification[] = [];

  record(
    decision: Omit<DecisionJustification, "decisionId" | "timestamp">,
  ): DecisionJustification {
    const full: DecisionJustification = {
      ...decision,
      decisionId: "dj_" + Date.now().toString(36),
      timestamp: new Date().toISOString(),
    };
    this.decisions.push(full);
    return full;
  }

  getJustification(decisionId: string): DecisionJustification | null {
    return this.decisions.find((d) => d.decisionId === decisionId) ?? null;
  }

  getAuditTrail(): string[] {
    return this.decisions.map(
      (d) =>
        "[" +
        d.chosenTool +
        "] rejected: " +
        d.rejectedAlternatives.map((a) => a.tool).join(", "),
    );
  }
}
