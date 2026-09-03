// N0VA HEALTH & WELLNESS Release Sequencing — Project Vita.
// Converts the expansive feature catalog into a risk-tiered health operating
// platform: every feature carries a defined user, intended purpose, evidence
// level, approval path, safety boundary, data requirement, and measurable
// outcome. Phases gate on evidence — predictive and advanced capabilities
// never launch merely because the platform already contains the components.
//
// Governing principle: sequence by risk, not by enthusiasm. Phase N opens
// only when phases below it have evidence, and regulated tiers always need
// their approval path complete.
import { z } from "zod";
import { logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_releases";
export const RELEASE_SEQUENCING_VERSION = "2026.09";

// ── Recommended release sequence — 4 phases ───────────────────────────
export const RELEASE_PHASES = [
  {
    phase: 1, name: "Safe foundation",
    goal: "Trusted record, consent, and coordination before any automation",
    capabilities: ["uhr_workspace", "consent_sharing", "ehr_hie_integration", "med_reconciliation", "scheduling_access", "referral_lifecycle", "clinical_messaging", "home_devices", "health_profile", "records_vault", "audit_provenance"],
    entryRequirements: ["consumer_privacy_notice", "identity_recovery", "consent_sharing", "tenant_isolation", "documentation_governance"],
  },
  {
    phase: 2, name: "Clinical productivity",
    goal: "Human-reviewed assistance that saves time without making decisions",
    capabilities: ["ai_documentation", "team_tasks", "care_gap_engine", "rpm", "patient_engagement", "payer_authorization", "population_surveillance", "advanced_analytics"],
    entryRequirements: ["workflow_validation", "medication_referral_safety", "critical_result_handling", "human_review_of_ai", "downtime_workflow"],
  },
  {
    phase: 3, name: "Predictive intelligence",
    goal: "Validated models with calibration, subgroup, and monitoring evidence",
    capabilities: ["cds", "imaging", "medication_management", "advanced_analytics", "interoperability_hub", "research_clean_room"],
    entryRequirements: ["safety_case", "regulatory_classification", "model_monitoring", "human_factors", "hospital_governance"],
  },
  {
    phase: 4, name: "Advanced research",
    goal: "Experimental capabilities inside governed research boundaries only",
    capabilities: ["biobank", "device_gateway", "ha_dr", "dedicated_regional_deployment", "managed_governance"],
    entryRequirements: ["protocol_ethics_workflow", "genomic_governance", "clean_room_controls", "reproducibility", "output_review"],
  },
] as const;
export type ReleasePhase = (typeof RELEASE_PHASES)[number]["phase"];

export function phaseGateStatus(phase: ReleasePhase, evidence: Record<string, boolean>): { openable: boolean; gaps: string[]; blockedBy: string[] } {
  const def = RELEASE_PHASES.find((p) => p.phase === phase);
  if (!def) return { openable: false, gaps: [], blockedBy: ["unknown phase"] };
  const gaps = def.entryRequirements.filter((r) => !evidence[r]);
  const blockedBy: string[] = [];
  for (const earlier of RELEASE_PHASES.filter((p) => p.phase < phase)) {
    const earlierGaps = earlier.entryRequirements.filter((r) => !evidence[r]);
    if (earlierGaps.length > 0) blockedBy.push(`phase ${earlier.phase} (${earlier.name}): ${earlierGaps.join(", ")}`);
  }
  return { openable: gaps.length === 0 && blockedBy.length === 0, gaps: [...gaps], blockedBy };
}

// ── Risk-tiered feature catalog ───────────────────────────────────────
// T0 informational → T1 operational → T2 clinical-support → T3
// regulated-device-candidate → T4 autonomous (prohibited without explicit
// approval). Tier sets the approval path, safety boundary, data
// requirement, evidence level, and measurable outcome for every feature.
export const FEATURE_RISK_TIERS = {
  T0_INFORMATIONAL: { approvalPath: "product_review", safetyBoundary: "labeled_information_only", dataRequirement: "patient_provided_or_consented", evidenceLevel: "usability", outcomeIds: ["patient_comprehension", "patient_engagement"] },
  T1_OPERATIONAL: { approvalPath: "clinical_operations_review", safetyBoundary: "human_owned_tasks", dataRequirement: "operational_care_records", evidenceLevel: "workflow_validation", outcomeIds: ["referral_completion", "no_show_rate", "alert_ack_time"] },
  T2_CLINICAL_SUPPORT: { approvalPath: "clinical_governance_plus_safety", safetyBoundary: "recommendation_never_order", dataRequirement: "validated_clinical_data", evidenceLevel: "retrospective_plus_silent", outcomeIds: ["abnormal_result_review_time", "alert_false_positive_rate", "alert_false_negative_rate", "documentation_time_saved"] },
  T3_DEVICE_CANDIDATE: { approvalPath: "regulatory_classification_plus_qms", safetyBoundary: "cleared_indication_only", dataRequirement: "regulated_evidence_dataset", evidenceLevel: "prospective_trial", outcomeIds: ["model_calibration", "subgroup_performance", "clinical_outcome_improvement"] },
  T4_AUTONOMOUS_PROHIBITED: { approvalPath: "explicit_board_approval_only", safetyBoundary: "no_unsupervised_clinical_action", dataRequirement: "continuous_monitoring", evidenceLevel: "continuous_assurance", outcomeIds: ["clinical_outcome_improvement", "incident_response_time"] },
} as const;
export type FeatureRiskTier = keyof typeof FEATURE_RISK_TIERS;

export const featureCatalogSchema = z.object({
  feature: z.string().min(1),
  edition: z.enum(["NOVA_PERSONAL", "NOVA_CARE", "NOVA_CLINICAL", "NOVA_RESEARCH", "NOVA_PUBLIC_HEALTH"]),
  tier: z.enum(Object.keys(FEATURE_RISK_TIERS) as [FeatureRiskTier, ...FeatureRiskTier[]]),
  user: z.string().min(1),
  intendedPurpose: z.string().min(1),
  evidenceLevel: z.string().min(1),
  approvalPath: z.string().min(1),
  safetyBoundary: z.string().min(1),
  dataRequirement: z.string().min(1),
  outcomeIds: z.array(z.string()).min(1),
  releasePhase: z.coerce.number().int().min(1).max(4),
});

export function catalogCompleteness(input: Partial<z.infer<typeof featureCatalogSchema>>): string[] {
  const required = ["feature", "edition", "tier", "user", "intendedPurpose", "evidenceLevel", "approvalPath", "safetyBoundary", "dataRequirement", "outcomeIds", "releasePhase"] as const;
  return required.filter((k) => {
    const v = (input as Record<string, unknown>)[k];
    return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  });
}

// ── In-memory catalog (pre-migration) ─────────────────────────────────
interface StoredRow extends Record<string, unknown> { id: string; workspaceId: string }
const memFeatures = new Map<string, StoredRow[]>();
function memList(ws: string): StoredRow[] { return memFeatures.get(ws) ?? []; }

// ── Release Sequencing Control ────────────────────────────────────────
export class ReleaseSequencing {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health`);
  }
  private audit(action: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType: "ReleaseArtifact", targetId, metadata: meta }).catch(() => null);
  }

  listPhases() {
    return RELEASE_PHASES.map((p) => ({ phase: p.phase, name: p.name, goal: p.goal, capabilities: [...p.capabilities], entryRequirements: [...p.entryRequirements] }));
  }

  checkPhase(phase: ReleasePhase, evidence: Record<string, boolean>) {
    const status = phaseGateStatus(phase, evidence);
    return { phase, ...status };
  }

  async registerFeature(input: z.infer<typeof featureCatalogSchema>) {
    const parsed = featureCatalogSchema.parse(input);
    if (parsed.tier === "T4_AUTONOMOUS_PROHIBITED") {
      throw new Error("T4 autonomous features cannot self-register — explicit board approval required first");
    }
    await this.assert("CREATE");
    const missing = catalogCompleteness(parsed);
    if (missing.length > 0) throw new Error(`Feature catalog incomplete — missing: ${missing.join(", ")}`);
    const tierDefaults = FEATURE_RISK_TIERS[parsed.tier];
    const id = `feat-${crypto.randomUUID().slice(0, 8)}`;
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>), tierDefaults: { ...tierDefaults } };
    memFeatures.set(this.workspaceId, [...memList(this.workspaceId), stored]);
    await this.audit("releases.feature.registered", id, { feature: parsed.feature, tier: parsed.tier, phase: parsed.releasePhase });
    return stored;
  }

  async listFeatures(tier?: string, phase?: number) {
    await this.assert("READ");
    let all = memList(this.workspaceId);
    if (tier) all = all.filter((f) => f.tier === tier);
    if (phase !== undefined) all = all.filter((f) => f.releasePhase === phase);
    return all;
  }

  async catalogCoverage() {
    await this.assert("READ");
    const all = memList(this.workspaceId);
    const byTier: Record<string, number> = {};
    const byPhase: Record<string, number> = {};
    for (const f of all) {
      byTier[f.tier as string] = (byTier[f.tier as string] ?? 0) + 1;
      byPhase[String(f.releasePhase)] = (byPhase[String(f.releasePhase)] ?? 0) + 1;
    }
    return { version: RELEASE_SEQUENCING_VERSION, features: all.length, byTier, byPhase, generatedAt: new Date().toISOString() };
  }
}

// ── Static reference exports ──────────────────────────────────────────
export const RELEASE_API = [
  "listPhases", "checkPhase", "registerFeature", "listFeatures", "catalogCoverage",
] as const;
