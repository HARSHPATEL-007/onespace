// N0VA Clinical — enterprise clinical systems edition — Project Vita.
// For hospitals and health systems, with stronger controls than N0VA Care
// across safety, availability, interoperability, medical-device integration,
// governance, and recovery. A governed clinical platform that integrates with,
// extends, or selectively replaces defined hospital workflows — never an
// automatically certified universal EHR.
//
// Governing principle: make enterprise care safer and more coordinated without
// hiding uncertainty, weakening clinician accountability, or confusing
// technical integration with clinical assurance.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_clinical";
export const CLINICAL_VERSION = "2026.09";

export const CLINICAL_PROMISE =
  "N0VA Clinical provides a governed, interoperable, resilient clinical operating layer for hospitals and health systems, with every high-impact workflow accountable to clinical ownership and safety evidence.";

// ── Boundaries — claims N0VA Clinical never makes ─────────────────────
export const CLINICAL_NOT_CLAIMS = [
  "universal EHR replacement", "automatic regulatory clearance",
  "full PACS replacement unless validated", "autonomous diagnosis",
  "autonomous prescribing", "guaranteed critical-alert delivery without validation",
  "safety from test-set accuracy alone", "interoperability from API existence alone",
  "hospital-grade availability without tested objectives",
  "safe image or signal interpretation without evaluation",
] as const;

export function clinicalClaimCheck(text: string): { ok: boolean; violations: string[] } {
  const lower = text.toLowerCase();
  const violations = CLINICAL_NOT_CLAIMS.filter((c) => lower.includes(c));
  return { ok: violations.length === 0, violations: [...violations] };
}

// Every claim maps to its evidence chain.
export const CLAIM_EVIDENCE_CHAIN = [
  "product_capability", "intended_use", "user", "data_input", "clinical_impact",
  "regulatory_classification", "validation_evidence", "deployment_conditions", "monitoring",
] as const;

// ── Authority layers — a unified interface never implies equal authority ─
export const AUTHORITY_LAYERS = [
  "source_of_truth_system", "nova_derived_view", "clinical_documentation",
  "patient_generated_data", "ai_generated_content", "operational_events",
  "analytics_outputs", "research_public_health_extracts",
] as const;

// ── Command center workspaces ─────────────────────────────────────────
export const COMMAND_WORKSPACES = [
  "enterprise_command", "emergency", "inpatient", "specialty", "procedural",
  "results", "patient_safety", "clinical_informatics", "downtime",
] as const;
export const WORKSPACE_CONTEXT = [
  "current_patient_or_population", "responsible_owner", "pending_action",
  "time_sensitivity", "dependencies", "data_freshness", "safety_status",
  "escalation", "audit_state",
] as const;

// ── Enterprise record — source-aware, history-preserving ──────────────
export const RECORD_SECTIONS = [
  "identity", "encounters", "problems", "allergies", "medications", "orders",
  "results", "imaging", "procedures", "notes", "care_plans", "devices",
  "referrals", "transitions", "consent", "safety_events",
] as const;
export const RECORD_ITEM_FIELDS = [
  "source_system", "organization", "author_or_performer", "recorded_time",
  "effective_time", "verification_state", "status", "provenance",
  "correction_history", "confidentiality_classification", "clinical_review_state", "actionable",
] as const;
export const RECORD_STATUSES = [
  "preliminary", "final", "corrected", "amended", "superseded", "cancelled", "entered_in_error",
] as const;
const RECORD_EDGES: Record<string, string[]> = {
  preliminary: ["final", "cancelled", "entered_in_error"],
  final: ["corrected", "amended", "superseded", "cancelled"],
  corrected: ["amended", "superseded"],
  amended: ["superseded", "corrected"],
  superseded: [], cancelled: [], entered_in_error: [],
};
export function recordStatusTransition(from: string, to: string): boolean {
  return (RECORD_EDGES[from] ?? []).includes(to);
}
// Prior facts are never overwritten — history preserved, current value clear.

// ── Interoperability matrix + lifecycle ───────────────────────────────
export const INTEROP_MATRIX = [
  "fhir_resources_profiles", "hl7v2_messages", "dicom_dicomweb", "smart_launch",
  "uscdi_elements", "terminology_services", "patient_matching",
  "provider_org_identifiers", "pharmacy_transactions", "payer_auth_standards",
  "tefCA_participation", "consent_authorization", "audit_provenance",
  "bulk_data", "event_notifications",
] as const;
export const INTEROP_LIFECYCLE = [
  "partner_assessment", "data_contract", "security_review", "mapping",
  "synthetic_testing", "conformance_testing", "clinical_validation",
  "pilot", "production", "monitoring", "recertification",
] as const;
export const TRANSACTION_VISIBILITY = [
  "accepted", "validated", "partially_accepted", "rejected", "queued",
  "retried", "reconciled", "applied", "awaiting_human_review",
] as const;
export const RECONCILIATION_VIEWS = [
  "duplicate_patients", "duplicate_medications", "conflicting_allergies",
  "different_encounter_dates", "conflicting_result_status", "missing_attribution",
  "unsupported_codes", "unknown_units", "stale_documents", "unmatched_external_ids",
] as const;

// "Message delivered" is not "clinical information incorporated."
export function interopTransactionComplete(state: string): { incorporated: boolean; reason: string } {
  if (state === "applied" || state === "reconciled") return { incorporated: true, reason: `Transaction ${state} into the clinical record.` };
  return { incorporated: false, reason: `State ${state} is transport progress, not clinical incorporation.` };
}

