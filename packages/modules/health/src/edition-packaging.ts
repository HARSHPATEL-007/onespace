// N0VA HEALTH & WELLNESS Product Packaging — Project Vita.
// Five deliberately bounded products above one coherent platform: Personal,
// Care, Clinical, Research, and Public Health. Editions share identity,
// interoperability, security, eventing, analytics, and AI foundations, but
// each has its own users, clinical claims, governance, deployment model,
// commercial contract, support model, and regulatory boundary.
//
// Governing principle: one coherent platform underneath, but five deliberately
// bounded products above it — each optimized for its users, risks, data,
// governance, and duty of care. A feature being technically available never
// means it is commercially, clinically, or legally enabled.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_editions";
export const EDITION_PACKAGING_VERSION = "2026.09";

// ── Edition portfolio ─────────────────────────────────────────────────
export const EDITIONS = {
  NOVA_PERSONAL: {
    label: "N0VA Personal", users: "Individuals, families, caregivers",
    scope: "Wellness, personal records, medications, appointments, devices, Ani companion",
    deployment: "Consumer cloud or approved regional deployment",
    governance: "Privacy, consent, safety, consumer protection",
    dataDomain: "Personal wellness and patient-controlled records",
    commercial: "Free, premium, family, device, or partner subscription",
    availability: "High, with consumer fallback", support: "Self-service plus support", release: "Frequent controlled releases",
  },
  NOVA_CARE: {
    label: "N0VA Care", users: "Clinics, practices, care teams",
    scope: "UHR, scheduling, referrals, documentation, RPM, care coordination",
    deployment: "Multi-tenant SaaS or dedicated tenant",
    governance: "Clinical operations, privacy, security, interoperability",
    dataDomain: "Operational care records and coordination data",
    commercial: "Per clinician, per site, per active patient, or hybrid",
    availability: "High during clinic operations", support: "Business-hours or extended support", release: "Tenant-staged releases",
  },
  NOVA_CLINICAL: {
    label: "N0VA Clinical", users: "Hospitals, health systems, clinical departments",
    scope: "EHR integration, CDS, imaging, clinical operations, governance",
    deployment: "Dedicated or regional enterprise deployment",
    governance: "Clinical safety, medical-device, quality, security",
    dataDomain: "Enterprise clinical records and high-criticality workflows",
    commercial: "Enterprise contract, implementation, availability, and module fees",
    availability: "Mission-critical", support: "24/7 operations and escalation", release: "Validated enterprise releases",
  },
  NOVA_RESEARCH: {
    label: "N0VA Research", users: "Universities, sponsors, CROs, biobanks",
    scope: "De-identified cohorts, trials, biobanking, RWE, analytics",
    deployment: "Controlled research workspace or clean room",
    governance: "IRB/ethics, data-use, privacy, scientific validity",
    dataDomain: "Approved coded, de-identified, synthetic, or study data",
    commercial: "Project, cohort, workspace, study, or sponsor contract",
    availability: "Contract-defined", support: "Project and platform support", release: "Study-controlled releases",
  },
  NOVA_PUBLIC_HEALTH: {
    label: "N0VA Public Health", users: "Governments, health agencies, communities",
    scope: "Population health, surveillance, equity, emergency coordination",
    deployment: "Sovereign, regional, or government cloud",
    governance: "Public authority, surveillance governance, equity",
    dataDomain: "Authorized population and surveillance data",
    commercial: "Government or agency contract, population, region, or program",
    availability: "Emergency and policy-driven", support: "Government operations center", release: "Governed regional releases",
  },
} as const;
export type EditionKey = keyof typeof EDITIONS;

// UHR is the specific unified health-record capability N0VA provides — never
// marketed as a legally equivalent EHR without applicable certification.

