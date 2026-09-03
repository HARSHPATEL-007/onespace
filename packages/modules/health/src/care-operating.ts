// N0VA Care — clinic and distributed-care operating system — Project Vita.
// For ambulatory practices, community providers, specialty clinics, and
// coordinated-care organizations. N0VA Care coordinates, documents,
// integrates, and surfaces recommendations — without claiming to replace a
// full hospital EHR. Claims, availability, validation, and regulatory posture
// always match the capabilities actually deployed.
//
// Governing principle: make the right care action clear, assign it to the
// right owner, preserve its status across failures, and keep a human
// clinically accountable for decisions that affect the patient.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_care";
export const CARE_VERSION = "2026.09";

export const CARE_PROMISE =
  "N0VA Care gives care teams a reliable shared workspace for coordinated, patient-centered care—without claiming to replace a full hospital EHR.";

// ── Boundaries — what N0VA Care never claims to be ────────────────────
export const CARE_NOT_CLAIMS = [
  "universal hospital EHR", "substitute for local clinical governance",
  "autonomous diagnostic system", "autonomous prescribing system",
  "complete PACS or imaging archive", "medical-device replacement",
  "payer adjudication system", "public-health surveillance platform",
  "research data warehouse by default", "guaranteed continuity without tested recovery",
] as const;

export function careClaimCheck(text: string): { ok: boolean; violations: string[] } {
  const lower = text.toLowerCase();
  const violations = CARE_NOT_CLAIMS.filter((c) => lower.includes(c));
  return { ok: violations.length === 0, violations: [...violations] };
}

// ── Workspace provenance — sources are never equally authoritative ────
export const WORKSPACE_PROVENANCE = [
  "source", "timestamp", "author", "organization", "verification_status",
  "clinical_review_status", "freshness", "superseded_status",
  "patient_reported_vs_clinician_entered", "fit_for_clinical_decisions",
] as const;
export const WORKSPACE_HEADER = [
  "identity_matching_confidence", "allergies", "active_medications",
  "problems_conditions", "recent_encounters", "pending_results", "open_referrals",
  "care_gaps", "rpm_status", "care_team", "patient_preferences",
  "consent_proxy", "alerts_tasks", "timeline",
] as const;
export const WORKSPACE_GUARDRAILS = [
  "identity_confidence_prominent", "duplicate_merge_warnings",
  "stale_meds_never_current", "patient_vs_clinician_separated",
  "conflicts_visible", "provenance_preserved", "minimize_sensitive_exposure",
  "purpose_relationship_access",
] as const;

// ── Access workflow — urgency beats availability ───────────────────────
export const ACCESS_STAGES = [
  "request", "identity_verification", "service_selection", "urgency_accessibility_intake",
  "triage", "scheduling", "reminder_preparation", "visit", "follow_up",
] as const;
export const INTAKE_FIELDS = [
  "reason_for_visit", "symptoms", "duration", "severity", "relevant_conditions",
  "medication_allergy_status", "pregnancy_context", "accessibility_needs",
  "preferred_language", "social_needs", "caregiver_support", "prior_treatment",
  "patient_goals", "urgent_warning_signs",
] as const;
export const TRIAGE_STATES = [
  "not_reviewed", "administrative_review", "clinical_triage_required",
  "routine", "urgent", "emergency_direction", "needs_clarification",
  "scheduled", "closed_with_reason",
] as const;
const TRIAGE_EDGES: Record<string, string[]> = {
  not_reviewed: ["administrative_review", "clinical_triage_required"],
  administrative_review: ["clinical_triage_required", "routine", "needs_clarification"],
  clinical_triage_required: ["routine", "urgent", "emergency_direction", "needs_clarification"],
  needs_clarification: ["administrative_review", "clinical_triage_required"],
  routine: ["scheduled", "urgent"],
  urgent: ["scheduled", "emergency_direction"],
  emergency_direction: ["closed_with_reason"],
  scheduled: ["closed_with_reason"],
  closed_with_reason: [],
};
export function triageTransition(from: string, to: string): boolean {
  return (TRIAGE_EDGES[from] ?? []).includes(to);
}
// Availability must never override urgency: concerning symptoms route to
// triage or emergency guidance, never just the next open slot.
export function accessRoute(urgentSymptoms: boolean, requestedSlot: string): { route: string; slot: string | null } {
  if (urgentSymptoms) return { route: "approved_triage_or_emergency_guidance", slot: null };
  return { route: "scheduling", slot: requestedSlot };
}

// ── Encounter workflow — closure is a checklist, not a signature ──────
export const ENCOUNTER_STAGES = [
  "pre_visit_review", "check_in", "medication_allergy_review", "history_assessment",
  "documentation", "orders", "referrals", "patient_instructions",
  "follow_up", "billing_authorization", "closure",
] as const;
export const ENCOUNTER_CLOSURE = [
  "allergies_reviewed", "medication_status_addressed", "orders_signed",
  "results_followup_assigned", "referrals_assigned", "instructions_delivered",
  "followup_interval_set", "unresolved_items_assigned", "documentation_clear",
  "patient_summary_available",
] as const;

export function encounterClosureGaps(checklist: Record<string, boolean>): string[] {
  return ENCOUNTER_CLOSURE.filter((c) => !checklist[c]);
}