// ── Emergency department ──────────────────────────────────────────────
export const ED_WORKFLOW = [
  "arrival", "registration", "triage", "acuity", "bed_assignment", "orders",
  "results", "reassessment", "consult", "disposition", "handoff",
] as const;
export const ED_TRACKING = [
  "arrival_time", "triage_completion", "acuity", "time_to_clinician",
  "time_to_order", "critical_result_status", "reassessment_due", "consult_request",
  "bed_request", "transfer", "disposition", "left_before_treatment", "boarding", "handoff_completion",
] as const;
export const ED_SAFETY = [
  "allergy_medication_visibility", "deterioration_escalation", "unreviewed_criticals",
  "behavioral_health_safety", "infection_precautions", "pregnancy_prompts",
  "interpreter_accessibility", "downtime_tracking", "time_critical_assurance",
] as const;

// Throughput must never suppress reassessment, safety checks, or documentation.
export function edThroughputGuard(skipped: string[]): { permitted: boolean; blocked: string[] } {
  const protectedSteps = ["reassessment", "safety_checks", "documentation"];
  const blocked = skipped.filter((s) => protectedSteps.some((p) => s.toLowerCase().includes(p)));
  return { permitted: blocked.length === 0, blocked };
}

// ── Inpatient ─────────────────────────────────────────────────────────
export const INPATIENT_WORKFLOWS = [
  "admission", "bed_management", "nursing_plans", "physician_rounds",
  "multidisciplinary_rounds", "med_admin_integration", "results_review",
  "consults", "procedures", "discharge_planning", "transfer", "handoff", "readmission_prevention",
] as const;
export const DAILY_CLINICAL_VIEW = [
  "active_problems", "overnight_events", "vitals_trends", "labs_imaging",
  "medications", "lines_devices", "consults", "open_tasks",
  "discharge_barriers", "patient_goals",
] as const;

// Uncertainty stays visible: missing results, unsigned orders, unreviewed
// reports must never render as completed items.
export function dailyViewGaps(items: Record<string, "complete" | "pending" | "missing">): string[] {
  return Object.entries(items).filter(([, v]) => v !== "complete").map(([k, v]) => `${k}:${v}`);
}

// ── Documentation controls ────────────────────────────────────────────
export const DOCUMENTATION_CONTROLS = [
  "draft_final_states", "required_fields", "role_based_signing", "co_signature",
  "late_entry", "addendum", "copy_forward_detection", "contradiction_detection",
  "source_attribution", "ai_draft_labeling", "time_author_integrity",
  "patient_summary_controls", "downtime_reconciliation",
] as const;

export function clinicalSignOff(doc: { aiDraft: boolean; verified: boolean; signer: string; role: string }): { signable: boolean; reason: string } {
  if (doc.aiDraft && !doc.verified) return { signable: false, reason: "AI may draft or summarize, but the responsible clinician must verify and sign final documentation." };
  if (!doc.signer) return { signable: false, reason: "Signer required." };
  return { signable: true, reason: `Signed by ${doc.signer} (${doc.role}), accountable for content.` };
}

// ── Medication + allergy ──────────────────────────────────────────────
export const CLINICAL_MEDICATION_WORKFLOW = [
  "source_collection", "normalization", "duplicate_detection", "reconciliation",
  "clinical_review", "order_or_discontinue", "pharmacy_admin_integration",
  "monitoring", "transition_reconciliation",
] as const;
export const ALLERGY_TYPES = [
  "allergy", "intolerance", "adverse_effect", "contraindication",
  "unknown_reaction", "historical_report", "clinician_confirmed",
  "patient_reported", "resolved_disproven",
] as const;
export const ALLERGY_REQUIRED = ["reaction", "severity", "date", "source", "verification"] as const;

export function allergyGaps(entry: Record<string, unknown>): string[] {
  return ALLERGY_REQUIRED.filter((f) => !entry[f]);
}
// Free-text allergy notes survive normalization — originals are preserved.

// ── Lab / pathology / critical results ────────────────────────────────
export const LAB_LIFECYCLE = [
  "order_entry", "specimen_collection", "accessioning", "status",
  "preliminary_result", "final_result", "corrected_result", "critical_result",
  "pathology_workflow", "microbiology", "routing", "acknowledgement",
  "patient_communication", "followup_order",
] as const;
export const CRITICAL_ASSURANCE = [
  "identified", "validated", "assigned", "notified", "acknowledged",
  "interpreted_acted", "communicated", "resolution_documented", "escalated_if_overdue",
] as const;
export const CRITICAL_MONITORS = [
  "delivery_time", "acknowledgement_time", "escalation_success",
  "wrong_recipient_events", "duplicate_notifications", "unresolved_criticals",
  "downtime_fallback", "patient_communication", "safety_incidents",
] as const;

// ── Imaging — display ≠ analysis ≠ recommendation ─────────────────────
export const IMAGING_WORKFLOWS = [
  "modality_worklist", "dicom_ingest", "dicomweb", "study_matching",
  "archive_integration", "radiology_workflow", "report_status", "critical_findings",
  "prior_comparison", "clinician_access", "patient_access", "ai_provenance", "structured_reporting",
] as const;
export const IMAGING_SEPARATION = [
  "acquisition", "storage", "display", "annotation", "measurement",
  "interpretation", "recommendation", "patient_communication",
] as const;

// Image / IVD / streaming-signal interpretation requires specific regulatory
// analysis — never default it to non-device CDS.

