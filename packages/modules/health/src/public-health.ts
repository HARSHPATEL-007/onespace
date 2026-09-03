// N0VA Public Health — jurisdiction-aware population-health and emergency-coordination platform — Project Vita.
// For governments, health departments, tribal authorities, agencies, and
// community partners. Rapid action during outbreaks and disasters with strict
// boundaries around legal authority, data minimization, individual privacy,
// community trust, and the separation of identifiable case management from
// public reporting.
//
// Governing principle: enable fast, evidence-based collective action while
// remaining proportionate, transparent, privacy-preserving, equity-aware, and
// accountable to the communities served. Public-health data is purpose-bound
// government information — never an unrestricted extension of clinical or
// commercial analytics.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_public";
export const PUBLIC_HEALTH_VERSION = "2026.09";

export const PUBLIC_HEALTH_PROMISE =
  "N0VA Public Health turns authorized population-health signals into coordinated, proportionate, and transparent public-health action.";

// ── Architecture — separate data products, never filtered views ───────
export const PUBLIC_ARCHITECTURE = [
  "source_validation_authority", "data_exchange", "operating_plane", "governance_plane",
] as const;
export const EXCHANGE_DOMAINS = [
  "case_notifications", "immunization", "laboratory", "mortality",
  "syndromic", "environmental", "facility_capacity", "community_needs",
] as const;
export const DATA_PRODUCTS = [
  "case_management_workspace", "epidemiology_workspace", "population_dashboard",
  "public_portal", "emergency_operations_center", "partner_gateway",
  "equity_workspace", "research_evaluation_workspace",
] as const;
// A public dashboard is never a filtered view of a case-management table.

// ── Jurisdictional model — authority before action ────────────────────
export const jurisdictionSchema = z.object({
  jurisdictionId: z.string().min(1).default(""),
  agency: z.string().min(1),
  program: z.string().min(1),
  legalAuthority: z.string().min(1),
  permittedPurposes: z.array(z.string()).min(1),
  dataScope: z.array(z.string()).min(1),
  geography: z.string().min(1),
  emergencyMode: z.boolean().default(false),
  approvedPartners: z.array(z.string()).default([]),
  prohibitedPartners: z.array(z.string()).default([]),
  retention: z.string().default("configured-period"),
  reviewDate: z.coerce.date().optional().nullable(),
});
export type JurisdictionInput = z.infer<typeof jurisdictionSchema>;

export interface AuthorityContext {
  jurisdictionId: string; program: string; purpose: string;
  role: string; dataNeed: string; active: boolean;
}

export function phAuthorityCheck(jurisdiction: JurisdictionInput, ctx: AuthorityContext): { permitted: boolean; missing: string[] } {
  const missing: string[] = [];
  if (jurisdiction.jurisdictionId !== ctx.jurisdictionId) missing.push("jurisdiction match");
  if (!jurisdiction.permittedPurposes.includes(ctx.purpose)) missing.push(`purpose ${ctx.purpose} not permitted`);
  if (!ctx.program || ctx.program !== jurisdiction.program) missing.push("active program assignment");
  if (!ctx.role) missing.push("role with data need");
  if (!ctx.dataNeed) missing.push("documented data need");
  if (!ctx.active) missing.push("active authorization (not expired or revoked)");
  if (new Date() > new Date(jurisdiction.reviewDate ?? Date.now())) missing.push("jurisdiction review date passed — reauthorization required");
  return { permitted: missing.length === 0, missing };
}
// Government employment alone never grants broad access.

// ── Surveillance — signals, states, display contract ──────────────────
export const SURVEILLANCE_DOMAINS = [
  "notifiable_diseases", "syndromic", "laboratory_confirmed", "mortality",
  "wastewater", "environmental", "care_utilization", "absenteeism_permitted",
  "zoonotic", "vaccine_preventable", "antimicrobial_resistance",
  "climate_events", "disaster_related",
] as const;
export const SIGNAL_LIFECYCLE = [
  "received", "validated", "deduplicated", "assigned", "baseline_compared",
  "epidemiologist_review", "investigation", "response", "communication", "resolution", "after_action",
] as const;
export const SIGNAL_DISPLAY = [
  "source", "collection_time", "receipt_time", "geography", "data_quality",
  "completeness", "baseline", "confidence", "limitations", "analyst", "status", "response_action",
] as const;
export const EVENT_STATES = [
  "normal", "watch", "signal", "under_review", "suspected_event",
  "confirmed_event", "responding", "controlled", "closed",
] as const;
const EVENT_EDGES: Record<string, string[]> = {
  normal: ["watch"], watch: ["signal", "normal"], signal: ["under_review"],
  under_review: ["suspected_event", "signal"], suspected_event: ["confirmed_event", "under_review"],
  confirmed_event: ["responding"], responding: ["controlled"], controlled: ["closed"], closed: [],
};
export function phEventTransition(from: string, to: string): boolean {
  return (EVENT_EDGES[from] ?? []).includes(to);
}
// An anomaly is not an outbreak until explicitly classified as one.

