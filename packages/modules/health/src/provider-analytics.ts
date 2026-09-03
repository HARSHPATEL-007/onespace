// N0VA Provider and Organization Intelligence Plane — Project Vita (Health & Wellness).
// Turns operational, clinical, financial, engagement, equity, and model-safety
// data into accountable action. Every metric shows performance AND context:
// raw volume, risk-adjusted outcomes, patient mix, staffing, access barriers,
// documentation burden, and data completeness.
//
// Governing principle: make performance visible without making people the
// scapegoat — every metric must be clinically meaningful, context-aware,
// equity-aware, actionable, and connected to an accountable improvement
// process. Dashboards never rank clinicians or organizations on unadjusted
// outcomes alone.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_providers";
export const PROVIDER_ANALYTICS_VERSION = "2026.09";

// ── Analytics architecture pipeline ───────────────────────────────────
export const PROVIDER_PIPELINE = [
  "source_systems",
  "identity_encounter_provider_attribution",
  "quality_and_data_validation",
  "metric_definition_registry",
  "risk_adjustment_and_stratification",
  "warehouse_lakehouse",
  "role_specific_dashboards",
] as const;
export const DASHBOARD_AUDIENCES = [
  "executive", "operations", "clinical_leader", "individual_clinician",
  "care_coordinator", "revenue_cycle", "equity", "model_safety",
] as const;
export type DashboardAudience = keyof typeof DASHBOARD_AUDIENCES;

// ── Metric display contract — every metric carries its context ────────
export const METRIC_DISPLAY_FIELDS = [
  "numerator", "denominator", "inclusion_criteria", "exclusion_criteria",
  "observation_period", "attribution_rule", "data_sources", "data_completeness",
  "risk_adjustment_method", "comparison_baseline", "confidence_interval",
  "suppression_rule", "last_refresh", "metric_owner", "action_owner", "caveats",
] as const;

export const metricDefinitionSchema = z.object({
  metricId: z.string().min(1).default(""),
  name: z.string().min(1),
  definition: z.string().min(1),
  population: z.string().default(""),
  numerator: z.string().default(""),
  denominator: z.string().default(""),
  aggregation: z.string().default("rate"),
  attribution: z.string().default(""),
  exclusions: z.array(z.string()).default([]),
  stratifications: z.array(z.string()).default([]),
  refresh: z.string().default("daily"),
  owner: z.string().default(""),
  actionOwner: z.string().default(""),
  version: z.string().default("1.0"),
  qualityStatus: z.enum(["DRAFT", "VALIDATED", "DEPRECATED"]).default("DRAFT"),
  // Context block (display contract)
  observationPeriod: z.string().default(""),
  dataSources: z.array(z.string()).default([]),
  dataCompleteness: z.coerce.number().min(0).max(1).default(1),
  riskAdjustmentMethod: z.string().default("unadjusted"),
  comparisonBaseline: z.string().default(""),
  suppressionRule: z.string().default("suppress_under_11"),
  caveats: z.array(z.string()).default([]),
});
export type MetricDefinitionInput = z.infer<typeof metricDefinitionSchema>;

// Versioned definitions: denominator changes must be visible, never silently compared.
export function denominatorChangeWarning(oldVersion: { version: string; denominator: string }, next: { version: string; denominator: string }): string | null {
  if (oldVersion.denominator !== next.denominator) {
    return `Denominator changed between v${oldVersion.version} and v${next.version} — do not compare old and new values as though identical.`;
  }
  return null;
}

// ── Executive tiles (each links to its operational queue) ─────────────
export const EXECUTIVE_TILES = [
  "access", "continuity", "safety", "experience",
  "workforce", "finance", "equity", "ai_safety",
] as const;
export const EXECUTIVE_TILE_DETAIL: Record<string, string[]> = {
  access: ["median_wait", "third_next_available", "abandoned_requests"],
  continuity: ["referral_completion", "care_gap_closure", "follow_up_after_discharge"],
  safety: ["medication_events", "critical_result_acknowledgement", "readmissions"],
  experience: ["patient_engagement", "communication", "complaints"],
  workforce: ["documentation_time", "after_hours_work", "alert_burden"],
  finance: ["clean_claim_rate", "denial_rate", "days_in_ar"],
  equity: ["disparity_gaps", "improvement_trends"],
  ai_safety: ["drift", "calibration", "overrides", "harm_signals"],
};

// ── Access funnel + wait-time measures ────────────────────────────────
export const ACCESS_FUNNEL = [
  "need_identified", "request_submitted", "request_accepted", "triage_completed",
  "appointment_offered", "appointment_scheduled", "visit_completed", "follow_up_completed",
] as const;
export const ACCESS_MEASURES = [
  "request_to_first_response", "request_to_triage", "third_next_available",
  "urgent_appointment_time", "routine_appointment_time", "referral_to_appointment",
  "call_abandonment", "portal_abandonment", "scheduling_failure", "availability_by_site",
  "wait_room_time", "visit_start_delay", "result_to_review", "review_to_communication",
  "unmet_demand", "capacity_utilization", "same_day_access", "after_hours_access",
] as const;
export const ACCESS_STRATIFICATIONS = [
  "clinic", "specialty", "provider", "visit_type", "new_vs_established", "urgency",
  "payer", "geography", "language", "disability_accommodation", "channel", "rural_vs_urban",
] as const;