// ── Shared platform foundation (shared services, separated exposure) ──
export const PLATFORM_FOUNDATION = [
  "identity_and_zero_trust", "tenant_isolation", "consent_and_authorization",
  "eventing_and_transactions", "audit_and_history", "interoperability_gateway",
  "device_and_integration_registry", "privacy_analytics", "configuration_plane",
  "ai_and_model_governance", "security_and_resilience", "notification_and_workflow",
] as const;
export const DATA_DOMAIN_SEPARATION = [
  "distinct_data_domains", "distinct_access_policies", "distinct_retention_rules",
  "distinct_analytics_boundaries", "distinct_export_controls",
] as const;

// ── Edition capability catalogs ───────────────────────────────────────
export const PERSONAL_CAPABILITIES = [
  "health_profile", "wellness_goals", "medication_reminders", "appointment_management",
  "records_vault", "home_devices", "symptom_lifestyle_tracking", "patient_generated_data",
  "education", "caregiver_proxy", "secure_messaging", "ani_companion",
  "consent_sharing", "health_timeline", "emergency_summary",
] as const;
export const PERSONAL_GUARDRAILS = [
  "wellness_vs_medical_advice_labeled", "urgent_symptom_escalation",
  "no_unreviewed_ai_diagnosis", "consent_before_sharing", "source_and_freshness_shown",
  "device_data_labeled_measured_estimated_entered", "accessible_recovery",
  "delegated_scope_enforced", "deletion_export_sharing_controls",
] as const;

export const ANI_MODES = [
  "wellness_coaching", "medication_appointment_reminders", "record_navigation",
  "visit_preparation", "patient_education", "emotional_support", "care_plan_reinforcement",
] as const;
export const ANI_PROHIBITED = [
  "diagnose", "change_medications", "cancel_critical_followup",
  "interpret_critical_result_as_safe", "override_clinician_instructions",
  "make_emergency_decisions", "share_sensitive_with_caregiver_without_permission",
] as const;

export const CARE_CAPABILITIES = [
  "uhr_workspace", "scheduling_access", "referral_lifecycle", "documentation",
  "care_coordination", "med_reconciliation", "care_gap_management", "rpm",
  "patient_engagement", "clinical_messaging", "results_review", "team_tasks",
  "payer_authorization", "provider_analytics", "device_integration", "basic_cds_classified",
] as const;
export const CARE_WORKFLOW = [
  "patient_access", "intake", "encounter", "documentation", "orders_referrals",
  "results", "care_coordination", "follow_up", "analytics",
] as const;
export const CARE_SAFETY = [
  "allergy_medication_review", "critical_result_ack", "referral_escalation",
  "transition_followup", "patient_confirmation", "human_review_of_ai",
  "downtime_workflows", "duplicate_patient_detection", "care_team_attribution",
  "visible_transaction_status",
] as const;

export const CLINICAL_CAPABILITIES = [
  "ehr_hie_integration", "hospital_operations", "clinical_documentation", "cds",
  "medication_allergy", "lab_pathology", "imaging_dicom", "critical_result_management",
  "emergency_inpatient", "discharge_transitions", "perioperative_coordination",
  "device_integration", "clinical_governance", "quality_safety_analytics",
  "enterprise_identity", "disaster_recovery",
] as const;
export const CLINICAL_CONTROLS = [
  "safety_case", "hazard_analysis", "human_factors_validation", "change_control_board",
  "clinical_release_approval", "audit_provenance", "device_classification_review",
  "model_monitoring", "critical_alert_assurance", "high_availability",
  "downtime_drills", "safety_incident_linkage", "vendor_device_risk", "committee_governance",
] as const;

export const RESEARCH_CAPABILITIES = [
  "deidentified_coded_cohorts", "research_marts", "trial_operations", "edc",
  "protocol_eligibility", "research_consent", "biobanking", "biospecimen_inventory",
  "rwe", "federated_research", "clean_rooms", "synthetic_data",
  "statistics", "lineage", "dua", "publication_review",
] as const;
export const RESEARCH_CONTROLS = [
  "protocol_registration", "ethics_irb_approval", "investigator_verification",
  "minimization_review", "controlled_access", "pseudonymization", "genomic_privacy",
  "disclosure_risk", "minimum_cohort", "output_approval", "reidentification_prohibition",
  "dataset_expiry", "withdrawal_propagation", "reproducibility",
] as const;
// "De-identified" is a governance decision with documented risk — never a
// blanket permission for unrestricted sharing.