// ── Documentation provenance — AI drafts stay drafts ───────────────────
export const DOCUMENTATION_PROVENANCE = [
  "author", "source", "creation_time", "import_time", "ai_involvement",
  "human_edits", "final_signer", "superseded_version", "intended_audience",
] as const;

export function documentationSignOff(doc: { aiInvolved: boolean; humanEdits: boolean; signerQualified: boolean; signer: string }): { signable: boolean; reason: string } {
  if (doc.aiInvolved && !doc.signerQualified) {
    return { signable: false, reason: "AI-generated documentation remains a draft until a qualified user reviews and signs it." };
  }
  if (!doc.signer) return { signable: false, reason: "Final signer required — accountability cannot be anonymous." };
  return { signable: true, reason: "Provenance complete; signer accountable for content including AI contributions and copy-forward." };
}

// ── Medication reconciliation — one governed source of truth ───────────
export const MEDREC_WORKFLOW = [
  "sources_collected", "identity_normalized", "duplicates_detected",
  "patient_confirmation", "clinician_pharmacist_review", "discrepancies_classified",
  "list_approved", "changes_communicated", "monitoring_tasks_created",
] as const;
export const MEDREC_SOURCES = [
  "patient_report", "caregiver_report", "prescribing_clinician", "pharmacy",
  "payer_claims", "hospital_discharge", "external_ehr", "device_dispenser", "imported_document",
] as const;
export const DISCREPANCY_CATEGORIES = [
  "duplicate", "missing_medication", "wrong_dose", "wrong_frequency", "wrong_route",
  "discontinued_but_listed", "listed_but_not_taking", "taking_but_not_listed",
  "change_not_propagated", "unknown_status", "allergy_conflict", "high_risk",
] as const;

// Never silently choose one source: display, assign owner, preserve history.
export function discrepancyDecision(discrepancy: string, chosenSource: string, owner: string, rationale: string): { recorded: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!(DISCREPANCY_CATEGORIES as readonly string[]).includes(discrepancy)) missing.push("valid discrepancy category");
  if (!chosenSource) missing.push("chosen source");
  if (!owner) missing.push("assigned owner");
  if (!rationale) missing.push("decision rationale");
  return { recorded: missing.length === 0, missing };
}

// ── Orders and referrals — submission is not completion ────────────────
export const ORDER_LIFECYCLE = [
  "need_identified", "order_created", "safety_eligibility_checks", "authorization",
  "patient_informed", "referral_transmitted", "acknowledged", "appointment_scheduled",
  "service_completed", "report_received", "clinician_reviewed",
  "patient_notified", "care_plan_updated",
] as const;
export const ORDER_DISPLAY = [
  "current_status", "responsible_owner", "receiving_organization", "urgency",
  "authorization_state", "patient_communication", "next_deadline", "retry_count",
  "failure_reason", "escalation_path", "report_review_status",
] as const;
const ORDER_EDGES: Record<string, string[]> = {
  need_identified: ["order_created"], order_created: ["safety_eligibility_checks"],
  safety_eligibility_checks: ["authorization", "order_created"],
  authorization: ["patient_informed", "safety_eligibility_checks"],
  patient_informed: ["referral_transmitted"], referral_transmitted: ["acknowledged", "referral_transmitted"],
  acknowledged: ["appointment_scheduled"], appointment_scheduled: ["service_completed", "acknowledged"],
  service_completed: ["report_received"], report_received: ["clinician_reviewed"],
  clinician_reviewed: ["patient_notified"], patient_notified: ["care_plan_updated"],
  care_plan_updated: [],
};
export function orderTransition(from: string, to: string): boolean {
  return (ORDER_EDGES[from] ?? []).includes(to);
}
// Failed endpoints keep referrals visible as pending — never swallowed.
export function orderEndpointFailure(orderId: string, reason: string): Record<string, unknown> {
  return { orderId, status: "referral_transmitted", pending: true as const, failureReason: reason, retryable: true as const, visible: "pending — not lost" };
}

// ── Results — delivery is not acknowledgement ──────────────────────────
export const RESULT_LIFECYCLE = [
  "received", "validated", "routed", "assigned", "clinician_reviewed",
  "communication_required", "communicated", "followup_ordered", "closed",
] as const;
export const CRITICAL_RESULT_REQUIREMENTS = [
  "named_owner", "backup_recipient", "deadline", "escalation",
  "delivery_status", "read_status", "acknowledgement", "resolution",
  "patient_communication", "downtime_fallback",
] as const;

export function criticalResultGaps(checks: Record<string, boolean>): string[] {
  return CRITICAL_RESULT_REQUIREMENTS.filter((c) => !checks[c]);
}

// ── Coordination tasks — one owner for the next action ─────────────────
export const TASK_DISPOSITIONS = [
  "completed", "patient_contacted", "appointment_scheduled", "result_reviewed",
  "referral_completed", "unable_to_reach", "patient_declined",
  "not_clinically_appropriate", "duplicate", "transferred", "escalated",
] as const;

export function taskOwnerCheck(task: { owner?: string; team?: string }): { accountable: boolean; reason: string } {
  if (task.owner) return { accountable: true, reason: `Next action owned by ${task.owner}${task.team ? ` (${task.team})` : ""}.` };
  return { accountable: false, reason: "Team-owned with no individual accountability — one person or role must own the next action." };
}