// Report median, p90, long-wait tail, and threshold exceedance — never averages alone.
export interface WaitDistribution { median: number; p90: number; longWaitTail: number; exceedanceRate: number; n: number }
export function waitDistribution(minutes: number[], threshold: number): WaitDistribution {
  const sorted = [...minutes].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { median: 0, p90: 0, longWaitTail: 0, exceedanceRate: 0, n: 0 };
  const median = sorted[Math.floor((n - 1) / 2)]!;
  const p90 = sorted[Math.min(n - 1, Math.floor(n * 0.9))]!;
  const exceed = sorted.filter((m) => m > threshold).length;
  return { median, p90, longWaitTail: sorted[n - 1]!, exceedanceRate: Math.round((exceed / n) * 1000) / 1000, n };
}

// ── No-show taxonomy — barriers, not blame ────────────────────────────
export const NOSHOW_OUTCOMES = [
  "no_show", "late_cancellation", "same_day_cancellation", "rescheduled",
  "arrived_late", "clinic_cancellation", "transport_failure", "technology_failure",
  "reminder_failure", "scheduling_error",
] as const;
export const NOSHOW_MEASURES = [
  "no_show_rate", "cancellation_rate", "rescheduling_completion", "time_to_rebook",
  "no_show_recurrence", "no_show_by_lead_time", "no_show_by_type",
  "reminder_delivery_ack", "transport_related", "digital_access_related",
  "revenue_capacity_impact", "clinical_harm_or_delay",
] as const;

// ── Referral funnel + leakage causes ──────────────────────────────────
export const REFERRAL_FUNNEL = [
  "indicated", "ordered", "patient_informed", "auth_requested", "auth_approved",
  "transmitted", "acknowledged", "scheduled", "visit_completed", "report_returned",
  "clinician_reviewed", "care_plan_updated",
] as const;
export const LEAKAGE_CAUSES = [
  "no_receiving_capacity", "insurance_mismatch", "authorization_delay",
  "patient_unreachable", "transportation_barrier", "patient_chose_outside",
  "referral_data_missing", "report_not_returned", "duplicate_referral", "incorrect_destination",
] as const;

export function funnelConversion(entered: number, completed: number): { rate: number; suppressed: boolean } {
  if (entered < 11) return { rate: 0, suppressed: true };
  return { rate: Math.round((completed / entered) * 1000) / 1000, suppressed: false };
}

// ── Care-gap lifecycle — closure means clinical completion ────────────
export const GAP_LIFECYCLE = [
  "eligible", "identified", "contacted", "intervention_offered",
  "accepted_declined_unreachable", "appointment_or_order_completed",
  "result_received", "clinician_reviewed", "closed", "closure_verified",
] as const;
export const GAP_MEASURES = [
  "eligible_population", "open_gaps", "newly_identified", "contact_success",
  "appointment_completion", "intervention_completion", "result_completion",
  "clinician_review", "closure_rate", "time_to_closure", "overdue_rate",
  "declined_rate", "exception_rate", "duplicate_outreach", "reopening",
  "closure_by_intervention_type",
] as const;

// A gap is closed only at the clinically meaningful completion state —
// never merely because an order was placed.
export function gapClosureState(state: string): { closed: boolean; reason: string } {
  if (state === "closure_verified" || state === "closed") return { closed: true, reason: "clinically meaningful completion reached" };
  if (state === "appointment_or_order_completed") return { closed: false, reason: "order placed is not closure — result, review, and verification still required" };
  return { closed: false, reason: `lifecycle state ${state} is not closure` };
}

// ── Medication adherence — possession ≠ ingestion ─────────────────────
export const ADHERENCE_MEASURES = [
  "fill_rate", "proportion_days_covered", "medication_possession_ratio", "refill_gap",
  "prior_auth_delay", "cost_related_nonadherence", "pharmacy_stock_failure",
  "patient_reported_use", "missed_dose_events", "discontinuation_without_plan",
  "side_effect_nonadherence", "reconciliation_discrepancy", "taper_completion",
  "monitoring_completion", "adherence_by_risk_category",
] as const;
export const ADHERENCE_LIMITATIONS = [
  "claims_are_not_proof_of_ingestion",
  "cash_purchases_may_be_invisible",
  "hospital_meds_absent_from_pharmacy_data",
  "patient_report_may_be_incomplete",
  "refill_timing_may_reflect_stockpiling_or_dose_change",
] as const;

// ── Readmissions + transitions (AHRQ-aligned) ─────────────────────────
export const READMISSION_MEASURES = [
  "readmit_7d", "readmit_30d_all_cause", "readmit_condition_specific",
  "emergency_revisit", "observation_revisit", "preventability_classification",
  "follow_up_completed", "med_reconciliation_completed", "discharge_instructions_received",
  "pending_results_assigned", "pcp_notification", "patient_understanding",
  "home_support", "post_discharge_contact", "time_to_first_follow_up",
] as const;
export const READMISSION_REVIEW_FIELDS = [
  "index_condition", "discharge_complexity", "medication_discrepancy",
  "unresolved_result", "follow_up_access", "patient_understanding",
  "social_or_transport_barrier", "caregiver_support", "new_clinical_event",
  "potentially_avoidable_factor", "improvement_owner",
] as const;
// Preventability is never automatic — structured review with patient/caregiver perspective.

// ── Alert burden — value, not just volume ─────────────────────────────
export const ALERT_MEASURES = [
  "alerts_per_clinician", "alerts_per_encounter", "interruptive_vs_passive",
  "high_severity_volume", "acceptance_rate", "override_rate", "snooze_rate",
  "time_to_response", "duplicate_alerts", "repeated_alerts", "after_hours_alerts",
  "alert_driven_med_changes", "alert_associated_adverse_events", "false_positive_rate",
  "usefulness_rating", "user_suppressed", "burden_by_specialty_workflow",
  "safety_events_missed_ignored",
] as const;

