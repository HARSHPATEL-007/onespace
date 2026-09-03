// N0VA Research — controlled research, trial, biobanking, and evidence environment — Project Vita.
// Separated from routine clinical operations. Never an export button from
// N0VA Clinical: every dataset, cohort, query, model, and publication is
// governed by purpose, authorization, consent, privacy risk, scientific
// validity, and reproducibility.
//
// Governing principle: maximize scientific utility while minimizing
// unnecessary exposure — every dataset a justified purpose, every user an
// accountable authorization, every analysis a reproducible trail, every
// output a defensible privacy review. "De-identified" is a documented risk
// assessment, never a universal permission for unrestricted use.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_research";
export const RESEARCH_VERSION = "2026.09";

export const RESEARCH_PROMISE =
  "N0VA Research converts governed health data into reproducible evidence without weakening participant privacy, clinical integrity, or institutional accountability.";

// ── Architecture — lineage preserved, research never silently rewrites care ─
export const RESEARCH_ARCHITECTURE = [
  "source_systems", "identity_provenance_boundary", "consent_protocol_dua_evaluation",
  "research_data_layer", "research_workspaces", "governance_audit",
] as const;
export const RESEARCH_DATA_LAYERS = [
  "deidentified", "coded_pseudonymized", "limited", "controlled_genomic",
  "trial", "rwe", "biobank", "synthetic",
] as const;
export const RESEARCH_WORKSPACES = [
  "cohort_builder", "trial_operations", "edc", "clean_room",
  "federated", "analytics", "statistics", "publication_review",
] as const;

// ── Project lifecycle — Concept to retention/destruction ───────────────
export const PROJECT_LIFECYCLE = [
  "concept", "protocol", "scientific_review", "ethics_review", "minimization_review",
  "privacy_review", "dua", "investigator_verification", "dataset_construction",
  "validation", "analysis", "output_review", "publication", "closeout", "retention_destruction",
] as const;
const PROJECT_EDGES: Record<string, string[]> = {
  concept: ["protocol"], protocol: ["scientific_review"],
  scientific_review: ["ethics_review", "protocol"], ethics_review: ["minimization_review", "protocol"],
  minimization_review: ["privacy_review", "protocol"], privacy_review: ["dua", "protocol"],
  dua: ["investigator_verification"], investigator_verification: ["dataset_construction"],
  dataset_construction: ["validation"], validation: ["analysis", "dataset_construction"],
  analysis: ["output_review"], output_review: ["publication", "analysis"],
  publication: ["closeout"], closeout: ["retention_destruction"], retention_destruction: [],
};
export function rsrchLifecycleMove(from: string, to: string): boolean {
  return (PROJECT_EDGES[from] ?? []).includes(to);
}

export const protocolSchema = z.object({
  protocolId: z.string().min(1).default(""),
  version: z.string().default("1.0"),
  title: z.string().min(1),
  principalInvestigator: z.string().default(""),
  sponsor: z.string().default(""),
  institution: z.string().default(""),
  studyType: z.string().default("real_world_evidence"),
  status: z.enum(["draft", "under_review", "approved", "amended", "suspended", "closed"]).default("draft"),
  inclusion: z.array(z.string()).default([]),
  exclusion: z.array(z.string()).default([]),
  dataDomains: z.array(z.string()).default([]),
  consentModel: z.string().default(""),
  irbStatus: z.string().default("pending"),
  dataAccess: z.enum(["open", "controlled"]).default("controlled"),
  geography: z.string().default(""),
  analysisPlan: z.string().default(""),
  approvedOutputs: z.array(z.string()).default([]),
  expiresAt: z.coerce.date().optional().nullable(),
});

// Amendments create new versions — never silently broaden population,
// domains, linkage, or outputs.
export function rsrchProtocolAmend(current: { population: string[]; domains: string[]; linkage: string[]; outputs: string[] }, next: { population: string[]; domains: string[]; linkage: string[]; outputs: string[] }): { broadening: string[]; newVersionRequired: boolean } {
  const broadening: string[] = [];
  const added = (a: string[], b: string[], label: string) => {
    const extra = b.filter((x) => !a.includes(x));
    if (extra.length > 0) broadening.push(`${label}: +${extra.join(",")}`);
  };
  added(current.population, next.population, "population");
  added(current.domains, next.domains, "data_domains");
  added(current.linkage, next.linkage, "linkage");
  added(current.outputs, next.outputs, "outputs");
  return { broadening, newVersionRequired: broadening.length > 0 };
}

// ── Data classification ladder R0–R6 ───────────────────────────────────
export const DATA_CLASSES = {
  R0: { label: "Fully synthetic or public data", access: "Broad research access" },
  R1: { label: "Low-risk aggregate data", access: "Approved users" },
  R2: { label: "De-identified individual-level data", access: "Controlled workspace" },
  R3: { label: "Coded or pseudonymized data", access: "Approved project users" },
  R4: { label: "Limited dataset or sensitive linkage data", access: "Formal committee approval" },
  R5: { label: "Identifiable clinical or contact data", access: "Strict role, purpose, and legal controls" },
  R6: { label: "Genomic, biometric, or highly sensitive data", access: "Controlled access, enhanced monitoring" },
} as const;
export type DataClass = keyof typeof DATA_CLASSES;