export const PUBLIC_HEALTH_CAPABILITIES = [
  "surveillance", "population_dashboards", "outbreak_management", "immunization",
  "emergency_preparedness", "community_needs", "equity_monitoring", "lab_facility_reporting",
  "environmental_syndromic", "case_workflows_authorized", "resource_allocation",
  "public_communication", "interagency_coordination", "disaster_operations",
] as const;
export const PUBLIC_HEALTH_CONTROLS = [
  "legal_authority_verification", "purpose_limitation", "jurisdictional_policy",
  "minimum_necessary", "small_cell_suppression", "community_review",
  "data_sharing_agreements", "emergency_access_boundaries", "retention_sunset",
  "transparent_reporting", "bias_equity_review", "reporting_vs_case_separation",
  "emergency_mode_activation_closure",
] as const;

export const EDITION_CAPABILITIES: Record<EditionKey, readonly string[]> = {
  NOVA_PERSONAL: PERSONAL_CAPABILITIES,
  NOVA_CARE: CARE_CAPABILITIES,
  NOVA_CLINICAL: CLINICAL_CAPABILITIES,
  NOVA_RESEARCH: RESEARCH_CAPABILITIES,
  NOVA_PUBLIC_HEALTH: PUBLIC_HEALTH_CAPABILITIES,
};

// ── Optional modules (never imply edition equivalence) ────────────────
export const OPTIONAL_MODULES = [
  "rpm", "medication_management", "referral_network", "patient_engagement",
  "care_gap_engine", "cds", "imaging", "research_clean_room", "biobank",
  "population_surveillance", "emergency_coordination", "advanced_analytics",
  "ai_documentation", "device_gateway", "interoperability_hub",
  "dedicated_regional_deployment", "ha_dr", "managed_governance",
] as const;

// ── Upgrade paths — explicit, consented data movement ─────────────────
export const UPGRADE_PATH = [
  "NOVA_PERSONAL", "NOVA_CARE", "NOVA_CLINICAL", "NOVA_RESEARCH", "NOVA_PUBLIC_HEALTH",
] as const;
export const EXCHANGE_REQUIREMENTS: Record<string, string[]> = {
  PERSONAL_TO_CARE: ["patient_authorization_or_care_relationship"],
  CARE_TO_CLINICAL: ["approved_interoperability", "identity_matching"],
  CLINICAL_TO_RESEARCH: ["protocol", "consent_or_legal_basis", "minimization", "controlled_access"],
  CLINICAL_CARE_TO_PUBLIC_HEALTH: ["legal_authority", "purpose_limitation", "jurisdictional_controls"],
  RESEARCH_TO_PUBLIC_HEALTH: ["separate_community_impact_review", "small_group_protection"],
} as const;
export const EXCHANGE_ENVELOPE = [
  "data_contract", "purpose_bound_tokens", "consent_authorization_checks",
  "tenant_org_scope", "provenance", "data_classification", "transformation_history",
  "retention_rules", "export_controls", "revocation_withdrawal",
] as const;

export function upgradePathValid(from: EditionKey, to: EditionKey): { valid: boolean; requirements: string[]; warning: string | null } {
  const order = (UPGRADE_PATH as readonly string[]).indexOf(from);
  const dest = (UPGRADE_PATH as readonly string[]).indexOf(to);
  if (order < 0 || dest < 0) return { valid: false, requirements: [], warning: "Unknown edition" };
  if (dest <= order) return { valid: false, requirements: [], warning: "Upgrade paths move forward along Personal → Care → Clinical → Research → Public Health" };
  const key = `${from.replace("NOVA_", "")}_TO_${to.replace("NOVA_", "")}`;
  const requirements = EXCHANGE_REQUIREMENTS[key] ?? ["explicit_authorization", "purpose_limitation"];
  return { valid: true, requirements: [...requirements], warning: "Each edition exposes only the data needed for its purpose — never the same record." };
}