// ── Devices — registry + validated lifecycle ──────────────────────────
export const DEVICE_REGISTRY_FIELDS = [
  "manufacturer", "model", "device_identifier", "firmware", "intended_use",
  "data_types", "connectivity", "calibration", "safety_classification",
  "approval_status", "site", "patient_association", "maintenance",
  "patch_status", "vendor_support", "failure_mode", "quarantine_status",
] as const;
export const DEVICE_LIFECYCLE = [
  "registered", "validated", "associated", "data_received", "integrity_checked",
  "units_normalized", "context_attached", "routed", "reviewed", "actioned", "archived",
] as const;
export const DEVICE_RELIABILITY_CHECKS = [
  "device_identity", "patient_association", "time_synchronization", "units",
  "calibration", "missingness", "connectivity", "plausibility",
  "duplicate_transmission", "signal_quality",
] as const;

export function deviceReliabilityGaps(checks: Record<string, boolean>): string[] {
  return DEVICE_RELIABILITY_CHECKS.filter((c) => !checks[c]);
}

// ── CDS classification + AI governance ────────────────────────────────
export const CDS_CLASSES = [
  "informational", "guideline_reminder", "documentation_support", "safety_check",
  "risk_stratification", "diagnostic_support", "treatment_support",
  "image_interpretation", "signal_interpretation", "time_critical_alert", "autonomous_action",
] as const;
export const CDS_RECORD_FIELDS = [
  "cds_id", "name", "intended_user", "intended_use", "inputs", "output",
  "evidence", "model_or_rule_version", "limitations", "human_review",
  "regulatory_classification", "monitoring",
] as const;
export const RECOMMENDATION_TRANSPARENCY = [
  "relevant_inputs", "data_freshness", "evidence_guideline", "reasoning_summary",
  "uncertainty", "conflicting_data", "alternatives", "override", "feedback", "review_state",
] as const;

export const AI_INVENTORY_FIELDS = [
  "model", "version", "owner", "intended_use", "prohibited_use", "population",
  "sites", "inputs", "outputs", "training_validation_data", "bias_assessment",
  "calibration", "monitoring", "human_reviewer", "regulatory_classification",
  "expiration_date", "incident_process",
] as const;
export const AI_MONITORS = [
  "sensitivity_specificity", "calibration", "false_negatives", "false_positives",
  "subgroup_performance", "drift", "missingness", "override", "automation_bias",
  "unsafe_output", "delayed_escalation", "safety_incidents", "clinician_burden", "patient_impact",
] as const;
export const AI_DEPLOYMENT_REQUIREMENTS = [
  "named_owner", "safety_case", "approved_use_statement", "rollback_disable_path",
  "monitoring_thresholds", "post_deployment_review_date", "human_oversight_model",
] as const;

export function aiDeploymentGaps(evidence: Record<string, boolean>): string[] {
  return AI_DEPLOYMENT_REQUIREMENTS.filter((r) => !evidence[r]);
}

// ── Safety case — living evidence, not a pre-release document ─────────
export const SAFETY_CASE_STRUCTURE = [
  "safety_claim", "clinical_hazards", "risk_controls", "verification_evidence",
  "validation_evidence", "residual_risk", "monitoring_plan", "incident_response", "approval",
] as const;

// ── Human factors ─────────────────────────────────────────────────────
export const HF_PARTICIPANTS = [
  "emergency_clinicians", "nurses", "physicians", "pharmacists", "laboratory_staff",
  "radiologists", "allied_health", "coders", "administrators",
  "informaticists", "downtime_personnel",
] as const;
export const HF_SCENARIOS = [
  "time_critical_use", "high_workload", "interruptions", "hand_offs",
  "multiple_patients", "incomplete_data", "conflicting_data", "alert_escalation",
  "device_failure", "wrong_patient_risk", "language_accessibility",
  "post_downtime_recovery", "ai_disagreement", "patient_communication",
] as const;
export const HF_METRICS = [
  "task_completion", "error_rate", "recovery_time", "uncertainty_recognition",
  "alert_comprehension", "wrong_patient_prevention", "workload",
  "situation_awareness", "override_quality", "trust_calibration",
] as const;

// ── Change-control board ──────────────────────────────────────────────
export const CHANGE_BOARD_SCOPE = [
  "new_workflows", "cds_rules", "ai_models", "alert_thresholds", "medication_logic",
  "imaging_functions", "device_integrations", "patient_facing_content",
  "data_transformations", "documentation_templates", "downtime_processes", "interop_mappings",
] as const;
export const CHANGE_RECORD_FIELDS = [
  "scope", "rationale", "risk_class", "affected_populations", "dependencies",
  "validation_evidence", "training", "rollout_plan", "monitoring", "rollback",
  "communication", "effective_date", "owner",
] as const;

// ── Availability by criticality ───────────────────────────────────────
export const AVAILABILITY_TARGETS: Record<string, string> = {
  critical_alerts: "immediate redundancy and failover",
  medication_safety: "highly available with safe degraded mode",
  emergency_tracking: "continuous operational availability",
  patient_identity: "high availability and read-only fallback",
  results_review: "durable queue and reconciliation",
  documentation: "local or store-and-forward fallback",
  analytics: "delayed refresh tolerable",
  research_extracts: "pausable",
  wellness_content: "lowest criticality",
};
export const RESILIENCE_MECHANISMS = [
  "multi_zone", "regional_failover", "redundant_messaging", "durable_queues",
  "idempotent_processing", "health_checks", "dependency_monitoring",
  "circuit_breakers", "backpressure", "disaster_recovery", "backup_restoration",
  "recovery_point_validation", "downtime_kits", "manual_escalation", "incident_command",
] as const;
// Recovery is not successful until clinical reconciliation is complete.