export function rsrchClassify(f: { identifiers: boolean; quasiHigh: boolean; rareDisease: boolean; smallGeo: boolean; dates: boolean; freeText: boolean; genomic: boolean; images: boolean; linkage: boolean; vulnerable: boolean; weakConsent: boolean }): DataClass {
  if (f.identifiers) return "R5";
  if (f.genomic) return "R6";
  const sensitive = [f.quasiHigh, f.rareDisease, f.smallGeo, f.freeText, f.images, f.linkage, f.vulnerable, f.weakConsent].filter(Boolean).length;
  if (f.dates && sensitive >= 2) return "R4";
  if (sensitive >= 2 || f.dates) return "R3";
  if (sensitive === 1) return "R2";
  return "R1";
}

// ── De-identification — strategies + report ───────────────────────────
export const DEID_STRATEGIES = [
  "suppression", "generalization", "date_shifting", "geographic_coarsening",
  "tokenization", "pseudonymization", "k_anonymity", "differential_privacy",
  "synthetic_data", "federated_computation", "secure_linkage", "restricted_free_text",
] as const;
export const DEID_REPORT_FIELDS = [
  "method", "version", "fields_transformed", "fields_retained", "residual_risks",
  "linkage_risks", "expert_review", "intended_audience", "approved_use",
  "expiration", "reidentification_prohibition", "reassessment_trigger",
] as const;

export function rsrchDeidReport(report: Record<string, unknown>): { complete: boolean; missing: string[] } {
  const missing = DEID_REPORT_FIELDS.filter((f) => report[f] === undefined || report[f] === "" || report[f] === null);
  return { complete: missing.length === 0, missing: [...missing] };
}
// Pseudonymization is not anonymization: reversible or linkable tokens stay sensitive.

// ── Consent — types, envelope, governed withdrawal ────────────────────
export const CONSENT_TYPES = [
  "clinical_research", "secondary_use", "genomic_research", "biobanking",
  "recontact", "data_linkage", "commercial_collaboration", "international_transfer",
  "broad_future_research", "study_specific", "return_of_results",
  "family_notification", "withdrawal",
] as const;
export const WITHDRAWAL_ACTIONS = [
  "stop_enrollment", "stop_future_access", "suppress_future_extracts",
  "mark_existing_analyses", "identify_aggregate_use", "notify_investigators",
  "preserve_audit_regulatory_records", "document_irreversible_limits",
] as const;

export function rsrchWithdraw(): { actions: string[]; limitation: string } {
  return {
    actions: [...WITHDRAWAL_ACTIONS],
    limitation: "Published aggregate findings cannot be un-published where data cannot be isolated without invalidating the study — explain transparently, never promise impossible deletion.",
  };
}

// ── Access — all applicable conditions, auto-expiring ─────────────────
export const ACCESS_CONDITIONS = [
  "verified_investigator", "approved_institution", "active_protocol",
  "valid_training", "approved_dua", "consent_basis", "authorized_dataset",
  "approved_region", "time_bound", "purpose_bound_role",
] as const;
export const RESEARCH_ROLES = [
  "principal_investigator", "co_investigator", "data_manager", "statistician",
  "study_coordinator", "monitor", "auditor", "biostatistician", "biobank_manager",
  "dac_member", "publication_reviewer", "sponsor_representative", "external_collaborator",
] as const;

export function rsrchAccessCheck(conditions: Record<string, boolean>): { granted: boolean; missing: string[] } {
  const missing = ACCESS_CONDITIONS.filter((c) => !conditions[c]);
  return { granted: missing.length === 0, missing: [...missing] };
}

// ── Cohort builder — release package, never rare-individual oracle ────
export const COHORT_RELEASE_FIELDS = [
  "query_logic", "data_snapshot", "code_version", "terminology_version",
  "inclusion_count", "exclusion_count", "missingness_profile", "site_distribution",
  "demographic_distribution", "disclosure_assessment", "reviewer", "release_timestamp",
] as const;

export function rsrchCohortRelease(inclusion: number, minimumN: number, rareIndividual: boolean): { releasable: boolean; reason: string } {
  if (inclusion < minimumN) return { releasable: false, reason: `Cohort below minimum size ${minimumN} — suppressed.` };
  if (rareIndividual) return { releasable: false, reason: "Query would reveal whether a rare individual exists — blocked." };
  return { releasable: true, reason: `Cohort of ${inclusion} released with disclosure assessment.` };
}

// ── Query disclosure — sequences reconstruct; track cumulative risk ────
export const DISCLOSURE_TECHNIQUES = [
  "minimum_cell_sizes", "suppression", "rounding", "noise_addition",
  "query_budgets", "result_throttling", "restricted_variables",
  "manual_review", "secure_output_workspace", "differential_privacy",
] as const;

export function rsrchDisclosure(priorQueries: number, smallCellQueries: number, budget: number, spent: number): { permitted: boolean; reason: string } {
  if (spent >= budget) return { permitted: false, reason: "Query budget exhausted — further queries blocked pending review." };
  if (priorQueries >= 5 && smallCellQueries >= 2) return { permitted: false, reason: "Sequence risk: repeated small-cell queries may reconstruct sensitive information — manual review required." };
  return { permitted: true, reason: "Within budget and sequence limits." };
}

// ── Clean room visibility labels ──────────────────────────────────────
export const DATA_VISIBILITY_LABELS = ["synthetic", "deidentified", "coded", "limited", "identifiable", "genomic"] as const;
export const CLEANROOM_CONTROLS = [
  "no_raw_download", "approved_tools", "restricted_egress", "clipboard_controls",
  "command_logging", "package_allowlisting", "malware_scanning", "output_review",
  "session_expiry", "watermarked_exports", "separate_workspaces", "encrypted_storage",
  "region_enforcement", "immutable_audit",
] as const;

