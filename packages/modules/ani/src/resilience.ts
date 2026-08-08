export type FailureSeverity = "L1_degradation" | "L2_partial" | "L3_major" | "L4_critical" | "L5_catastrophic";

export interface FailureEvent {
  id: string;
  timestamp: string;
  severity: FailureSeverity;
  component: string;
  message: string;
  context: Record<string, unknown>;
}

export interface CircuitBreakerState {
  name: string;
  failures: number;
  lastFailure: string;
  state: "closed" | "open" | "half_open";
  threshold: number;
  resetTimeoutMs: number;
}

export interface CrisisPlaybook {
  failureType: string;
  immediateAction: string;
  communication: string;
  recovery: string;
  estimatedRecoveryTimeMs: number;
}

const CRISIS_PLAYBOOKS: CrisisPlaybook[] = [
  {
    failureType: "model_hallucination_spike",
    immediateAction: "Switch to conservative mode, increase verification",
    communication: "Alert users of temporary quality reduction",
    recovery: "Root cause analysis, retrain/reprompt",
    estimatedRecoveryTimeMs: 300000,
  },
  {
    failureType: "bias_incident",
    immediateAction: "Pause affected model, enable fallback",
    communication: "Transparent disclosure, remediation plan",
    recovery: "Audit + retrain with mitigation",
    estimatedRecoveryTimeMs: 3600000,
  },
  {
    failureType: "security_breach",
    immediateAction: "Isolate affected tenant, rotate keys",
    communication: "Immediate notification, forensic report",
    recovery: "Security review + hardening",
    estimatedRecoveryTimeMs: 7200000,
  },
  {
    failureType: "integration_outage",
    immediateAction: "Failover to cached responses, queue writes",
    communication: "Status page update",
    recovery: "Restore integration, replay queue",
    estimatedRecoveryTimeMs: 600000,
  },
  {
    failureType: "data_corruption",
    immediateAction: "Halt writes, snapshot state",
    communication: "Incident notification to affected users",
    recovery: "Restore from last known good snapshot",
    estimatedRecoveryTimeMs: 1800000,
  },
];

export class CrisisResilienceEngine {
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private failureLog: FailureEvent[] = [];
  private degradedFeatures: Set<string> = new Set();

  constructor() {
    this._initCircuitBreaker("llm_inference", 5, 30000);
    this._initCircuitBreaker("tool_execution", 3, 60000);
    this._initCircuitBreaker("rag_retrieval", 10, 15000);
    this._initCircuitBreaker("memory_store", 5, 30000);
  }

  recordFailure(component: string, message: string, context: Record<string, unknown> = {}): FailureEvent {
    const severity = this._classifySeverity(component, message);
    const event: FailureEvent = {
      id: `fail_${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      severity,
      component,
      message,
      context,
    };

    this.failureLog.push(event);

    const cb = this.circuitBreakers.get(component);
    if (cb) {
      cb.failures++;
      cb.lastFailure = event.timestamp;
      if (cb.failures >= cb.threshold) {
        cb.state = "open";
        this.degradedFeatures.add(component);
      }
    }

    return event;
  }

  canExecute(component: string): boolean {
    const cb = this.circuitBreakers.get(component);
    if (!cb) return true;

    if (cb.state === "open") {
      const elapsed = Date.now() - Date.parse(cb.lastFailure);
      if (elapsed >= cb.resetTimeoutMs) {
        cb.state = "half_open";
        return true;
      }
      return false;
    }

    return true;
  }

  recordSuccess(component: string): void {
    const cb = this.circuitBreakers.get(component);
    if (cb) {
      cb.failures = Math.max(0, cb.failures - 1);
      if (cb.state === "half_open") {
        cb.state = "closed";
        this.degradedFeatures.delete(component);
      }
    }
  }

  getPlaybook(failureType: string): CrisisPlaybook | undefined {
    return CRISIS_PLAYBOOKS.find((p) => p.failureType === failureType) ?? CRISIS_PLAYBOOKS.find((p) => p.failureType === "integration_outage");
  }

  getDegradedFeatures(): string[] {
    return [...this.degradedFeatures];
  }

  getSystemHealth(): {
    status: "healthy" | "degraded" | "critical";
    openCircuits: string[];
    recentFailures: FailureEvent[];
    degradedFeatures: string[];
  } {
    const openCircuits = [...this.circuitBreakers.values()].filter((cb) => cb.state === "open").map((cb) => cb.name);
    const recentFailures = this.failureLog.slice(-10);

    let status: "healthy" | "degraded" | "critical" = "healthy";
    if (openCircuits.length > 2) status = "critical";
    else if (openCircuits.length > 0) status = "degraded";

    return { status, openCircuits, recentFailures, degradedFeatures: this.getDegradedFeatures() };
  }

  private _initCircuitBreaker(name: string, threshold: number, resetTimeoutMs: number): void {
    this.circuitBreakers.set(name, {
      name,
      failures: 0,
      lastFailure: new Date(0).toISOString(),
      state: "closed",
      threshold,
      resetTimeoutMs,
    });
  }

  private _classifySeverity(component: string, message: string): FailureSeverity {
    const lower = message.toLowerCase();
    if (lower.includes("security") || lower.includes("breach") || lower.includes("unauthorized")) return "L4_critical";
    if (lower.includes("corruption") || lower.includes("data loss")) return "L4_critical";
    if (lower.includes("outage") || lower.includes("unavailable")) return "L3_major";
    if (lower.includes("timeout") || lower.includes("slow")) return "L2_partial";
    if (lower.includes("degradation") || lower.includes("warning")) return "L1_degradation";
    return "L2_partial";
  }
}

export function createCrisisEngine(): CrisisResilienceEngine {
  return new CrisisResilienceEngine();
}