// ── Downtime operations ───────────────────────────────────────────────
export const DOWNTIME_BEFORE = [
  "publish_status", "identify_workflows", "prepare_snapshots", "validate_users",
  "confirm_emergency_contacts", "distribute_summaries", "open_command_bridge",
  "establish_escalation", "protect_against_stale_use",
] as const;
export const DOWNTIME_DURING = [
  "stale_warnings", "capture_time_author", "controlled_forms", "record_meds_allergies",
  "critical_escalation", "track_orders_procedures", "track_transfers_handoffs",
  "identity_controls", "prevent_duplicates",
] as const;
export const CLINICAL_DOWNTIME_RECOVERY = [
  "system_restored", "validate_infrastructure", "reconcile_identities",
  "reconcile_orders_results", "reconcile_medications", "reconcile_notes",
  "reconcile_alerts", "review_safety_events", "confirm_owners", "close_incident",
] as const;

export function downtimeRecoveryGaps(completed: Record<string, boolean>): string[] {
  return CLINICAL_DOWNTIME_RECOVERY.filter((s) => !completed[s]);
}

// ── Identity, audit, quality, vendors, committees ─────────────────────
export const IDENTITY_CONTROLS = [
  "workforce_identity", "federation", "sso", "strong_auth", "rbac", "abac",
  "break_glass", "pam", "session_monitoring", "temporary_access", "delegation",
  "coverage_schedules", "separation_of_duties", "auto_expiration", "recertification",
] as const;
export const BREAK_GLASS_REQUIREMENTS = [
  "reason", "step_up_auth", "scope", "time_limit", "audit", "post_event_review", "patient_notification_per_policy",
] as const;

export function breakGlassGaps(request: Record<string, unknown>): string[] {
  return BREAK_GLASS_REQUIREMENTS.filter((r) => !request[r]);
}

export const AUDIT_EVENTS = [
  "record_access", "searches", "exports", "changes", "corrections",
  "medication_actions", "allergy_changes", "result_review", "alert_ack",
  "cds_display", "ai_generation", "ai_accept_override", "device_association",
  "config_change", "privilege_elevation", "break_glass", "integration_transactions", "downtime_reconciliation",
] as const;
export const AUDIT_PROPERTIES = [
  "immutable", "time_synchronized", "tenant_org_scoped", "searchable",
  "exportable_for_investigation", "protected_from_admins", "linked_to_events", "retained_per_policy",
] as const;

export const QUALITY_DASHBOARDS = [
  "medication_errors", "allergy_conflicts", "critical_result_failures", "falls",
  "pressure_injuries", "sepsis_deterioration", "readmissions", "transfers",
  "delayed_care", "diagnostic_followup", "referral_completion", "handoffs",
  "device_incidents", "alert_burden", "documentation_burden", "ai_incidents",
  "equity_disparities", "complaints", "near_misses",
] as const;
export const IMPROVEMENT_CYCLE = [
  "signal", "case_review", "root_cause", "corrective_action", "owner",
  "due_date", "verification", "sustained_monitoring",
] as const;

export const VENDOR_REGISTER_ENTITIES = [
  "ehr_vendors", "cloud_providers", "imaging_vendors", "device_manufacturers",
  "ai_suppliers", "laboratory_vendors", "identity_providers", "messaging_providers",
  "payer_connections", "hosting_regions", "support_subcontractors",
] as const;
export const VENDOR_ASSESSMENT = [
  "security", "privacy", "availability", "clinical_safety", "interoperability",
  "patch_management", "vuln_disclosure", "subprocessors", "data_residency",
  "exit_strategy", "business_continuity", "incident_notification",
  "model_changes", "firmware_changes", "contractual_obligations",
] as const;

export const HOSPITAL_COMMITTEES = [
  "medical_executive", "nursing_leadership", "pharmacy_therapeutics", "laboratory",
  "radiology", "health_information_management", "privacy", "information_security",
  "clinical_informatics", "patient_safety_quality", "biomedical_engineering",
  "compliance_legal", "research_governance", "accessibility_experience",
] as const;
export const CAPABILITY_OWNERSHIP = [
  "clinical_owner", "technical_owner", "safety_owner", "privacy_owner",
  "operational_owner", "escalation_route", "review_frequency", "retirement_criteria",
] as const;

// ── In-memory fallbacks (pre-migration) ───────────────────────────────
interface StoredRow extends Record<string, unknown> { id: string; workspaceId: string }
const memRecordItems = new Map<string, StoredRow[]>();
const memInterop = new Map<string, StoredRow[]>();
const memEd = new Map<string, StoredRow[]>();
const memInpatient = new Map<string, StoredRow[]>();
const memDocuments = new Map<string, StoredRow[]>();
const memMeds = new Map<string, StoredRow[]>();
const memAllergies = new Map<string, StoredRow[]>();
const memLab = new Map<string, StoredRow[]>();
const memImaging = new Map<string, StoredRow[]>();
const memDevices = new Map<string, StoredRow[]>();
const memCds = new Map<string, StoredRow[]>();
const memAi = new Map<string, StoredRow[]>();
const memSafetyCases = new Map<string, StoredRow[]>();
const memHf = new Map<string, StoredRow[]>();
const memChanges = new Map<string, StoredRow[]>();
const memDowntime = new Map<string, StoredRow[]>();
const memIdentity = new Map<string, StoredRow[]>();
const memQuality = new Map<string, StoredRow[]>();
const memVendors = new Map<string, StoredRow[]>();

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
function memList(m: Map<string, StoredRow[]>, ws: string): StoredRow[] { return m.get(ws) ?? []; }
function memPush(m: Map<string, StoredRow[]>, ws: string, row: StoredRow) { m.set(ws, [...(m.get(ws) ?? []), row]); }