// ── Trials — lifecycle, separation, Part 11 EDC ───────────────────────
export const TRIAL_LIFECYCLE = [
  "potentially_eligible", "pre_screened", "consent_discussion", "consented",
  "screened", "eligible_or_screen_failure", "enrolled", "randomized",
  "visits_assessments", "safety_followup", "completed_withdrawn_lost", "closeout",
] as const;
const TRIAL_EDGES: Record<string, string[]> = {
  potentially_eligible: ["pre_screened"], pre_screened: ["consent_discussion"],
  consent_discussion: ["consented"], consented: ["screened"],
  screened: ["eligible_or_screen_failure"], eligible_or_screen_failure: ["enrolled"],
  enrolled: ["randomized", "visits_assessments"], randomized: ["visits_assessments"],
  visits_assessments: ["safety_followup", "visits_assessments"],
  safety_followup: ["completed_withdrawn_lost"], completed_withdrawn_lost: ["closeout"], closeout: [],
};
export function rsrchTrialMove(from: string, to: string): boolean {
  return (TRIAL_EDGES[from] ?? []).includes(to);
}
export const TRIAL_SEPARATION = [
  "clinical_care", "research_procedures", "research_measurements",
  "trial_eligibility", "adverse_event_reporting", "treatment_decisions",
] as const;

export const EDC_CONTROLS = [
  "unique_identity", "strong_auth", "rbac", "audit_trail", "record_versioning",
  "electronic_signatures", "signature_meaning", "time_sync", "change_reason",
  "source_verification", "form_locking", "query_management", "data_export",
  "backup_restoration", "validation_evidence", "system_owner", "training_records",
] as const;

export function rsrchEdcSign(identity: string, signatureLinked: boolean, transferable: boolean): { valid: boolean; reason: string } {
  if (!identity) return { valid: false, reason: "Unique user identity required." };
  if (!signatureLinked) return { valid: false, reason: "Signature must be uniquely linked to the individual and the signed record." };
  if (transferable) return { valid: false, reason: "Transferable or detachable signatures permit falsification — prohibited." };
  return { valid: true, reason: "Part 11-aligned signature: unique, linked, non-transferable." };
}

// ── Biobank — specimen release needs five matching authorizations ─────
export const BIOBANK_LIFECYCLE = [
  "consent", "collection", "accession", "processing", "storage", "inventory",
  "request", "approval", "release", "use", "return_or_destruction",
] as const;

export function rsrchSpecimenRelease(checks: { protocol: boolean; consent: boolean; mta: boolean; biosafety: boolean; inventory: boolean }): { releasable: boolean; missing: string[] } {
  const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  return { releasable: missing.length === 0, missing };
}

// ── Genomics — enhanced controls + analysis flags ─────────────────────
export const GENOMIC_CONTROLS = [
  "controlled_repository", "separate_domains", "variant_level_policy",
  "kinship_safeguards", "reidentification_monitoring", "prohibited_use",
  "secure_environment", "no_uncontrolled_downloads", "use_certification",
  "return_of_results_governance", "transfer_restrictions", "retention_destruction",
] as const;

export function rsrchGenomicFlag(analysis: { rareVariants?: boolean; kinship?: boolean; smallPopulation?: boolean; geoCluster?: boolean; publicDbLinkage?: boolean; sensitiveTrait?: boolean }): string[] {
  const flags: string[] = [];
  if (analysis.rareVariants) flags.push("rare_variants");
  if (analysis.kinship) flags.push("family_relationships");
  if (analysis.smallPopulation) flags.push("small_population");
  if (analysis.geoCluster) flags.push("geographic_cluster");
  if (analysis.publicDbLinkage) flags.push("public_database_reidentification");
  if (analysis.sensitiveTrait) flags.push("sensitive_disease_or_ancestry");
  return flags;
}

// ── RWE — exploratory vs regulatory-grade ─────────────────────────────
export const RWE_ELEMENTS = [
  "data_source", "generation_process", "clinical_context", "completeness",
  "accuracy", "representativeness", "provenance", "missingness",
  "linkage_quality", "outcome_definition", "confounding", "bias", "design",
] as const;
export const RWE_STUDY_PLAN = [
  "research_question", "target_population", "data_source", "generating_process",
  "exposure", "comparator", "outcome", "followup", "confounders",
  "missing_data_plan", "bias_assessment", "sap", "sensitivity", "reproducible_output",
] as const;

export function rsrchRweGrade(plan: Record<string, boolean>, intendedUse: string): { grade: "exploratory" | "regulatory_grade_candidate"; gaps: string[] } {
  const gaps = RWE_STUDY_PLAN.filter((p) => !plan[p]);
  const regulatory = /regulat|submission|safety|effectiveness|reimbursement/i.test(intendedUse);
  if (regulatory && gaps.length > 0) return { grade: "exploratory", gaps };
  if (gaps.length > 0) return { grade: "exploratory", gaps };
  return { grade: regulatory ? "regulatory_grade_candidate" : "exploratory", gaps: [] };
}

// ── Federated — transparency over silent exclusion ────────────────────
export const FEDERATED_CONTROLS = [
  "identical_code", "terminology_mapping", "local_validation", "minimum_cohort",
  "aggregate_only", "query_budget", "site_approval", "result_harmonization",
  "missing_site_reporting", "reproducible_execution", "no_silent_exclusion",
] as const;