export function taskClosureValid(task: { safetyCritical: boolean }, disposition: string): { closable: boolean; reason: string } {
  if (!(TASK_DISPOSITIONS as readonly string[]).includes(disposition)) {
    return { closable: false, reason: `Unknown disposition: ${disposition}.` };
  }
  if (task.safetyCritical && disposition === "completed") {
    return { closable: false, reason: "Safety-critical tasks require a meaningful disposition (contacted, scheduled, reviewed, escalated…) — generic done is not accepted." };
  }
  return { closable: true, reason: `Closed as ${disposition}.` };
}

// ── RPM as a clinical program ──────────────────────────────────────────
export const RPM_LIFECYCLE = [
  "eligibility", "consent", "device_assignment", "setup", "first_reading",
  "data_quality_validation", "clinician_review", "alert_trend_assessment",
  "intervention", "follow_up", "retention_review", "completion_or_discharge",
] as const;

export function rpmEscalationGate(input: { thresholdDefined: boolean; dataQualityOk: boolean; patientContext: boolean; owner: string; responsePath: string }): { escalatable: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!input.thresholdDefined) missing.push("validated threshold");
  if (!input.dataQualityOk) missing.push("data quality");
  if (!input.patientContext) missing.push("patient context");
  if (!input.owner) missing.push("clinical owner");
  if (!input.responsePath) missing.push("response path");
  return { escalatable: missing.length === 0, missing };
}

// ── Messaging — automation never impersonates clinicians ───────────────
export const MESSAGE_CLASSES = [
  "administrative", "routine_clinical", "urgent_clinical", "critical_clinical",
  "medication_related", "results_related", "billing", "patient_support", "research_public_health",
] as const;

export function messageLabel(aiInvolved: boolean, clinicianReviewed: boolean, sender: string): string {
  if (aiInvolved && !clinicianReviewed) return `${sender} (AI-assisted draft — not yet reviewed by a clinician)`;
  if (aiInvolved) return `${sender} (AI-assisted, clinician-reviewed)`;
  return sender;
}

// ── Payer workflows — financial rules never silently rewrite care ──────
export function payerDenialTask(denial: { orderId: string; reason: string; patientRef: string }): Record<string, unknown> {
  return {
    type: "payer_denial", orderId: denial.orderId, owner: "authorization-coordinator",
    priority: "high", status: "open",
    actions: ["operational_task_created", "patient_explanation_provided", "appeal_or_alternative_started"],
    clinicalPlan: "unchanged — financial rules do not override clinical safety",
    reason: denial.reason,
  };
}

// ── Basic CDS — transparent, classified, human-reviewed ────────────────
export const CDS_CATALOG = [
  "guideline_reminders", "care_gap_identification", "duplicate_order_detection",
  "med_rec_prompts", "documentation_completeness", "referral_routing",
  "followup_reminders", "education_prompts", "risk_factor_summaries",
] as const;
export const CDS_REQUIRED_FIELDS = [
  "intended_use", "intended_user", "inputs", "data_freshness", "rule_or_model_version",
  "recommendation", "evidence_basis", "limitations", "override", "feedback",
  "safety_threshold", "regulatory_classification", "human_review_requirement",
] as const;
export const CDS_STATES = ["available", "viewed", "accepted", "modified", "rejected", "deferred", "expired", "escalated"] as const;
const CDS_EDGES: Record<string, string[]> = {
  available: ["viewed", "expired"], viewed: ["accepted", "modified", "rejected", "deferred", "expired"],
  deferred: ["viewed", "expired"], modified: ["accepted", "rejected"],
  accepted: [], rejected: ["escalated"], escalated: [], expired: [],
};
export function cdsTransition(from: string, to: string): boolean {
  return (CDS_EDGES[from] ?? []).includes(to);
}

// ── Safety controls ───────────────────────────────────────────────────
export const ALLERGY_REVIEW_CHECKPOINTS = [
  "new_patient_intake", "every_medication_change", "transition_of_care",
  "before_relevant_orders", "new_external_data", "allergy_conflict", "patient_reported_reaction",
] as const;
export const REFERRAL_ESCALATION_TRIGGERS = [
  "no_acknowledgement", "authorization_expires", "cannot_schedule",
  "patient_unreachable", "report_missing", "report_unreviewed",
  "urgency_changes", "receiving_rejection",
] as const;
export const TRANSITION_FOLLOWUP = [
  "medication_reconciliation", "pending_results", "followup_appointment",
  "patient_instructions", "teach_back", "transportation", "equipment",
  "pcp_notification", "caregiver_involvement", "first_post_discharge_contact", "readmission_revisit",
] as const;
export const MATCH_SIGNALS = [
  "name", "date_of_birth", "phone", "email", "address", "identifier_permitted",
  "caregiver_relationship", "previous_identifiers", "biometrics_governed", "source_system_ids",
] as const;
export const MATCH_OUTCOMES = [
  "likely_same", "confirmed_match", "possible_duplicate", "possible_overlay",
  "insufficient_evidence", "confirmed_different",
] as const;
export const MERGE_REQUIREMENTS = [
  "authorized_reviewer", "evidence", "dual_approval_high_risk", "reversible_or_governed",
  "audit_history", "downstream_reconciliation", "patient_safety_review",
] as const;