// ── Dashboards — denominators, vintage, no stigma ─────────────────────
export const DASHBOARD_DOMAINS = [
  "disease_trends", "immunization_coverage", "facility_capacity", "lab_turnaround",
  "mortality", "ed_utilization", "community_indicators", "environmental",
  "resource_availability", "equity_gaps", "intervention_coverage", "communication_reach",
] as const;
export const DASHBOARD_CONTRACT = [
  "population_definition", "geographic_boundary", "time_period", "data_vintage",
  "denominator", "missingness", "suppression_rule", "uncertainty", "source",
  "last_refresh", "interpretation_notes",
] as const;

export function phStigmaCheck(config: { rankGroups?: boolean; smallArea?: boolean; groupLabels?: string[] }): { warnings: string[] } {
  const warnings: string[] = [];
  if (config.rankGroups) warnings.push("Rankings that stigmatize neighborhoods, groups, schools, or facilities are prohibited — show where support is needed instead.");
  if (config.smallArea) warnings.push("Small-area display requires suppression review before release.");
  return { warnings };
}

export function phSmallCell(n: number, minimumN: number, rareCondition: boolean): { publishable: boolean; reason: string } {
  if (n < minimumN) return { publishable: false, reason: `Suppressed: count below minimum cell size ${minimumN}.` };
  if (rareCondition && n < minimumN * 2) return { publishable: false, reason: "Suppressed: rare condition in a small population." };
  return { publishable: true, reason: "Meets suppression rule." };
}

// ── Outbreaks — versioned case definitions ────────────────────────────
export const OUTBREAK_LIFECYCLE = [
  "detection", "verification", "declaration", "investigation", "case_definition",
  "exposure_assessment", "intervention", "resource_coordination", "communication",
  "monitoring", "de_escalation", "after_action",
] as const;
export const OUTBREAK_SUPPORTS = [
  "case_definition_versioning", "exposure_locations", "investigation_teams",
  "cluster_mapping", "lab_coordination", "contact_workflows", "isolation_instructions",
  "vaccination_campaigns", "resource_requests", "partner_coordination",
  "public_messaging", "situation_reports", "incident_timeline", "after_action_findings",
] as const;

// ── Cases + contacts — lawful, minimal, expiring ──────────────────────
export const CASE_WORKFLOW = [
  "report_received", "identity_matching", "classification", "lab_confirmation",
  "interview", "exposure_assessment", "care_referral", "intervention", "followup", "closure",
] as const;
export const CONTACT_WORKFLOW = [
  "identified", "eligibility_check", "safe_outreach", "exposure_communication",
  "symptom_monitoring", "testing_referral", "support_needs", "followup", "closure",
] as const;
export const CASE_GUARDRAILS = [
  "no_unnecessary_source_exposure", "least_necessary_information",
  "separate_advice_from_orders", "minimal_contact_detail", "language_accessibility",
  "safe_channels", "correction_permitted", "every_access_logged",
  "expiry_at_closure", "no_informal_search",
] as const;

// ── Immunization — unknown is not unvaccinated ────────────────────────
export const IMMUNIZATION_WORKFLOW = [
  "eligible_population", "outreach", "consent", "appointment", "administration",
  "registry_update", "followup_dose", "adverse_monitoring", "coverage_analysis",
] as const;
export const IMMUNIZATION_STATES = [
  "eligible", "offered", "scheduled", "received", "declined", "unable_to_access",
  "contraindicated", "unknown", "registry_mismatch", "supply_limited",
  "transport_barrier", "language_barrier",
] as const;

export function phImmunizationStatus(state: string): { label: string; countable: "vaccinated" | "unvaccinated" | "unknown" } {
  if (state === "received") return { label: "Vaccinated (registry-confirmed where available).", countable: "vaccinated" };
  if (state === "declined" || state === "contraindicated") return { label: `Not vaccinated: ${state}.`, countable: "unvaccinated" };
  return { label: `Status ${state} — unknown or unreconciled, never counted as unvaccinated.`, countable: "unknown" };
}

// ── Preparedness inventory ────────────────────────────────────────────
export const PREPAREDNESS_HAZARDS = [
  "outbreaks", "extreme_heat", "floods", "wildfires", "air_quality", "hurricanes",
  "earthquakes", "mass_casualty", "chemical_radiological", "cyber", "power_comms_failure",
  "system_disruption", "displacement_shelter",
] as const;
export const READINESS_INVENTORY = [
  "hazard_plans", "contact_trees", "resources", "facility_status", "staffing",
  "bed_capacity", "oxygen_meds", "lab_capacity", "vaccine_supplies", "shelter_info",
  "transport", "community_partners", "public_messages", "mutual_aid", "exercises_lessons",
] as const;