export interface AlertQualityInput { relevant: number; actionable: number; timely: number; specific: number; outcomeAssociated: number; duplicates: number; falsePositives: number; interruptions: number }
export function alertQualityScore(q: AlertQualityInput): number {
  const value = q.relevant + q.actionable + q.timely + q.specific + q.outcomeAssociated;
  const burden = q.duplicates + q.falsePositives + q.interruptions;
  return Math.round((value - burden) * 10) / 10;
}
// Never optimize override rate alone: lower may mean better targeting — or unsafe suppression.

// ── Documentation burden — workload patterns, not keystrokes ──────────
export const DOCUMENTATION_DOMAINS = [
  "in_visit", "pre_visit_review", "post_visit_completion", "inbox_management",
  "results_review", "order_entry", "med_reconciliation", "referral_management",
  "coding_billing", "prior_authorization", "after_hours_work", "copy_forward",
  "repeated_entry", "ambient_documentation_use", "corrections", "alert_resolution",
] as const;
export const DOCUMENTATION_GUARDRAILS = [
  "no_raw_ehr_minute_rankings",
  "adjust_for_panel_complexity_specialty_visit_type_staffing",
  "separate_productive_review_from_avoidable_admin",
  "include_clinician_reported_burden",
  "include_outcomes_and_safety",
  "protect_individual_data_from_punitive_use",
  "show_burden_reducing_interventions",
] as const;

// ── Patient engagement — meaningful participation ─────────────────────
export const ENGAGEMENT_MEASURES = [
  "portal_activation", "successful_auth", "appointment_booking", "message_response",
  "care_plan_viewing", "teach_back_completion", "medication_confirmation",
  "shared_decision_documentation", "patient_reported_outcomes", "patient_generated_data",
  "questionnaire_completion", "education_usefulness", "response_time",
  "preference_completion", "consent_management", "reported_confidence",
  "contactability", "digital_barriers", "language_accessibility_support",
] as const;
export const ENGAGEMENT_STATES = [
  "no_engagement", "unable_to_access", "declined", "not_clinically_appropriate",
  "not_offered", "completed_offline", "completed_by_caregiver", "data_unavailable",
] as const;
// Never label "non-engaged" when the cause is broadband, accommodation,
// language, device access, or an inaccessible workflow.

// ── RPM funnel ────────────────────────────────────────────────────────
export const RPM_FUNNEL = [
  "eligible", "referred", "contacted", "consented", "device_assigned",
  "device_activated", "first_data_received", "clinician_reviewed",
  "intervention_delivered", "retained_30d", "retained_90d", "discharged_or_completed",
] as const;
export const RPM_EXIT_REASONS = [
  "cost", "device_difficulty", "connectivity", "battery", "language",
  "caregiver_availability", "alert_overload", "no_perceived_benefit",
  "clinical_improvement", "hospitalization", "privacy_concern",
  "death_or_hospice", "program_completion",
] as const;

// ── Revenue cycle + clinical safeguards ───────────────────────────────
export const REVENUE_MEASURES = [
  "clean_claim_rate", "first_pass_acceptance", "denial_rate", "denial_reason",
  "appeal_success", "days_in_ar", "charge_lag", "documentation_to_claim_time",
  "coding_completeness", "prior_auth_turnaround", "eligibility_verification",
  "estimate_accuracy", "pos_collection", "uncompensated_care", "payment_variance",
  "refund_time", "resubmission_rate", "payer_response_time", "financial_complaints",
] as const;
export const REVENUE_SAFEGUARDS = [
  "no_care_denial_from_dashboard_score",
  "separate_clinical_and_financial_access_decisions",
  "monitor_auth_related_care_delays",
  "track_denial_and_auth_disparities",
  "flag_billing_rule_documentation_burden",
  "no_automated_coding_invention",
  "review_for_high_impact_claim_changes",
  "understandable_patient_estimates",
] as const;

// ── Health equity ─────────────────────────────────────────────────────
export const EQUITY_STRATIFIERS = [
  "race_ethnicity", "language", "disability", "sex_gender",
  "sexual_orientation_consented", "age", "geography", "rurality",
  "insurance", "socioeconomic_indicators", "digital_access",
  "transportation", "housing_food_insecurity",
] as const;
export const EQUITY_MEASURES = [
  "access_wait", "no_show_rate", "referral_completion", "care_gap_closure",
  "medication_affordability", "rpm_enrollment", "engagement", "readmissions",
  "experience", "interpreter_utilization", "accessibility_accommodation",
  "portal_usability", "alert_model_performance", "denials_and_auth",
  "outcomes_by_subgroup",
] as const;
export const EQUITY_SAFEGUARDS = [
  "suppress_small_identifiable_groups",
  "avoid_deficit_framing",
  "absolute_and_relative_differences",
  "intersectional_where_sample_permits",
  "display_missing_data_rates",
  "documentation_gap_vs_true_absence",
  "patient_community_interpretation",
  "assign_action_owner",
  "track_intervention_impact",
  "never_use_protected_attributes_to_deny_or_ration",
] as const;
export const EQUITY_WORKFLOW = [
  "observed_disparity", "data_quality_check", "root_cause_hypotheses",
  "community_or_patient_review", "intervention", "follow_up_measurement",
  "equity_impact_assessment",
] as const;

export interface DisparityInput { referenceRate: number; groupRate: number; groupN: number }
export function disparityGaps(d: DisparityInput): { absolute: number; relative: number; suppressed: boolean } {
  if (d.groupN < 11) return { absolute: 0, relative: 0, suppressed: true };
  const absolute = Math.round((d.groupRate - d.referenceRate) * 1000) / 1000;
  const relative = d.referenceRate === 0 ? 0 : Math.round((d.groupRate / d.referenceRate) * 100) / 100;
  return { absolute, relative, suppressed: false };
}