// ── Entitlement model — policy, not forks ─────────────────────────────
export const ENTITLEMENT_DIMENSIONS = [
  "edition", "add_on", "region", "organization", "specialty", "user_role",
  "patient_population", "device_catalog", "ai_model", "data_domain",
  "effective_date", "expiry", "approval_requirement", "usage_limit", "residency_constraint",
] as const;

export const entitlementSchema = z.object({
  tenantId: z.string().min(1),
  edition: z.enum(["NOVA_PERSONAL", "NOVA_CARE", "NOVA_CLINICAL", "NOVA_RESEARCH", "NOVA_PUBLIC_HEALTH"]),
  capability: z.string().min(1),
  state: z.enum(["enabled", "restricted", "disabled"]).default("enabled"),
  scope: z.string().default("tenant"),
  requires: z.string().default(""),
  addOn: z.string().default(""),
  region: z.string().default(""),
  specialty: z.string().default(""),
  userRole: z.string().default(""),
  effectiveDate: z.coerce.date().optional(),
  expiry: z.coerce.date().optional().nullable(),
  approvalRequirement: z.string().default(""),
  usageLimit: z.string().default(""),
  residencyConstraint: z.string().default(""),
  approvedBy: z.string().default(""),
  effectiveVersion: z.string().default("2026.09.1"),
});

// Capability must belong to the edition (or be an explicit add-on); modules
// never promote one edition into another.
export function entitlementCoherent(edition: EditionKey, capability: string, addOns: string[]): { coherent: boolean; reason: string } {
  const native = (EDITION_CAPABILITIES[edition] as readonly string[]).includes(capability);
  if (native) return { coherent: true, reason: "native edition capability" };
  if ((OPTIONAL_MODULES as readonly string[]).includes(capability) && addOns.includes(capability)) {
    return { coherent: true, reason: `licensed add-on — does not promote ${EDITIONS[edition].label} into another edition` };
  }
  return { coherent: false, reason: `capability ${capability} is neither native to ${EDITIONS[edition].label} nor a licensed add-on` };
}

// ── Regulatory classification — every clinical/AI capability ──────────
export const REGULATORY_CLASSES = [
  "wellness_general", "administrative", "documentation_support",
  "analytical_support", "cds_non_device_candidate", "device_candidate",
  "prohibited_autonomous",
] as const;

export const regulatorySchema = z.object({
  capability: z.string().min(1),
  edition: z.enum(["NOVA_PERSONAL", "NOVA_CARE", "NOVA_CLINICAL", "NOVA_RESEARCH", "NOVA_PUBLIC_HEALTH"]),
  regulatoryClass: z.enum(REGULATORY_CLASSES),
  riskRationale: z.string().default(""),
  intendedUse: z.string().default(""),
  prohibitedUse: z.array(z.string()).default([]),
  certificationMapping: z.array(z.string()).default([]),
  reviewer: z.string().default(""),
  reviewDate: z.coerce.date().optional(),
});

// ── AI packaging by risk class ────────────────────────────────────────
export const AI_RISK_CLASSES = {
  WELLNESS: { example: "Habit suggestions", defaultControl: "User-facing disclosure" },
  ADMINISTRATIVE: { example: "Scheduling or routing", defaultControl: "Operational monitoring" },
  DOCUMENTATION: { example: "Note draft", defaultControl: "Human review before signing" },
  ANALYTICAL: { example: "Population trend", defaultControl: "Privacy and data-quality controls" },
  CLINICAL_SUPPORT: { example: "Differential or treatment support", defaultControl: "Clinical governance and audit" },
  DEVICE_RELATED: { example: "Signal or image interpretation", defaultControl: "Regulatory assessment and validation" },
  AUTONOMOUS_CLINICAL: { example: "Medication or care-plan change", defaultControl: "Generally prohibited without explicit approval" },
} as const;
export type AiRiskClass = keyof typeof AI_RISK_CLASSES;