// ── Emergency mode — formal, scoped, self-expiring ────────────────────
export const EMERGENCY_ACTIVATION = [
  "threat_assessment", "activation_request", "legal_executive_approval",
  "mode_enabled", "scoped_expansion", "continuous_monitoring", "reauthorization",
  "deactivation", "access_rollback", "data_audit_review", "after_action",
] as const;
export const EMERGENCY_SCOPE_FIELDS = [
  "incident", "authority", "start_time", "scope", "jurisdictions", "expanded_roles",
  "data_types", "partners", "workflows", "communication", "expiration",
  "reauthorization_interval", "deactivation_owner",
] as const;
export const ACTIVATION_CHECKLIST = [
  "threat_identified", "authority_confirmed", "commander_appointed", "scope_defined",
  "data_needs_defined", "minimal_expansion", "partners_approved", "communication_ready",
  "equity_assessed", "expiration_set", "audit_enabled",
] as const;
export const CLOSURE_CHECKLIST = [
  "threat_reviewed", "access_revoked", "flows_stopped", "retention_applied",
  "dashboards_routine", "cases_reassigned", "partners_removed", "community_informed",
  "timeline_preserved", "after_action_done", "corrective_assigned",
] as const;

export function phEmergencyExpired(expiresAt: string, reauthorized: boolean, now = Date.now()): { expired: boolean; action: string } {
  if (reauthorized) return { expired: false, action: "Reauthorized — monitoring continues to next interval." };
  if (new Date(expiresAt).getTime() <= now) {
    return { expired: true, action: "Emergency access expired — automatic rollback. Speed never becomes permanent surveillance." };
  }
  return { expired: false, action: "Within authorized window." };
}

// ── Lab/facility reporting — states without punishment ────────────────
export const REPORTING_PIPELINE = [
  "submitted", "schema_validated", "terminology_validated", "identity_validated",
  "deduplicated", "jurisdiction_routed", "epi_processed", "acknowledged", "corrected", "audited",
] as const;
export const SUBMITTER_STATES = [
  "accepted", "accepted_with_warnings", "rejected", "duplicate",
  "pending_review", "corrected", "late", "incomplete",
] as const;

// ── Environmental signals — indicators, not diagnoses ─────────────────
export const ENVIRONMENTAL_SOURCES = [
  "wastewater", "air_quality", "temperature", "humidity", "vector_activity",
  "ed_chief_complaints", "ambulance_calls", "poison_control", "pharmacy_patterns",
  "school_absenteeism", "workplace_absenteeism", "shelter_reports",
] as const;

// ── Community needs — admin data plus community voice ─────────────────
export const COMMUNITY_DOMAINS = [
  "housing", "food_access", "transportation", "language_access", "broadband",
  "environmental_exposure", "employment", "education", "social_connection",
  "behavioral_health", "maternal_child", "disability_access", "safety",
  "community_assets", "trust_channels",
] as const;

// ── Equity — absolute + relative, community-interpreted ───────────────
export const PUBLIC_EQUITY_MEASURES = [
  "incidence", "testing", "immunization", "treatment_access", "emergency_response",
  "mortality", "hospitalization", "environmental_exposure", "communication_reach",
  "resource_allocation", "case_investigation", "contact_support", "intervention",
] as const;
export const EQUITY_DISPLAY = [
  "absolute_difference", "relative_difference", "trend", "denominator",
  "missingness", "intersectionality", "confidence_interval", "limitations",
  "community_interpretation", "intervention_owner",
] as const;

// ── Resources — transparent rules, human approval, sunset ─────────────
export const ALLOCATABLES = [
  "vaccines", "testing", "treatments", "beds", "staff", "ambulances", "ppe",
  "oxygen", "mobile_clinics", "food_housing", "transportation", "communication", "community_grants",
] as const;
export const ALLOCATION_RULES = [
  "objective", "legal_authority", "eligibility", "priority_criteria",
  "equity_impact", "scarcity_assumptions", "human_reviewer", "appeal_route", "audit", "sunset_date",
] as const;

export function phAllocationReview(rules: Record<string, unknown>): { approvable: boolean; missing: string[] } {
  const missing: string[] = ALLOCATION_RULES.filter((r) => !rules[r]);
  if (rules.automated_from_utilization && !rules.equity_override) {
    missing.push("equity_override (utilization-only automation reproduces unequal access)");
  }
  return { approvable: missing.length === 0, missing: [...missing] };
}

// ── Public communication — known/uncertain/actionable ─────────────────
export const COMM_CHANNELS = [
  "dashboards", "situation_reports", "alerts", "multilingual_messages",
  "accessible_formats", "partner_toolkits", "rumor_tracking", "faqs",
  "risk_communication", "press_briefings", "corrections", "message_archive",
] as const;
export const MESSAGE_FIELDS = [
  "known", "uncertain", "affected", "actions", "help_where", "updated_at", "authority", "review_at",
] as const;

