export type SourceTier = "internal_fact" | "retrieved_document" | "live_web" | "model_inference" | "user_memory";

export interface Evidence {
  id: string;
  claim: string;
  sourceTier: SourceTier;
  sourceRef: string;
  confidence: number;
  supporting: string[];
  contradictions: string[];
  timestamp: string;
}

export class EvidenceGraph {
  private evidence: Map<string, Evidence> = new Map();

  addClaim(claim: string, sourceTier: SourceTier, sourceRef: string, confidence: number): Evidence {
    const ev: Evidence = {
      id: "ev_" + Date.now().toString(36),
      claim, sourceTier, sourceRef, confidence,
      supporting: [], contradictions: [],
      timestamp: new Date().toISOString(),
    };
    this.evidence.set(ev.id, ev);
    return ev;
  }

  linkSupport(evidenceId: string, supportingId: string): void {
    const ev = this.evidence.get(evidenceId);
    if (ev) ev.supporting.push(supportingId);
  }

  addContradiction(evidenceId: string, contradictingId: string): void {
    const ev = this.evidence.get(evidenceId);
    if (ev) ev.contradictions.push(contradictingId);
  }

  getContradictions(): Array<[Evidence, Evidence]> {
    const results: Array<[Evidence, Evidence]> = [];
    for (const ev of this.evidence.values()) {
      for (const contraId of ev.contradictions) {
        const contra = this.evidence.get(contraId);
        if (contra) results.push([ev, contra]);
      }
    }
    return results;
  }

  getClaimsByTier(tier: SourceTier): Evidence[] {
    return [...this.evidence.values()].filter((e) => e.sourceTier === tier);
  }

  scoreClaim(evidenceId: string): number {
    const ev = this.evidence.get(evidenceId);
    if (!ev) return 0;
    const tierBonus = { internal_fact: 0.1, retrieved_document: 0.05, live_web: 0.0, model_inference: -0.05, user_memory: 0.0 };
    const supportBonus = ev.supporting.length * 0.05;
    const contraPenalty = ev.contradictions.length * 0.15;
    return Math.max(0, Math.min(1, ev.confidence + (tierBonus[ev.sourceTier] ?? 0) + supportBonus - contraPenalty));
  }
}