export const aiClassificationSchema = z.object({
  aiFunction: z.string().min(1),
  edition: z.enum(["NOVA_PERSONAL", "NOVA_CARE", "NOVA_CLINICAL", "NOVA_RESEARCH", "NOVA_PUBLIC_HEALTH"]),
  riskClass: z.enum(Object.keys(AI_RISK_CLASSES) as [AiRiskClass, ...AiRiskClass[]]),
  modelVersions: z.array(z.string()).default([]),
  humanApproval: z.string().default("required"),
  patientDisclosure: z.string().default("configured"),
  prohibitedUse: z.array(z.string()).default([]),
  fallback: z.string().default("manual_workflow"),
  approvedBy: z.string().default(""),
});

// Higher-risk CDS only after clinical, regulatory, safety, model-governance approval.
export function aiActivationGate(edition: EditionKey, riskClass: AiRiskClass, approvals: Record<string, boolean>): { activatable: boolean; missing: string[] } {
  if (edition === "NOVA_PERSONAL" && (riskClass === "CLINICAL_SUPPORT" || riskClass === "DEVICE_RELATED" || riskClass === "AUTONOMOUS_CLINICAL")) {
    return { activatable: false, missing: [`${riskClass} AI is not packageable in N0VA Personal (wellness-oriented AI only)`] };
  }
  if (riskClass === "AUTONOMOUS_CLINICAL" && !approvals.explicit_approval) {
    return { activatable: false, missing: ["explicit approval for autonomous clinical action"] };
  }
  if ((riskClass === "CLINICAL_SUPPORT" || riskClass === "DEVICE_RELATED")) {
    const missing = ["clinical", "regulatory", "safety", "model_governance"].filter((a) => !approvals[a]);
    return { activatable: missing.length === 0, missing };
  }
  return { activatable: true, missing: [] };
}

export function aniGuard(action: string): { permitted: boolean; reason: string } {
  if ((ANI_PROHIBITED as readonly string[]).includes(action)) {
    return { permitted: false, reason: `Ani must not independently: ${action}. Route to escalation or approved clinical pathway.` };
  }
  return { permitted: true, reason: "within configured Ani modes; interaction must be attributable, reviewable, AI-labeled" };
}

// ── Launch gates per edition ──────────────────────────────────────────
export const LAUNCH_GATES: Record<EditionKey, readonly string[]> = {
  NOVA_PERSONAL: ["consumer_privacy_notice", "wellness_boundaries", "identity_recovery", "consent_sharing", "device_data_labels", "ani_safety_escalation", "accessibility", "deletion_export"],
  NOVA_CARE: ["workflow_validation", "provider_identity", "patient_matching", "medication_referral_safety", "critical_result_handling", "rpm_operations", "downtime_workflow", "tenant_isolation", "documentation_governance"],
  NOVA_CLINICAL: ["safety_case", "enterprise_interop", "availability_recovery_tests", "device_firmware_governance", "regulatory_classification", "human_factors", "model_monitoring", "hospital_governance", "safety_incident_processes"],
  NOVA_RESEARCH: ["protocol_ethics_workflow", "dua", "disclosure_controls", "consent_withdrawal", "genomic_governance", "lineage", "clean_room_controls", "reproducibility", "output_review"],
  NOVA_PUBLIC_HEALTH: ["legal_authority_model", "jurisdictional_deployment", "surveillance_governance", "equity_review", "emergency_mode_controls", "community_communication", "small_cell_protection", "interagency_sharing", "sunset_retention"],
};
export function launchGateGaps(edition: EditionKey, evidence: Record<string, boolean>): string[] {
  return LAUNCH_GATES[edition].filter((g) => !evidence[g]);
}

