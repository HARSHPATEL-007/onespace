export interface CognitionLedgerEntry {
  id: string;
  timestamp: string;
  responseId: string;
  sources: Array<{ id: string; type: string; relevance: number }>;
  modelUsed: string;
  policyChecks: Array<{ policy: string; passed: boolean }>;
  selfEvaluation: { groundedness: number; usefulness: number; safety: number };
  finalConfidence: number;
}

export class CognitionLedger {
  private entries: CognitionLedgerEntry[] = [];

  record(
    entry: Omit<CognitionLedgerEntry, "id" | "timestamp">,
  ): CognitionLedgerEntry {
    const full: CognitionLedgerEntry = {
      ...entry,
      id: "cog_" + Date.now().toString(36),
      timestamp: new Date().toISOString(),
    };
    this.entries.push(full);
    return full;
  }

  getEntry(responseId: string): CognitionLedgerEntry | null {
    return this.entries.find((e) => e.responseId === responseId) ?? null;
  }

  getPolicyViolations(): Array<{ responseId: string; violations: string[] }> {
    return this.entries
      .filter((e) => e.policyChecks.some((p) => !p.passed))
      .map((e) => ({
        responseId: e.responseId,
        violations: e.policyChecks
          .filter((p) => !p.passed)
          .map((p) => p.policy),
      }));
  }
}