// ── Model safety dashboard ────────────────────────────────────────────
export const MODEL_INVENTORY_FIELDS = [
  "model_name", "version", "owner", "intended_use", "prohibited_use",
  "population", "data_sources", "training_period", "validation_cohort",
  "deployment_sites", "clinical_workflow", "human_decision_maker",
  "risk_classification", "approval_status", "expiration_or_review_date",
] as const;
export const MODEL_PERFORMANCE_MEASURES = [
  "discrimination", "calibration", "sensitivity", "specificity", "ppv", "npv",
  "false_negative_rate", "false_positive_rate", "calibration_by_subgroup",
  "performance_by_site", "performance_by_language", "performance_by_device",
  "data_drift", "concept_drift", "missingness_drift", "referral_or_intervention_rate",
  "clinician_override", "patient_outcomes", "harm_signals", "near_misses", "time_saved_or_added",
] as const;
export const MODEL_SAFETY_MEASURES = [
  "unsafe_recommendation_rate", "hallucination_rate", "override_reason",
  "automation_bias_indicators", "disagreement_cases", "delayed_escalation",
  "missed_deterioration", "privacy_incidents", "data_leakage", "prompt_injection",
  "out_of_distribution_inputs", "stale_model_use", "unreviewed_output",
  "model_induced_documentation_errors",
] as const;

export const modelRegistrationSchema = z.object({
  modelId: z.string().min(1).default(""),
  modelName: z.string().min(1),
  version: z.string().default("1.0"),
  owner: z.string().default(""),
  intendedUse: z.string().default(""),
  prohibitedUse: z.array(z.string()).default([]),
  population: z.string().default(""),
  dataSources: z.array(z.string()).default([]),
  trainingPeriod: z.string().default(""),
  deploymentSites: z.array(z.string()).default([]),
  clinicalWorkflow: z.string().default(""),
  humanDecisionMaker: z.string().default(""),
  riskClassification: z.string().default(""),
  approvalStatus: z.enum(["DRAFT", "APPROVED", "SUSPENDED", "RETIRED"]).default("DRAFT"),
  reviewDate: z.coerce.date().optional(),
});

export function modelSafetyGate(input: { calibrationError: number; subgroupGap: number; harmSignals: number; unreviewedOutputRate: number }): { action: "operate" | "narrow" | "suspend"; reasons: string[] } {
  const reasons: string[] = [];
  if (input.calibrationError > 0.05) reasons.push("calibration_error_above_0.05");
  if (input.subgroupGap > 0.1) reasons.push("subgroup_gap_above_0.10");
  if (input.harmSignals > 0) reasons.push("active_harm_signals");
  if (input.unreviewedOutputRate > 0.05) reasons.push("unreviewed_output_above_5pct");
  if (reasons.length >= 2 || input.harmSignals > 0) return { action: "suspend", reasons };
  if (reasons.length === 1) return { action: "narrow", reasons };
  return { action: "operate", reasons: [] };
}

// ── Attribution and fairness ──────────────────────────────────────────
export const ATTRIBUTION_ROLES = [
  "rendering_provider", "ordering_provider", "responsible_clinician",
  "supervising_clinician", "team_or_clinic", "referral_originator",
  "receiving_organization", "episode_owner", "coverage_provider", "shared_care",
] as const;
export const ATTRIBUTION_VIEWS = [
  "individual", "team", "organization", "risk_adjusted_benchmark",
  "peer_distribution", "confidence_interval", "case_mix_context", "data_completeness_warning",
] as const;

export const attributionSchema = z.object({
  eventType: z.enum(["readmission", "no_show", "referral_leakage", "care_gap", "med_event", "other"]).default("other"),
  roles: z.array(z.enum(ATTRIBUTION_ROLES)).min(1),
  primaryRole: z.enum(ATTRIBUTION_ROLES),
  sharedCare: z.boolean().default(false),
  systemConstraintNoted: z.string().default(""),
});

// Never attribute a multi-team outcome to one clinician without noting
// shared accountability and system constraints.
export function attributionFairnessCheck(a: z.infer<typeof attributionSchema>): { fair: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if ((a.eventType === "readmission" || a.eventType === "referral_leakage") && !a.sharedCare && a.roles.length < 2) {
    warnings.push("multi_team_outcome_attributed_to_single_role — add shared-care attribution");
  }
  if (!a.systemConstraintNoted) warnings.push("system_constraints_not_documented — distinguish constraints from individual performance");
  return { fair: warnings.length === 0, warnings };
}

// ── Action queues — dashboards manage, not just report ────────────────
export const ACTION_QUEUE_FLOW = [
  "threshold_exceeded", "population_identified", "data_validated", "owner_assigned",
  "work_queue_created", "intervention_executed", "disposition_recorded",
  "remeasured", "closed_or_escalated",
] as const;
export const ACTION_QUEUE_EXAMPLES = [
  "access_threshold_waiters", "unacknowledged_referrals", "open_care_gaps",
  "high_risk_refill_gaps", "unreviewed_critical_results", "rpm_missing_data",
  "excessive_low_value_alerts", "correctable_denials", "disparity_affected_patients",
  "model_outputs_outside_safety_bounds",
] as const;

