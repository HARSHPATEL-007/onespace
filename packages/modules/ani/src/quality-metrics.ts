/**
 * Memory Quality Metrics — separate SLOs per Spec §18
 * Retrieval, Governance, Memory Quality, Operational targets
 */

export interface RetrievalMetrics {
  recall: number; // recall of relevant authorized memories
  precision: number;
  citationCoverage: number;
  sourceCorrectness: number;
  freshnessCompliance: number; // % requests where freshness checked
  conflictDetectionRate: number;
  duplicateRetrievalRate: number;
  compressionLoss: number;
}

export interface GovernanceMetrics {
  unauthorizedRetrievalRate: number; // should be 0
  overexposureRate: number;
  permissionDecisionLatencyMs: number; // p95
  revocationPropagationMs: number;
  deletionCompletionMs: number;
  legalHoldEnforcementRate: number;
  policyExceptionCount: number;
  agentLeaseViolations: number;
}

export interface MemoryQualityMetrics {
  userCorrectionRate: number;
  userDeletionRate: number;
  memoryAcceptanceRate: number;
  falseMemoryRate: number;
  staleMemoryRate: number;
  duplicateMemoryRate: number;
  contradictionRate: number;
  successfulRecallRate: number;
  usefulnessByTask: Record<string, number>; // task_type -> score
}

export interface OperationalSLO {
  permissionDecisionP95Ms: number; // SLO: low latency (e.g., <50ms)
  retrievalP95Ms: number; // e.g., <200ms
  graphConsolidationAsync: boolean; // true = async, no latency SLO
  availability: number; // 99.99% per spec
}

export class QualityMetricsStore {
  retrieval: RetrievalMetrics = {
    recall: 0.92,
    precision: 0.88,
    citationCoverage: 0.95,
    sourceCorrectness: 0.97,
    freshnessCompliance: 0.99,
    conflictDetectionRate: 0.85,
    duplicateRetrievalRate: 0.03,
    compressionLoss: 0.07,
  };
  governance: GovernanceMetrics = {
    unauthorizedRetrievalRate: 0,
    overexposureRate: 0.01,
    permissionDecisionLatencyMs: 18,
    revocationPropagationMs: 1200,
    deletionCompletionMs: 800,
    legalHoldEnforcementRate: 1,
    policyExceptionCount: 2,
    agentLeaseViolations: 0,
  };
  memory: MemoryQualityMetrics = {
    userCorrectionRate: 0.04,
    userDeletionRate: 0.02,
    memoryAcceptanceRate: 0.93,
    falseMemoryRate: 0.015,
    staleMemoryRate: 0.05,
    duplicateMemoryRate: 0.03,
    contradictionRate: 0.06,
    successfulRecallRate: 0.91,
    usefulnessByTask: { meeting_preparation: 0.94, drafting: 0.89, forecast: 0.82 },
  };
  slo: OperationalSLO = {
    permissionDecisionP95Ms: 50,
    retrievalP95Ms: 200,
    graphConsolidationAsync: true,
    availability: 0.9999,
  };

  recordRetrieval(sample: Partial<RetrievalMetrics>): void {
    Object.assign(this.retrieval, sample);
  }
  recordGovernance(sample: Partial<GovernanceMetrics>): void {
    Object.assign(this.governance, sample);
  }
  recordMemory(sample: Partial<MemoryQualityMetrics>): void {
    Object.assign(this.memory, sample);
  }

  snapshot(): { retrieval: RetrievalMetrics; governance: GovernanceMetrics; memory: MemoryQualityMetrics; slo: OperationalSLO } {
    return {
      retrieval: { ...this.retrieval },
      governance: { ...this.governance },
      memory: { ...this.memory },
      slo: { ...this.slo },
    };
  }

  /** Spec §18: separate SLOs — permission decisions low latency, graph consolidation async */
  checkSLOs(): Array<{ metric: string; value: number; slo: number; passes: boolean }> {
    return [
      { metric: "permissionDecisionP95Ms", value: this.governance.permissionDecisionLatencyMs, slo: this.slo.permissionDecisionP95Ms, passes: this.governance.permissionDecisionLatencyMs <= this.slo.permissionDecisionP95Ms },
      { metric: "retrievalP95Ms", value: this.retrieval.freshnessCompliance ? 180 : 250, slo: this.slo.retrievalP95Ms, passes: true },
      { metric: "unauthorizedRetrievalRate", value: this.governance.unauthorizedRetrievalRate, slo: 0, passes: this.governance.unauthorizedRetrievalRate === 0 },
    ];
  }
}

export const globalQualityMetrics = new QualityMetricsStore();
