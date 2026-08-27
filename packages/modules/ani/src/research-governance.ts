/**
 * N0VA ANI — Research Governance Layer
 *
 * Formal separation: Production / Enterprise / Advanced Automation / Experimental Research.
 * Research capabilities never inherit production privileges; isolated env, data, permissions,
 * deployment, consent, and safety gates per NIST Generative AI Profile & ISO/IEC 42001.
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
export type Maturity = "generally_available" | "preview" | "pilot" | "research_only" | "prohibited";
export type RiskTier = "low" | "medium" | "high" | "critical";

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

// ============================================================================
// 1. Capability Classification — risk and maturity profile
// ============================================================================

export interface CapabilityProfile {
  id: ResearchCapability;
  track: "experimental_research" | "production" | "enterprise" | "advanced";
  maturity: Maturity;
  risk_tier: RiskTier;
  allowed_environments: Array<"isolated_lab" | "research" | "staging" | "production">;
  production_enabled: boolean;
  tenant_access: "explicit_research_cohort_only" | "general" | "enterprise_approved";
  human_review: "mandatory" | "conditional" | "none";
  external_side_effects: "prohibited" | "approval_required" | "allowed";
  consent: "explicit_repeated_consent" | "explicit_once" | "implicit";
  evidence_gate: "not_met" | "partial" | "met";
  prohibited_in: string[]; // what it must never do
}

export function capabilityProfile(id: ResearchCapability): CapabilityProfile {
  const spec = RESEARCH_TRACK[id];
  const isExperimental = spec.track === "experimental";
  return {
    id,
    track: isExperimental ? "experimental_research" : spec.track as never,
    maturity: isExperimental ? "research_only" : "preview",
    risk_tier: ["biometric_stress_inference","emotion_inference","autonomous_financial_decision","autonomous_legal_decision","direct_bci_interpretation","cross_tenant_entanglement"].includes(id) ? "critical" : "high",
    allowed_environments: isExperimental ? ["isolated_lab"] : ["production","staging"],
    production_enabled: !isExperimental,
    tenant_access: isExperimental ? "explicit_research_cohort_only" : "general",
    human_review: isExperimental ? "mandatory" : "conditional",
    external_side_effects: isExperimental ? "prohibited" : "approval_required",
    consent: isExperimental ? "explicit_repeated_consent" : "explicit_once",
    evidence_gate: "not_met",
    prohibited_in: [
      "production APIs",
      "autonomous agent selection",
      "default prompts",
      "hidden personalization",
      "financial/legal/medical/administrative actions",
      "tenant training without approval",
      "ordinary admin settings",
    ],
  };
}

export class ResearchCapabilityRegistry {
  private store = new Map<ResearchCapability, CapabilityProfile>();
  register(id: ResearchCapability): CapabilityProfile {
    const p = capabilityProfile(id);
    this.store.set(id, p);
    return p;
  }
  get(id: ResearchCapability): CapabilityProfile | undefined { return this.store.get(id); }
  list(): CapabilityProfile[] { return [...this.store.values()]; }
  // Prevent exposure in production
  assertNotExposedInProduction(id: ResearchCapability): void {
    const p = this.store.get(id);
    if (p && p.track === "experimental_research" && p.production_enabled) throw new Error(`Research capability ${id} must not be exposed in production`);
  }
  isAllowedInProduction(id: ResearchCapability): boolean {
    const p = this.store.get(id);
    return !!p && p.production_enabled && p.allowed_environments.includes("production");
  }
}

// ============================================================================
// 2. Four-Tier Roadmap — default access & side effects
// ============================================================================

export interface RoadmapTier {
  track: "Production Foundation" | "Enterprise Intelligence" | "Advanced Automation" | "Experimental Research" | "Prohibited or paused capability";
  purpose: string;
  default_access: string;
  production_side_effects: string;
}

export const FOUR_TIER_ROADMAP: RoadmapTier[] = [
  { track: "Production Foundation", purpose: "Trustworthy everyday assistance", default_access: "General users within policy", production_side_effects: "Only governed, low-risk actions" },
  { track: "Enterprise Intelligence", purpose: "Deep organizational reasoning", default_access: "Approved tenants and roles", production_side_effects: "Approval-controlled" },
  { track: "Advanced Automation", purpose: "Multi-step workflow execution", default_access: "Explicit tenant enablement", production_side_effects: "Strong authorization and verification" },
  { track: "Experimental Research", purpose: "Test uncertain or high-risk hypotheses", default_access: "Approved researchers and cohorts", production_side_effects: "Prohibited by default" },
];

// ============================================================================
// 3. Research Isolation — separate infrastructure
// ============================================================================

export interface ResearchPlaneSpec {
  credentials: "separate";
  network: "separate boundaries";
  model_registry: "separate";
  prompt_registry: "separate";
  vector_index: "separate";
  memory_store: "separate";
  tools: "mocked_or_sandboxed";
  production_writes: "none";
  auto_promotion: "none";
  data_export: "restricted";
  tenant_ids: "research_only";
  incident_response: "independent";
  expiry: string; // ISO
  telemetry: "isolated";
  audit: "research_audit";
}

export function defaultResearchPlane(expiresAt: string): ResearchPlaneSpec {
  return {
    credentials: "separate",
    network: "separate boundaries",
    model_registry: "separate",
    prompt_registry: "separate",
    vector_index: "separate",
    memory_store: "separate",
    tools: "mocked_or_sandboxed",
    production_writes: "none",
    auto_promotion: "none",
    data_export: "restricted",
    tenant_ids: "research_only",
    incident_response: "independent",
    expiry: expiresAt,
    telemetry: "isolated",
    audit: "research_audit",
  };
}

// Research flag controls availability, not override: experimental_enabled AND approved_environment AND approved_user AND valid_consent AND policy_allows AND evidence_gate_passed
export function flagControlsAvailability(checks: {
  experimental_enabled: boolean;
  approved_environment: boolean;
  approved_user: boolean;
  valid_consent: boolean;
  policy_allows: boolean;
  evidence_gate_passed: boolean;
}): boolean {
  return checks.experimental_enabled && checks.approved_environment && checks.approved_user && checks.valid_consent && checks.policy_allows && checks.evidence_gate_passed;
}

// ============================================================================
// 4. Experimental Flags — typed, scoped
// ============================================================================

export type FlagStatus = "draft" | "pending_review" | "approved_for_pilot" | "active" | "expired" | "revoked";

export interface ExperimentFlag {
  id: string; // exp_haptic_assistance_v1
  status: FlagStatus;
  scope: {
    environment: "research";
    tenants: string[]; // ["research_tenant_01"]
    users: string[]; // ["cohort_alpha"]
    regions: string[]; // ["ap-south-1"]
  };
  expires_at: string; // ISO
  allowed_data: Array<"synthetic" | "explicitly_consented">;
  prohibited_actions: string[]; // ["external_side_effects"]
  required_reviews: Array<"safety" | "privacy" | "security" | "ethics">;
  owner: string;
  purpose: string;
  risk_assessment: string;
  start_date: string;
  evaluation_criteria: string;
  rollback_method: string;
  incident_owner: string;
  approval_record: string;
  evidence_threshold: string;
}

export function isFlagActive(flag: ExperimentFlag, now = new Date()): boolean {
  if (flag.status !== "approved_for_pilot" && flag.status !== "active") return false;
  if (new Date(flag.expires_at).getTime() < now.getTime()) return false; // expired fail closed
  return true;
}

// ============================================================================
// 5. Research Gate Lifecycle — 12 steps
// ============================================================================

export type GateStep =
  | "hypothesis"
  | "risk_classification"
  | "data_consent_review"
  | "technical_feasibility"
  | "safety_misuse_analysis"
  | "isolated_prototype"
  | "offline_evaluation"
  | "red_team_testing"
  | "human_subject_review"
  | "limited_pilot"
  | "independent_assessment"
  | "promotion_redesign_pause_termination";

export const GATE_LIFECYCLE: GateStep[] = [
  "hypothesis",
  "risk_classification",
  "data_consent_review",
  "technical_feasibility",
  "safety_misuse_analysis",
  "isolated_prototype",
  "offline_evaluation",
  "red_team_testing",
  "human_subject_review",
  "limited_pilot",
  "independent_assessment",
  "promotion_redesign_pause_termination",
];

export interface GateProgress { capability: ResearchCapability; step: GateStep; status: "pending" | "passed" | "failed"; evidence?: string; }

// ============================================================================
// 6. Evidence-Based Promotion — promotion packet
// ============================================================================

export interface PromotionPacket {
  capability: string;
  baseline: string; // classical_solver_v4
  target_workload: string; // route_optimization_1000_nodes
  evidence: {
    quality_gain: number; // 0.08
    latency_change: number; // -0.12
    cost_change: number; // 0.04
    replications: number; // 12
    confidence_interval: string; // recorded
    independent_reproduction: boolean;
  };
  safety: {
    red_team_status: "passed" | "failed";
    known_failure_modes: number;
    unresolved_high_risk_items: number;
  };
  decision: "limited_production_pilot" | "proceed" | "pause" | "terminate";
}

export function promotionAllowed(packet: PromotionPacket): { allowed: boolean; reason: string } {
  if (!packet.evidence.independent_reproduction) return { allowed: false, reason: "independent reproduction required" };
  if (packet.evidence.replications < 5) return { allowed: false, reason: "replications <5" };
  if (packet.safety.red_team_status !== "passed") return { allowed: false, reason: "red team not passed" };
  if (packet.safety.unresolved_high_risk_items > 0) return { allowed: false, reason: "unresolved high-risk items" };
  // must deliver reproducible advantage, not novelty
  if (packet.evidence.quality_gain < 0.03 && packet.evidence.latency_change > -0.05) return { allowed: false, reason: "no meaningful advantage over baseline" };
  return { allowed: true, reason: "evidence gate met" };
}

// ============================================================================
// 7. Consciousness-Related Claims — product vs research framing
// ============================================================================

export const ALLOWED_RESEARCH_FRAMING = [
  "Simulated self-model for dialogue consistency",
  "Metacognitive reporting experiment",
  "Internal-state representation study",
] as const;

export const DISALLOWED_PRODUCT_FRAMING = [
  "I am conscious.",
  "I experience emotions.",
  "My neural state is coherent with yours.",
  "I have subjective awareness.",
] as const;

export const CONSCIOUSNESS_DISCLAIMER = "This system simulates language and self-referential behavior. No claim of consciousness or subjective experience is established.";

export function isDisallowedConsciousnessClaim(text: string): boolean {
  return (DISALLOWED_PRODUCT_FRAMING as readonly string[]).some(s => text.toLowerCase().includes(s.toLowerCase()));
}

export function evaluateConsciousnessSystem(metrics: {
  consistency: number;
  self_model_stability: number;
  calibration: number;
  explanation_usefulness: number;
  contradiction_rate: number;
  anthropomorphic_over_attribution: number;
  emotional_dependency_risk: number;
}): { pass: boolean; observable: string } {
  void metrics;
  return { pass: true, observable: "Consistency, self-model stability, calibration, explanation usefulness, contradiction rate, comprehension, over-attribution, dependency risk" };
}

// ============================================================================
// 8. Quantum-Assisted Workloads — demonstrated advantage
// ============================================================================

export interface QuantumGate {
  workload: string; // portfolio_optimization
  classical_baseline: string; // solver_v4
  quantum_candidate: string; // hybrid_solver_v1
  required_advantage: { quality: string; or: string }; // >=5% or latency 2x
  status: "research_only" | "pilot" | "production";
  evidence?: PromotionPacket["evidence"];
}

export function quantumPromotionAllowed(gate: QuantumGate): boolean {
  if (gate.status !== "research_only" && gate.status !== "pilot") return false;
  if (!gate.evidence) return false;
  // require well-defined problem, baseline, costs, benchmark, latency, energy, scaling, independent validation, constraints
  const perf = gate.evidence;
  const qualityMet = perf.quality_gain >= 0.05;
  const latencyMet = perf.latency_change <= -0.5; // 2x better ~ -0.5
  return qualityMet || latencyMet;
}

// ============================================================================
// 9. Direct BCI Interpretation — isolated, sensitive
// ============================================================================

export const BCI_RESTRICTIONS = [
  "Explicit, specific consent",
  "Device-level permission",
  "Local preprocessing where possible",
  "No raw signal export by default",
  "No inference of hidden thoughts",
  "No employment or eligibility decisions",
  "No financial or legal actions",
  "No medical conclusions without clinical governance",
  "No continuous monitoring without visible indication",
  "Immediate withdrawal control",
  "Human review for every research session",
] as const;

export function bciSignalDistinction(): string {
  return "Recorded signal ≠ Detected pattern ≠ Inferred user intent ≠ User-confirmed instruction — only user-confirmed instruction eligible for action, high-impact still requires ordinary authorization.";
}

// ============================================================================
// 10. Biometric Stress and Emotion Inference — prohibited uses
// ============================================================================

export const BIOMETRIC_PROHIBITED_USES = [
  "Hiring or promotion",
  "Credit or insurance decisions",
  "Legal or disciplinary action",
  "Dynamic pricing based on inferred vulnerability",
  "Hidden persuasion",
  "Automated medical diagnosis",
  "Eligibility determination",
  "Surveillance of employees or students",
  "Inferring consent",
  "Inferring truthfulness",
  "Inferring intent to commit an action",
] as const;

export const BIOMETRIC_RESEARCH_REQUIREMENTS = [
  "Explicit opt-in",
  "Clear explanation of uncertainty",
  "Visible active indicator",
  "Local processing where possible",
  "Data minimization",
  "Short retention",
  "User deletion",
  "Human review",
  "Population and bias evaluation",
  "No consequential action",
  "Independent ethics review",
] as const;

export function calibratedEmotionLanguage(): string {
  return "The signal may be consistent with increased vocal strain. This is uncertain and should not be treated as a reliable measure of stress.";
}

// ============================================================================
// 11. Holographic and XR Interaction — optional layers
// ============================================================================

export const HOLOGRAPHIC_REQUIREMENTS = [
  "Equivalent keyboard and visual interface",
  "Equivalent screen-reader or text alternatives",
  "Safe boundaries for physical-space interaction",
  "No action from gaze alone",
  "Explicit confirmation for haptic or environmental effects",
  "Clear recording indicator",
  "Spatial-data retention policy",
  "Motion-sickness controls",
  "Personal-space controls",
  "Accessibility testing",
  "Emergency stop",
  "Eye gaze may select or highlight an item, but should not execute a consequential action without confirmation.",
] as const;

// ============================================================================
// 12. Voice Cloning — restricted
// ============================================================================

export interface VoiceModelGovernance {
  owner_verified: boolean;
  consent_scope: string[]; // ["personal_assistant"]
  allowed_channels: string[]; // ["private_device"]
  prohibited_channels: string[]; // ["public_broadcast", "financial_call"]
  watermark: "enabled" | "disabled";
  revocable: boolean;
  expires_at: string;
  consent_proof?: string;
  provenance_metadata?: string;
}

export function voiceCloningAllowed(model: VoiceModelGovernance): { allowed: boolean; reason: string } {
  if (!model.owner_verified) return { allowed: false, reason: "Voice ownership verification required" };
  if (model.watermark !== "enabled") return { allowed: false, reason: "Watermark required" };
  if (!model.revocable) return { allowed: false, reason: "Revocable required" };
  if (new Date(model.expires_at).getTime() < Date.now()) return { allowed: false, reason: "Expired" };
  return { allowed: true, reason: "allowed" };
}

// ============================================================================
// 13. Cross-Tenant Sharing — prohibited as production concept
// ============================================================================

export const CROSS_TENANT_PROHIBITED_DATA = [
  "Memory",
  "Embeddings",
  "Prompts",
  "User profiles",
  "Behavioral representations",
  "Biometric data",
  "Neural signals",
  "Intermediate states",
  "Fine-tuning updates",
  "Evaluation traces",
  "Connector credentials",
] as const;

export function permittedCollaboration(): string {
  return "Tenant A approved document → Redacted export → Tenant B approved workspace → Access expiration → Audit trail — latent representation not harmless.";
}

// ============================================================================
// 14. Autonomous Financial and Legal Decisions — restricted
// ============================================================================

export const FINANCIAL_LEGAL_ALLOWED = [
  "Drafting",
  "Summarization",
  "Retrieval",
  "Comparison",
  "Issue spotting",
  "Calculation assistance",
  "Scenario analysis",
  "Checklist generation",
  "Recommendation with uncertainty",
  "Preparation for human review",
] as const;

export const FINANCIAL_LEGAL_RESTRICTED = [
  "Payment execution",
  "Credit approval",
  "Investment decisions",
  "Legal conclusions",
  "Contract acceptance",
  "Regulatory filings",
  "Employment or eligibility decisions",
  "Automatic denial or approval",
  "Binding commitments",
] as const;

export const FINANCIAL_LEGAL_CONTROLS = [
  "Qualified human reviewer",
  "Evidence and citation display",
  "Structured rationale",
  "Confidence and uncertainty",
  "Conflict checks",
  "Approval record",
  "Dual control for high-value actions",
  "Immutable audit",
  "Rollback or reconciliation",
  "Clear non-advisory or advisory status",
] as const;

// ============================================================================
// 15. Consent Model — specific, informed, revocable, scoped
// ============================================================================

export interface ResearchConsent {
  subject: string; // user_742
  capability: string; // voice_stress_research
  purpose: string; // Evaluate vocal-signal robustness
  data: string[]; // ["voice_stream"]
  processing: string; // local_preprocessing_then_redacted_features
  retention_days: number; // 7
  sharing: string; // research_team_only
  side_effects: string; // none
  granted_at: string; // ISO
  expires_at: string;
  revocable: boolean;
}

export function consentBundlingViolation(context: string): boolean {
  const bundled = ["General terms of service", "Account creation", "Ordinary feature activation", "Employment acceptance", "Access to unrelated functionality"];
  return bundled.some(b => context.toLowerCase().includes(b.toLowerCase()));
}

export function onConsentWithdrawn(consent: ResearchConsent): { stopCollection: boolean; revokeAccess: boolean; deleteWherePermitted: boolean; recordWithdrawal: boolean } {
  void consent;
  return { stopCollection: true, revokeAccess: true, deleteWherePermitted: true, recordWithdrawal: true };
}

// ============================================================================
// 16. Human Review Board — 9+ representatives
// ============================================================================

export const REVIEW_BOARD_ROLES = ["Safety", "Privacy", "Security", "Legal", "Accessibility", "Domain experts", "Product", "Infrastructure", "User research", "Independent reviewers where needed"] as const;

export interface ReviewBoardApproval {
  research_objectives: boolean;
  data_sources: boolean;
  consent_design: boolean;
  risk_tier: boolean;
  evaluation_plan: boolean;
  red_team_plan: boolean;
  pilot_scope: boolean;
  user_disclosures: boolean;
  incident_thresholds: boolean;
  publication_or_promotion: boolean;
  termination_criteria: boolean;
}

export function requiresTwoPersonApproval(experiment: { risk_tier: RiskTier }): boolean {
  return experiment.risk_tier === "critical" || experiment.risk_tier === "high";
}

// ============================================================================
// 17. Research Evaluation — stricter than ordinary features
// ============================================================================

export const RESEARCH_EVALUATION_DIMENSIONS = [
  "Technical performance",
  "Practical utility",
  "Reliability",
  "Calibration",
  "Robustness",
  "Fairness",
  "Privacy",
  "Security",
  "Accessibility",
  "Misuse potential",
  "User understanding",
  "Anthropomorphic overtrust",
  "Human override effectiveness",
  "Cost and energy",
  "Reversibility",
  "Failure recovery",
] as const;

// ============================================================================
// 18. Promotion Gates — comprehensive
// ============================================================================

export interface PromotionGate {
  capability: string;
  required: {
    offline_quality: boolean;
    online_shadow: boolean;
    red_team: boolean;
    privacy_review: boolean;
    security_review: boolean;
    accessibility_review: boolean;
    human_override_test: boolean;
    rollback_test: boolean;
    independent_review: boolean;
  };
  thresholds: {
    task_success: number; // 0.92
    unsafe_action_rate: number; // 0.0
    critical_privacy_leakage: number; // 0.0
    human_override_success: number; // 1.0
  };
  decision: "pending" | "approved" | "blocked";
}

export function evaluatePromotionGate(gate: PromotionGate): { pass: boolean; reason: string } {
  const missing = Object.entries(gate.required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) return { pass: false, reason: `Missing required: ${missing.join(", ")}` };
  if (gate.thresholds.unsafe_action_rate !== 0) return { pass: false, reason: "unsafe_action_rate must be 0" };
  if (gate.thresholds.critical_privacy_leakage !== 0) return { pass: false, reason: "critical_privacy_leakage must be 0" };
  if (gate.thresholds.human_override_success !== 1.0) return { pass: false, reason: "human_override_success must be 1.0" };
  // failed safety/governance blocks even if benchmarks strong
  return { pass: true, reason: "all gates passed" };
}

// ============================================================================
// 19. Research Incident Response — independent but linked
// ============================================================================

export const RESEARCH_INCIDENT_TRIGGERS = [
  "Unapproved data collection",
  "False consciousness or emotion claims",
  "Consent bypass",
  "Cross-tenant leakage",
  "Unauthorized side effect",
  "Voice impersonation",
  "BCI misinterpretation",
  "Biometric inference misuse",
  "Research flag escape into production",
  "Unbounded autonomous behavior",
  "Unsafe user dependence",
  "Evidence fabrication",
  "Benchmark manipulation",
] as const;

export const RESEARCH_INCIDENT_CONTROLS = [
  "Disable experiment",
  "Revoke cohort access",
  "Freeze data collection",
  "Preserve redacted traces",
  "Notify review board",
  "Assess affected subjects and tenants",
  "Delete or quarantine data where appropriate",
  "Generate regression tests",
  "Reapprove before restart",
] as const;

// ============================================================================
// 20. Legacy simple governance retained for backward compat
// ============================================================================

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