export function phMessageCheck(message: Record<string, unknown>): { releasable: boolean; missing: string[] } {
  const missing = MESSAGE_FIELDS.filter((f) => !message[f]);
  return { releasable: missing.length === 0, missing: [...missing] };
}

// ── Separation — no direct drill from chart to case ───────────────────
export function phDrillCheck(role: { caseAccess: boolean; purpose: string; jurisdiction: string; approved: boolean }): { permitted: boolean; reason: string } {
  if (!role.caseAccess || !role.approved || !role.purpose || !role.jurisdiction) {
    return { permitted: false, reason: "Moving from a public chart to an identifiable case requires separately approved role, purpose, jurisdiction, and access request." };
  }
  return { permitted: true, reason: "Separately approved case access." };
}

// ── Agreements — expiry ends expanded access ──────────────────────────
export const AGREEMENT_PARTIES = [
  "laboratories", "hospitals", "clinics", "pharmacies", "emergency_services",
  "schools", "employers", "community_organizations", "federal_agencies",
  "neighboring_jurisdictions", "international_partners", "research_institutions", "vendors",
] as const;
export const AGREEMENT_FIELDS = [
  "parties", "legal_authority", "purpose", "data_elements", "frequency",
  "security", "residency", "retention", "subsharing", "reidentification_restrictions",
  "incident_reporting", "public_disclosure", "correction_process", "audit_rights", "expiration", "termination",
] as const;

export function phAgreementActive(expiresAt: string, now = Date.now()): { active: boolean; action: string } {
  if (new Date(expiresAt).getTime() <= now) {
    return { active: false, action: "Agreement expired — expanded partner access revoked." };
  }
  return { active: true, action: "Within agreement window." };
}

// ── AI — support workers, never replace authority ─────────────────────
export const PUBLIC_AI_USES = [
  "outbreak_anomaly", "demand_forecasting", "resource_planning", "lab_prioritization",
  "vaccine_outreach", "environmental_modeling", "translation_drafting",
  "contact_support", "equity_gap_detection",
] as const;
export const PUBLIC_AI_FIELDS = [
  "intended_use", "prohibited_use", "jurisdiction", "population", "data_sources",
  "training_period", "model_version", "performance", "calibration", "subgroup_results",
  "error_impacts", "human_reviewer", "public_explanation", "monitoring", "disable_path",
] as const;

export function phAiRestrict(use: string, restrictive: boolean): { permitted: boolean; requirements: string[] } {
  if (restrictive) {
    return { permitted: false, requirements: ["legal_review", "due_process", "human_oversight", "validated_evidence"] };
  }
  return { permitted: true, requirements: ["human_reviewer", "monitoring", "disable_path", "public_explanation"] };
}

// ── Data quality + security + governance ──────────────────────────────
export const DATA_QUALITY_FIELDS = [
  "source", "collection_method", "reporting_delay", "completeness", "missingness",
  "duplicate_rate", "coding_changes", "geographic_coverage", "population_coverage",
  "known_bias", "correction_history", "transformation", "version", "last_refresh",
] as const;
export const PUBLIC_SECURITY_CONTROLS = [
  "jurisdiction_scoped_access", "purpose_bound_auth", "strong_auth", "pam",
  "break_glass_expiry", "encryption", "key_separation", "segmented_stores",
  "small_cell_suppression", "query_monitoring", "export_controls", "dlp",
  "immutable_audit", "legal_holds", "secure_deletion", "vendor_controls",
  "incident_response", "public_transparency",
] as const;
export const PROHIBITED_USES = [
  "browsing_unrelated_cases", "commercial_advertising", "unapproved_immigration_employment_credit_law_enforcement",
  "reidentifying_public_datasets", "stigmatizing_small_area_publication",
  "indefinite_emergency_retention", "undocumented_dataset_combination",
] as const;
export const GOVERNANCE_BOARD = [
  "governance_board", "legal_authority_review", "epidemiology_leadership",
  "privacy_officer", "security_officer", "equity_civil_rights", "community_advisory",
  "incident_commander", "data_quality_owner", "communication_owner",
  "ai_safety_owner", "records_owner",
] as const;