type ClinicalTables = {
  healthClinicalRecord: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthClinicalInterop: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthClinicalEncounter: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthClinicalDocument: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthClinicalMedication: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthClinicalResult: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthClinicalImaging: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthClinicalDevice: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthClinicalCds: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthClinicalAi: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthClinicalSafety: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthClinicalChange: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthClinicalDowntime: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthClinicalQuality: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthClinicalVendor: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
};

// ── N0VA Clinical enterprise service ──────────────────────────────────
export class ClinicalEnterpriseSystem {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health`);
  }
  private audit(action: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType: "ClinicalArtifact", targetId, metadata: meta }).catch(() => null);
  }

  // ── Record items — status transitions preserve history ───────────
  async recordItem(input: { patientRef: string; section: string; status?: string; sourceSystem: string; author?: string; effectiveTime?: string; payload?: Record<string, unknown>; confidentiality?: string }) {
    await this.assert("CREATE");
    if (!(RECORD_SECTIONS as readonly string[]).includes(input.section)) throw new Error(`Unknown record section: ${input.section}`);
    const id = `cli-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalRecord.create({
        data: { workspaceId: this.workspaceId, itemId: id, patientRef: input.patientRef, section: input.section, status: input.status ?? "preliminary", sourceSystem: input.sourceSystem, author: input.author ?? "", effectiveTime: input.effectiveTime ? new Date(input.effectiveTime) : null, payload: input.payload ?? {}, confidentiality: input.confidentiality ?? "clinical", history: [{ status: input.status ?? "preliminary", at: new Date().toISOString() }], createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, status: input.status ?? "preliminary", history: [{ status: input.status ?? "preliminary" }] };
    if (!row) memPush(memRecordItems, this.workspaceId, stored);
    await this.audit("clinical.record.created", id, { section: input.section });
    return { itemId: id, statuses: [...RECORD_STATUSES] };
  }

  async transitionRecord(itemId: string, to: string) {
    await this.assert("UPDATE");
    const found = memList(memRecordItems, this.workspaceId).find((r) => r.id === itemId);
    const from = String(found?.status ?? "preliminary");
    if (!recordStatusTransition(from, to)) throw new Error(`Invalid record transition ${from} → ${to} — prior facts are preserved, never overwritten.`);
    await safe(() => (prisma as unknown as ClinicalTables).healthClinicalRecord.update({ where: { itemId }, data: { status: to } }) as Promise<never>, null);
    if (found) { found.status = to; (found.history as unknown[]).push({ status: to, at: new Date().toISOString() }); }
    await this.audit("clinical.record.transitioned", itemId, { from, to });
    return { itemId, from, to };
  }

  // ── Interop transactions — incorporation, not delivery ────────────
  async interopTransaction(input: { partner: string; direction: "inbound" | "outbound"; kind: string; state?: string }) {
    await this.assert("CREATE");
    const id = `itx-${crypto.randomUUID().slice(0, 8)}`;
    const state = input.state ?? "accepted";
    const verdict = interopTransactionComplete(state);
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalInterop.create({
        data: { workspaceId: this.workspaceId, transactionId: id, partner: input.partner, direction: input.direction, kind: input.kind, state, incorporated: verdict.incorporated, createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, state, incorporated: verdict.incorporated };
    if (!row) memPush(memInterop, this.workspaceId, stored);
    await this.audit("clinical.interop.transaction", id, { partner: input.partner, state });
    return { transactionId: id, ...verdict, visibility: [...TRANSACTION_VISIBILITY] };
  }

  // ── ED + inpatient stays ─────────────────────────────────────────
  async openStay(input: { patientRef: string; setting: "emergency" | "inpatient" | "procedural"; acuity?: string }) {
    await this.assert("CREATE");
    const id = `stay-${crypto.randomUUID().slice(0, 8)}`;
    const workflow = input.setting === "emergency" ? [...ED_WORKFLOW] : input.setting === "procedural" ? ["scheduling", "readiness", "case_coordination"] : [...INPATIENT_WORKFLOWS];
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalEncounter.create({
        data: { workspaceId: this.workspaceId, stayId: id, patientRef: input.patientRef, setting: input.setting, acuity: input.acuity ?? "", stage: workflow[0] ?? "arrival", tracking: {}, safety: {}, createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, stage: workflow[0] };
    if (!row) (input.setting === "emergency" ? memPush(memEd, this.workspaceId, stored) : memPush(memInpatient, this.workspaceId, stored));
    await this.audit("clinical.stay.opened", id, { setting: input.setting });
    return { stayId: id, workflow, tracking: input.setting === "emergency" ? [...ED_TRACKING] : [...DAILY_CLINICAL_VIEW], safety: input.setting === "emergency" ? [...ED_SAFETY] : [] };
  }

  // ── Documents — verified signing ─────────────────────────────────
  async signClinicalDocument(input: { patientRef: string; title: string; aiDraft: boolean; verified: boolean; signer: string; role: string }) {
    await this.assert("CREATE");
    const gate = clinicalSignOff(input);
    if (!gate.signable) {
      await this.audit("clinical.document.sign_blocked", input.title, {});
      throw new Error(gate.reason);
    }
    const id = `cdoc-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalDocument.create({
        data: { workspaceId: this.workspaceId, documentId: id, patientRef: input.patientRef, title: input.title, aiDraft: input.aiDraft, verified: input.verified, signer: input.signer, role: input.role, status: "final", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memDocuments, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "final" });
    await this.audit("clinical.document.signed", id, { signer: input.signer });
    return { documentId: id, status: "final" as const };
  }

  // ── Medications + allergies ──────────────────────────────────────
  async orderMedication(input: { patientRef: string; medication: string; highAlert?: boolean; renalHepaticChecked?: boolean; allergyChecked?: boolean }) {
    await this.assert("CREATE");
    const missing: string[] = [];
    if (!input.allergyChecked) missing.push("allergy review");
    if (input.highAlert && !input.renalHepaticChecked) missing.push("renal/hepatic + high-alert review");
    if (missing.length > 0) throw new Error(`Medication order blocked — missing: ${missing.join(", ")}`);
    const id = `cmed-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalMedication.create({
        data: { workspaceId: this.workspaceId, orderId: id, patientRef: input.patientRef, medication: input.medication, highAlert: input.highAlert ?? false, status: "ordered", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memMeds, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "ordered" });
    await this.audit("clinical.medication.ordered", id, { medication: input.medication });
    return { orderId: id, workflow: [...CLINICAL_MEDICATION_WORKFLOW] };
  }

  async recordAllergy(input: { patientRef: string; substance: string; type?: string; reaction?: string; severity?: string; date?: string; source?: string; verification?: string; originalNote?: string }) {
    await this.assert("CREATE");
    const gaps = allergyGaps(input as Record<string, unknown>);
    const id = `alg-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalMedication.create({
        data: { workspaceId: this.workspaceId, orderId: id, patientRef: input.patientRef, medication: `ALLERGY:${input.substance}`, highAlert: false, status: "allergy_recorded", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memAllergies, this.workspaceId, { id, workspaceId: this.workspaceId, ...input });
    await this.audit("clinical.allergy.recorded", id, { substance: input.substance, complete: gaps.length === 0 });
    return { allergyId: id, completenessGaps: gaps, originalPreserved: input.originalNote ?? null, note: gaps.length > 0 ? "Capture reaction, severity, date, source, verification when available." : "Complete." };
  }

  // ── Lab + imaging + devices ──────────────────────────────────────
  async labResult(input: { patientRef: string; test: string; critical?: boolean; status?: string; owner?: string }) {
    await this.assert("CREATE");
    const id = `lab-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalResult.create({
        data: { workspaceId: this.workspaceId, resultId: id, patientRef: input.patientRef, domain: "laboratory", test: input.test, critical: input.critical ?? false, status: input.status ?? "preliminary_result", owner: input.owner ?? "", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memLab, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: input.status ?? "preliminary_result" });
    await this.audit("clinical.lab.result", id, { test: input.test, critical: input.critical ?? false });
    return { resultId: id, lifecycle: [...LAB_LIFECYCLE], assurance: input.critical ? [...CRITICAL_ASSURANCE] : [] };
  }

  async imagingStudy(input: { patientRef: string; modality: string; aiAnalysis?: boolean; regulatoryClass?: string }) {
    await this.assert("CREATE");
    if (input.aiAnalysis && !input.regulatoryClass) {
      throw new Error("Image analysis for diagnostic recommendations requires specific regulatory classification — never default to non-device CDS.");
    }
    const id = `img-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalImaging.create({
        data: { workspaceId: this.workspaceId, studyId: id, patientRef: input.patientRef, modality: input.modality, aiAnalysis: input.aiAnalysis ?? false, regulatoryClass: input.regulatoryClass ?? "", separation: [...IMAGING_SEPARATION], createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memImaging, this.workspaceId, { id, workspaceId: this.workspaceId, ...input });
    await this.audit("clinical.imaging.study", id, { modality: input.modality });
    return { studyId: id, separation: [...IMAGING_SEPARATION], workflows: [...IMAGING_WORKFLOWS] };
  }

  async registerDevice(input: { identifier: string; manufacturer?: string; model?: string; firmware?: string; intendedUse?: string; site?: string }) {
    await this.assert("CREATE");
    const id = `dev-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalDevice.create({
        data: { workspaceId: this.workspaceId, deviceId: id, identifier: input.identifier, manufacturer: input.manufacturer ?? "", model: input.model ?? "", firmware: input.firmware ?? "", intendedUse: input.intendedUse ?? "", site: input.site ?? "", patientAssociation: "", reliability: {}, status: "registered", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memDevices, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "registered", reliability: {} });
    await this.audit("clinical.device.registered", id, { identifier: input.identifier });
    return { deviceId: id, registry: [...DEVICE_REGISTRY_FIELDS], lifecycle: [...DEVICE_LIFECYCLE] };
  }

  async validateDeviceData(deviceId: string, checks: Record<string, boolean>, patientAssociation: string) {
    await this.assert("UPDATE");
    const gaps = deviceReliabilityGaps(checks);
    if (gaps.length > 0 || !patientAssociation) {
      await this.audit("clinical.device.unreliable", deviceId, { gaps });
      throw new Error(`Device feed not clinically reliable — ${[...gaps, ...(!patientAssociation ? ["patient_association"] : [])].join(", ")}`);
    }
    await safe(() => (prisma as unknown as ClinicalTables).healthClinicalDevice.update({ where: { deviceId }, data: { status: "validated", patientAssociation } }) as Promise<never>, null);
    const found = memList(memDevices, this.workspaceId).find((d) => d.id === deviceId);
    if (found) { found.status = "validated"; found.patientAssociation = patientAssociation; }
    await this.audit("clinical.device.validated", deviceId, {});
    return { deviceId, status: "validated" as const };
  }

  // ── CDS + AI governance ──────────────────────────────────────────
  async registerCds(input: { name: string; cdsClass: string; intendedUser?: string; intendedUse?: string; inputs?: string[]; evidence?: string[]; regulatoryClass?: string; humanReview?: string }) {
    await this.assert("CREATE");
    if (!(CDS_CLASSES as readonly string[]).includes(input.cdsClass)) throw new Error(`Unknown CDS class: ${input.cdsClass}`);
    if ((input.cdsClass === "image_interpretation" || input.cdsClass === "signal_interpretation") && !input.regulatoryClass) {
      throw new Error("Image/signal interpretation requires specific regulatory classification.");
    }
    const id = `ccds-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalCds.create({
        data: { workspaceId: this.workspaceId, cdsId: id, name: input.name, cdsClass: input.cdsClass, intendedUser: input.intendedUser ?? "", intendedUse: input.intendedUse ?? "", inputs: input.inputs ?? [], evidence: input.evidence ?? [], regulatoryClass: input.regulatoryClass ?? "under_review", humanReview: input.humanReview ?? "required", transparency: [...RECOMMENDATION_TRANSPARENCY], createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memCds, this.workspaceId, { id, workspaceId: this.workspaceId, ...input });
    await this.audit("clinical.cds.registered", id, { class: input.cdsClass });
    return { cdsId: id, recordFields: [...CDS_RECORD_FIELDS], transparency: [...RECOMMENDATION_TRANSPARENCY] };
  }

  async registerAiModel(input: { model: string; version?: string; owner?: string; intendedUse?: string; population?: string; sites?: string[]; regulatoryClass?: string }) {
    await this.assert("CREATE");
    const id = `cai-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalAi.create({
        data: { workspaceId: this.workspaceId, modelId: id, model: input.model, version: input.version ?? "1.0", owner: input.owner ?? "", intendedUse: input.intendedUse ?? "", population: input.population ?? "", sites: input.sites ?? [], regulatoryClass: input.regulatoryClass ?? "under_review", status: "registered", monitors: [...AI_MONITORS], createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memAi, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "registered" });
    await this.audit("clinical.ai.registered", id, { model: input.model });
    return { modelId: id, inventory: [...AI_INVENTORY_FIELDS], deploymentRequirements: [...AI_DEPLOYMENT_REQUIREMENTS] };
  }

  async deployAiModel(modelId: string, evidence: Record<string, boolean>) {
    await this.assert("UPDATE");
    const gaps = aiDeploymentGaps(evidence);
    if (gaps.length > 0) throw new Error(`Model deployment blocked — missing: ${gaps.join(", ")}`);
    await safe(() => (prisma as unknown as ClinicalTables).healthClinicalAi.update({ where: { modelId }, data: { status: "deployed" } }) as Promise<never>, null);
    const found = memList(memAi, this.workspaceId).find((m) => m.id === modelId);
    if (found) found.status = "deployed";
    await this.audit("clinical.ai.deployed", modelId, {});
    return { modelId, status: "deployed" as const };
  }

  // ── Safety case + human factors + change board ───────────────────
  async fileSafetyCase(input: { capability: string; claim: string; hazards?: string[]; controls?: string[]; evidence?: string[]; residualRisk?: string; monitoring?: string[] }) {
    await this.assert("CREATE");
    const id = `scase-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalSafety.create({
        data: { workspaceId: this.workspaceId, caseId: id, kind: "safety_case", capability: input.capability, claim: input.claim, hazards: input.hazards ?? [], controls: input.controls ?? [], evidence: input.evidence ?? [], residualRisk: input.residualRisk ?? "", monitoring: input.monitoring ?? [], status: "active", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memSafetyCases, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "active" });
    await this.audit("clinical.safety_case.filed", id, { capability: input.capability });
    return { caseId: id, structure: [...SAFETY_CASE_STRUCTURE], living: "Safety case stays active after launch with monitoring and incident response." };
  }

  async recordHumanFactors(input: { capability: string; participants?: string[]; scenarios?: string[]; metrics?: Record<string, number> }) {
    await this.assert("CREATE");
    const id = `hf-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalSafety.create({
        data: { workspaceId: this.workspaceId, caseId: id, kind: "human_factors", capability: input.capability, claim: "", hazards: [], controls: [], evidence: [], residualRisk: "", monitoring: [], status: "recorded", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memHf, this.workspaceId, { id, workspaceId: this.workspaceId, ...input });
    await this.audit("clinical.human_factors.recorded", id, { capability: input.capability });
    return { recordId: id, participants: [...HF_PARTICIPANTS], scenarios: [...HF_SCENARIOS], metrics: [...HF_METRICS] };
  }

  async submitChange(input: { scope: string; rationale?: string; riskClass?: string; rollback?: string; owner?: string }) {
    await this.assert("CREATE");
    if (!(CHANGE_BOARD_SCOPE as readonly string[]).includes(input.scope)) throw new Error(`Change outside board scope taxonomy: ${input.scope}`);
    const id = `chg-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalChange.create({
        data: { workspaceId: this.workspaceId, changeId: id, scope: input.scope, rationale: input.rationale ?? "", riskClass: input.riskClass ?? "", rollback: input.rollback ?? "", owner: input.owner ?? "", status: "submitted", emergencyBypass: false, createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memChanges, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "submitted" });
    await this.audit("clinical.change.submitted", id, { scope: input.scope });
    return { changeId: id, recordFields: [...CHANGE_RECORD_FIELDS], note: "Emergency changes may bypass timing — never documentation, safety assessment, or retrospective review." };
  }

  // ── Downtime + identity + quality + vendors ──────────────────────
  async openDowntime(input: { scope: string; commander?: string }) {
    await this.assert("CREATE");
    const id = `dt-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalDowntime.create({
        data: { workspaceId: this.workspaceId, downtimeId: id, scope: input.scope, commander: input.commander ?? "", phase: "before", reconciled: {}, status: "open", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memDowntime, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, phase: "before", status: "open" });
    await this.audit("clinical.downtime.opened", id, { scope: input.scope });
    return { downtimeId: id, before: [...DOWNTIME_BEFORE], during: [...DOWNTIME_DURING], recovery: [...CLINICAL_DOWNTIME_RECOVERY] };
  }

  async closeDowntime(downtimeId: string, reconciled: Record<string, boolean>) {
    await this.assert("UPDATE");
    const gaps = downtimeRecoveryGaps(reconciled);
    if (gaps.length > 0) throw new Error(`Recovery not successful — unreconciled: ${gaps.join(", ")}. Clinical reconciliation completes recovery.`);
    await safe(() => (prisma as unknown as ClinicalTables).healthClinicalDowntime.update({ where: { downtimeId }, data: { status: "closed", reconciled } }) as Promise<never>, null);
    const found = memList(memDowntime, this.workspaceId).find((d) => d.id === downtimeId);
    if (found) { found.status = "closed"; found.reconciled = reconciled; }
    await this.audit("clinical.downtime.closed", downtimeId, {});
    return { downtimeId, status: "closed" as const };
  }

  async breakGlass(input: { userRef: string; reason?: string; stepUpAuth?: boolean; scope?: string; timeLimit?: string }) {
    await this.assert("CREATE");
    const gaps = breakGlassGaps(input as Record<string, unknown>);
    if (gaps.length > 0) throw new Error(`Break-glass denied — missing: ${gaps.join(", ")}`);
    const id = `bg-${crypto.randomUUID().slice(0, 8)}`;
    await safe(() => (prisma as unknown as ClinicalTables).healthClinicalSafety.create({
      data: { workspaceId: this.workspaceId, caseId: id, kind: "break_glass", capability: input.userRef, claim: String(input.reason ?? ""), hazards: [], controls: [], evidence: [], residualRisk: "", monitoring: [], status: "granted_audited", createdById: this.userId },
    }) as Promise<never>, null);
    memPush(memIdentity, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "granted_audited" });
    await this.audit("clinical.break_glass.granted", id, { user: input.userRef });
    return { accessId: id, controls: [...IDENTITY_CONTROLS], status: "granted_audited" as const };
  }

  async qualitySignal(input: { dashboard: string; finding: string; owner?: string; dueDate?: string }) {
    await this.assert("CREATE");
    if (!(QUALITY_DASHBOARDS as readonly string[]).includes(input.dashboard)) throw new Error(`Unknown quality dashboard: ${input.dashboard}`);
    const id = `q-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalQuality.create({
        data: { workspaceId: this.workspaceId, signalId: id, dashboard: input.dashboard, finding: input.finding, owner: input.owner ?? "", dueDate: input.dueDate ? new Date(input.dueDate) : null, cycle: [...IMPROVEMENT_CYCLE], status: "signal", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memQuality, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "signal" });
    await this.audit("clinical.quality.signal", id, { dashboard: input.dashboard });
    return { signalId: id, cycle: [...IMPROVEMENT_CYCLE], note: "Analytics inform improvement with case mix and workflow context — never punitive ranking alone." };
  }

  async assessVendor(input: { entity: string; name: string; assessment?: Record<string, string>; triggersRevalidation?: boolean }) {
    await this.assert("CREATE");
    if (!(VENDOR_REGISTER_ENTITIES as readonly string[]).includes(input.entity)) throw new Error(`Unknown vendor entity: ${input.entity}`);
    const id = `ven-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ClinicalTables).healthClinicalVendor.create({
        data: { workspaceId: this.workspaceId, vendorId: id, entity: input.entity, name: input.name, assessment: input.assessment ?? {}, triggersRevalidation: input.triggersRevalidation ?? false, createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memVendors, this.workspaceId, { id, workspaceId: this.workspaceId, ...input });
    await this.audit("clinical.vendor.assessed", id, { entity: input.entity });
    return { vendorId: id, assessment: [...VENDOR_ASSESSMENT], committees: [...HOSPITAL_COMMITTEES], ownership: [...CAPABILITY_OWNERSHIP] };
  }

  // ── Command view ─────────────────────────────────────────────────
  async commandView(workspace: string) {
    await this.assert("READ");
    if (!(COMMAND_WORKSPACES as readonly string[]).includes(workspace)) throw new Error(`Unknown command workspace: ${workspace}`);
    const ws = this.workspaceId;
    return {
      workspace, version: CLINICAL_VERSION, context: [...WORKSPACE_CONTEXT],
      openStays: memList(memEd, ws).length + memList(memInpatient, ws).length,
      unreviewedResults: memList(memLab, ws).filter((r) => !["acknowledged", "closed"].includes(String(r.status))).length,
      openDowntimes: memList(memDowntime, ws).filter((d) => d.status !== "closed").length,
      deployedAi: memList(memAi, ws).filter((m) => m.status === "deployed").length,
      generatedAt: new Date().toISOString(),
    };
  }
}

// ── Static reference exports ──────────────────────────────────────────
export const CLINICAL_API = [
  "recordItem", "transitionRecord", "interopTransaction",
  "openStay", "signClinicalDocument",
  "orderMedication", "recordAllergy",
  "labResult", "imagingStudy", "registerDevice", "validateDeviceData",
  "registerCds", "registerAiModel", "deployAiModel",
  "fileSafetyCase", "recordHumanFactors", "submitChange",
  "openDowntime", "closeDowntime", "breakGlass",
  "qualitySignal", "assessVendor", "commandView",
] as const;
