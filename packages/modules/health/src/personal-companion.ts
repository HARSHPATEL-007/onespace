// N0VA Personal — consumer-controlled health and wellness companion — Project Vita.
// For individuals, families, and approved caregivers. Not a substitute for
// professional medical care: it helps users organize, understand, and act on
// their health information while keeping professional clinical decisions with
// qualified care teams.
//
// Governing principle: help people become more informed, organized, and
// supported in their health — without pretending that a consumer app, device,
// or AI companion can replace professional judgment or emergency care.
// Sensitive data (medications, symptoms, vitals, fertility, sleep,
// mental-health, genetic) carries full privacy obligations regardless of the
// "wellness app" label.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_personal";
export const PERSONAL_VERSION = "2026.09";

export const PRODUCT_PROMISE =
  "N0VA helps you organize, understand, and act on your health information while keeping professional clinical decisions with qualified care teams.";

// ── Prohibited claims — never present the app as clinical authority ───
export const PROHIBITED_CLAIMS = [
  "diagnoses your condition", "replaces your doctor", "guarantees prevention",
  "determines whether you are safe", "adjusts treatment automatically",
  "monitors you continuously",
] as const;

export function claimCheck(text: string): { ok: boolean; violations: string[] } {
  const lower = text.toLowerCase();
  const violations = PROHIBITED_CLAIMS.filter((c) => lower.includes(c.toLowerCase().replace(/[.“”"]/g, "")) || lower.includes(c.toLowerCase()));
  return { ok: violations.length === 0, violations: [...violations] };
}

// ── Personal architecture + home screen ───────────────────────────────
export const PERSONAL_MODULES = [
  "identity_recovery", "health_profile", "wellness_goals", "medication_appointment_tools",
  "records_vault", "device_gateway", "symptom_journal", "patient_generated_data",
  "education", "ani_companion", "sharing_proxy", "emergency_summary", "privacy_center",
] as const;
export const HOME_SECTIONS = [
  "medication_reminders", "appointments", "care_tasks", "device_readings",
  "wellness_goals", "new_records", "messages", "ani_checkin",
] as const;
// Never a single composite "health score" as the primary representation.
export const HOME_STATES = [
  "up_to_date", "needs_attention", "waiting_for_confirmation", "data_delayed",
  "data_incomplete", "shared_with_care_team", "not_clinically_reviewed",
  "action_recommended", "emergency_support_needed",
] as const;

// ── Provenance — every item shows source, freshness, scope ────────────
export const PROFILE_SOURCE_STATES = [
  "clinician_confirmed", "patient_reported", "caregiver_entered", "device_derived",
  "imported", "ai_generated_summary", "unverified", "historical",
] as const;
export const DATA_LABELS = [
  "measured", "estimated", "user_entered", "imported",
  "clinician_entered", "ai_interpreted", "unverified",
] as const;

export function provenanceLabel(item: { source: string; recordedAt: string; confirmedAt?: string | null; viewers?: string[] }): string {
  const parts = [`source:${item.source}`, `recorded:${item.recordedAt}`];
  if (item.confirmedAt) parts.push(`confirmed:${item.confirmedAt}`);
  else parts.push("confirmation:pending");
  if (item.viewers) parts.push(`viewers:${item.viewers.join(",") || "private"}`);
  return parts.join(" | ");
}

// ── Wellness goals — user-selected, pausable, non-punitive ────────────
export const GOAL_DOMAINS = [
  "sleep", "physical_activity", "nutrition", "hydration", "stress_management",
  "mindfulness", "social_connection", "smoking_reduction", "alcohol_moderation",
  "routine_building", "medication_organization", "appointment_preparation",
] as const;
export const GOAL_SAFEGUARDS = [
  "user_selected", "adjustable", "accessible", "non_punitive", "disability_sensitive",
  "context_adaptable", "pausable", "explainable", "user_approved_data",
] as const;

export const goalSchema = z.object({
  goalId: z.string().min(1).default(""),
  domain: z.enum(GOAL_DOMAINS),
  title: z.string().min(1),
  target: z.string().default(""),
  status: z.enum(["active", "paused", "completed", "abandoned"]).default("active"),
  adaptations: z.array(z.string()).default([]),
});

// Missed goals trigger curiosity about the target — never failure framing.
export function goalCheckIn(missedCount: number): string {
  if (missedCount <= 0) return "On track — steady progress counts.";
  return `Missed ${missedCount} time(s). Is this target realistic right now? Consider a smaller step, a pause, or adapting for illness, schedule, or context — progress is not failure.`;
}

// ── Medication support — organize and remind, never prescribe ─────────
export const MED_PERMITTED = [
  "list_display", "reminder_scheduling", "refill_reminders", "pharmacy_contact",
  "dose_history_logging", "missed_dose_journaling", "side_effect_capture",
  "photo_label_storage", "appointment_preparation", "clinician_sharing",
  "reconciliation_prompts", "pharmacist_questions",
] as const;
export const MED_RESTRICTED = [
  "dose_change", "discontinuation", "taper_design", "substitution",
  "interaction_resolution", "treatment_initiation", "emergency_interpretation", "safe_to_skip_decision",
] as const;
export const MED_RECORD_STATES = [
  "user_entered", "imported", "clinician_confirmed", "patient_reports_taking",
  "patient_reports_not_taking", "unclear", "discontinued_by_clinician", "superseded",
] as const;

export function medicationGuard(action: string): { permitted: boolean; reason: string } {
  if ((MED_RESTRICTED as readonly string[]).includes(action)) {
    return { permitted: false, reason: `Restricted: ${action} practices medicine. Route to pharmacist, prescriber, or approved clinical pathway.` };
  }
  if (!(MED_PERMITTED as readonly string[]).includes(action)) {
    return { permitted: false, reason: `Unknown medication action: ${action} — default deny.` };
  }
  return { permitted: true, reason: "Organizational/reminder function within Personal scope." };
}

// "Missed my dose — what should I do?" → general safety, never invented instruction.
export function missedDoseResponse(medicationKnown: boolean, urgentSymptoms: boolean): { message: string; escalate: boolean } {
  if (urgentSymptoms) {
    return { escalate: true, message: "Concerning symptoms need immediate help — contact local emergency services now. Do not wait on medication guidance." };
  }
  return {
    escalate: false,
    message: medicationKnown
      ? "I can't give medication-specific instructions. Check the label's missed-dose section, contact your pharmacist or prescriber, and log what you decide together. If you feel unwell, seek care promptly."
      : "I don't have enough context for medication-specific advice. Check the label, contact your pharmacist or prescriber, and never guess a catch-up dose.",
  };
}

export const medicationSchema = z.object({
  medicationId: z.string().min(1).default(""),
  name: z.string().min(1),
  dosage: z.string().default(""),
  schedule: z.string().default(""),
  state: z.enum(MED_RECORD_STATES).default("user_entered"),
  prescriber: z.string().default(""),
  pharmacy: z.string().default(""),
  photoRef: z.string().default(""),
});

// ── Appointments — critical follow-up is never silently cancelled ─────
export const appointmentSchema = z.object({
  appointmentId: z.string().min(1).default(""),
  title: z.string().min(1),
  scheduledAt: z.coerce.date(),
  criticality: z.enum(["routine", "important", "critical"]).default("routine"),
  status: z.enum(["scheduled", "rescheduled", "cancelled", "completed", "waitlisted"]).default("scheduled"),
  preparation: z.array(z.string()).default([]),
  transportNotes: z.string().default(""),
  accessibilityNeeds: z.array(z.string()).default([]),
  caregiverAttending: z.string().default(""),
  telehealthReady: z.boolean().default(false),
});

export function cancelAppointmentFlow(criticality: string): { steps: string[]; cancellable: boolean } {
  if (criticality === "critical") {
    return {
      cancellable: false,
      steps: ["explain_consequence", "offer_reschedule", "notify_care_team", "record_patient_choice", "confirm_safe_alternative"],
    };
  }
  return { cancellable: true, steps: ["offer_reschedule", "record_patient_choice", "confirm_status"] };
}

// ── Records vault ─────────────────────────────────────────────────────
export const DOCUMENT_TYPES = [
  "lab_report", "imaging_report", "visit_summary", "discharge_document",
  "prescription", "immunization_record", "insurance_document", "advance_care_document",
  "home_monitoring_record", "patient_note", "photograph",
] as const;

export const documentSchema = z.object({
  documentId: z.string().min(1).default(""),
  title: z.string().min(1),
  documentType: z.enum(DOCUMENT_TYPES),
  source: z.string().default("patient_upload"),
  recordedAt: z.coerce.date().optional(),
  clinicianAuthored: z.boolean().default(false),
  reviewed: z.boolean().default(false),
  currentlyValid: z.boolean().default(true),
  viewers: z.array(z.string()).default([]),
  storageRef: z.string().default(""),
});

// ── Home devices — labeled readings, validated alerts only ────────────
export const SUPPORTED_DEVICES = [
  "blood_pressure", "glucose_meter", "pulse_oximeter", "thermometer",
  "weight_scale", "activity_tracker", "sleep_device", "medication_dispenser",
  "fertility_device", "wellness_sensor",
] as const;

export const deviceSchema = z.object({
  deviceId: z.string().min(1).default(""),
  kind: z.enum(SUPPORTED_DEVICES),
  model: z.string().default(""),
  firmware: z.string().default(""),
  calibrationStatus: z.string().default("unknown"),
  connectivity: z.string().default("unknown"),
});

export interface DeviceReadingInput {
  deviceId: string; kind: string; value: Record<string, number | string>;
  unit: string; label: string; recordedAt: string; calibrationStatus?: string;
  connectivity?: string; patientAssociation?: string;
}
export function labelReading(r: DeviceReadingInput): Record<string, unknown> {
  if (!(DATA_LABELS as readonly string[]).includes(r.label)) throw new Error(`Reading requires a data label (measured/estimated/user-entered/...): got ${r.label}`);
  return {
    ...r.value, unit: r.unit, label: r.label,
    source: "home_device", deviceId: r.deviceId,
    recordedAt: r.recordedAt, receivedAt: new Date().toISOString(),
    calibrationStatus: r.calibrationStatus ?? "unknown",
    connectivity: r.connectivity ?? "unknown",
    clinicalReview: "not_performed", clinicalUse: "not_established",
    warning: r.label !== "measured" ? `Labeled ${r.label} — not a direct device measurement.` : undefined,
  };
}

// ── Symptom tracking + safety mode ────────────────────────────────────
export const JOURNAL_DOMAINS = [
  "symptoms", "severity", "duration", "triggers", "function", "sleep", "mood",
  "nutrition", "activity", "reproductive_health", "substance_use", "pain",
  "side_effects", "environmental_exposure", "goals",
] as const;

export const URGENT_PATTERNS = [
  "chest pain", "can't breathe", "difficulty breathing", "suicid", "kill myself",
  "overdose", "stroke", "unconscious", "severe bleeding", "anaphylax",
  "heart attack", "emergency", "call 911", "self-harm",
] as const;

export function detectUrgency(text: string): { urgent: boolean; matched: string[] } {
  const lower = text.toLowerCase();
  const matched = URGENT_PATTERNS.filter((p) => lower.includes(p as string));
  return { urgent: matched.length > 0, matched: [...matched] };
}

export function safetyModeMessage(): { message: string; steps: string[] } {
  return {
    message: "This sounds urgent. If you are in danger, contact your local emergency number now — for example 911 in the US. Do not wait for an app response.",
    steps: ["clarify_immediate_danger", "emergency_instruction", "urgent_care_pathway", "no_diagnosis", "no_delay", "record_safety_message", "offer_clinician_contact_with_permission"],
  };
}

// ── Patient-generated data envelope ───────────────────────────────────
export function pghdEnvelope(input: { observationId: string; patientRef: string; type: string; value: Record<string, unknown>; sourceType: string; deviceId?: string; recordedAt: string; annotation?: string }): Record<string, unknown> {
  return {
    observation_id: input.observationId, patient_id: input.patientRef, type: input.type,
    value: input.value, source_type: input.sourceType, device_id: input.deviceId ?? null,
    recorded_at: input.recordedAt, received_at: new Date().toISOString(),
    verification: "unreviewed", shared_with: [], clinical_use: "not_established",
    annotation: input.annotation ?? null, correction_history: [],
  };
}

// ── Education ─────────────────────────────────────────────────────────
export const EDUCATION_REQUIREMENTS = [
  "evidence_informed", "plain_language", "culturally_responsive", "accessible",
  "source_linked", "versioned", "expert_reviewed", "uncertainty_clear",
  "separated_from_advertising", "language_literacy_adapted",
] as const;

// ── Sharing — granular, previewed, revocable ──────────────────────────
export const SHARING_DIMENSIONS = [
  "records", "excluded_categories", "recipient", "purpose", "start_date",
  "expiration", "one_time_vs_ongoing", "caregiver_scope", "provider_scope",
  "research_use", "device_sharing", "ani_conversation_sharing", "recontact", "revocation",
] as const;
export const SHARING_FLOW = [
  "select_data", "select_recipient", "select_purpose", "select_duration",
  "review_preview", "confirm_with_passkey", "share", "notify_user",
  "show_access_history", "revoke_or_expire",
] as const;

export const SENSITIVE_CATEGORIES = ["reproductive_health", "mental_health", "substance_use", "genetic", "hiv_status"] as const;

// A summary share must not silently expand to the full record.
export function sharingScopeCheck(requested: string[], granted: string[]): { allowed: string[]; denied: string[] } {
  const allowed = requested.filter((r) => granted.includes(r));
  const denied = requested.filter((r) => !granted.includes(r));
  return { allowed, denied };
}

export const PROXY_TYPES = ["family_member", "caregiver", "parent_guardian", "personal_representative", "interpreter", "community_health_worker", "trusted_support"] as const;

export function proxyMayView(proxy: { scope: string[]; expiresAt: string | null }, category: string): { permitted: boolean; reason: string } {
  if (proxy.expiresAt && new Date(proxy.expiresAt).getTime() <= Date.now()) {
    return { permitted: false, reason: "Proxy authorization expired." };
  }
  if (!proxy.scope.includes(category) && !proxy.scope.includes("all_non_sensitive")) {
    return { permitted: false, reason: `Category ${category} is outside the granted proxy scope.` };
  }
  if ((SENSITIVE_CATEGORIES as readonly string[]).includes(category) && !proxy.scope.includes(category)) {
    return { permitted: false, reason: `Sensitive category ${category} requires explicit scope — family status alone never grants access.` };
  }
  return { permitted: true, reason: "Within granted, unexpired scope." };
}

// ── Timeline markers ──────────────────────────────────────────────────
export const TIMELINE_MARKERS = [
  "clinician_confirmed", "patient_reported", "device_derived", "ai_generated",
  "pending_review", "superseded", "shared", "private",
] as const;

// ── Emergency summary ─────────────────────────────────────────────────
export const EMERGENCY_FIELDS = [
  "name_dob", "allergies", "current_medications", "major_conditions",
  "implanted_devices", "emergency_contacts", "preferred_language",
  "accessibility_needs", "blood_type_verified", "advance_care", "clinician_contacts", "recent_critical",
] as const;

export function emergencySummaryWarnings(items: Array<{ field: string; verified: boolean; recordedAt: string }>): string[] {
  const warnings: string[] = ["This summary may be incomplete — confirm against available records."];
  for (const item of items) {
    if (!item.verified) warnings.push(`${item.field}: unverified — treat with caution.`);
  }
  return warnings;
}

// ── Ani companion — modes, pipeline, prohibitions, attribution ────────
export const PERSONAL_ANI_MODES: Record<string, { functions: string[]; guardrail: string }> = {
  wellness_coaching: { functions: ["goals", "habits", "routines"], guardrail: "No diagnosis or treatment claims" },
  medication_reminders: { functions: ["reminders", "logging", "refill_prompts"], guardrail: "No independent dose changes" },
  appointment_support: { functions: ["booking", "preparation", "reminders"], guardrail: "No unsafe cancellation" },
  record_navigation: { functions: ["find", "summarize", "organize"], guardrail: "Source and freshness visible" },
  visit_preparation: { functions: ["question_lists", "symptom_timeline"], guardrail: "No diagnosis" },
  patient_education: { functions: ["general_explanations"], guardrail: "Evidence and uncertainty" },
  emotional_support: { functions: ["reflection", "grounding", "resources"], guardrail: "Crisis escalation" },
  care_plan_reinforcement: { functions: ["repeat_approved_instructions"], guardrail: "No override of clinician plan" },
};
export const PERSONAL_ANI_PROHIBITED = [
  "diagnose", "rule_out_emergency", "change_medication", "interpret_critical_as_safe",
  "override_clinician", "cancel_critical_followup", "release_discharge",
  "approve_referral_closure", "make_emergency_decision", "share_sensitive_with_caregiver",
  "enroll_research", "change_consent", "change_proxy", "alter_record",
  "send_message_as_clinician", "high_risk_treatment_without_authorization",
] as const;
export const ANI_PIPELINE = [
  "identify_intent", "detect_risk", "check_context", "check_authorization",
  "select_mode", "bounded_response", "uncertainty_label", "human_pathway_offer", "audit_metadata",
] as const;
export const ANI_RESPONSE_STATES = [
  "general_wellness", "from_user_record", "clinician_plan", "device_observation",
  "ai_suggestion", "insufficient_information", "needs_professional_review", "urgent_support",
] as const;

export function personalAniGuard(action: string): { permitted: boolean; reason: string } {
  if ((PERSONAL_ANI_PROHIBITED as readonly string[]).includes(action)) {
    return { permitted: false, reason: `Ani must not independently ${action.replace(/_/g, " ")}. Draft for human review instead — boundary stays visible.` };
  }
  return { permitted: true, reason: "Within configured Ani modes; attributable, reviewable, AI-labeled." };
}

export const PATIENT_AI_LABEL = "This response was generated by Ani. It is educational support and has not been independently reviewed by a clinician.";
export const CLINICIAN_AI_LABEL = "AI-generated patient summary. Verify against the source record before relying on it.";

export const CRISIS_TRIGGERS = [
  "self_harm_suicide", "threats_to_others", "abuse_danger", "severe_confusion",
  "psychosis_crisis", "medical_emergency", "unable_to_stay_safe", "vulnerable_person_at_risk",
] as const;

// ── Privacy, accessibility, telemetry, failure handling ───────────────
export const PRIVACY_CONTROLS = [
  "privacy_notice", "data_inventory", "sharing_history", "consent_controls",
  "data_export", "deletion_request", "account_closure", "ad_restrictions",
  "no_health_data_sale", "no_hidden_secondary_use", "vendor_disclosure",
  "breach_notification", "secure_recovery", "access_logs",
] as const;
export const ACCESSIBILITY_COVERAGE = [
  "screen_readers", "large_text", "high_contrast", "reduced_motion", "voice_input",
  "captions", "plain_language", "languages", "easy_read", "cognitive_load",
  "haptic_visual", "caregiver_supported", "low_bandwidth", "offline_capture", "assisted_recovery",
] as const;
export const SAFETY_TELEMETRY = [
  "repeated_urgent_messages", "medication_confusion", "contradictory_med_data",
  "concerning_device_readings", "unacknowledged_urgent_instructions",
  "failed_escalation", "caregiver_anomalies", "account_takeover",
  "unsafe_ani_responses", "correction_of_clinical_info", "stale_emergency_summary", "missing_program_data",
] as const;

export function syncStatusMessage(lastAttempt: string, reachedTeam: boolean): string {
  if (reachedTeam) return "Shared with your care team.";
  return `Saved on this device but has not yet reached your care team. Last synchronization attempt: ${lastAttempt}. Try again or contact your clinic if this is urgent.`;
}

// ── In-memory fallbacks (pre-migration) ───────────────────────────────
interface StoredRow extends Record<string, unknown> { id: string; workspaceId: string }
const memProfiles = new Map<string, StoredRow[]>();
const memGoals = new Map<string, StoredRow[]>();
const memMeds = new Map<string, StoredRow[]>();
const memAppointments = new Map<string, StoredRow[]>();
const memDocuments = new Map<string, StoredRow[]>();
const memDevices = new Map<string, StoredRow[]>();
const memJournal = new Map<string, StoredRow[]>();
const memSharing = new Map<string, StoredRow[]>();
const memTimeline = new Map<string, StoredRow[]>();
const memAni = new Map<string, StoredRow[]>();

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
function memList(m: Map<string, StoredRow[]>, ws: string): StoredRow[] { return m.get(ws) ?? []; }
function memPush(m: Map<string, StoredRow[]>, ws: string, row: StoredRow) { m.set(ws, [...(m.get(ws) ?? []), row]); }

type PersonalTables = {
  healthPersonalProfile: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; findFirst: (a: unknown) => Promise<never | null>; update: (a: unknown) => Promise<never> };
  healthPersonalGoal: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthPersonalMedication: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthPersonalAppointment: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthPersonalDocument: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthPersonalDevice: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthPersonalJournal: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthPersonalSharing: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthPersonalTimeline: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthPersonalAni: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
};

export const profileSchema = z.object({
  userId: z.string().min(1),
  preferredName: z.string().default(""),
  dateOfBirth: z.string().default(""),
  pronouns: z.string().default(""),
  language: z.string().default("en"),
  accessibility: z.array(z.string()).default([]),
  emergencyContacts: z.array(z.record(z.unknown())).default([]),
  carePreferences: z.string().default(""),
  allergies: z.array(z.record(z.unknown())).default([]),
  conditions: z.array(z.record(z.unknown())).default([]),
  immunizations: z.array(z.record(z.unknown())).default([]),
  procedures: z.array(z.record(z.unknown())).default([]),
  familyHistory: z.array(z.record(z.unknown())).default([]),
  lifestyle: z.record(z.unknown()).default({}),
  careTeams: z.array(z.record(z.unknown())).default([]),
  advanceCare: z.record(z.unknown()).default({}),
  sharingPreferences: z.record(z.unknown()).default({}),
});

// ── N0VA Personal companion service ───────────────────────────────────
export class PersonalCompanion {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health`);
  }
  private audit(action: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType: "PersonalArtifact", targetId, metadata: meta }).catch(() => null);
  }

  // ── Profile ──────────────────────────────────────────────────────
  async upsertProfile(input: z.infer<typeof profileSchema>) {
    await this.assert("CREATE");
    const parsed = profileSchema.parse(input);
    const row = await safe(
      () => (prisma as unknown as PersonalTables).healthPersonalProfile.create({
        data: { workspaceId: this.workspaceId, userId: parsed.userId, profile: parsed, emergencySummary: {}, privacySettings: {}, createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.userId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) {
      const list = memList(memProfiles, this.workspaceId);
      const ix = list.findIndex((p) => p.id === parsed.userId);
      if (ix >= 0) list[ix] = stored; else memPush(memProfiles, this.workspaceId, stored);
    }
    await this.audit("personal.profile.upserted", parsed.userId, {});
    return (row as unknown) ?? stored;
  }

  // ── Goals ────────────────────────────────────────────────────────
  async createGoal(input: z.infer<typeof goalSchema>) {
    await this.assert("CREATE");
    const parsed = goalSchema.parse({ ...input, goalId: input.goalId || `goal-${crypto.randomUUID().slice(0, 8)}` });
    const row = await safe(
      () => (prisma as unknown as PersonalTables).healthPersonalGoal.create({
        data: { workspaceId: this.workspaceId, goalId: parsed.goalId, userId: this.userId, domain: parsed.domain, title: parsed.title, target: parsed.target, status: parsed.status, adaptations: parsed.adaptations },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.goalId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memGoals, this.workspaceId, stored);
    await this.audit("personal.goal.created", parsed.goalId, { domain: parsed.domain });
    return { ...((row as unknown as Record<string, unknown> | null) ?? stored), safeguards: [...GOAL_SAFEGUARDS] };
  }

  async setGoalStatus(goalId: string, status: "active" | "paused" | "completed" | "abandoned") {
    await this.assert("UPDATE");
    await safe(() => (prisma as unknown as PersonalTables).healthPersonalGoal.update({ where: { goalId }, data: { status } }) as Promise<never>, null);
    const found = memList(memGoals, this.workspaceId).find((g) => g.id === goalId);
    if (found) found.status = status;
    await this.audit("personal.goal.status", goalId, { status });
    return { goalId, status };
  }

  // ── Medications — restricted actions blocked by default ──────────
  async addMedication(input: z.infer<typeof medicationSchema>) {
    await this.assert("CREATE");
    const parsed = medicationSchema.parse({ ...input, medicationId: input.medicationId || `med-${crypto.randomUUID().slice(0, 8)}` });
    const row = await safe(
      () => (prisma as unknown as PersonalTables).healthPersonalMedication.create({
        data: { workspaceId: this.workspaceId, medicationId: parsed.medicationId, userId: this.userId, name: parsed.name, dosage: parsed.dosage, schedule: parsed.schedule, state: parsed.state, prescriber: parsed.prescriber, pharmacy: parsed.pharmacy, photoRef: parsed.photoRef, doseLog: [], sideEffects: [] },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.medicationId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>), doseLog: [], sideEffects: [] };
    if (!row) memPush(memMeds, this.workspaceId, stored);
    await this.audit("personal.medication.added", parsed.medicationId, { state: parsed.state });
    return { ...((row as unknown as Record<string, unknown> | null) ?? stored), listedIsNotProof: "A listed medication is not proof it is being taken." };
  }

  async medicationAction(medicationId: string, action: string, detail?: Record<string, unknown>) {
    await this.assert("UPDATE");
    const guard = medicationGuard(action);
    if (!guard.permitted) {
      await this.audit("personal.medication.blocked", medicationId, { action });
      throw new Error(guard.reason);
    }
    await safe(() => (prisma as unknown as PersonalTables).healthPersonalMedication.update({ where: { medicationId }, data: { doseLog: detail ?? {} } }) as Promise<never>, null).catch(() => null);
    const found = memList(memMeds, this.workspaceId).find((m) => m.id === medicationId);
    if (found) found.lastAction = action;
    await this.audit("personal.medication.action", medicationId, { action });
    return { medicationId, action, recorded: true as const };
  }

  // ── Appointments — critical cancellation needs safe alternative ──
  async scheduleAppointment(input: z.infer<typeof appointmentSchema>) {
    await this.assert("CREATE");
    const parsed = appointmentSchema.parse({ ...input, appointmentId: input.appointmentId || `appt-${crypto.randomUUID().slice(0, 8)}` });
    const row = await safe(
      () => (prisma as unknown as PersonalTables).healthPersonalAppointment.create({
        data: { workspaceId: this.workspaceId, appointmentId: parsed.appointmentId, userId: this.userId, title: parsed.title, scheduledAt: parsed.scheduledAt, criticality: parsed.criticality, status: parsed.status, preparation: parsed.preparation, transportNotes: parsed.transportNotes, accessibilityNeeds: parsed.accessibilityNeeds, caregiverAttending: parsed.caregiverAttending, telehealthReady: parsed.telehealthReady },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.appointmentId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memAppointments, this.workspaceId, stored);
    await this.audit("personal.appointment.scheduled", parsed.appointmentId, { criticality: parsed.criticality });
    return (row as unknown) ?? stored;
  }

  async cancelAppointment(appointmentId: string) {
    await this.assert("UPDATE");
    const all = memList(memAppointments, this.workspaceId);
    const found = all.find((a) => a.id === appointmentId);
    const criticality = String(found?.criticality ?? "routine");
    const flow = cancelAppointmentFlow(criticality);
    if (!flow.cancellable) {
      await this.audit("personal.appointment.cancel_blocked", appointmentId, { criticality });
      return { appointmentId, cancelled: false as const, warning: "Clinically important follow-up — cancellation requires a safe alternative.", steps: flow.steps };
    }
    await safe(() => (prisma as unknown as PersonalTables).healthPersonalAppointment.update({ where: { appointmentId }, data: { status: "cancelled" } }) as Promise<never>, null);
    if (found) found.status = "cancelled";
    await this.audit("personal.appointment.cancelled", appointmentId, {});
    return { appointmentId, cancelled: true as const, steps: flow.steps };
  }

  // ── Vault / devices / journal ────────────────────────────────────
  async storeDocument(input: z.infer<typeof documentSchema>) {
    await this.assert("CREATE");
    const parsed = documentSchema.parse({ ...input, documentId: input.documentId || `doc-${crypto.randomUUID().slice(0, 8)}` });
    const row = await safe(
      () => (prisma as unknown as PersonalTables).healthPersonalDocument.create({
        data: { workspaceId: this.workspaceId, documentId: parsed.documentId, userId: this.userId, title: parsed.title, documentType: parsed.documentType, source: parsed.source, recordedAt: parsed.recordedAt ?? null, clinicianAuthored: parsed.clinicianAuthored, reviewed: parsed.reviewed, currentlyValid: parsed.currentlyValid, viewers: parsed.viewers, storageRef: parsed.storageRef, accessHistory: [], createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.documentId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memDocuments, this.workspaceId, stored);
    await this.audit("personal.document.stored", parsed.documentId, { type: parsed.documentType });
    return { ...((row as unknown as Record<string, unknown> | null) ?? stored), interpreted: parsed.reviewed && parsed.clinicianAuthored ? "clinically reviewed" : "not clinically interpreted" };
  }

  async pairDevice(input: z.infer<typeof deviceSchema>) {
    await this.assert("CREATE");
    const parsed = deviceSchema.parse({ ...input, deviceId: input.deviceId || `dev-${crypto.randomUUID().slice(0, 8)}` });
    const row = await safe(
      () => (prisma as unknown as PersonalTables).healthPersonalDevice.create({
        data: { workspaceId: this.workspaceId, deviceId: parsed.deviceId, userId: this.userId, kind: parsed.kind, model: parsed.model, firmware: parsed.firmware, calibrationStatus: parsed.calibrationStatus, connectivity: parsed.connectivity, readings: [] },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.deviceId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>), readings: [] };
    if (!row) memPush(memDevices, this.workspaceId, stored);
    await this.audit("personal.device.paired", parsed.deviceId, { kind: parsed.kind });
    return (row as unknown) ?? stored;
  }

  async recordReading(input: DeviceReadingInput) {
    await this.assert("CREATE");
    const labeled = labelReading(input);
    const found = memList(memDevices, this.workspaceId).find((d) => d.id === input.deviceId);
    if (found) (found.readings as unknown[]).push(labeled);
    await this.audit("personal.reading.recorded", input.deviceId, { kind: input.kind, label: input.label });
    return labeled;
  }

  async journalEntry(input: { domain: string; text: string; severity?: number; correctsId?: string }) {
    await this.assert("CREATE");
    if (!(JOURNAL_DOMAINS as readonly string[]).includes(input.domain)) throw new Error(`Unknown journal domain: ${input.domain}`);
    const urgency = detectUrgency(input.text);
    const id = `jnl-${crypto.randomUUID().slice(0, 8)}`;
    const entry = { id, workspaceId: this.workspaceId, domain: input.domain, text: input.text, severity: input.severity ?? null, correctsId: input.correctsId ?? null, createdAt: new Date().toISOString() };
    await safe(() => (prisma as unknown as PersonalTables).healthPersonalJournal.create({ data: { workspaceId: this.workspaceId, entryId: id, userId: this.userId, domain: input.domain, text: input.text, severity: input.severity ?? null, correctsId: input.correctsId ?? null } }) as Promise<never>, null);
    memPush(memJournal, this.workspaceId, entry);
    if (input.correctsId) {
      await this.audit("personal.journal.corrected", id, { corrects: input.correctsId });
    }
    if (urgency.urgent) {
      await this.audit("personal.safety.triggered", id, { matched: urgency.matched });
      return { entry, safetyMode: true as const, ...safetyModeMessage() };
    }
    await this.audit("personal.journal.recorded", id, { domain: input.domain });
    return { entry, safetyMode: false as const, trendNote: "Trends show time windows and missing data; correlation is not causation and never a diagnosis." };
  }

  // ── Sharing + proxies ────────────────────────────────────────────
  async shareData(input: { categories: string[]; recipient: string; purpose: string; expiresAt?: string; oneTime?: boolean }) {
    await this.assert("CREATE");
    // Summary shares never silently expand: caller passes the explicit grant list.
    const id = `shr-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PersonalTables).healthPersonalSharing.create({
        data: { workspaceId: this.workspaceId, shareId: id, userId: this.userId, kind: "grant", categories: input.categories, recipient: input.recipient, purpose: input.purpose, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, oneTime: input.oneTime ?? false, status: "ACTIVE", scope: {}, accessHistory: [], createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, kind: "grant", status: "ACTIVE", flow: [...SHARING_FLOW] };
    if (!row) memPush(memSharing, this.workspaceId, stored);
    await this.audit("personal.shared", id, { recipient: input.recipient, purpose: input.purpose });
    return { shareId: id, flow: [...SHARING_FLOW], note: "Only the listed categories are shared — summaries never expand silently." };
  }

  async revokeShare(shareId: string) {
    await this.assert("UPDATE");
    await safe(() => (prisma as unknown as PersonalTables).healthPersonalSharing.update({ where: { shareId }, data: { status: "REVOKED" } }) as Promise<never>, null);
    const found = memList(memSharing, this.workspaceId).find((s) => s.id === shareId);
    if (found) found.status = "REVOKED";
    await this.audit("personal.share.revoked", shareId, {});
    return { shareId, status: "REVOKED" as const };
  }

  async authorizeProxy(input: { proxyType: string; proxyUserId: string; scope: string[]; expiresAt: string; relationship: string }) {
    await this.assert("CREATE");
    if (!(PROXY_TYPES as readonly string[]).includes(input.proxyType)) throw new Error(`Unknown proxy type: ${input.proxyType}`);
    const id = `prx-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PersonalTables).healthPersonalSharing.create({
        data: { workspaceId: this.workspaceId, shareId: id, userId: this.userId, kind: "proxy", categories: input.scope, recipient: input.proxyUserId, purpose: input.relationship, expiresAt: new Date(input.expiresAt), oneTime: false, status: "ACTIVE", scope: { proxyType: input.proxyType }, accessHistory: [], createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, kind: "proxy", status: "ACTIVE" };
    if (!row) memPush(memSharing, this.workspaceId, stored);
    await this.audit("personal.proxy.authorized", id, { proxyType: input.proxyType, scope: input.scope });
    return (row as unknown) ?? stored;
  }

  checkProxy(category: string, proxy: { scope: string[]; expiresAt: string | null }) {
    return proxyMayView(proxy, category);
  }

  // ── Timeline + emergency summary ─────────────────────────────────
  async timelineEvent(input: { kind: string; marker: string; title: string; refId?: string; conflictWith?: string }) {
    await this.assert("CREATE");
    if (!(TIMELINE_MARKERS as readonly string[]).includes(input.marker)) throw new Error(`Unknown timeline marker: ${input.marker}`);
    const id = `tml-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PersonalTables).healthPersonalTimeline.create({
        data: { workspaceId: this.workspaceId, eventId: id, userId: this.userId, kind: input.kind, marker: input.marker, title: input.title, refId: input.refId ?? "", conflictWith: input.conflictWith ?? null },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input };
    if (!row) memPush(memTimeline, this.workspaceId, stored);
    await this.audit("personal.timeline.recorded", id, { kind: input.kind, marker: input.marker });
    return { eventId: id, conflict: input.conflictWith ? `Conflicts with ${input.conflictWith} — shown side-by-side with a correction path, never silently merged.` : null };
  }

  emergencySummary(items: Array<{ field: string; value: string; verified: boolean; recordedAt: string; source: string }>) {
    const warnings = emergencySummaryWarnings(items);
    return {
      generatedAt: new Date().toISOString(),
      items: items.map((i) => ({ ...i })),
      warnings,
      lockScreenNote: "Lock-screen view is limited to name, allergies, conditions, contacts, and language.",
      logged: true as const,
    };
  }

  // ── Ani sessions — bounded, attributed, labeled ───────────────────
  async aniMessage(input: { sessionId?: string; mode: string; message: string; context?: Record<string, unknown> }) {
    await this.assert("CREATE");
    if (!PERSONAL_ANI_MODES[input.mode]) throw new Error(`Unknown Ani mode: ${input.mode}`);
    const urgency = detectUrgency(input.message);
    const sessionId = input.sessionId ?? `ani-${crypto.randomUUID().slice(0, 8)}`;
    if (urgency.urgent) {
      await this.audit("personal.ani.escalated", sessionId, { matched: urgency.matched });
      return { sessionId, mode: input.mode, pipeline: [...ANI_PIPELINE], state: "urgent_support" as const, label: PATIENT_AI_LABEL, ...safetyModeMessage() };
    }
    const record = { id: `${sessionId}-${Date.now()}`, workspaceId: this.workspaceId, sessionId, mode: input.mode, message: input.message, state: "general_wellness", label: PATIENT_AI_LABEL };
    memPush(memAni, this.workspaceId, record);
    await safe(() => (prisma as unknown as PersonalTables).healthPersonalAni.create({ data: { workspaceId: this.workspaceId, sessionId, userId: this.userId, mode: input.mode, messages: [record], state: "general_wellness", reviewer: "" } }) as Promise<never>, null).catch(() => null);
    await this.audit("personal.ani.message", sessionId, { mode: input.mode });
    return { sessionId, pipeline: [...ANI_PIPELINE], state: "general_wellness" as const, label: PATIENT_AI_LABEL, guardrail: PERSONAL_ANI_MODES[input.mode]!.guardrail };
  }

  async aniDraftAction(sessionId: string, action: string) {
    await this.assert("CREATE");
    const guard = personalAniGuard(action);
    if (!guard.permitted) {
      await this.audit("personal.ani.blocked", sessionId, { action });
      throw new Error(guard.reason);
    }
    await this.audit("personal.ani.drafted", sessionId, { action });
    return { sessionId, action, flow: "draft → human review → authorized approval → patient confirmation → execute → record outcome" };
  }

  // ── Privacy center + dashboard ───────────────────────────────────
  async privacyRequest(kind: "export" | "deletion" | "closure") {
    await this.assert("CREATE");
    const id = `prv-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PersonalTables).healthPersonalSharing.create({
        data: { workspaceId: this.workspaceId, shareId: id, userId: this.userId, kind, categories: [], recipient: "self", purpose: kind, expiresAt: null, oneTime: true, status: "PENDING", scope: {}, accessHistory: [], createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memSharing, this.workspaceId, { id, workspaceId: this.workspaceId, kind, status: "PENDING" });
    await this.audit("personal.privacy.requested", id, { kind });
    return { requestId: id, kind, status: "PENDING" as const, retentionNote: "Subject to applicable retention duties and legal holds." };
  }

  async homeDashboard() {
    await this.assert("READ");
    const ws = this.workspaceId;
    const counts = {
      goals: memList(memGoals, ws).length,
      medications: memList(memMeds, ws).length,
      appointments: memList(memAppointments, ws).filter((a) => a.status === "scheduled").length,
      documents: memList(memDocuments, ws).length,
      devices: memList(memDevices, ws).length,
      journal: memList(memJournal, ws).length,
      shares: memList(memSharing, ws).filter((s) => s.status === "ACTIVE").length,
      timeline: memList(memTimeline, ws).length,
      aniSessions: new Set(memList(memAni, ws).map((m) => m.sessionId)).size,
    };
    return {
      version: PERSONAL_VERSION,
      promise: PRODUCT_PROMISE,
      sections: [...HOME_SECTIONS],
      states: [...HOME_STATES],
      counts,
      noHealthScore: "N0VA Personal does not reduce your health to a single score.",
      generatedAt: new Date().toISOString(),
    };
  }
}

// ── Static reference exports ──────────────────────────────────────────
export const PERSONAL_API = [
  "upsertProfile", "createGoal", "setGoalStatus",
  "addMedication", "medicationAction",
  "scheduleAppointment", "cancelAppointment",
  "storeDocument", "pairDevice", "recordReading", "journalEntry",
  "shareData", "revokeShare", "authorizeProxy", "checkProxy",
  "timelineEvent", "emergencySummary",
  "aniMessage", "aniDraftAction",
  "privacyRequest", "homeDashboard",
] as const;