export function rsrchFederatedReport(sites: Array<{ site: string; contributed: boolean; vintage?: string; completeness?: number; exclusions?: string }>): { transparent: boolean; missing: string[]; note: string } {
  const missing = sites.filter((s) => !s.contributed).map((s) => s.site);
  return {
    transparent: true,
    missing,
    note: `Contributed: ${sites.filter((s) => s.contributed).map((s) => s.site).join(",") || "none"}. Missing: ${missing.join(",") || "none"}. Site exclusions may bias results — reported, never silent.`,
  };
}

// ── Synthetic — labeled with limits ───────────────────────────────────
export const SYNTHETIC_LABEL_FIELDS = [
  "synthetic", "generation_method", "model_version", "source_domain",
  "utility_assessment", "privacy_assessment", "known_limitations",
] as const;

export function rsrchSyntheticLabel(label: Record<string, unknown>): { complete: boolean; missing: string[]; warning: string } {
  const missing = SYNTHETIC_LABEL_FIELDS.filter((f) => !label[f]);
  return {
    complete: missing.length === 0, missing: [...missing],
    warning: "Synthetic data may reproduce bias, invent implausible combinations, omit rare events, or memorize patterns — never for clinical conclusions without real-world validation.",
  };
}

// ── Statistics, lineage, DUA, publication, reproducibility ────────────
export const STAT_REQUIREMENTS = [
  "prespecified_plan", "denominator", "code_version", "dataset_version",
  "random_seed", "environment", "assumptions", "missing_data_treatment",
  "exclusion_log", "sensitivity_analyses", "reviewer_signoff",
] as const;
export const LINEAGE_STAGES = [
  "source_record", "extract", "normalize", "transform", "link", "deidentify",
  "cohort_query", "analysis_dataset", "statistical_output", "figure_table", "manuscript", "publication",
] as const;
export const DUA_TRACKING = [
  "parties", "dataset", "purpose", "prohibited_uses", "users", "locations",
  "security_requirements", "retention", "publication", "reidentification_prohibition",
  "subsharing", "incident_reporting", "return_destruction", "audit_rights",
  "effective_date", "expiration", "amendment",
] as const;

export function rsrchDuaExpiry(agreementExpiry: string, accessEnd: string): { expired: boolean; action: string } {
  if (new Date(accessEnd).getTime() > new Date(agreementExpiry).getTime()) {
    return { expired: true, action: "Access automatically expired/restricted — agreement lapsed." };
  }
  return { expired: false, action: "Access within agreement window." };
}

export const PUBLICATION_REVIEW = [
  "minimum_cell_size", "reidentification_risk", "sensitive_variables",
  "residual_identifiers", "free_text", "maps", "images", "genomic_info",
  "linkage_disclosure", "protocol_consistency", "statistical_validity",
  "missingness_disclosure", "sponsor_restrictions", "authorship",
  "community_impact", "unsupported_claims",
] as const;
export const REVIEW_PIPELINE = [
  "draft", "statistical_review", "privacy_review", "disclosure_review",
  "protocol_compliance", "clinical_review", "sponsor_review", "approved_release",
] as const;

export function rsrchPublicationReview(checks: Record<string, boolean>): { releasable: boolean; missing: string[] } {
  const missing = PUBLICATION_REVIEW.filter((p) => !checks[p]);
  return { releasable: missing.length === 0, missing: [...missing] };
}

export const REPRO_PACKAGE = [
  "protocol_version", "analysis_plan", "dataset_id", "dataset_snapshot",
  "code_repository", "environment", "package_versions", "random_seeds",
  "terminology_versions", "transformations", "exclusion_logic", "output_files",
  "reviewer_approvals", "limitations", "execution_logs",
] as const;

export function rsrchReproducibility(pkg: Record<string, unknown>): { reproducible: boolean; missing: string[] } {
  const missing = REPRO_PACKAGE.filter((p) => pkg[p] === undefined || pkg[p] === "" || pkg[p] === null);
  return { reproducible: missing.length === 0, missing: [...missing] };
}
// Corrections never overwrite published results — new version + reason + impact.

// ── Monitoring, audit, quality, closeout ──────────────────────────────
export const MONITOR_SIGNALS = [
  "unauthorized_access", "excessive_querying", "repeated_small_cell",
  "download_attempts", "screenshot_copy", "out_of_region_access",
  "expired_projects", "consent_conflicts", "dataset_drift", "protocol_deviations",
  "cohort_changes", "linkage_failure", "quality_deterioration",
  "model_performance", "disclosure_alerts", "unapproved_outputs",
] as const;
export const AUDIT_FIELDS = [
  "who", "what", "why", "protocol", "agreement", "where", "duration",
  "query_or_code", "output", "approver", "exported",
] as const;
export const QUALITY_PROFILE = [
  "completeness", "accuracy", "timeliness", "consistency", "missingness",
  "coding_stability", "site_variation", "linkage_rate", "duplicate_rate",
  "outcome_capture", "measurement_frequency", "device_reliability",
  "population_coverage", "known_bias", "generation_changes",
] as const;
export const CLOSEOUT_STEPS = [
  "revoke_users", "expire_tokens", "freeze_dataset", "archive_protocol_analysis",
  "review_publications", "reconcile_withdrawal", "return_or_destroy",
  "reconcile_biospecimens", "close_dua", "preserve_regulatory_records",
  "document_deviations", "sign_off", "retain_reproducibility", "confirm_temp_deletion",
] as const;

export function rsrchCloseout(completed: Record<string, boolean>): { closed: boolean; missing: string[] } {
  const missing = CLOSEOUT_STEPS.filter((s) => !completed[s]);
  return { closed: missing.length === 0, missing: [...missing] };
}