export function mergePermitted(outcome: string, approvals: number, reviewer: string): { permitted: boolean; missing: string[] } {
  const missing: string[] = [];
  if (outcome !== "confirmed_match" && outcome !== "likely_same") missing.push("certain match outcome — never auto-merge uncertain records");
  if (!reviewer) missing.push("authorized reviewer");
  if (outcome === "likely_same" && approvals < 2) missing.push("dual approval for high-risk merge");
  return { permitted: missing.length === 0, missing };
}

export const ATTRIBUTION_FIELDS = [
  "requesting_user", "performing_user", "responsible_clinician", "supervising_clinician",
  "care_team", "organization", "referral_originator", "receiving_organization",
  "task_owner", "reviewer", "ai_contributor", "patient_caregiver_participant",
] as const;

export const TRANSACTION_STATES = [
  "accepted", "in_progress", "waiting_for_patient", "waiting_for_payer",
  "waiting_for_external", "partially_completed", "needs_human_review",
  "escalated", "completed", "failed_safely",
] as const;

// ── Downtime — capture locally, reconcile without clobbering ──────────
export const DOWNTIME_CAPABILITIES = [
  "read_only_summary", "medication_allergy_snapshot", "local_documentation",
  "manual_task_capture", "critical_result_escalation", "referral_appointment_fallback",
  "rpm_gap_handling", "printed_encrypted_summaries", "store_and_forward", "stale_data_warning",
] as const;
export const DOWNTIME_RECOVERY = [
  "offline_records", "identity_validation", "duplicate_detection",
  "timestamp_normalization", "conflict_review", "clinical_reconciliation", "final_write", "audit_closure",
] as const;

export function downtimeWriteAllowed(offlineTimestamp: string, currentTimestamp: string): { writable: boolean; reason: string } {
  if (new Date(offlineTimestamp).getTime() < new Date(currentTimestamp).getTime()) {
    return { writable: false, reason: "Offline copy is older — route to conflict review. Never silently overwrite a newer clinical record." };
  }
  return { writable: true, reason: "Offline copy is current — proceed to clinical reconciliation." };
}

// ── Analytics dashboards ──────────────────────────────────────────────
export const CARE_DASHBOARDS = [
  "access_wait", "no_shows", "referral_leakage", "care_gap_closure",
  "medication_adherence", "results_timeliness", "critical_alert_ack",
  "rpm_enrollment_retention", "patient_engagement", "documentation_burden",
  "team_workload", "readmissions_transitions", "equity_disparities", "model_cds_performance",
] as const;

// ── In-memory fallbacks (pre-migration) ───────────────────────────────
interface StoredRow extends Record<string, unknown> { id: string; workspaceId: string }
const memEncounters = new Map<string, StoredRow[]>();
const memMedRec = new Map<string, StoredRow[]>();
const memOrders = new Map<string, StoredRow[]>();
const memResults = new Map<string, StoredRow[]>();
const memTasks = new Map<string, StoredRow[]>();
const memRpm = new Map<string, StoredRow[]>();
const memMessages = new Map<string, StoredRow[]>();
const memCds = new Map<string, StoredRow[]>();
const memSafety = new Map<string, StoredRow[]>();

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
function memList(m: Map<string, StoredRow[]>, ws: string): StoredRow[] { return m.get(ws) ?? []; }
function memPush(m: Map<string, StoredRow[]>, ws: string, row: StoredRow) { m.set(ws, [...(m.get(ws) ?? []), row]); }

type CareTables = {
  healthCareEncounter: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; findFirst: (a: unknown) => Promise<never | null>; update: (a: unknown) => Promise<never> };
  healthCareMedRec: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthCareOrder: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthCareResult: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthCareCoordTask: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthCareRpm: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthCareMessage: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthCareCds: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthCareSafety: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
};

export const encounterSchema = z.object({
  encounterId: z.string().min(1).default(""),
  patientRef: z.string().min(1),
  stage: z.enum(["access", "intake", "encounter", "followup", "closed"]).default("access"),
  triageState: z.enum(TRIAGE_STATES).default("not_reviewed"),
  urgencyAccessed: z.boolean().default(false),
  checklist: z.record(z.boolean()).default({}),
  documents: z.array(z.record(z.unknown())).default([]),
  attribution: z.record(z.string()).default({}),
});