export const thresholdSchema = z.object({
  thresholdId: z.string().min(1).default(""),
  metric: z.string().min(1),
  warningThreshold: z.coerce.number(),
  criticalThreshold: z.coerce.number(),
  measurementWindow: z.string().default("7_days"),
  minimumVolume: z.coerce.number().int().min(1).default(30),
  comparison: z.string().default("baseline_and_target"),
  owner: z.string().default(""),
  action: z.string().default("create_improvement_queue"),
  reviewInterval: z.string().default("weekly"),
  hysteresisBand: z.coerce.number().min(0).default(0.02),
});

export interface ThresholdState { currentValue: number; previousState: "normal" | "warning" | "critical" }
// Hysteresis prevents oscillation around a boundary.
export function evaluateThreshold(t: z.infer<typeof thresholdSchema>, s: ThresholdState): "normal" | "warning" | "critical" {
  const h = t.hysteresisBand;
  if (s.currentValue >= t.criticalThreshold + (s.previousState === "critical" ? -h : 0)) return "critical";
  if (s.currentValue >= t.warningThreshold + (s.previousState === "warning" ? -h : 0)) return "warning";
  return "normal";
}

// ── Data quality / denominator controls ───────────────────────────────
export const DENOMINATOR_QUALITY_FIELDS = [
  "records_expected", "records_received", "missingness", "exclusions",
  "unknown_category", "duplicate_events", "attribution_failures",
  "stale_source_data", "unlinked_encounters", "unresolved_identity",
  "terminology_gaps", "date_completeness",
] as const;

export function denominatorShrinkageFlag(previous: number, current: number, tolerance = 0.05): string | null {
  if (previous <= 0) return null;
  const drop = (previous - current) / previous;
  if (drop > tolerance) {
    return `Denominator shrank ${(drop * 100).toFixed(1)}% — improvement may reflect missing poor outcomes, not better care. Investigate exclusions before celebrating.`;
  }
  return null;
}

// ── Dashboard security ────────────────────────────────────────────────
export const PROVIDER_DASHBOARD_CONTROLS = [
  "role_based_access", "purpose_limitation", "minimum_necessary_display",
  "small_cell_suppression", "clinician_privacy_controls", "patient_deidentification",
  "export_audit", "restricted_financial_data", "sensitive_subgroup_protections",
  "research_separation", "model_access_controls", "time_limited_downloads",
] as const;

// ── In-memory fallbacks (pre-migration) ───────────────────────────────
interface StoredRow extends Record<string, unknown> { id: string; workspaceId: string }
const memMetrics = new Map<string, StoredRow[]>();
const memObservations = new Map<string, StoredRow[]>();
const memQueues = new Map<string, StoredRow[]>();
const memModels = new Map<string, StoredRow[]>();
const memModelReadings = new Map<string, StoredRow[]>();
const memEquityReviews = new Map<string, StoredRow[]>();
const memThresholds = new Map<string, StoredRow[]>();

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
function memList(m: Map<string, StoredRow[]>, ws: string): StoredRow[] { return m.get(ws) ?? []; }
function memPush(m: Map<string, StoredRow[]>, ws: string, row: StoredRow) { m.set(ws, [...(m.get(ws) ?? []), row]); }

type ProviderTables = {
  healthProviderMetric: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; findFirst: (a: unknown) => Promise<never | null>; update: (a: unknown) => Promise<never> };
  healthProviderObservation: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthProviderActionQueue: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthProviderModel: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthProviderModelReading: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthProviderEquityReview: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
};