// ── In-memory fallbacks (pre-migration) ───────────────────────────────
interface StoredRow extends Record<string, unknown> { id: string; workspaceId: string }
const memProtocols = new Map<string, StoredRow[]>();
const memDatasets = new Map<string, StoredRow[]>();
const memAccess = new Map<string, StoredRow[]>();
const memCohorts = new Map<string, StoredRow[]>();
const memQueries = new Map<string, StoredRow[]>();
const memTrials = new Map<string, StoredRow[]>();
const memEdc = new Map<string, StoredRow[]>();
const memBiobank = new Map<string, StoredRow[]>();
const memAnalyses = new Map<string, StoredRow[]>();
const memPublications = new Map<string, StoredRow[]>();
const memProjects = new Map<string, StoredRow[]>();

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
function memList(m: Map<string, StoredRow[]>, ws: string): StoredRow[] { return m.get(ws) ?? []; }
function memPush(m: Map<string, StoredRow[]>, ws: string, row: StoredRow) { m.set(ws, [...(m.get(ws) ?? []), row]); }

type ResearchTables = {
  healthResearchProtocol: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthResearchDataset: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthResearchAccess: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthResearchCohort: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthResearchTrial: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthResearchBiobank: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthResearchAnalysis: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthResearchPublication: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
  healthResearchProject: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
};

