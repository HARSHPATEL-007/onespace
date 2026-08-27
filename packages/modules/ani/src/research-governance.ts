/**
 * N0VA ANI — Research Track Governance
 *
 * Highest-impact enhancement: trustworthy context + governed actions + measurable
 * reliability as core platform. Speculative capabilities isolated behind
 * experimental flags, independent consent, safety reviews, and evidence gates.
 */

export type ResearchCapability =
  | "consciousness_simulation"
  | "neural_coherence_introspection"
  | "quantum_assisted_inference"
  | "direct_bci_interpretation"
  | "biometric_stress_inference"
  | "emotion_inference"
  | "holographic_presence"
  | "autonomous_financial_decision"
  | "autonomous_legal_decision"
  | "voice_cloning_short_sample"
  | "cross_tenant_entanglement"
  | "eye_tracking"
  | "haptic_feedback"
  | "subvocal_commands";

export type Track = "production" | "enterprise" | "advanced" | "experimental";

export const RESEARCH_TRACK: Record<ResearchCapability, { track: Track; tier: string; timeline: string; requires: string[] }> = {
  consciousness_simulation: { track: "experimental", tier: "Transcendent", timeline: "2027-2030", requires: ["experimental_flag", "independent_consent", "safety_review", "performance_gate"] },
  neural_coherence_introspection: { track: "experimental", tier: "Transcendent", timeline: "2027-2030", requires: ["experimental_flag", "safety_review", "evidence_gate"] },
  quantum_assisted_inference: { track: "experimental", tier: "Transcendent", timeline: "2027-2030", requires: ["experimental_flag", "workload_advantage_proof", "performance_gate"] },
  direct_bci_interpretation: { track: "experimental", tier: "Research", timeline: "2028+", requires: ["experimental_flag", "independent_consent", "safety_review"] },
  biometric_stress_inference: { track: "experimental", tier: "Research", timeline: "2027+", requires: ["experimental_flag", "independent_consent", "safety_review"] },
  emotion_inference: { track: "experimental", tier: "Research", timeline: "2027+", requires: ["experimental_flag", "independent_consent", "safety_review"] },
  holographic_presence: { track: "experimental", tier: "Transcendent", timeline: "2028+", requires: ["experimental_flag"] },
  autonomous_financial_decision: { track: "experimental", tier: "Research", timeline: "2029+", requires: ["experimental_flag", "safety_review", "human_approval_gate"] },
  autonomous_legal_decision: { track: "experimental", tier: "Research", timeline: "2029+", requires: ["experimental_flag", "safety_review", "human_approval_gate"] },
  voice_cloning_short_sample: { track: "experimental", tier: "Research", timeline: "2027+", requires: ["experimental_flag", "independent_consent", "safety_review"] },
  cross_tenant_entanglement: { track: "experimental", tier: "Transcendent", timeline: "2027-2030", requires: ["experimental_flag", "safety_review", "isolation_proof"] },
  eye_tracking: { track: "advanced", tier: "Experimental", timeline: "2027", requires: ["experimental_flag"] },
  haptic_feedback: { track: "advanced", tier: "Experimental", timeline: "2027", requires: ["experimental_flag"] },
  subvocal_commands: { track: "advanced", tier: "Experimental", timeline: "2027", requires: ["experimental_flag", "consent"] },
};

export interface ExperimentalGate {
  capability: ResearchCapability;
  flagEnabled: boolean;
  consentGranted: boolean;
  safetyReviewed: boolean;
  performanceEvidence?: { workloadAdvantage?: boolean; accuracy?: number; threshold: number };
  approved: boolean;
  reason: string;
}

export class ResearchGovernance {
  private flags = new Map<ResearchCapability, boolean>();
  private consents = new Map<ResearchCapability, boolean>();
  private safety = new Map<ResearchCapability, boolean>();

  setFlag(cap: ResearchCapability, on: boolean): void { this.flags.set(cap, on); }
  setConsent(cap: ResearchCapability, granted: boolean): void { this.consents.set(cap, granted); }
  setSafetyReview(cap: ResearchCapability, passed: boolean): void { this.safety.set(cap, passed); }

  evaluate(cap: ResearchCapability, evidence?: { workloadAdvantage?: boolean; accuracy?: number }): ExperimentalGate {
    const spec = RESEARCH_TRACK[cap];
    const flagEnabled = this.flags.get(cap) ?? false;
    const consentGranted = this.consents.get(cap) ?? false;
    const safetyReviewed = this.safety.get(cap) ?? false;
    const needsFlag = spec.requires.includes("experimental_flag");
    const needsConsent = spec.requires.includes("independent_consent");
    const needsSafety = spec.requires.includes("safety_review");
    const needsPerf = spec.requires.includes("performance_gate") || spec.requires.includes("workload_advantage_proof");

    let approved = true;
    let reason = "approved";
    if (needsFlag && !flagEnabled) { approved = false; reason = "experimental_flag disabled"; }
    else if (needsConsent && !consentGranted) { approved = false; reason = "independent_consent required"; }
    else if (needsSafety && !safetyReviewed) { approved = false; reason = "safety_review pending"; }
    else if (needsPerf && evidence && evidence.workloadAdvantage === false) { approved = false; reason = "no workload advantage demonstrated"; }
    else if (needsPerf && evidence && typeof evidence.accuracy === "number" && evidence.accuracy < 0.9) { approved = false; reason = "accuracy below gate 0.9"; }

    return { capability: cap, flagEnabled, consentGranted, safetyReviewed, performanceEvidence: evidence ? { ...evidence, threshold: 0.9 } : undefined, approved, reason };
  }

  isProductionAllowed(cap: ResearchCapability): boolean {
    return RESEARCH_TRACK[cap].track !== "experimental";
  }

  listByTrack(track: Track): ResearchCapability[] {
    return (Object.keys(RESEARCH_TRACK) as ResearchCapability[]).filter(k => RESEARCH_TRACK[k].track === track);
  }
}

// Delivery sequence as code — enforces trustworthy core first
export const DELIVERY_SEQUENCE: Array<{ phase: string; capabilities: string[]; principle: string }> = [
  { phase: "Production Foundation", capabilities: ["permission-aware RAG", "tenant memory", "unified model gateway", "tool contracts", "risk-based approvals", "audit trails", "core Mail/Docs/Chat/Calendar/Meet/Tasks", "evaluation & red-team"], principle: "trustworthy context + governed actions + measurable reliability" },
  { phase: "Enterprise Intelligence", capabilities: ["knowledge graph", "CRM/ERP/Finance/CSM/Admin", "deep research citations", "multimodal meeting intelligence", "team/department personas", "edge/regional deployment", "cost/quota/quality optimization"], principle: "governed intelligence at scale" },
  { phase: "Advanced Automation", capabilities: ["multi-agent collaboration", "workflow discovery/self-healing", "predictive assistance", "scenario modeling/forecasting", "advanced multimodal video", "marketplace governed agents"], principle: "automation with human approval" },
  { phase: "Experimental Research", capabilities: ["XR/holographic", "eye tracking/haptic", "sub-vocal", "BCI preparation", "quantum-assisted", "neural/consciousness experimentation"], principle: "isolated, consented, evidence-gated" },
];

const globalResearchRegistry = new Map<string, ResearchGovernance>();
export function researchForWorkspace(workspaceId: string): ResearchGovernance {
  let r = globalResearchRegistry.get(workspaceId);
  if (!r) { r = new ResearchGovernance(); globalResearchRegistry.set(workspaceId, r); }
  return r;
}