// ── Patient-facing clarity ────────────────────────────────────────────
export function serviceExplanation(edition: EditionKey): string {
  const map: Record<EditionKey, string> = {
    NOVA_PERSONAL: "You are using a wellness companion — not a replacement for professional medical care.",
    NOVA_CARE: "You are using a clinic care service operated by your care team.",
    NOVA_CLINICAL: "You are using a hospital clinical system governed by clinical safety processes.",
    NOVA_RESEARCH: "You are contributing to a governed research study — use is limited to the approved protocol.",
    NOVA_PUBLIC_HEALTH: "You are interacting with an authorized public-health program operating under legal authority.",
  };
  return map[edition];
}

// ── In-memory fallbacks (pre-migration) ───────────────────────────────
interface StoredRow extends Record<string, unknown> { id: string; workspaceId: string }
const memEntitlements = new Map<string, StoredRow[]>();
const memRegulatory = new Map<string, StoredRow[]>();
const memAi = new Map<string, StoredRow[]>();
const memExchanges = new Map<string, StoredRow[]>();
const memLaunches = new Map<string, StoredRow[]>();

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
function memList(m: Map<string, StoredRow[]>, ws: string): StoredRow[] { return m.get(ws) ?? []; }
function memPush(m: Map<string, StoredRow[]>, ws: string, row: StoredRow) { m.set(ws, [...(m.get(ws) ?? []), row]); }

type EditionTables = {
  healthEditionEntitlement: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthEditionRegulatory: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthEditionAi: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthEditionExchange: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthEditionLaunch: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
};