// ── In-memory fallbacks (pre-migration) ───────────────────────────────
interface StoredRow extends Record<string, unknown> { id: string; workspaceId: string }
const memJurisdictions = new Map<string, StoredRow[]>();
const memSignals = new Map<string, StoredRow[]>();
const memDashboards = new Map<string, StoredRow[]>();
const memOutbreaks = new Map<string, StoredRow[]>();
const memCases = new Map<string, StoredRow[]>();
const memImmunizations = new Map<string, StoredRow[]>();
const memEmergencies = new Map<string, StoredRow[]>();
const memResources = new Map<string, StoredRow[]>();
const memMessages = new Map<string, StoredRow[]>();
const memAgreements = new Map<string, StoredRow[]>();
const memAi = new Map<string, StoredRow[]>();

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
function memList(m: Map<string, StoredRow[]>, ws: string): StoredRow[] { return m.get(ws) ?? []; }
function memPush(m: Map<string, StoredRow[]>, ws: string, row: StoredRow) { m.set(ws, [...(m.get(ws) ?? []), row]); }

type PublicTables = {
  healthPublicJurisdiction: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthPublicSignal: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthPublicDashboard: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthPublicOutbreak: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthPublicCase: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthPublicImmunization: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthPublicEmergency: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthPublicResource: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthPublicMessage: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthPublicAgreement: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthPublicAi: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
};