// ── Provider and Organization Intelligence Plane ──────────────────────
export class ProviderIntelligencePlane {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health`);
  }
  private audit(action: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType: "ProviderArtifact", targetId, metadata: meta }).catch(() => null);
  }

  // ── Metric registry — versioned, governed definitions ────────────
  async registerMetric(input: MetricDefinitionInput) {
    await this.assert("CREATE");
    const parsed = metricDefinitionSchema.parse({ ...input, metricId: input.metricId || `metric-${crypto.randomUUID().slice(0, 8)}` });
    const missingContext = METRIC_DISPLAY_FIELDS.filter((f) => {
      const v = (parsed as unknown as Record<string, unknown>)[fieldToKey(f)];
      return v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
    });
    const row = await safe(
      () => (prisma as unknown as ProviderTables).healthProviderMetric.create({
        data: {
          workspaceId: this.workspaceId, metricId: parsed.metricId, name: parsed.name,
          definition: parsed.definition, population: parsed.population, numerator: parsed.numerator,
          denominator: parsed.denominator, aggregation: parsed.aggregation, attribution: parsed.attribution,
          exclusions: parsed.exclusions, stratifications: parsed.stratifications, refresh: parsed.refresh,
          owner: parsed.owner, actionOwner: parsed.actionOwner, version: parsed.version,
          qualityStatus: parsed.qualityStatus, observationPeriod: parsed.observationPeriod,
          dataSources: parsed.dataSources, dataCompleteness: parsed.dataCompleteness,
          riskAdjustmentMethod: parsed.riskAdjustmentMethod, comparisonBaseline: parsed.comparisonBaseline,
          suppressionRule: parsed.suppressionRule, caveats: parsed.caveats, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.metricId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memMetrics, this.workspaceId, stored);
    await this.audit("providers.metric.registered", parsed.metricId, { version: parsed.version, qualityStatus: parsed.qualityStatus });
    return { ...((row as unknown as Record<string, unknown> | null) ?? stored), displayContract: [...METRIC_DISPLAY_FIELDS], incompleteContext: missingContext };
  }

  async reviseMetric(metricId: string, patch: Partial<MetricDefinitionInput> & { version: string }) {
    await this.assert("UPDATE");
    const all = await this.listMetrics();
    const found = (all as Array<Record<string, unknown>>).find((m) => m.metricId === metricId || m.id === metricId);
    if (!found) throw new Error("Metric not found");
    const warning = denominatorChangeWarning(
      { version: String(found.version), denominator: String(found.denominator) },
      { version: patch.version, denominator: patch.denominator ?? String(found.denominator) },
    );
    await safe(() => (prisma as unknown as ProviderTables).healthProviderMetric.update({ where: { metricId }, data: { ...patch } }) as Promise<never>, null);
    Object.assign(found, patch);
    await this.audit("providers.metric.revised", metricId, { version: patch.version, denominatorChanged: warning !== null });
    return { metricId, version: patch.version, denominatorWarning: warning };
  }

  async listMetrics(status?: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as ProviderTables).healthProviderMetric.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 200 }) as Promise<never[]>,
      [],
    );
    const all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memMetrics, this.workspaceId);
    return status ? all.filter((m) => (m as Record<string, unknown>).qualityStatus === status) : all;
  }

  // ── Observations — metric values with quality envelope ────────────
  async recordObservation(input: { metricId: string; numerator: number; denominator: number; stratum?: Record<string, string>; riskAdjusted?: number | null; ciLower?: number | null; ciUpper?: number | null; quality?: Record<string, number>; attribution?: string }) {
    await this.assert("CREATE");
    if (input.denominator < 11) {
      await this.audit("providers.observation.suppressed", input.metricId, { denominator: input.denominator });
      return { suppressed: true as const, reason: "small_cell_suppression", metricId: input.metricId };
    }
    const rate = input.denominator === 0 ? 0 : Math.round((input.numerator / input.denominator) * 10000) / 10000;
    // Unadjusted values are never rankable alone.
    const rankable = input.riskAdjusted !== undefined && input.riskAdjusted !== null;
    const id = `obs-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ProviderTables).healthProviderObservation.create({
        data: {
          workspaceId: this.workspaceId, observationId: id, metricId: input.metricId,
          numerator: input.numerator, denominator: input.denominator, rate,
          stratum: input.stratum ?? {}, riskAdjusted: input.riskAdjusted ?? null,
          ciLower: input.ciLower ?? null, ciUpper: input.ciUpper ?? null,
          quality: input.quality ?? {}, attribution: input.attribution ?? "", createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, metricId: input.metricId, numerator: input.numerator, denominator: input.denominator, rate, riskAdjusted: input.riskAdjusted ?? null };
    if (!row) memPush(memObservations, this.workspaceId, stored);
    await this.audit("providers.observation.recorded", id, { metricId: input.metricId, rate, rankable });
    return { observationId: id, rate, rankable, rankingWarning: rankable ? null : "Unadjusted outcome — contextualize with case mix, completeness, and CI. Never rank on this alone." };
  }

  async listObservations(metricId?: string, take = 100) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as ProviderTables).healthProviderObservation.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take }) as Promise<never[]>,
      [],
    );
    const all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memObservations, this.workspaceId).slice(-take).reverse();
    return metricId ? all.filter((o) => (o as Record<string, unknown>).metricId === metricId) : all;
  }

  // ── Funnel + gap + adherence + transition recorders ───────────────
  async recordFunnel(input: { funnel: "access" | "referral" | "rpm" | "care_gap"; stage: string; entered: number; completed: number; leakageCause?: string; stratum?: Record<string, string> }) {
    await this.assert("CREATE");
    const conv = funnelConversion(input.entered, input.completed);
    if (conv.suppressed) {
      await this.audit("providers.funnel.suppressed", input.stage, { funnel: input.funnel });
      return { suppressed: true as const, reason: "small_cell_suppression" };
    }
    if (input.funnel === "referral" && input.leakageCause && !(LEAKAGE_CAUSES as readonly string[]).includes(input.leakageCause)) {
      throw new Error(`Unknown leakage cause: ${input.leakageCause} — expose the actionable cause, not a generic leak label`);
    }
    await this.audit("providers.funnel.recorded", input.stage, { funnel: input.funnel, rate: conv.rate });
    return { funnel: input.funnel, stage: input.stage, conversionRate: conv.rate, leakageCause: input.leakageCause ?? null };
  }

  async recordGapClosure(input: { gapId: string; state: string; interventionType?: string }) {
    await this.assert("CREATE");
    const closure = gapClosureState(input.state);
    await this.audit("providers.gap.recorded", input.gapId, { state: input.state, closed: closure.closed });
    return { gapId: input.gapId, ...closure };
  }

  // ── Thresholds with hysteresis + action queues ────────────────────
  async upsertThreshold(input: z.infer<typeof thresholdSchema>) {
    await this.assert("CREATE");
    const parsed = thresholdSchema.parse({ ...input, thresholdId: input.thresholdId || `thr-${crypto.randomUUID().slice(0, 8)}` });
    const stored: StoredRow = { id: parsed.thresholdId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    const existing = memList(memThresholds, this.workspaceId).findIndex((t) => t.id === parsed.thresholdId);
    if (existing >= 0) memList(memThresholds, this.workspaceId)[existing] = stored;
    else memPush(memThresholds, this.workspaceId, stored);
    await this.audit("providers.threshold.upserted", parsed.thresholdId, { metric: parsed.metric });
    return parsed;
  }

  async evaluateMetric(metric: string, value: number, volume: number, previousState: ThresholdState["previousState"] = "normal") {
    await this.assert("READ");
    const thresholds = memList(memThresholds, this.workspaceId).filter((t) => t.metric === metric);
    if (thresholds.length === 0) return { metric, state: "normal" as const, note: "no threshold configured" };
    const t = thresholds[0]! as unknown as z.infer<typeof thresholdSchema>;
    if (volume < t.minimumVolume) return { metric, state: "normal" as const, note: `below minimum volume ${t.minimumVolume} — no alert` };
    const state = evaluateThreshold(t, { currentValue: value, previousState });
    if (state !== "normal") {
      return { metric, state, queue: await this.openActionQueue({ metric, reason: `${state}_threshold_exceeded`, owner: t.owner }) };
    }
    return { metric, state };
  }

  async openActionQueue(input: { metric: string; reason: string; owner: string; populationRef?: string }) {
    await this.assert("CREATE");
    const id = `queue-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ProviderTables).healthProviderActionQueue.create({
        data: {
          workspaceId: this.workspaceId, queueId: id, metric: input.metric,
          reason: input.reason, owner: input.owner, populationRef: input.populationRef ?? "",
          status: "OPEN", flow: [...ACTION_QUEUE_FLOW], createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, status: "OPEN" };
    if (!row) memPush(memQueues, this.workspaceId, stored);
    await this.audit("providers.queue.opened", id, { metric: input.metric, owner: input.owner });
    return { queueId: id, flow: [...ACTION_QUEUE_FLOW], status: "OPEN" as const };
  }

  async advanceQueue(queueId: string, to: string, disposition?: string) {
    await this.assert("UPDATE");
    const valid = ["OPEN", "VALIDATED", "ASSIGNED", "IN_PROGRESS", "REMEASURED", "CLOSED", "ESCALATED"];
    if (!valid.includes(to)) throw new Error(`Invalid queue state: ${to}`);
    await safe(() => (prisma as unknown as ProviderTables).healthProviderActionQueue.update({ where: { queueId }, data: { status: to, disposition: disposition ?? null } }) as Promise<never>, null);
    const found = memList(memQueues, this.workspaceId).find((q) => q.id === queueId);
    if (found) { found.status = to; if (disposition) found.disposition = disposition; }
    await this.audit("providers.queue.advanced", queueId, { to });
    return { queueId, status: to };
  }

  async listQueues(status?: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as ProviderTables).healthProviderActionQueue.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }) as Promise<never[]>,
      [],
    );
    const all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memQueues, this.workspaceId);
    return status ? all.filter((q) => (q as Record<string, unknown>).status === status) : all;
  }

  // ── Attribution checks ────────────────────────────────────────────
  checkAttribution(input: z.infer<typeof attributionSchema>) {
    return attributionFairnessCheck(attributionSchema.parse(input));
  }

  // ── Equity reviews — disparity to impact assessment ───────────────
  async recordEquityReview(input: { disparity: string; stratifiers: string[]; gaps: { absolute: number; relative: number; suppressed: boolean }; stage?: string; owner?: string; intervention?: string }) {
    await this.assert("CREATE");
    const stage = input.stage ?? "observed_disparity";
    if (!(EQUITY_WORKFLOW as readonly string[]).includes(stage)) throw new Error(`Unknown equity stage: ${stage}`);
    for (const s of input.stratifiers) {
      if (!(EQUITY_STRATIFIERS as readonly string[]).includes(s)) throw new Error(`Ungoverned stratifier: ${s}`);
    }
    const id = `eq-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ProviderTables).healthProviderEquityReview.create({
        data: {
          workspaceId: this.workspaceId, reviewId: id, disparity: input.disparity,
          stratifiers: input.stratifiers, gaps: input.gaps, stage,
          owner: input.owner ?? "", intervention: input.intervention ?? "", createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, stage };
    if (!row) memPush(memEquityReviews, this.workspaceId, stored);
    await this.audit("providers.equity.reviewed", id, { disparity: input.disparity, stage });
    return { reviewId: id, workflow: [...EQUITY_WORKFLOW], safeguards: [...EQUITY_SAFEGUARDS], ...((row as unknown as Record<string, unknown> | null) ?? stored) };
  }

  async advanceEquityReview(reviewId: string, to: string) {
    await this.assert("UPDATE");
    const idx = EQUITY_WORKFLOW.indexOf(to as (typeof EQUITY_WORKFLOW)[number]);
    if (idx < 0) throw new Error(`Unknown equity stage: ${to}`);
    await safe(() => (prisma as unknown as ProviderTables).healthProviderEquityReview.update({ where: { reviewId }, data: { stage: to } }) as Promise<never>, null);
    const found = memList(memEquityReviews, this.workspaceId).find((r) => r.id === reviewId);
    if (found) found.stage = to;
    await this.audit("providers.equity.advanced", reviewId, { to });
    return { reviewId, stage: to };
  }

  // ── Model registry + safety readings ──────────────────────────────
  async registerModel(input: z.infer<typeof modelRegistrationSchema>) {
    await this.assert("CREATE");
    const parsed = modelRegistrationSchema.parse({ ...input, modelId: input.modelId || `model-${crypto.randomUUID().slice(0, 8)}` });
    const row = await safe(
      () => (prisma as unknown as ProviderTables).healthProviderModel.create({
        data: {
          workspaceId: this.workspaceId, modelId: parsed.modelId, modelName: parsed.modelName,
          version: parsed.version, owner: parsed.owner, intendedUse: parsed.intendedUse,
          prohibitedUse: parsed.prohibitedUse, population: parsed.population,
          dataSources: parsed.dataSources, trainingPeriod: parsed.trainingPeriod,
          deploymentSites: parsed.deploymentSites, clinicalWorkflow: parsed.clinicalWorkflow,
          humanDecisionMaker: parsed.humanDecisionMaker, riskClassification: parsed.riskClassification,
          approvalStatus: parsed.approvalStatus, reviewDate: parsed.reviewDate ?? null, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.modelId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memModels, this.workspaceId, stored);
    await this.audit("providers.model.registered", parsed.modelId, { approvalStatus: parsed.approvalStatus });
    return { ...((row as unknown as Record<string, unknown> | null) ?? stored), inventory: [...MODEL_INVENTORY_FIELDS] };
  }

  async recordModelReading(input: { modelId: string; calibrationError: number; subgroupGap: number; harmSignals: number; unreviewedOutputRate: number; discrimination?: number; overrideRate?: number; drift?: Record<string, number> }) {
    await this.assert("CREATE");
    const gate = modelSafetyGate(input);
    const id = `mrd-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ProviderTables).healthProviderModelReading.create({
        data: {
          workspaceId: this.workspaceId, readingId: id, modelId: input.modelId,
          calibrationError: input.calibrationError, subgroupGap: input.subgroupGap,
          harmSignals: input.harmSignals, unreviewedOutputRate: input.unreviewedOutputRate,
          discrimination: input.discrimination ?? null, overrideRate: input.overrideRate ?? null,
          drift: input.drift ?? {}, gateAction: gate.action, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    if (gate.action === "suspend") {
      await safe(() => (prisma as unknown as ProviderTables).healthProviderModel.update({ where: { modelId: input.modelId }, data: { approvalStatus: "SUSPENDED" } }) as Promise<never>, null);
      const found = memList(memModels, this.workspaceId).find((m) => m.id === input.modelId);
      if (found) found.approvalStatus = "SUSPENDED";
    }
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, gateAction: gate.action };
    if (!row) memPush(memModelReadings, this.workspaceId, stored);
    await this.audit("providers.model.reading", id, { modelId: input.modelId, gateAction: gate.action });
    return { readingId: id, gate, performanceMeasures: [...MODEL_PERFORMANCE_MEASURES], safetyMeasures: [...MODEL_SAFETY_MEASURES] };
  }

  async listModels(status?: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as ProviderTables).healthProviderModel.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }) as Promise<never[]>,
      [],
    );
    const all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memModels, this.workspaceId);
    return status ? all.filter((m) => (m as Record<string, unknown>).approvalStatus === status) : all;
  }

  // ── Role dashboards ───────────────────────────────────────────────
  async dashboard(audience: string) {
    await this.assert("READ");
    if (!(DASHBOARD_AUDIENCES as readonly string[]).includes(audience)) throw new Error(`Unknown dashboard audience: ${audience}`);
    const [metrics, observations, queues, models] = await Promise.all([
      this.listMetrics(), this.listObservations(undefined, 200), this.listQueues("OPEN"), this.listModels(),
    ]);
    const openQueues = (queues as Array<Record<string, unknown>>).length;
    const suspendedModels = (models as Array<Record<string, unknown>>).filter((m) => m.approvalStatus === "SUSPENDED").length;
    const suppressedObs = (observations as Array<Record<string, unknown>>).filter((o) => o.suppressed === true).length;
    return {
      audience,
      version: PROVIDER_ANALYTICS_VERSION,
      tiles: audience === "executive" ? [...EXECUTIVE_TILES] : undefined,
      tileDetail: audience === "executive" ? EXECUTIVE_TILE_DETAIL : undefined,
      metrics: (metrics as unknown[]).length,
      observations: (observations as unknown[]).length,
      suppressedObservations: suppressedObs,
      openActionQueues: openQueues,
      suspendedModels,
      controls: [...PROVIDER_DASHBOARD_CONTROLS],
      rankingPolicy: "Unadjusted outcomes never rank alone — risk adjustment, case mix, completeness, CI, and attribution required.",
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Improvement effectiveness — did the intervention work? ─────────
  async interventionEffectiveness(metricId: string, before: { rate: number; denominator: number }, after: { rate: number; denominator: number }) {
    await this.assert("READ");
    const denomFlag = denominatorShrinkageFlag(before.denominator, after.denominator);
    const delta = Math.round((after.rate - before.rate) * 10000) / 10000;
    await this.audit("providers.effectiveness.measured", metricId, { delta });
    return { metricId, delta, denominatorWarning: denomFlag, verdict: denomFlag ? "inconclusive_check_denominator" : delta > 0 ? "improved" : delta < 0 ? "worsened" : "unchanged" };
  }
}

// Map display-contract field names to schema keys for completeness checks.
function fieldToKey(field: string): string {
  const map: Record<string, string> = {
    numerator: "numerator", denominator: "denominator",
    inclusion_criteria: "population", exclusion_criteria: "exclusions",
    observation_period: "observationPeriod", attribution_rule: "attribution",
    data_sources: "dataSources", data_completeness: "dataCompleteness",
    risk_adjustment_method: "riskAdjustmentMethod", comparison_baseline: "comparisonBaseline",
    confidence_interval: "dataCompleteness", suppression_rule: "suppressionRule",
    last_refresh: "refresh", metric_owner: "owner", action_owner: "actionOwner", caveats: "caveats",
  };
  return map[field] ?? field;
}

// ── Static reference exports ──────────────────────────────────────────
export const PROVIDER_API = [
  "registerMetric", "reviseMetric", "listMetrics",
  "recordObservation", "listObservations",
  "recordFunnel", "recordGapClosure",
  "upsertThreshold", "evaluateMetric",
  "openActionQueue", "advanceQueue", "listQueues",
  "checkAttribution",
  "recordEquityReview", "advanceEquityReview",
  "registerModel", "recordModelReading", "listModels",
  "dashboard", "interventionEffectiveness",
] as const;