// ── Edition Packaging Control ─────────────────────────────────────────
export class EditionPackaging {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health`);
  }
  private audit(action: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType: "EditionArtifact", targetId, metadata: meta }).catch(() => null);
  }

  // ── Entitlements — capability grants as versioned policy ──────────
  async grantEntitlement(input: z.infer<typeof entitlementSchema>) {
    await this.assert("CREATE");
    const parsed = entitlementSchema.parse(input);
    if (parsed.expiry && parsed.expiry.getTime() <= Date.now()) throw new Error("Entitlement expiry must be in the future");
    const coherence = entitlementCoherent(parsed.edition, parsed.capability, parsed.addOn ? [parsed.addOn] : []);
    if (!coherence.coherent) throw new Error(`Entitlement incoherent: ${coherence.reason}`);
    if (parsed.state === "restricted" && !parsed.requires) throw new Error("Restricted capabilities must name their requirement (e.g. clinical_governance)");
    const id = `ent-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as EditionTables).healthEditionEntitlement.create({
        data: {
          workspaceId: this.workspaceId, entitlementId: id, tenantId: parsed.tenantId,
          edition: parsed.edition, capability: parsed.capability, state: parsed.state,
          scope: parsed.scope, requires: parsed.requires, addOn: parsed.addOn,
          region: parsed.region, specialty: parsed.specialty, userRole: parsed.userRole,
          effectiveDate: parsed.effectiveDate ?? null, expiry: parsed.expiry ?? null,
          approvalRequirement: parsed.approvalRequirement, usageLimit: parsed.usageLimit,
          residencyConstraint: parsed.residencyConstraint, approvedBy: parsed.approvedBy,
          effectiveVersion: parsed.effectiveVersion, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memEntitlements, this.workspaceId, stored);
    await this.audit("editions.entitlement.granted", id, { edition: parsed.edition, capability: parsed.capability, state: parsed.state });
    return { entitlementId: id, coherence: coherence.reason, ...((row as unknown as Record<string, unknown> | null) ?? stored) };
  }

  async setEntitlementState(entitlementId: string, state: "enabled" | "restricted" | "disabled", actor: string) {
    await this.assert("UPDATE");
    await safe(() => (prisma as unknown as EditionTables).healthEditionEntitlement.update({ where: { entitlementId }, data: { state } }) as Promise<never>, null);
    const found = memList(memEntitlements, this.workspaceId).find((e) => e.id === entitlementId);
    if (found) found.state = state;
    await this.audit("editions.entitlement.changed", entitlementId, { state, actor });
    return { entitlementId, state };
  }

  async listEntitlements(tenantId?: string, edition?: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as EditionTables).healthEditionEntitlement.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 200 }) as Promise<never[]>,
      [],
    );
    let all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memEntitlements, this.workspaceId);
    if (tenantId) all = all.filter((e) => (e as Record<string, unknown>).tenantId === tenantId);
    if (edition) all = all.filter((e) => (e as Record<string, unknown>).edition === edition);
    return all;
  }

  // ── Regulatory classification — explicit for every capability ─────
  async classifyCapability(input: z.infer<typeof regulatorySchema>) {
    await this.assert("CREATE");
    const parsed = regulatorySchema.parse(input);
    if ((parsed.regulatoryClass === "device_candidate" || parsed.regulatoryClass === "cds_non_device_candidate") && !parsed.reviewer) {
      throw new Error("CDS/device classification requires a named reviewer and documented rationale");
    }
    const id = `reg-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as EditionTables).healthEditionRegulatory.create({
        data: {
          workspaceId: this.workspaceId, classificationId: id, capability: parsed.capability,
          edition: parsed.edition, regulatoryClass: parsed.regulatoryClass,
          riskRationale: parsed.riskRationale, intendedUse: parsed.intendedUse,
          prohibitedUse: parsed.prohibitedUse, certificationMapping: parsed.certificationMapping,
          reviewer: parsed.reviewer, reviewDate: parsed.reviewDate ?? null, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memRegulatory, this.workspaceId, stored);
    await this.audit("editions.regulatory.classified", id, { capability: parsed.capability, class: parsed.regulatoryClass });
    return (row as unknown) ?? stored;
  }

  // ── AI classification + activation ─────────────────────────────────
  async classifyAi(input: z.infer<typeof aiClassificationSchema>) {
    await this.assert("CREATE");
    const parsed = aiClassificationSchema.parse(input);
    const id = `ai-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as EditionTables).healthEditionAi.create({
        data: {
          workspaceId: this.workspaceId, aiId: id, aiFunction: parsed.aiFunction,
          edition: parsed.edition, riskClass: parsed.riskClass, modelVersions: parsed.modelVersions,
          humanApproval: parsed.humanApproval, patientDisclosure: parsed.patientDisclosure,
          prohibitedUse: parsed.prohibitedUse, fallback: parsed.fallback,
          approvedBy: parsed.approvedBy, active: false, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>), active: false };
    if (!row) memPush(memAi, this.workspaceId, stored);
    await this.audit("editions.ai.classified", id, { function: parsed.aiFunction, riskClass: parsed.riskClass });
    return { aiId: id, defaultControl: AI_RISK_CLASSES[parsed.riskClass].defaultControl, ...((row as unknown as Record<string, unknown> | null) ?? stored) };
  }

  async activateAi(aiId: string, approvals: Record<string, boolean>) {
    await this.assert("UPDATE");
    const all = await this.listAi();
    const found = (all as Array<Record<string, unknown>>).find((a) => a.aiId === aiId || a.id === aiId);
    if (!found) throw new Error("AI classification not found");
    const gate = aiActivationGate(found.edition as EditionKey, found.riskClass as AiRiskClass, approvals);
    if (!gate.activatable) throw new Error(`AI activation blocked — missing: ${gate.missing.join("; ")}`);
    await safe(() => (prisma as unknown as EditionTables).healthEditionAi.update({ where: { aiId }, data: { active: true } }) as Promise<never>, null);
    found.active = true;
    await this.audit("editions.ai.activated", aiId, { approvals });
    return { aiId, active: true as const };
  }

  async listAi(edition?: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as EditionTables).healthEditionAi.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 200 }) as Promise<never[]>,
      [],
    );
    const all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memAi, this.workspaceId);
    return edition ? all.filter((a) => (a as Record<string, unknown>).edition === edition) : all;
  }

  // ── Cross-edition exchange — explicit, purpose-bound ───────────────
  async authorizeExchange(input: { fromEdition: EditionKey; toEdition: EditionKey; purpose: string; authorizer: string; consentRef?: string; legalBasis?: string }) {
    await this.assert("CREATE");
    const path = upgradePathValid(input.fromEdition, input.toEdition);
    if (!path.valid) throw new Error(path.warning ?? "Exchange not permitted along this path");
    const missing = path.requirements.filter((r) => {
      if (r === "patient_authorization_or_care_relationship") return !input.consentRef;
      if (r === "consent_or_legal_basis") return !input.consentRef && !input.legalBasis;
      if (r === "legal_authority") return !input.legalBasis;
      return false;
    });
    if (missing.length > 0) throw new Error(`Exchange blocked — missing: ${missing.join(", ")}`);
    const id = `xch-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as EditionTables).healthEditionExchange.create({
        data: {
          workspaceId: this.workspaceId, exchangeId: id, fromEdition: input.fromEdition,
          toEdition: input.toEdition, purpose: input.purpose, authorizer: input.authorizer,
          consentRef: input.consentRef ?? "", legalBasis: input.legalBasis ?? "",
          requirements: path.requirements, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, requirements: path.requirements };
    if (!row) memPush(memExchanges, this.workspaceId, stored);
    await this.audit("editions.exchange.authorized", id, { from: input.fromEdition, to: input.toEdition, purpose: input.purpose });
    return { exchangeId: id, envelope: [...EXCHANGE_ENVELOPE], warning: path.warning, ...((row as unknown as Record<string, unknown> | null) ?? {}) };
  }

  // ── Launch gates — evidence before claims ─────────────────────────
  async recordLaunchGate(edition: EditionKey, evidence: Record<string, boolean>, approver: string) {
    await this.assert("CREATE");
    const gaps = launchGateGaps(edition, evidence);
    const id = `launch-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as EditionTables).healthEditionLaunch.create({
        data: {
          workspaceId: this.workspaceId, launchId: id, edition,
          evidence, gaps, approved: gaps.length === 0,
          approver, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, edition, evidence, gaps, approved: gaps.length === 0, approver };
    if (!row) memPush(memLaunches, this.workspaceId, stored);
    await this.audit("editions.launch.recorded", id, { edition, approved: gaps.length === 0 });
    // Highest-risk clinical / public-health claims never launch on technical readiness alone.
    if (gaps.length > 0) {
      return { launchId: id, edition, approved: false as const, gaps, note: "Launch blocked — claims require evidence, not component availability." };
    }
    return { launchId: id, edition, approved: true as const, gaps: [] as string[] };
  }

  async portfolio() {
    await this.assert("READ");
    const [entitlements, ai, launches] = await Promise.all([this.listEntitlements(), this.listAi(), (async () => {
      const rows = await safe(() => (prisma as unknown as EditionTables).healthEditionLaunch.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 50 }) as Promise<never[]>, []);
      return rows.length ? rows : memList(memLaunches, this.workspaceId);
    })()]);
    return {
      version: EDITION_PACKAGING_VERSION,
      editions: Object.fromEntries(Object.entries(EDITIONS).map(([k, v]) => [k, { label: v.label, users: v.users, scope: v.scope, deployment: v.deployment, governance: v.governance, dataDomain: v.dataDomain, commercial: v.commercial, availability: v.availability, support: v.support, release: v.release }])),
      foundation: [...PLATFORM_FOUNDATION],
      separation: [...DATA_DOMAIN_SEPARATION],
      entitlements: (entitlements as unknown[]).length,
      aiFunctions: (ai as unknown[]).length,
      launches: (launches as unknown[]).length,
      generatedAt: new Date().toISOString(),
    };
  }
}

// ── Static reference exports ──────────────────────────────────────────
export const EDITION_API = [
  "grantEntitlement", "setEntitlementState", "listEntitlements",
  "classifyCapability", "classifyAi", "activateAi", "listAi",
  "authorizeExchange", "recordLaunchGate", "portfolio",
] as const;