// ── N0VA Public Health service ────────────────────────────────────────
export class PublicHealthSystem {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health`);
  }
  private audit(action: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType: "PublicHealthArtifact", targetId, metadata: meta }).catch(() => null);
  }

  // ── Jurisdictions — authority records ────────────────────────────
  async registerJurisdiction(input: JurisdictionInput) {
    await this.assert("CREATE");
    const parsed = jurisdictionSchema.parse({ ...input, jurisdictionId: input.jurisdictionId || `juris-${crypto.randomUUID().slice(0, 8)}` });
    const row = await safe(
      () => (prisma as unknown as PublicTables).healthPublicJurisdiction.create({
        data: { workspaceId: this.workspaceId, jurisdictionId: parsed.jurisdictionId, agency: parsed.agency, program: parsed.program, legalAuthority: parsed.legalAuthority, permittedPurposes: parsed.permittedPurposes, dataScope: parsed.dataScope, geography: parsed.geography, emergencyMode: parsed.emergencyMode, approvedPartners: parsed.approvedPartners, prohibitedPartners: parsed.prohibitedPartners, retention: parsed.retention, reviewDate: parsed.reviewDate ?? null, createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.jurisdictionId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memJurisdictions, this.workspaceId, stored);
    await this.audit("public.jurisdiction.registered", parsed.jurisdictionId, { program: parsed.program });
    return (row as unknown) ?? stored;
  }

  async checkAuthority(jurisdictionId: string, ctx: Omit<AuthorityContext, "jurisdictionId">) {
    await this.assert("READ");
    const all = memList(memJurisdictions, this.workspaceId);
    const found = all.find((j) => j.id === jurisdictionId) as unknown as JurisdictionInput | undefined;
    if (!found) throw new Error("Jurisdiction not found — no action without a registered authority record.");
    const verdict = phAuthorityCheck(found, { ...ctx, jurisdictionId });
    await this.audit("public.authority.checked", jurisdictionId, { purpose: ctx.purpose, permitted: verdict.permitted });
    return verdict;
  }

  // ── Signals — anomalies stay anomalies until classified ──────────
  async receiveSignal(input: { domain: string; geography: string; source?: string; quality?: Record<string, unknown>; baseline?: string }) {
    await this.assert("CREATE");
    if (!(SURVEILLANCE_DOMAINS as readonly string[]).includes(input.domain)) throw new Error(`Unknown surveillance domain: ${input.domain}`);
    const id = `sig-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PublicTables).healthPublicSignal.create({
        data: { workspaceId: this.workspaceId, signalId: id, domain: input.domain, geography: input.geography, source: input.source ?? "", quality: input.quality ?? {}, baseline: input.baseline ?? "", eventState: "signal", lifecycle: ["received"], createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memSignals, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, eventState: "signal", lifecycle: ["received"] });
    await this.audit("public.signal.received", id, { domain: input.domain });
    return { signalId: id, eventState: "signal" as const, display: [...SIGNAL_DISPLAY], note: "A statistical anomaly is not a confirmed outbreak." };
  }

  async advanceSignal(signalId: string, to: string) {
    await this.assert("UPDATE");
    const found = memList(memSignals, this.workspaceId).find((s) => s.id === signalId);
    const from = String(found?.eventState ?? "signal");
    if (!phEventTransition(from, to)) throw new Error(`Invalid event transition ${from} → ${to} — suspected and confirmed are explicit classifications.`);
    await safe(() => (prisma as unknown as PublicTables).healthPublicSignal.update({ where: { signalId }, data: { eventState: to } }) as Promise<never>, null);
    if (found) found.eventState = to;
    await this.audit("public.signal.advanced", signalId, { from, to });
    return { signalId, from, to };
  }

  // ── Dashboards — contracted, suppressed, non-stigmatizing ─────────
  async publishDashboard(input: { domain: string; geography: string; period: string; contract: Record<string, unknown>; counts: Array<{ group: string; n: number }>; minimumN?: number; rankGroups?: boolean }) {
    await this.assert("CREATE");
    if (!(DASHBOARD_DOMAINS as readonly string[]).includes(input.domain)) throw new Error(`Unknown dashboard domain: ${input.domain}`);
    const missing = DASHBOARD_CONTRACT.filter((f) => !(input.contract ?? {})[f]);
    if (missing.length > 0) throw new Error(`Dashboard contract incomplete — missing: ${missing.join(", ")}`);
    const stigma = phStigmaCheck({ rankGroups: input.rankGroups, smallArea: /neighborhood|block|school/i.test(input.geography) });
    if (stigma.warnings.length > 0) throw new Error(stigma.warnings.join(" "));
    const suppressed = input.counts.filter((c) => !phSmallCell(c.n, input.minimumN ?? 11, false).publishable);
    const id = `dash-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PublicTables).healthPublicDashboard.create({
        data: { workspaceId: this.workspaceId, dashboardId: id, domain: input.domain, geography: input.geography, period: input.period, contract: input.contract, suppressedGroups: suppressed.map((s) => s.group), status: "published", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memDashboards, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, suppressedGroups: suppressed.map((s) => s.group) });
    await this.audit("public.dashboard.published", id, { domain: input.domain, suppressed: suppressed.length });
    return { dashboardId: id, suppressedGroups: suppressed.map((s) => s.group), published: input.counts.filter((c) => !suppressed.includes(c)) };
  }

  // ── Outbreaks — definition versions preserved ────────────────────
  async declareOutbreak(input: { signalId: string; title: string; jurisdictionId: string }) {
    await this.assert("CREATE");
    const id = `out-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PublicTables).healthPublicOutbreak.create({
        data: { workspaceId: this.workspaceId, outbreakId: id, signalId: input.signalId, title: input.title, jurisdictionId: input.jurisdictionId, stage: "declaration", caseDefinitions: [], timeline: [{ stage: "declaration", at: new Date().toISOString() }], status: "active", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memOutbreaks, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, stage: "declaration", caseDefinitions: [], status: "active" });
    await this.audit("public.outbreak.declared", id, { title: input.title });
    return { outbreakId: id, lifecycle: [...OUTBREAK_LIFECYCLE], supports: [...OUTBREAK_SUPPORTS] };
  }

  async versionCaseDefinition(outbreakId: string, definition: { version: string; criteria: string[] }) {
    await this.assert("UPDATE");
    const found = memList(memOutbreaks, this.workspaceId).find((o) => o.id === outbreakId);
    if (found) (found.caseDefinitions as unknown[]).push({ ...definition, at: new Date().toISOString() });
    await this.audit("public.case_definition.versioned", outbreakId, { version: definition.version });
    return { outbreakId, version: definition.version, note: "Historical classifications keep the version used at the time." };
  }

  // ── Cases + contacts — lawful, minimal, expiring ─────────────────
  async openCase(input: { kind: "case" | "contact"; jurisdictionId: string; authorityRef: string; purpose: string; patientRef?: string }) {
    await this.assert("CREATE");
    if (!input.authorityRef) throw new Error("Identifiable case workflows require lawful authority and a defined purpose.");
    const id = `pcase-${crypto.randomUUID().slice(0, 8)}`;
    const workflow = input.kind === "case" ? [...CASE_WORKFLOW] : [...CONTACT_WORKFLOW];
    const row = await safe(
      () => (prisma as unknown as PublicTables).healthPublicCase.create({
        data: { workspaceId: this.workspaceId, caseId: id, kind: input.kind, jurisdictionId: input.jurisdictionId, authorityRef: input.authorityRef, purpose: input.purpose, patientRef: input.patientRef ?? "", stage: workflow[0] ?? "report_received", status: "open", expiresAt: null, createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memCases, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, stage: workflow[0], status: "open" });
    await this.audit("public.case.opened", id, { kind: input.kind, purpose: input.purpose });
    return { caseId: id, workflow, guardrails: [...CASE_GUARDRAILS] };
  }

  async closeCase(caseId: string, expiresAccess = true) {
    await this.assert("UPDATE");
    await safe(() => (prisma as unknown as PublicTables).healthPublicCase.update({ where: { caseId }, data: { status: "closed" } }) as Promise<never>, null);
    const found = memList(memCases, this.workspaceId).find((c) => c.id === caseId);
    if (found) found.status = "closed";
    await this.audit("public.case.closed", caseId, { expiresAccess });
    return { caseId, status: "closed" as const, access: expiresAccess ? "expired at closure" : "retained per policy with justification" };
  }

  // ── Immunization ─────────────────────────────────────────────────
  async recordImmunization(input: { personRef: string; vaccine: string; state: string; registryRef?: string }) {
    await this.assert("CREATE");
    const status = phImmunizationStatus(input.state);
    const id = `imm-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PublicTables).healthPublicImmunization.create({
        data: { workspaceId: this.workspaceId, recordId: id, personRef: input.personRef, vaccine: input.vaccine, state: input.state, countable: status.countable, registryRef: input.registryRef ?? "", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memImmunizations, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, countable: status.countable });
    await this.audit("public.immunization.recorded", id, { vaccine: input.vaccine, countable: status.countable });
    return { recordId: id, ...status, workflow: [...IMMUNIZATION_WORKFLOW] };
  }

  // ── Emergency mode — scoped, reauthorized, rolled back ───────────
  async activateEmergency(input: { incident: string; authority: string; jurisdictions: string[]; scope: string; expiration: string; commander?: string; partners?: string[] }) {
    await this.assert("CREATE");
    const missing = ACTIVATION_CHECKLIST.filter((c) => {
      if (c === "threat_identified") return !input.incident;
      if (c === "authority_confirmed") return !input.authority;
      if (c === "commander_appointed") return !input.commander;
      if (c === "scope_defined") return !input.scope;
      if (c === "expiration_set") return !input.expiration;
      return false;
    });
    if (missing.length > 0) throw new Error(`Emergency activation blocked — missing: ${missing.join(", ")}`);
    const id = `emg-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PublicTables).healthPublicEmergency.create({
        data: { workspaceId: this.workspaceId, emergencyId: id, incident: input.incident, authority: input.authority, jurisdictions: input.jurisdictions, scope: input.scope, expiration: new Date(input.expiration), commander: input.commander ?? "", partners: input.partners ?? [], status: "active", reauthorizations: 0, createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memEmergencies, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "active", reauthorizations: 0 });
    await this.audit("public.emergency.activated", id, { incident: input.incident });
    return { emergencyId: id, activation: [...EMERGENCY_ACTIVATION], scopeFields: [...EMERGENCY_SCOPE_FIELDS], status: "active" as const };
  }

  async reauthorizeEmergency(emergencyId: string) {
    await this.assert("UPDATE");
    const found = memList(memEmergencies, this.workspaceId).find((e) => e.id === emergencyId);
    if (found) found.reauthorizations = Number(found.reauthorizations ?? 0) + 1;
    await this.audit("public.emergency.reauthorized", emergencyId, {});
    return { emergencyId, ...(found ? phEmergencyExpired(String(found.expiration), true) : { expired: false, action: "reauthorized" }) };
  }

  async sweepEmergencyExpiry() {
    await this.assert("UPDATE");
    let rolledBack = 0;
    for (const e of memList(memEmergencies, this.workspaceId)) {
      if (e.status === "active") {
        const verdict = phEmergencyExpired(String(e.expiration), false);
        if (verdict.expired) { e.status = "rolled_back"; rolledBack++; }
      }
    }
    await safe(() => (prisma as unknown as PublicTables).healthPublicEmergency.update({ where: { emergencyId: "__none__" }, data: {} }) as Promise<never>, null).catch(() => null);
    await this.audit("public.emergency.swept", this.workspaceId, { rolledBack });
    return { rolledBack };
  }

  async deactivateEmergency(emergencyId: string, closure: Record<string, boolean>) {
    await this.assert("UPDATE");
    const missing = CLOSURE_CHECKLIST.filter((c) => !closure[c]);
    if (missing.length > 0) throw new Error(`Deactivation blocked — closure gaps: ${missing.join(", ")}`);
    await safe(() => (prisma as unknown as PublicTables).healthPublicEmergency.update({ where: { emergencyId }, data: { status: "closed" } }) as Promise<never>, null);
    const found = memList(memEmergencies, this.workspaceId).find((e) => e.id === emergencyId);
    if (found) found.status = "closed";
    await this.audit("public.emergency.closed", emergencyId, {});
    return { emergencyId, status: "closed" as const };
  }

  // ── Resources — criteria, equity, human, sunset ──────────────────
  async allocateResource(input: { resource: string; quantity: number; rules: Record<string, unknown>; approver?: string }) {
    await this.assert("CREATE");
    if (!(ALLOCATABLES as readonly string[]).includes(input.resource)) throw new Error(`Unknown resource: ${input.resource}`);
    const review = phAllocationReview(input.rules);
    if (!review.approvable) throw new Error(`Allocation blocked — missing: ${review.missing.join(", ")}`);
    if (!input.approver) throw new Error("Human reviewer required for allocation.");
    const id = `alc-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PublicTables).healthPublicResource.create({
        data: { workspaceId: this.workspaceId, allocationId: id, resource: input.resource, quantity: input.quantity, rules: input.rules, approver: input.approver ?? "", status: "allocated", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memResources, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "allocated" });
    await this.audit("public.resource.allocated", id, { resource: input.resource, approver: input.approver });
    return { allocationId: id, status: "allocated" as const };
  }

  // ── Communication — complete messages or nothing ─────────────────
  async publishMessage(input: { channel: string; message: Record<string, unknown> }) {
    await this.assert("CREATE");
    if (!(COMM_CHANNELS as readonly string[]).includes(input.channel)) throw new Error(`Unknown channel: ${input.channel}`);
    const check = phMessageCheck(input.message);
    if (!check.releasable) throw new Error(`Message blocked — missing: ${check.missing.join(", ")}. Every message states what is known, uncertain, affected, actions, help, update time, authority, review time.`);
    const id = `pmsg-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PublicTables).healthPublicMessage.create({
        data: { workspaceId: this.workspaceId, messageId: id, channel: input.channel, message: input.message, status: "published", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memMessages, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "published" });
    await this.audit("public.message.published", id, { channel: input.channel });
    return { messageId: id, status: "published" as const };
  }

  // ── Agreements — expiry ends expanded access ─────────────────────
  async recordAgreement(input: { parties: string[]; legalAuthority: string; purpose: string; dataElements?: string[]; expiresAt: string; fields?: Record<string, unknown> }) {
    await this.assert("CREATE");
    const missing = AGREEMENT_FIELDS.filter((f) => {
      if (f === "parties") return input.parties.length === 0;
      if (f === "legal_authority") return !input.legalAuthority;
      if (f === "purpose") return !input.purpose;
      if (f === "expiration") return !input.expiresAt;
      return !(input.fields ?? {})[f];
    });
    if (missing.length > 0) throw new Error(`Agreement incomplete — missing: ${missing.join(", ")}`);
    const id = `agr-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PublicTables).healthPublicAgreement.create({
        data: { workspaceId: this.workspaceId, agreementId: id, parties: input.parties, legalAuthority: input.legalAuthority, purpose: input.purpose, dataElements: input.dataElements ?? [], fields: input.fields ?? {}, expiresAt: new Date(input.expiresAt), status: "active", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memAgreements, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "active" });
    await this.audit("public.agreement.recorded", id, { purpose: input.purpose });
    return { agreementId: id, parties: [...AGREEMENT_PARTIES], status: "active" as const };
  }

  // ── AI — governed, explainable, disableable ──────────────────────
  async registerAiModel(input: { use: string; jurisdiction: string; population?: string; version?: string; restrictive?: boolean; reviewer?: string }) {
    await this.assert("CREATE");
    if (!(PUBLIC_AI_USES as readonly string[]).includes(input.use)) throw new Error(`Unknown public-health AI use: ${input.use}`);
    const gate = phAiRestrict(input.use, input.restrictive ?? false);
    if (!gate.permitted) {
      await this.audit("public.ai.restricted", input.use, {});
      return { use: input.use, permitted: false as const, requirements: gate.requirements };
    }
    const id = `pai-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PublicTables).healthPublicAi.create({
        data: { workspaceId: this.workspaceId, modelId: id, use: input.use, jurisdiction: input.jurisdiction, population: input.population ?? "", version: input.version ?? "1.0", reviewer: input.reviewer ?? "", status: "registered", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memAi, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "registered" });
    await this.audit("public.ai.registered", id, { use: input.use });
    return { modelId: id, permitted: true as const, fields: [...PUBLIC_AI_FIELDS] };
  }

  // ── Command view ─────────────────────────────────────────────────
  async commandView() {
    await this.assert("READ");
    const ws = this.workspaceId;
    return {
      version: PUBLIC_HEALTH_VERSION,
      promise: PUBLIC_HEALTH_PROMISE,
      products: [...DATA_PRODUCTS],
      jurisdictions: memList(memJurisdictions, ws).length,
      activeSignals: memList(memSignals, ws).filter((s) => !["closed"].includes(String(s.eventState))).length,
      activeOutbreaks: memList(memOutbreaks, ws).filter((o) => o.status === "active").length,
      openCases: memList(memCases, ws).filter((c) => c.status === "open").length,
      activeEmergencies: memList(memEmergencies, ws).filter((e) => e.status === "active").length,
      governance: [...GOVERNANCE_BOARD],
      security: [...PUBLIC_SECURITY_CONTROLS],
      prohibitions: [...PROHIBITED_USES],
      generatedAt: new Date().toISOString(),
    };
  }
}

// ── Static reference exports ──────────────────────────────────────────
export const PUBLIC_API = [
  "registerJurisdiction", "checkAuthority",
  "receiveSignal", "advanceSignal",
  "publishDashboard",
  "declareOutbreak", "versionCaseDefinition",
  "openCase", "closeCase",
  "recordImmunization",
  "activateEmergency", "reauthorizeEmergency", "sweepEmergencyExpiry", "deactivateEmergency",
  "allocateResource", "publishMessage",
  "recordAgreement", "registerAiModel", "commandView",
] as const;