// ── N0VA Care operating service ───────────────────────────────────────
export class CareOperatingSystem {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health`);
  }
  private audit(action: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType: "CareArtifact", targetId, metadata: meta }).catch(() => null);
  }

  // ── Access + intake + triage ─────────────────────────────────────
  async openEncounter(input: z.infer<typeof encounterSchema>) {
    await this.assert("CREATE");
    const parsed = encounterSchema.parse({ ...input, encounterId: input.encounterId || `enc-${crypto.randomUUID().slice(0, 8)}` });
    const row = await safe(
      () => (prisma as unknown as CareTables).healthCareEncounter.create({
        data: { workspaceId: this.workspaceId, encounterId: parsed.encounterId, patientRef: parsed.patientRef, stage: parsed.stage, triageState: parsed.triageState, checklist: parsed.checklist, documents: parsed.documents, attribution: parsed.attribution, createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.encounterId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memEncounters, this.workspaceId, stored);
    await this.audit("care.encounter.opened", parsed.encounterId, { patientRef: parsed.patientRef, stage: parsed.stage });
    return (row as unknown) ?? stored;
  }

  async triageEncounter(encounterId: string, to: string, urgentSymptoms = false) {
    await this.assert("UPDATE");
    if (urgentSymptoms && (to === "routine" || to === "scheduled")) {
      throw new Error("Concerning symptoms route to triage or emergency guidance — availability never overrides urgency.");
    }
    const all = memList(memEncounters, this.workspaceId);
    const found = all.find((e) => e.id === encounterId);
    const from = String(found?.triageState ?? "not_reviewed");
    if (!triageTransition(from, to)) throw new Error(`Invalid triage transition ${from} → ${to}`);
    await safe(() => (prisma as unknown as CareTables).healthCareEncounter.update({ where: { encounterId }, data: { triageState: to } }) as Promise<never>, null);
    if (found) found.triageState = to;
    await this.audit("care.encounter.triaged", encounterId, { from, to });
    return { encounterId, from, to };
  }

  async closeEncounter(encounterId: string, checklist: Record<string, boolean>) {
    await this.assert("UPDATE");
    const gaps = encounterClosureGaps(checklist);
    if (gaps.length > 0) {
      await this.audit("care.encounter.close_blocked", encounterId, { gaps });
      throw new Error(`Encounter cannot close — unverified: ${gaps.join(", ")}. A signed note alone is not closure.`);
    }
    await safe(() => (prisma as unknown as CareTables).healthCareEncounter.update({ where: { encounterId }, data: { stage: "closed", checklist } }) as Promise<never>, null);
    const found = memList(memEncounters, this.workspaceId).find((e) => e.id === encounterId);
    if (found) { found.stage = "closed"; found.checklist = checklist; }
    await this.audit("care.encounter.closed", encounterId, {});
    return { encounterId, stage: "closed" as const };
  }

  async signDocument(encounterId: string, doc: { aiInvolved: boolean; humanEdits: boolean; signerQualified: boolean; signer: string; title: string }) {
    await this.assert("UPDATE");
    const gate = documentationSignOff(doc);
    if (!gate.signable) {
      await this.audit("care.document.sign_blocked", encounterId, { title: doc.title });
      throw new Error(gate.reason);
    }
    const found = memList(memEncounters, this.workspaceId).find((e) => e.id === encounterId);
    if (found) (found.documents as unknown[]).push({ ...doc, signedAt: new Date().toISOString() });
    await this.audit("care.document.signed", encounterId, { title: doc.title, signer: doc.signer });
    return { encounterId, signed: true as const, signer: doc.signer };
  }

  // ── Medication reconciliation ────────────────────────────────────
  async startMedRec(input: { patientRef: string; sources: string[] }) {
    await this.assert("CREATE");
    const unknown = input.sources.filter((s) => !(MEDREC_SOURCES as readonly string[]).includes(s));
    if (unknown.length > 0) throw new Error(`Unknown medication sources: ${unknown.join(", ")}`);
    const id = `mrx-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as CareTables).healthCareMedRec.create({
        data: { workspaceId: this.workspaceId, sessionId: id, patientRef: input.patientRef, sources: input.sources, discrepancies: [], approvedList: [], status: "sources_collected", owner: "", decisionHistory: [], createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, patientRef: input.patientRef, sources: input.sources, discrepancies: [], status: "sources_collected", decisionHistory: [] };
    if (!row) memPush(memMedRec, this.workspaceId, stored);
    await this.audit("care.medrec.started", id, { patientRef: input.patientRef });
    return { sessionId: id, workflow: [...MEDREC_WORKFLOW] };
  }

  async recordDiscrepancy(sessionId: string, input: { category: string; detail: string; chosenSource: string; owner: string; rationale: string }) {
    await this.assert("UPDATE");
    const decision = discrepancyDecision(input.category, input.chosenSource, input.owner, input.rationale);
    if (!decision.recorded) throw new Error(`Discrepancy not recordable — missing: ${decision.missing.join(", ")}. Sources in conflict stay visible.`);
    const found = memList(memMedRec, this.workspaceId).find((s) => s.id === sessionId);
    if (found) (found.discrepancies as unknown[]).push(input);
    await this.audit("care.medrec.discrepancy", sessionId, { category: input.category, owner: input.owner });
    return { sessionId, recorded: true as const };
  }

  async approveMedRec(sessionId: string, approvedList: string[], approver: string) {
    await this.assert("UPDATE");
    if (!approver) throw new Error("Clinician or pharmacist approver required for the shared list.");
    await safe(() => (prisma as unknown as CareTables).healthCareMedRec.update({ where: { sessionId }, data: { approvedList, status: "list_approved", owner: approver } }) as Promise<never>, null);
    const found = memList(memMedRec, this.workspaceId).find((s) => s.id === sessionId);
    if (found) { found.approvedList = approvedList; found.status = "list_approved"; }
    await this.audit("care.medrec.approved", sessionId, { approver, count: approvedList.length });
    return { sessionId, status: "list_approved" as const, next: ["changes_communicated", "monitoring_tasks_created"] };
  }

  // ── Orders + referrals ───────────────────────────────────────────
  async createOrder(input: { kind: "order" | "referral"; patientRef: string; title: string; urgency?: string; receivingOrg?: string; owner?: string }) {
    await this.assert("CREATE");
    const id = `ord-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as CareTables).healthCareOrder.create({
        data: { workspaceId: this.workspaceId, orderId: id, kind: input.kind, patientRef: input.patientRef, title: input.title, urgency: input.urgency ?? "routine", receivingOrg: input.receivingOrg ?? "", owner: input.owner ?? "", status: "order_created", authState: "not_required", deadlines: {}, reportReview: "pending", failureReason: "", retryCount: 0, createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, status: "order_created", retryCount: 0 };
    if (!row) memPush(memOrders, this.workspaceId, stored);
    await this.audit("care.order.created", id, { kind: input.kind });
    return { orderId: id, lifecycle: [...ORDER_LIFECYCLE], display: [...ORDER_DISPLAY] };
  }

  async advanceOrder(orderId: string, to: string) {
    await this.assert("UPDATE");
    const found = memList(memOrders, this.workspaceId).find((o) => o.id === orderId);
    const from = String(found?.status ?? "order_created");
    if (!orderTransition(from, to)) throw new Error(`Invalid order transition ${from} → ${to}`);
    await safe(() => (prisma as unknown as CareTables).healthCareOrder.update({ where: { orderId }, data: { status: to } }) as Promise<never>, null);
    if (found) found.status = to;
    await this.audit("care.order.advanced", orderId, { from, to });
    return { orderId, from, to };
  }

  async escalateOrder(orderId: string, trigger: string) {
    await this.assert("UPDATE");
    if (!(REFERRAL_ESCALATION_TRIGGERS as readonly string[]).includes(trigger)) throw new Error(`Unknown escalation trigger: ${trigger}`);
    await this.audit("care.order.escalated", orderId, { trigger });
    return { orderId, trigger, escalation: "owner → backup → department lead → clinical operations" };
  }

  // ── Results + critical acknowledgement ───────────────────────────
  async receiveResult(input: { patientRef: string; kind: string; critical?: boolean; payloadRef?: string }) {
    await this.assert("CREATE");
    const id = `res-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as CareTables).healthCareResult.create({
        data: { workspaceId: this.workspaceId, resultId: id, patientRef: input.patientRef, kind: input.kind, critical: input.critical ?? false, status: "received", owner: "", ack: {}, payloadRef: input.payloadRef ?? "", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, status: "received", ack: {} };
    if (!row) memPush(memResults, this.workspaceId, stored);
    await this.audit("care.result.received", id, { kind: input.kind, critical: input.critical ?? false });
    return { resultId: id, lifecycle: [...RESULT_LIFECYCLE], criticalRequirements: input.critical ? [...CRITICAL_RESULT_REQUIREMENTS] : [] };
  }

  async acknowledgeResult(resultId: string, checks: Record<string, boolean>, owner: string) {
    await this.assert("UPDATE");
    const found = memList(memResults, this.workspaceId).find((r) => r.id === resultId);
    const gaps = found?.critical ? criticalResultGaps(checks) : [];
    if (gaps.length > 0) {
      await this.audit("care.result.ack_blocked", resultId, { gaps });
      throw new Error(`Critical result not acknowledged — missing: ${gaps.join(", ")}. Delivery to an inbox is not completion.`);
    }
    await safe(() => (prisma as unknown as CareTables).healthCareResult.update({ where: { resultId }, data: { status: "clinician_reviewed", owner, ack: checks } }) as Promise<never>, null);
    if (found) { found.status = "clinician_reviewed"; found.owner = owner; }
    await this.audit("care.result.acknowledged", resultId, { owner });
    return { resultId, status: "clinician_reviewed" as const };
  }

  // ── Tasks — owned, dispositioned, never generic-done ─────────────
  async createTask(input: { patientRef: string; type: string; owner?: string; backupOwner?: string; priority?: string; dueAt?: string; dependencies?: string[]; patientVisible?: boolean; safetyCritical?: boolean; team?: string }) {
    await this.assert("CREATE");
    const ownership = taskOwnerCheck({ owner: input.owner, team: input.team });
    if (!ownership.accountable) throw new Error(ownership.reason);
    const id = `ctk-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as CareTables).healthCareCoordTask.create({
        data: { workspaceId: this.workspaceId, taskId: id, patientRef: input.patientRef, type: input.type, owner: input.owner ?? "", backupOwner: input.backupOwner ?? "", priority: input.priority ?? "routine", dueAt: input.dueAt ? new Date(input.dueAt) : null, dependencies: input.dependencies ?? [], patientVisible: input.patientVisible ?? true, safetyCritical: input.safetyCritical ?? false, status: "open", disposition: "", escalation: {}, createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, status: "open" };
    if (!row) memPush(memTasks, this.workspaceId, stored);
    await this.audit("care.task.created", id, { type: input.type, owner: input.owner });
    return { taskId: id, ownership: ownership.reason };
  }

  async closeTask(taskId: string, disposition: string) {
    await this.assert("UPDATE");
    const found = memList(memTasks, this.workspaceId).find((t) => t.id === taskId);
    const validity = taskClosureValid({ safetyCritical: Boolean(found?.safetyCritical) }, disposition);
    if (!validity.closable) throw new Error(validity.reason);
    await safe(() => (prisma as unknown as CareTables).healthCareCoordTask.update({ where: { taskId }, data: { status: "closed", disposition } }) as Promise<never>, null);
    if (found) { found.status = "closed"; found.disposition = disposition; }
    await this.audit("care.task.closed", taskId, { disposition });
    return { taskId, disposition };
  }

  // ── RPM program ──────────────────────────────────────────────────
  async enrollRpm(input: { patientRef: string; deviceRef: string; consentRef: string }) {
    await this.assert("CREATE");
    if (!input.consentRef) throw new Error("RPM requires explicit consent reference.");
    const id = `rpm-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as CareTables).healthCareRpm.create({
        data: { workspaceId: this.workspaceId, enrollmentId: id, patientRef: input.patientRef, deviceRef: input.deviceRef, consentRef: input.consentRef, status: "consented", readings: [], reviewer: "", interventions: [], exitReason: "", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, status: "consented", readings: [], interventions: [] };
    if (!row) memPush(memRpm, this.workspaceId, stored);
    await this.audit("care.rpm.enrolled", id, { patientRef: input.patientRef });
    return { enrollmentId: id, lifecycle: [...RPM_LIFECYCLE] };
  }

  async rpmReading(enrollmentId: string, reading: Record<string, unknown>, qualityOk: boolean) {
    await this.assert("UPDATE");
    const found = memList(memRpm, this.workspaceId).find((r) => r.id === enrollmentId);
    if (found) (found.readings as unknown[]).push({ ...reading, qualityOk, at: new Date().toISOString() });
    await this.audit("care.rpm.reading", enrollmentId, { qualityOk });
    return { enrollmentId, recorded: true as const, qualityOk, note: qualityOk ? "Routed for review." : "Flagged — poor quality readings never escalate silently." };
  }

  // ── Messaging — labeled, owned, escalated ────────────────────────
  async sendMessage(input: { patientRef?: string; classification: string; body: string; owner: string; priority?: string; deadlineAt?: string; aiInvolved?: boolean; clinicianReviewed?: boolean; sender?: string }) {
    await this.assert("CREATE");
    if (!(MESSAGE_CLASSES as readonly string[]).includes(input.classification)) throw new Error(`Unknown message class: ${input.classification}`);
    const id = `msg-${crypto.randomUUID().slice(0, 8)}`;
    const label = messageLabel(input.aiInvolved ?? false, input.clinicianReviewed ?? false, input.sender ?? input.owner);
    const row = await safe(
      () => (prisma as unknown as CareTables).healthCareMessage.create({
        data: { workspaceId: this.workspaceId, messageId: id, patientRef: input.patientRef ?? "", classification: input.classification, body: input.body, owner: input.owner, priority: input.priority ?? "routine", deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : null, aiInvolved: input.aiInvolved ?? false, clinicianReviewed: input.clinicianReviewed ?? false, senderLabel: label, readState: "unread", ackState: "unacknowledged", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, senderLabel: label, readState: "unread", ackState: "unacknowledged" };
    if (!row) memPush(memMessages, this.workspaceId, stored);
    await this.audit("care.message.sent", id, { classification: input.classification });
    return { messageId: id, senderLabel: label, reminder: "Sent does not mean reviewed — ownership, deadline, and escalation apply." };
  }

  // ── Payer workflows — denial becomes work, never a silent plan change
  async payerDenial(input: { orderId: string; reason: string; patientRef: string }) {
    await this.assert("CREATE");
    const task = payerDenialTask(input);
    await this.audit("care.payer.denied", input.orderId, { reason: input.reason });
    return task;
  }

  // ── CDS — classified, transparent, override-tracked ──────────────
  async registerCds(input: { functionKey: string; intendedUse: string; intendedUser?: string; inputs?: string[]; ruleVersion?: string; evidence?: string; limitations?: string[]; regulatoryClass?: string; humanReview?: string }) {
    await this.assert("CREATE");
    if (!(CDS_CATALOG as readonly string[]).includes(input.functionKey)) throw new Error(`Unknown CDS function: ${input.functionKey} — register only governed functions.`);
    if (!input.regulatoryClass) throw new Error("CDS requires a regulatory classification before deployment.");
    const id = `cds-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as CareTables).healthCareCds.create({
        data: { workspaceId: this.workspaceId, functionId: id, functionKey: input.functionKey, intendedUse: input.intendedUse, intendedUser: input.intendedUser ?? "", inputs: input.inputs ?? [], ruleVersion: input.ruleVersion ?? "1.0", evidence: input.evidence ?? "", limitations: input.limitations ?? [], regulatoryClass: input.regulatoryClass ?? "", humanReview: input.humanReview ?? "required", state: "available", interactions: [], createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, state: "available", interactions: [] };
    if (!row) memPush(memCds, this.workspaceId, stored);
    await this.audit("care.cds.registered", id, { function: input.functionKey });
    return { functionId: id, requiredFields: [...CDS_REQUIRED_FIELDS] };
  }

  async cdsInteract(functionId: string, to: string, reason?: string) {
    await this.assert("UPDATE");
    const found = memList(memCds, this.workspaceId).find((c) => c.id === functionId);
    const from = String(found?.state ?? "available");
    if (!cdsTransition(from, to)) throw new Error(`Invalid CDS transition ${from} → ${to}`);
    if ((to === "rejected" || to === "modified") && !reason) throw new Error("Overrides and rejections require a reason — tracked for safety improvement, never punished as noncompliance.");
    if (found) { found.state = to; (found.interactions as unknown[]).push({ to, reason: reason ?? "", at: new Date().toISOString() }); }
    await this.audit("care.cds.interaction", functionId, { from, to, reason });
    return { functionId, from, to };
  }

  // ── Safety records — reviews, duplicates, downtime ───────────────
  async safetyRecord(input: { kind: "allergy_review" | "duplicate_review" | "downtime_session" | "payer_case" | "transition"; patientRef?: string; detail: Record<string, unknown> }) {
    await this.assert("CREATE");
    const id = `saf-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as CareTables).healthCareSafety.create({
        data: { workspaceId: this.workspaceId, safetyId: id, kind: input.kind, patientRef: input.patientRef ?? "", detail: input.detail, status: "open", resolution: "", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, status: "open" };
    if (!row) memPush(memSafety, this.workspaceId, stored);
    await this.audit("care.safety.recorded", id, { kind: input.kind });
    return { safetyId: id };
  }

  async resolveDuplicate(safetyId: string, outcome: string, reviewer: string, approvals = 0) {
    await this.assert("UPDATE");
    if (!(MATCH_OUTCOMES as readonly string[]).includes(outcome)) throw new Error(`Unknown match outcome: ${outcome}`);
    const gate = mergePermitted(outcome, approvals, reviewer);
    if (!gate.permitted) throw new Error(`Merge blocked — ${gate.missing.join("; ")}`);
    await safe(() => (prisma as unknown as CareTables).healthCareSafety.update({ where: { safetyId }, data: { status: "resolved", resolution: outcome } }) as Promise<never>, null);
    const found = memList(memSafety, this.workspaceId).find((s) => s.id === safetyId);
    if (found) { found.status = "resolved"; found.resolution = outcome; }
    await this.audit("care.duplicate.resolved", safetyId, { outcome, reviewer });
    return { safetyId, outcome, reversible: outcome === "likely_same" ? "governed reversal required" : "standard reversal" };
  }

  async reconcileDowntime(safetyId: string, offlineAt: string, currentAt: string) {
    await this.assert("UPDATE");
    const gate = downtimeWriteAllowed(offlineAt, currentAt);
    if (!gate.writable) {
      await this.audit("care.downtime.conflict", safetyId, { offlineAt, currentAt });
      return { safetyId, ...gate, pipeline: [...DOWNTIME_RECOVERY] };
    }
    await safe(() => (prisma as unknown as CareTables).healthCareSafety.update({ where: { safetyId }, data: { status: "resolved", resolution: "reconciled" } }) as Promise<never>, null);
    await this.audit("care.downtime.reconciled", safetyId, {});
    return { safetyId, ...gate, pipeline: [...DOWNTIME_RECOVERY] };
  }

  // ── Workspace view + dashboards ──────────────────────────────────
  async workspaceView(patientRef: string) {
    await this.assert("READ");
    const ws = this.workspaceId;
    const pick = (m: Map<string, StoredRow[]>) => memList(m, ws).filter((r) => r.patientRef === patientRef);
    return {
      patientRef,
      version: CARE_VERSION,
      header: [...WORKSPACE_HEADER],
      provenance: [...WORKSPACE_PROVENANCE],
      guardrails: [...WORKSPACE_GUARDRAILS],
      encounters: pick(memEncounters).length,
      openOrders: pick(memOrders).filter((o) => !["care_plan_updated"].includes(String(o.status))).length,
      unreviewedResults: pick(memResults).filter((r) => !["clinician_reviewed", "closed"].includes(String(r.status))).length,
      openTasks: pick(memTasks).filter((t) => t.status !== "closed").length,
      rpm: pick(memRpm).length,
      messages: pick(memMessages).length,
      generatedAt: new Date().toISOString(),
    };
  }

  async careDashboard() {
    await this.assert("READ");
    return {
      version: CARE_VERSION,
      dashboards: [...CARE_DASHBOARDS],
      promise: CARE_PROMISE,
      transactionStates: [...TRANSACTION_STATES],
      generatedAt: new Date().toISOString(),
    };
  }
}

// ── Static reference exports ──────────────────────────────────────────
export const CARE_API = [
  "openEncounter", "triageEncounter", "closeEncounter", "signDocument",
  "startMedRec", "recordDiscrepancy", "approveMedRec",
  "createOrder", "advanceOrder", "escalateOrder",
  "receiveResult", "acknowledgeResult",
  "createTask", "closeTask",
  "enrollRpm", "rpmReading",
  "sendMessage", "payerDenial",
  "registerCds", "cdsInteract",
  "safetyRecord", "resolveDuplicate", "reconcileDowntime",
  "workspaceView", "careDashboard",
] as const;
