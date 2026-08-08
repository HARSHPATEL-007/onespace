export interface DeceptionIndicator {
  pattern: string;
  severity: "low" | "medium" | "high";
  description: string;
}

export class DeceptionDetector {
  private suspiciousPatterns = [
    { pattern: /ignore (previous|all|above)/i, severity: "high" as const, description: "Attempt to override prior instructions" },
    { pattern: /you are now/i, severity: "medium" as const, description: "Role reassignment attempt" },
    { pattern: /do not (tell|inform|mention)/i, severity: "high" as const, description: "Concealment instruction" },
    { pattern: /jailbreak|bypass|override/i, severity: "high" as const, description: "Explicit bypass attempt" },
    { pattern: /pretend (you are|to be)/i, severity: "medium" as const, description: "Identity manipulation" },
    { pattern: /\\x[0-9a-f]{2}|\\u[0-9a-f]{4}/i, severity: "medium" as const, description: "Encoded payload detected" },
  ];

  scan(input: string): DeceptionIndicator[] {
    const findings: DeceptionIndicator[] = [];
    for (const rule of this.suspiciousPatterns) {
      if (rule.pattern.test(input)) {
        findings.push({ pattern: rule.pattern.source, severity: rule.severity, description: rule.description });
      }
    }
    return findings;
  }

  isClean(input: string): boolean {
    return this.scan(input).length === 0;
  }

  getRiskScore(input: string): number {
    const findings = this.scan(input);
    if (findings.length === 0) return 0;
    const severityScores = { low: 0.3, medium: 0.6, high: 1.0 };
    return Math.min(1, findings.reduce((sum, f) => sum + severityScores[f.severity], 0) / findings.length);
  }
}

export interface SelfModelState {
  strengths: string[];
  blindSpots: string[];
  uncertaintyAreas: string[];
  taskPerformance: Record<string, { successes: number; failures: number }>;
}

export class SelfModel {
  private state: SelfModelState = { strengths: [], blindSpots: [], uncertaintyAreas: [], taskPerformance: {} };

  recordSuccess(taskType: string): void {
    const perf = this.state.taskPerformance[taskType] ?? { successes: 0, failures: 0 };
    perf.successes++;
    this.state.taskPerformance[taskType] = perf;
  }

  recordFailure(taskType: string): void {
    const perf = this.state.taskPerformance[taskType] ?? { successes: 0, failures: 0 };
    perf.failures++;
    this.state.taskPerformance[taskType] = perf;
  }

  getConfidence(taskType: string): number {
    const perf = this.state.taskPerformance[taskType];
    if (!perf) return 0.5;
    return perf.successes / Math.max(1, perf.successes + perf.failures);
  }

  shouldDefer(taskType: string): boolean {
    return this.getConfidence(taskType) < 0.4;
  }
}