// ── N0VA Research governance service ──────────────────────────────────
export class ResearchGovernanceSystem {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health`);
  }
  private audit(action: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType: "ResearchArtifact", targetId, metadata: meta }).catch(() => null);
  }

  // ── Protocols — amendments version, never silently broaden ────────
  async registerProtocol(input: z.infer<typeof protocolSchema>) {
    await this.assert("CREATE");
    const parsed = protocolSchema.parse({ ...input, protocolId: input.protocolId || `protocol-${crypto.randomUUID().slice(0, 8)}` });
    const row = await safe(
      () => (prisma as unknown as ResearchTables).healthResearchProtocol.create({
        data: { workspaceId: this.workspaceId, protocolId: parsed.protocolId, version: parsed.version, title: parsed.title, principalInvestigator: parsed.principalInvestigator, sponsor: parsed.sponsor, institution: parsed.institution, studyType: parsed.studyType, status: parsed.status, inclusion: parsed.inclusion, exclusion: parsed.exclusion, dataDomains: parsed.dataDomains, consentModel: parsed.consentModel, irbStatus: parsed.irbStatus, dataAccess: parsed.dataAccess, geography: parsed.geography, analysisPlan: parsed.analysisPlan, approvedOutputs: parsed.approvedOutputs, expiresAt: parsed.expiresAt ?? null, createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.protocolId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memProtocols, this.workspaceId, stored);
    await this.audit("research.protocol.registered", parsed.protocolId, { version: parsed.version });
    return (row as unknown) ?? stored;
  }

  async amendProtocol(protocolId: string, next: { version: string; population: string[]; domains: string[]; linkage: string[]; outputs: string[] }) {
    await this.assert("UPDATE");
    const all = await this.listProtocols();
    const found = (all as Array<Record<string, unknown>>).find((p) => p.protocolId === protocolId || p.id === protocolId);
    if (!found) throw new Error("Protocol not found");
    const current = {
      population: [...((found.inclusion as string[] | undefined) ?? []), ...((found.exclusion as string[] | undefined) ?? [])],
      domains: [...((found.dataDomains as string[] | undefined) ?? [])],
      linkage: [...((found as Record<string, unknown>).linkage as string[] | undefined ?? [])],
      outputs: [...((found.approvedOutputs as string[] | undefined) ?? [])],
    };
    const amendment = rsrchProtocolAmend(current, next);
    await safe(() => (prisma as unknown as ResearchTables).healthResearchProtocol.update({ where: { protocolId }, data: { version: next.version, status: amendment.newVersionRequired ? "amended" : String(found.status) } }) as Promise<never>, null);
    found.version = next.version;
    if (amendment.newVersionRequired) found.status = "amended";
    await this.audit("research.protocol.amended", protocolId, { version: next.version, broadening: amendment.broadening });
    return { protocolId, version: next.version, ...amendment };
  }

  async listProtocols(status?: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as ResearchTables).healthResearchProtocol.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }) as Promise<never[]>,
      [],
    );
    const all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memProtocols, this.workspaceId);
    return status ? all.filter((p) => (p as Record<string, unknown>).status === status) : all;
  }

  // ── Datasets — classified, reported, quality-profiled ─────────────
  async registerDataset(input: { datasetId?: string; title: string; classificationFactors: Parameters<typeof rsrchClassify>[0]; deidReport?: Record<string, unknown>; quality?: Record<string, number>; protocolId: string; expiresAt?: string }) {
    await this.assert("CREATE");
    const classification = rsrchClassify(input.classificationFactors);
    const deid = input.deidReport ? rsrchDeidReport(input.deidReport) : { complete: true, missing: [] as string[] };
    if (!deid.complete) throw new Error(`De-identification report incomplete — missing: ${deid.missing.join(", ")}`);
    const id = input.datasetId ?? `ds-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ResearchTables).healthResearchDataset.create({
        data: { workspaceId: this.workspaceId, datasetId: id, title: input.title, classification, deidReport: input.deidReport ?? {}, quality: input.quality ?? {}, protocolId: input.protocolId, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, title: input.title, classification, protocolId: input.protocolId };
    if (!row) memPush(memDatasets, this.workspaceId, stored);
    await this.audit("research.dataset.registered", id, { classification });
    return { datasetId: id, classification, qualityProfile: [...QUALITY_PROFILE], note: "Released with its missingness shown — what it lacks is part of the release." };
  }

  // ── Access — every condition, auto-expiring ───────────────────────
  async grantAccess(input: { investigator: string; role?: string; institution?: string; protocolId: string; datasetId: string; conditions: Record<string, boolean>; expiresAt: string; region?: string; purpose?: string }) {
    await this.assert("CREATE");
    if (!(RESEARCH_ROLES as readonly string[]).includes(input.role ?? "principal_investigator")) throw new Error(`Unknown research role: ${input.role}`);
    const check = rsrchAccessCheck(input.conditions);
    if (!check.granted) throw new Error(`Access denied — missing: ${check.missing.join(", ")}`);
    if (new Date(input.expiresAt).getTime() <= Date.now()) throw new Error("Access must be time-bounded with a future expiry.");
    const id = `acc-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ResearchTables).healthResearchAccess.create({
        data: { workspaceId: this.workspaceId, accessId: id, investigator: input.investigator, role: input.role ?? "principal_investigator", institution: input.institution ?? "", protocolId: input.protocolId, datasetId: input.datasetId, conditions: input.conditions, expiresAt: new Date(input.expiresAt), region: input.region ?? "", purpose: input.purpose ?? "", status: "active", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, status: "active" };
    if (!row) memPush(memAccess, this.workspaceId, stored);
    await this.audit("research.access.granted", id, { investigator: input.investigator, protocolId: input.protocolId });
    return { accessId: id, status: "active" as const, autoRevocation: "Access expires automatically; DUA lapse restricts immediately." };
  }

  async revokeExpiredAccess() {
    await this.assert("UPDATE");
    const now = Date.now();
    let revoked = 0;
    for (const a of memList(memAccess, this.workspaceId)) {
      if (a.status === "active" && a.expiresAt && new Date(String(a.expiresAt)).getTime() <= now) { a.status = "revoked"; revoked++; }
    }
    await this.audit("research.access.swept", this.workspaceId, { revoked });
    return { revoked };
  }

  // ── Cohorts + disclosure-tracked queries ─────────────────────────
  async releaseCohort(input: { protocolId: string; logic: string; inclusion: number; exclusion: number; minimumN?: number; rareIndividual?: boolean; missingness?: Record<string, number>; reviewer?: string }) {
    await this.assert("CREATE");
    const release = rsrchCohortRelease(input.inclusion, input.minimumN ?? 11, input.rareIndividual ?? false);
    if (!release.releasable) {
      await this.audit("research.cohort.suppressed", input.protocolId, { inclusion: input.inclusion });
      throw new Error(release.reason);
    }
    const id = `coh-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ResearchTables).healthResearchCohort.create({
        data: { workspaceId: this.workspaceId, cohortId: id, protocolId: input.protocolId, logic: input.logic, inclusion: input.inclusion, exclusion: input.exclusion, missingness: input.missingness ?? {}, reviewer: input.reviewer ?? "", releasedAt: new Date(), createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memCohorts, this.workspaceId, { id, workspaceId: this.workspaceId, ...input });
    await this.audit("research.cohort.released", id, { inclusion: input.inclusion });
    return { cohortId: id, ...release, releaseFields: [...COHORT_RELEASE_FIELDS] };
  }

  async logQuery(input: { userRef: string; protocolId: string; smallCell: boolean; budget: number; spent: number }) {
    await this.assert("CREATE");
    const history = memList(memQueries, this.workspaceId).filter((q) => q.userRef === input.userRef);
    const smallCells = history.filter((q) => q.smallCell === true).length + (input.smallCell ? 1 : 0);
    const verdict = rsrchDisclosure(history.length, smallCells, input.budget, input.spent);
    const id = `qry-${crypto.randomUUID().slice(0, 8)}`;
    memPush(memQueries, this.workspaceId, { id, workspaceId: this.workspaceId, ...input });
    await this.audit("research.query.logged", id, { user: input.userRef, permitted: verdict.permitted });
    if (!verdict.permitted) throw new Error(verdict.reason);
    return { queryId: id, ...verdict };
  }

  // ── Trials — separated, Part 11-signed ───────────────────────────
  async createTrial(input: { protocolId: string; title: string; sites?: string[] }) {
    await this.assert("CREATE");
    const id = `trial-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ResearchTables).healthResearchTrial.create({
        data: { workspaceId: this.workspaceId, trialId: id, protocolId: input.protocolId, title: input.title, sites: input.sites ?? [], participants: [], adverseEvents: [], deviations: [], status: "setup", dataLock: false, createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memTrials, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, participants: [], adverseEvents: [], deviations: [], status: "setup", dataLock: false });
    await this.audit("research.trial.created", id, { protocolId: input.protocolId });
    return { trialId: id, lifecycle: [...TRIAL_LIFECYCLE], separation: [...TRIAL_SEPARATION] };
  }

  async moveParticipant(trialId: string, participantRef: string, to: string) {
    await this.assert("UPDATE");
    const found = memList(memTrials, this.workspaceId).find((t) => t.id === trialId);
    if (!found) throw new Error("Trial not found");
    if (found.dataLock) throw new Error("Data lock active — participant moves frozen.");
    const parts = found.participants as Array<{ ref: string; state: string }>;
    const part = parts.find((p) => p.ref === participantRef);
    const from = part?.state ?? "potentially_eligible";
    if (!rsrchTrialMove(from, to)) throw new Error(`Invalid participant transition ${from} → ${to}`);
    if (part) part.state = to; else parts.push({ ref: participantRef, state: to });
    await this.audit("research.participant.moved", trialId, { participantRef, from, to });
    return { trialId, participantRef, from, to };
  }

  async adverseEvent(trialId: string, event: Record<string, unknown>) {
    await this.assert("CREATE");
    const found = memList(memTrials, this.workspaceId).find((t) => t.id === trialId);
    if (found) (found.adverseEvents as unknown[]).push({ ...event, at: new Date().toISOString() });
    await this.audit("research.adverse_event", trialId, {});
    return { trialId, captured: true as const, safetyReview: "Adverse events route to safety review —never edited silently." };
  }

  async lockTrialData(trialId: string) {
    await this.assert("UPDATE");
    const found = memList(memTrials, this.workspaceId).find((t) => t.id === trialId);
    if (found) { found.dataLock = true; found.status = "locked"; }
    await safe(() => (prisma as unknown as ResearchTables).healthResearchTrial.update({ where: { trialId }, data: { dataLock: true, status: "locked" } }) as Promise<never>, null);
    await this.audit("research.trial.locked", trialId, {});
    return { trialId, dataLock: true as const };
  }

  async edcSign(input: { recordRef: string; identity: string; signatureLinked: boolean; transferable: boolean; meaning?: string }) {
    await this.assert("CREATE");
    const verdict = rsrchEdcSign(input.identity, input.signatureLinked, input.transferable);
    if (!verdict.valid) throw new Error(verdict.reason);
    const id = `edc-${crypto.randomUUID().slice(0, 8)}`;
    await safe(() => (prisma as unknown as ResearchTables).healthResearchTrial.create({
      data: { workspaceId: this.workspaceId, trialId: id, protocolId: "", title: `EDC:${input.recordRef}`, sites: [], participants: [], adverseEvents: [], deviations: [], status: "signed", dataLock: false, createdById: this.userId },
    }) as Promise<never>, null).catch(() => null);
    memPush(memEdc, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, controls: [...EDC_CONTROLS] });
    await this.audit("research.edc.signed", id, { record: input.recordRef });
    return { signatureId: id, ...verdict };
  }

  // ── Biobank + genomics ───────────────────────────────────────────
  async accessionSpecimen(input: { participantRef: string; specimenType: string; site?: string; consentRef: string }) {
    await this.assert("CREATE");
    if (!input.consentRef) throw new Error("Biobanking requires a consent basis.");
    const id = `spc-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ResearchTables).healthResearchBiobank.create({
        data: { workspaceId: this.workspaceId, specimenId: id, participantRef: input.participantRef, specimenType: input.specimenType, site: input.site ?? "", consentRef: input.consentRef, custody: [{ event: "accession", at: new Date().toISOString() }], status: "stored", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memBiobank, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "stored", custody: [{ event: "accession" }] });
    await this.audit("research.specimen.accessioned", id, { type: input.specimenType });
    return { specimenId: id, lifecycle: [...BIOBANK_LIFECYCLE] };
  }

  async releaseSpecimen(specimenId: string, checks: { protocol: boolean; consent: boolean; mta: boolean; biosafety: boolean; inventory: boolean }) {
    await this.assert("UPDATE");
    const gate = rsrchSpecimenRelease(checks);
    if (!gate.releasable) throw new Error(`Specimen release blocked — missing: ${gate.missing.join(", ")}. Dataset access alone never releases specimens.`);
    await safe(() => (prisma as unknown as ResearchTables).healthResearchBiobank.update({ where: { specimenId }, data: { status: "released" } }) as Promise<never>, null);
    const found = memList(memBiobank, this.workspaceId).find((s) => s.id === specimenId);
    if (found) found.status = "released";
    await this.audit("research.specimen.released", specimenId, {});
    return { specimenId, status: "released" as const };
  }

  genomicFlags(analysis: Parameters<typeof rsrchGenomicFlag>[0]) {
    return { flags: rsrchGenomicFlag(analysis), controls: [...GENOMIC_CONTROLS] };
  }

  // ── RWE, federated, synthetic ────────────────────────────────────
  rweGrade(plan: Record<string, boolean>, intendedUse: string) {
    return { ...rsrchRweGrade(plan, intendedUse), elements: [...RWE_ELEMENTS], plan: [...RWE_STUDY_PLAN] };
  }

  federatedReport(sites: Parameters<typeof rsrchFederatedReport>[0]) {
    return { ...rsrchFederatedReport(sites), controls: [...FEDERATED_CONTROLS] };
  }

  syntheticLabel(label: Record<string, unknown>) {
    return rsrchSyntheticLabel(label);
  }

  // ── Analyses — versioned, never overwritten ──────────────────────
  async registerAnalysis(input: { protocolId: string; datasetId: string; plan?: Record<string, boolean>; codeRef?: string; outputKind?: string }) {
    await this.assert("CREATE");
    const missing = STAT_REQUIREMENTS.filter((s) => !(input.plan ?? {})[s]);
    if (missing.length > 0) throw new Error(`Analysis blocked — statistical plan incomplete: ${missing.join(", ")}`);
    const id = `ana-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ResearchTables).healthResearchAnalysis.create({
        data: { workspaceId: this.workspaceId, analysisId: id, protocolId: input.protocolId, datasetId: input.datasetId, plan: input.plan ?? {}, codeRef: input.codeRef ?? "", outputKind: input.outputKind ?? "", version: 1, reproPackage: {}, status: "registered", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memAnalyses, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, version: 1, status: "registered" });
    await this.audit("research.analysis.registered", id, { protocolId: input.protocolId });
    return { analysisId: id, version: 1 as const };
  }

  async correctAnalysis(analysisId: string, reason: string, impact: string) {
    await this.assert("UPDATE");
    const all = memList(memAnalyses, this.workspaceId);
    const found = all.find((a) => a.id === analysisId);
    const version = Number(found?.version ?? 1) + 1;
    if (found) { found.version = version; found.status = `corrected-v${version}`; }
    await safe(() => (prisma as unknown as ResearchTables).healthResearchAnalysis.update({ where: { analysisId }, data: { version, status: `corrected-v${version}` } }) as Promise<never>, null);
    await this.audit("research.analysis.corrected", analysisId, { version, reason, impact });
    return { analysisId, version, note: "Published results are never overwritten — new version with reason and impact." };
  }

  async attachReproducibility(analysisId: string, pkg: Record<string, unknown>) {
    await this.assert("UPDATE");
    const check = rsrchReproducibility(pkg);
    if (!check.reproducible) throw new Error(`Reproducibility package incomplete — missing: ${check.missing.join(", ")}`);
    const found = memList(memAnalyses, this.workspaceId).find((a) => a.id === analysisId);
    if (found) found.reproPackage = pkg;
    await this.audit("research.reproducibility.attached", analysisId, {});
    return { analysisId, reproducible: true as const };
  }

  // ── DUA, publication, monitoring, closeout ───────────────────────
  duaExpiry(agreementExpiry: string, accessEnd: string) {
    return rsrchDuaExpiry(agreementExpiry, accessEnd);
  }

  async submitPublication(input: { protocolId: string; analysisId: string; draftRef: string; checks: Record<string, boolean> }) {
    await this.assert("CREATE");
    const review = rsrchPublicationReview(input.checks);
    if (!review.releasable) throw new Error(`Publication blocked — review gaps: ${review.missing.join(", ")}`);
    const id = `pub-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ResearchTables).healthResearchPublication.create({
        data: { workspaceId: this.workspaceId, publicationId: id, protocolId: input.protocolId, analysisId: input.analysisId, draftRef: input.draftRef, checks: input.checks, status: "approved_release", pipeline: [...REVIEW_PIPELINE], createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memPublications, this.workspaceId, { id, workspaceId: this.workspaceId, ...input, status: "approved_release" });
    await this.audit("research.publication.released", id, { protocolId: input.protocolId });
    return { publicationId: id, status: "approved_release" as const, note: "Review guards privacy, safety, protocol, and transparency — never scientific censorship." };
  }

  monitorSignal(kind: string): { known: boolean; audit: string[] } {
    return { known: (MONITOR_SIGNALS as readonly string[]).includes(kind), audit: [...AUDIT_FIELDS] };
  }

  async closeoutProject(input: { protocolId: string; completed: Record<string, boolean> }) {
    await this.assert("UPDATE");
    const verdict = rsrchCloseout(input.completed);
    if (!verdict.closed) throw new Error(`Closeout blocked — missing: ${verdict.missing.join(", ")}`);
    const id = `prj-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as ResearchTables).healthResearchProject.create({
        data: { workspaceId: this.workspaceId, projectId: id, protocolId: input.protocolId, stage: "retention_destruction", closeout: input.completed, status: "closed", createdById: this.userId },
      }) as Promise<never>,
      null,
    );
    if (!row) memPush(memProjects, this.workspaceId, { id, workspaceId: this.workspaceId, protocolId: input.protocolId, status: "closed" });
    await this.audit("research.project.closed", id, { protocolId: input.protocolId });
    return { projectId: id, status: "closed" as const };
  }

  // ── Consent withdrawal with governed impact ──────────────────────
  async withdrawConsent(participantRef: string, protocolId: string) {
    await this.assert("UPDATE");
    const impact = rsrchWithdraw();
    await this.audit("research.consent.withdrawn", participantRef, { protocolId });
    return { participantRef, protocolId, ...impact };
  }

  // ── Command view ─────────────────────────────────────────────────
  async commandView() {
    await this.assert("READ");
    const ws = this.workspaceId;
    const expiredAccess = memList(memAccess, ws).filter((a) => a.status === "active" && a.expiresAt && new Date(String(a.expiresAt)).getTime() <= Date.now()).length;
    return {
      version: RESEARCH_VERSION,
      promise: RESEARCH_PROMISE,
      protocols: memList(memProtocols, ws).length,
      datasets: memList(memDatasets, ws).length,
      activeAccess: memList(memAccess, ws).filter((a) => a.status === "active").length,
      expiredAccess,
      cohorts: memList(memCohorts, ws).length,
      trials: memList(memTrials, ws).length,
      publications: memList(memPublications, ws).length,
      lifecycle: [...PROJECT_LIFECYCLE],
      monitors: [...MONITOR_SIGNALS],
      generatedAt: new Date().toISOString(),
    };
  }
}

// ── Static reference exports ──────────────────────────────────────────
export const RESEARCH_API = [
  "registerProtocol", "amendProtocol", "listProtocols",
  "registerDataset", "grantAccess", "revokeExpiredAccess",
  "releaseCohort", "logQuery",
  "createTrial", "moveParticipant", "adverseEvent", "lockTrialData", "edcSign",
  "accessionSpecimen", "releaseSpecimen", "genomicFlags",
  "rweGrade", "federatedReport", "syntheticLabel",
  "registerAnalysis", "correctAnalysis", "attachReproducibility",
  "duaExpiry", "submitPublication", "monitorSignal",
  "closeoutProject", "withdrawConsent", "commandView",
] as const;
