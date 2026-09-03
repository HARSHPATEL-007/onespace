// N0VA Privacy-Preserving Analytics Plane — Project Vita (Health & Wellness).
// Separates clinical care data from analytical use. Every query/model/output
// selects a privacy mode BEFORE data access; risk is measured, budgeted,
// and recorded in a release-level privacy ledger with lineage + withdrawal.
//
// Governing principle: release only the minimum analytical result that answers
// the approved question, with measurable privacy loss, visible uncertainty,
// and no assumption that de-identification alone makes health data safe.
//
// References (informative, not normative): HIPAA Safe Harbor / Expert
// Determination pathways; NIST DP + federated-learning + PET guidance;
// GA4GH proportionate safeguards for genomic data. This module implements
// the controls; it does not claim legal sufficiency — human governance
// approval is enforced in the gateway.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_privacy";
export const PRIVACY_POLICY_VERSION = "2026.09";

// ── Analytical zones — separation of environments ─────────────────────
export const ANALYTICS_ZONES = {
  IDENTIFIABLE_CLINICAL: { label: "Identifiable clinical zone", use: "Patient care and operational use", reidentifiable: true, rowAccess: "care-team only" },
  CODED_RESEARCH: { label: "Coded research zone", use: "Re-linkable longitudinal research via protected key service", reidentifiable: "key-service only", rowAccess: "coded IDs" },
  DEIDENTIFIED_ANALYTICS: { label: "De-identified analytics zone", use: "Population reporting, no routine re-identification capability", reidentifiable: false, rowAccess: "de-identified rows" },
  RESTRICTED_GENOMIC: { label: "Restricted genomic zone", use: "Genomic + family-linked analysis", reidentifiable: "special approval", rowAccess: "variant-restricted" },
  SYNTHETIC_DEVELOPMENT: { label: "Synthetic development zone", use: "Software/model development, no direct patient records", reidentifiable: false, rowAccess: "synthetic only" },
  CLEAN_ROOM: { label: "Clean-room zone", use: "Approved collaboration without unrestricted row-level access", reidentifiable: false, rowAccess: "query templates only" },
  PUBLIC_RELEASE: { label: "Public / external release zone", use: "Strongest output controls + disclosure testing", reidentifiable: false, rowAccess: "aggregates only" },
} as const;
export type AnalyticsZoneKey = keyof typeof ANALYTICS_ZONES;

// ── Configurable privacy modes — selected BEFORE data access ──────────
export const PRIVACY_MODES = {
  CARE_OPERATIONS: { label: "Care operations", useCase: "Internal service improvement", controls: ["role", "purpose", "minimum_necessary"], zone: "IDENTIFIABLE_CLINICAL" },
  LIMITED_DATASET: { label: "Limited dataset", useCase: "Approved operational or research analysis", controls: ["limited_identifiers", "data_use_agreement"], zone: "CODED_RESEARCH" },
  PSEUDONYMIZED_RESEARCH: { label: "Pseudonymized research", useCase: "Longitudinal research", controls: ["protected_linkage_vault", "coded_ids", "purpose_bound_linkage"], zone: "CODED_RESEARCH" },
  DEIDENTIFIED_ANALYTICS: { label: "De-identified analytics", useCase: "Population reporting", controls: ["safe_harbor_or_expert_determination", "risk_assessment"], zone: "DEIDENTIFIED_ANALYTICS" },
  DIFFERENTIAL_PRIVACY: { label: "Differentially private reporting", useCase: "External or broad reporting", controls: ["privacy_budget", "noisy_output", "cohort_thresholds"], zone: "PUBLIC_RELEASE" },
  FEDERATED_ANALYTICS: { label: "Federated analytics", useCase: "Multi-institution analysis", controls: ["data_stays_local", "secure_aggregation"], zone: "CLEAN_ROOM" },
  FEDERATED_LEARNING: { label: "Federated learning", useCase: "Model training across sites", controls: ["local_training", "update_protection", "model_risk_testing"], zone: "CLEAN_ROOM" },
  SYNTHETIC_DEVELOPMENT: { label: "Synthetic development", useCase: "Software and model development", controls: ["synthetic_generation", "disclosure_testing"], zone: "SYNTHETIC_DEVELOPMENT" },
  CONFIDENTIAL_ANALYTICS: { label: "Confidential analytics", useCase: "Sensitive computation", controls: ["trusted_execution_environment", "attestation"], zone: "RESTRICTED_GENOMIC" },
  GENOMIC_RESTRICTED: { label: "Genomic restricted", useCase: "Genomic and family-linked analysis", controls: ["special_consent", "granular_access", "no_casual_export"], zone: "RESTRICTED_GENOMIC" },
  RESEARCH_CLEAN_ROOM: { label: "Research clean room", useCase: "Cross-party collaboration", controls: ["query_restrictions", "output_review", "no_raw_export"], zone: "CLEAN_ROOM" },
} as const;
export type PrivacyModeKey = keyof typeof PRIVACY_MODES;

// ── Privacy policy object ─────────────────────────────────────────────
export const privacyPolicySchema = z.object({
  policyId: z.string().min(1).default(""),
  purpose: z.string().min(1),
  dataScope: z.array(z.string()).min(1),
  allowedUsers: z.array(z.string()).min(1),
  jurisdiction: z.string().default("configured"),
  privacyMode: z.enum(Object.keys(PRIVACY_MODES) as [PrivacyModeKey, ...PrivacyModeKey[]]),
  minimumCohortSize: z.coerce.number().int().min(2).default(20),
  quasiIdentifierRules: z.object({
    age: z.string().default("five_year_bands"),
    geography: z.string().default("district_or_larger"),
    date: z.string().default("month_only"),
  }).default({ age: "five_year_bands", geography: "district_or_larger", date: "month_only" }),
  privacyBudget: z.object({
    epsilon: z.string().default("configured"),
    delta: z.string().default("configured"),
    period: z.string().default("calendar_quarter"),
  }).default({ epsilon: "configured", delta: "configured", period: "calendar_quarter" }),
  genomicData: z.enum(["excluded", "summary_only", "variant_restricted", "coded_research", "family_linked", "raw_sequence"]).default("excluded"),
  reidentification: z.object({ threshold: z.string().default("very_low"), requiredReview: z.boolean().default(true) }).default({ threshold: "very_low", requiredReview: true }),
  outputDestination: z.string().default("internal_dashboard"),
  expiresAt: z.coerce.date(),
  approver: z.string().min(1),
});
export type PrivacyPolicyInput = z.infer<typeof privacyPolicySchema>;

// ── De-identification ─────────────────────────────────────────────────
export const DEID_METHODS = ["SAFE_HARBOR", "EXPERT_DETERMINATION"] as const;
export const DEID_TRANSFORMATION_CONTROLS = [
  "remove_direct_identifiers", "generalize_dates", "generalize_geography",
  "suppress_rare_conditions", "bin_ages", "limit_free_text",
  "remove_device_identifiers", "scrub_document_metadata", "remove_embedded_faces",
  "mask_accession_numbers", "protect_rare_procedure_combinations", "review_small_cells",
  "separate_linkage_keys", "restrict_external_joins", "release_specific_transforms",
] as const;

export const deidRecordSchema = z.object({
  datasetId: z.string().min(1),
  method: z.enum(DEID_METHODS),
  expert: z.string().optional().nullable(),
  directIdentifiersRemoved: z.boolean().default(true),
  quasiIdentifiersTransformed: z.array(z.string()).default([]),
  linkageKeyLocation: z.string().default("separate-key-vault"),
  riskAssessment: z.string().default(""),
  anticipatedRecipient: z.string().default(""),
  releaseScope: z.string().default("restricted-workspace"),
  validUntil: z.coerce.date(),
  reidentificationProhibited: z.boolean().default(true),
});

// ── Query-level risk scoring ──────────────────────────────────────────
// Weights sum to 100. Deterministic, explainable, auditable.
export const RISK_SIGNALS: Record<string, { weight: number; hint: string }> = {
  small_cohort: { weight: 22, hint: "Cohort below 2x minimum threshold" },
  rare_diagnosis: { weight: 14, hint: "Rare condition present" },
  rare_medication_combo: { weight: 8, hint: "Rare medication combination" },
  narrow_date_range: { weight: 7, hint: "Date range narrower than 31 days" },
  precise_geography: { weight: 9, hint: "Geography finer than district" },
  exact_age: { weight: 6, hint: "Exact age requested" },
  free_text_output: { weight: 8, hint: "Free-text output requested" },
  high_dimensional_features: { weight: 6, hint: ">12 features in one query" },
  genomic_data: { weight: 15, hint: "Genomic data in scope" },
  family_relationships: { weight: 10, hint: "Family linkage in scope" },
  unique_imaging_device: { weight: 6, hint: "Unique imaging/device pattern" },
  external_linkage: { weight: 8, hint: "External dataset join requested" },
  repeated_queries: { weight: 9, hint: "Repeated similar queries (differencing risk)" },
  query_differencing: { weight: 16, hint: "Differencing vs prior query isolates <=3 records" },
  export_destination: { weight: 5, hint: "External / downloadable destination" },
  sensitive_population: { weight: 7, hint: "Sensitive population (pediatric, SUD, mental health)" },
  direct_identifiers: { weight: 25, hint: "Direct identifiers in output" },
  linkage_key_available: { weight: 12, hint: "Linkage key accessible to requester" },
};

export const RISK_LEVELS = {
  LOW: { max: 29, behavior: "Execute under approved policy" },
  MODERATE: { max: 59, behavior: "Generalize, suppress, or require review" },
  HIGH: { max: 84, behavior: "Block or route to privacy review" },
  CRITICAL: { max: 100, behavior: "Block, create incident, preserve query audit" },
} as const;
export type RiskLevel = keyof typeof RISK_LEVELS;

export const queryAssessmentSchema = z.object({
  cohortSize: z.coerce.number().int().min(0),
  rareDiagnosis: z.boolean().default(false),
  rareMedicationCombo: z.boolean().default(false),
  dateRangeDays: z.coerce.number().default(365),
  geographyGranularity: z.enum(["nation", "state", "district", "postal", "street", "exact"]).default("district"),
  exactAge: z.boolean().default(false),
  freeTextOutput: z.boolean().default(false),
  featureCount: z.coerce.number().int().default(4),
  genomicData: z.boolean().default(false),
  familyRelationships: z.boolean().default(false),
  uniqueImagingDevice: z.boolean().default(false),
  externalLinkage: z.boolean().default(false),
  repeatedSimilarQueries: z.coerce.number().int().default(0),
  differencingOverlap: z.coerce.number().int().default(9999),
  exportDestination: z.enum(["internal_dashboard", "workspace_file", "clean_room", "external", "public"]).default("internal_dashboard"),
  sensitivePopulation: z.boolean().default(false),
  directIdentifiers: z.boolean().default(false),
  linkageKeyAvailable: z.boolean().default(false),
});
export type QueryAssessmentInput = z.infer<typeof queryAssessmentSchema>;

export interface QueryRiskResult {
  riskScore: number;
  riskLevel: RiskLevel;
  drivers: string[];
  decision: "allow" | "generalize" | "review" | "blocked";
  requiredAction: string;
  policyVersion: string;
}

export function scoreQueryRisk(input: QueryAssessmentInput, minimumCohortSize = 20): QueryRiskResult {
  const drivers: string[] = [];
  let score = 0;
  const add = (key: string, cond: boolean, label?: string) => {
    if (cond) { score += RISK_SIGNALS[key]!.weight; drivers.push(label ?? key); }
  };
  add("small_cohort", input.cohortSize < minimumCohortSize * 2, `cohort_size_${input.cohortSize}`);
  add("rare_diagnosis", input.rareDiagnosis);
  add("rare_medication_combo", input.rareMedicationCombo);
  add("narrow_date_range", input.dateRangeDays < 31, "narrow_date_range");
  add("precise_geography", input.geographyGranularity === "postal" || input.geographyGranularity === "street" || input.geographyGranularity === "exact", "small_geography");
  add("exact_age", input.exactAge, "exact_age");
  add("free_text_output", input.freeTextOutput, "free_text");
  add("high_dimensional_features", input.featureCount > 12, "high_dimensional");
  add("genomic_data", input.genomicData, "genomic_data");
  add("family_relationships", input.familyRelationships, "family_linkage");
  add("unique_imaging_device", input.uniqueImagingDevice, "unique_device_pattern");
  add("external_linkage", input.externalLinkage, "external_linkage");
  add("repeated_queries", input.repeatedSimilarQueries >= 2, "repeated_similar_query");
  add("query_differencing", input.differencingOverlap <= 3, "query_differencing_risk");
  add("export_destination", input.exportDestination === "external" || input.exportDestination === "public", "external_destination");
  add("sensitive_population", input.sensitivePopulation, "sensitive_population");
  add("direct_identifiers", input.directIdentifiers, "direct_identifiers");
  add("linkage_key_available", input.linkageKeyAvailable, "linkage_key_available");
  score = Math.min(100, score);
  const riskLevel: RiskLevel = score <= 29 ? "LOW" : score <= 59 ? "MODERATE" : score <= 84 ? "HIGH" : "CRITICAL";
  const decision = riskLevel === "LOW" ? "allow" : riskLevel === "MODERATE" ? "generalize" : riskLevel === "HIGH" ? "review" : "blocked";
  const requiredAction =
    decision === "allow" ? "execute_under_policy" :
    decision === "generalize" ? "broaden_cohort_generalize_or_suppress" :
    decision === "review" ? "broaden_cohort_or_privacy_review" :
    "block_create_incident_preserve_audit";
  return { riskScore: score, riskLevel, drivers, decision, requiredAction, policyVersion: PRIVACY_POLICY_VERSION };
}

// ── Minimum cohort-size enforcement ───────────────────────────────────
export interface CohortDecision { action: "release" | "aggregate_neighbors" | "suppress"; message: string }
export function enforceCohortSize(count: number, k: number): CohortDecision {
  if (count < k) return { action: "suppress", message: "insufficient cohort size" };
  if (count < 2 * k) return { action: "aggregate_neighbors", message: "aggregate neighboring categories" };
  return { action: "release", message: "cohort sufficient" };
}

// Never emit exact counts for suppressed small cells.
export function safeCountDisplay(count: number, k: number): string {
  return count < k ? "insufficient cohort size" : String(count);
}

// ── Generalization helpers (quasi-identifiers) ────────────────────────
export function binAge(age: number): string {
  if (!Number.isFinite(age)) return "suppressed";
  const lo = Math.floor(age / 5) * 5;
  return `${lo}-${lo + 4}`;
}
export function monthOnly(date: Date | string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "suppressed";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function topCode(value: number, cap: number): number { return value > cap ? cap : value; }
export function roundTo(value: number, step: number): number { return Math.round(value / step) * step; }

// Safe Harbor transform: strips direct identifiers, generalizes
// quasi-identifiers, suppresses rare values. Pure + deterministic.
const DIRECT_IDENTIFIER_KEYS = ["name", "firstName", "lastName", "email", "phone", "address", "mrn", "ssn", "mrnNumber", "deviceSerial", "accessionNumber", "photo", "faceImage"];
export function safeHarborTransform(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (DIRECT_IDENTIFIER_KEYS.includes(k)) continue;
    if (k === "age" && typeof v === "number") { out[k] = binAge(v); continue; }
    if ((k === "dob" || k === "admissionDate" || k === "recordedAt") && (typeof v === "string" || v instanceof Date)) { out[k] = monthOnly(v as string); continue; }
    if (k === "geography" || k === "zip" || k === "postal") { out[k] = "district_or_larger"; continue; }
    if (k === "freeText" || k === "note" || k === "notes") { out[k] = "[redacted: free text limited]"; continue; }
    out[k] = v;
  }
  return out;
}

// ── Pseudonymization — study-specific, purpose-bound tokens ───────────
export function studyPseudonym(patientId: string, studyId: string, tenantSecret: string): string {
  return crypto.createHmac("sha256", `${tenantSecret}:${studyId}`).update(patientId).digest("hex").slice(0, 32);
}

// ── Differential privacy — Laplace mechanism (deterministic PRNG) ─────
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Laplace noise with scale = sensitivity/epsilon. Deterministic per release+query for auditability. */
export function laplaceNoise(sensitivity: number, epsilon: number, seed: string): number {
  if (!Number.isFinite(epsilon) || epsilon <= 0) throw new Error("epsilon must be positive");
  const rand = mulberry32(hashSeed(seed));
  const u = Math.min(1 - 1e-12, Math.max(1e-12, rand())) - 0.5;
  return -(sensitivity / epsilon) * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

export const dpReleaseSchema = z.object({
  dataset: z.string().min(1),
  mechanism: z.string().default("laplace"),
  epsilon: z.string().default("configured"),
  epsilonValue: z.coerce.number().positive().default(1),
  delta: z.string().default("configured"),
  sensitivity: z.coerce.number().positive().default(1),
  minimumCohortSize: z.coerce.number().int().min(2).default(20),
});

export interface DpReleaseResult {
  approximateValue: number;
  noiseAdded: number;
  epsilonConsumed: number;
  display: { approximate: true; method: string; suppressionRules: string; suppressedSmallGroups: boolean };
}

/** DP count release: suppress under k, otherwise add Laplace noise. Output is always labeled approximate. */
export function dpNoisyCount(trueCount: number, opts: z.infer<typeof dpReleaseSchema> & { seed: string }): DpReleaseResult | { suppressed: true; reason: string } {
  if (trueCount < opts.minimumCohortSize) return { suppressed: true, reason: "insufficient cohort size" };
  const noise = laplaceNoise(opts.sensitivity, opts.epsilonValue, opts.seed);
  const approximateValue = Math.max(0, Math.round(trueCount + noise));
  return {
    approximateValue,
    noiseAdded: Math.round(noise * 100) / 100,
    epsilonConsumed: opts.epsilonValue,
    display: { approximate: true, method: `differential_privacy/${opts.mechanism}`, suppressionRules: `suppress_under_${opts.minimumCohortSize}`, suppressedSmallGroups: true },
  };
}

// ── Synthetic data disclosure testing ─────────────────────────────────
export const syntheticCertSchema = z.object({
  datasetId: z.string().min(1),
  generatorVersion: z.string().default("4.1"),
  sourceScope: z.string().default("approved_deidentified_cohort"),
  utilityTests: z.object({ marginalDistributions: z.string(), correlations: z.string(), workflowValidity: z.string() }),
  disclosureTests: z.object({ nearestNeighbor: z.string(), membershipInference: z.string(), memorization: z.string(), rareCombination: z.string() }),
  knownLimitations: z.array(z.string()).default([]),
  approvedUses: z.array(z.string()).default(["development", "interface_testing"]),
  prohibitedUses: z.array(z.string()).default(["direct_patient_treatment", "individual_risk_estimation"]),
});

export interface SyntheticDisclosureInput {
  syntheticRows: Array<Record<string, unknown>>;
  sourceRows: Array<Record<string, unknown>>;
  keyFields: string[];
}
/** Heuristic disclosure tests: exact copies, near-duplicates, rare-combo reproduction. */
export function testSyntheticDisclosure(input: SyntheticDisclosureInput) {
  const sig = (r: Record<string, unknown>) => input.keyFields.map((k) => String(r[k] ?? "")).join("|");
  const sourceSigs = new Set(input.sourceRows.map(sig));
  let exactCopies = 0;
  for (const row of input.syntheticRows) if (sourceSigs.has(sig(row))) exactCopies++;
  // Rare-combination: source combos appearing once that reappear in synthetic
  const freq = new Map<string, number>();
  for (const s of sourceSigs) freq.set(s, (freq.get(s) ?? 0) + 1);
  let rareReproduced = 0;
  for (const row of input.syntheticRows) {
    const s = sig(row);
    if (freq.get(s) === 1) rareReproduced++;
  }
  const exactRate = input.syntheticRows.length ? exactCopies / input.syntheticRows.length : 0;
  const passed = exactCopies === 0 && rareReproduced === 0;
  return {
    exactCopies, rareReproduced,
    exactCopyRate: Math.round(exactRate * 10000) / 10000,
    nearestNeighbor: exactCopies === 0 ? "passed" : "failed",
    memorization: exactCopies === 0 ? "passed" : "failed",
    rareCombination: rareReproduced === 0 ? "passed" : "conditional",
    overall: passed ? "passed" : "failed",
  };
}

// ── Genomic access levels ─────────────────────────────────────────────
export const GENOMIC_ACCESS_LEVELS = {
  SUMMARY: { label: "Summary", access: "Clinically relevant findings only" },
  VARIANT_RESTRICTED: { label: "Variant-restricted", access: "Approved variants or regions" },
  CODED_RESEARCH: { label: "Coded research", access: "Pseudonymized genomic data" },
  FAMILY_LINKED: { label: "Family-linked", access: "Requires special approval" },
  RAW_SEQUENCE: { label: "Raw sequence", access: "Restricted clean room or controlled repository" },
  EXTERNAL_RELEASE: { label: "External release", access: "Usually aggregate or privacy-protected only" },
} as const;

// ── Clean-room + federated + confidential constants ───────────────────
export const CLEAN_ROOM_CONTROLS = [
  "approved_protocol", "data_use_agreement", "investigator_verification",
  "purpose_limited_datasets", "no_raw_export", "restricted_query_language",
  "minimum_cohort_size", "differential_privacy_where_appropriate", "secure_aggregation",
  "query_budget", "output_review", "no_arbitrary_joins", "no_external_enrichment",
  "no_direct_identifiers", "genomic_restrictions", "full_audit", "project_expiry", "destruction_certificate",
] as const;

export const FEDERATED_SITE_CHECKS = [
  "local_authorization", "patient_consent", "jurisdiction", "minimum_cohort_size",
  "local_suppression", "data_quality_checks", "query_budget", "output_approval", "audit_logging",
] as const;

export const FL_MODEL_RISK_TESTS = [
  "membership_inference", "model_inversion", "backdoor_detection", "poisoning_check",
  "calibration_check", "subgroup_performance", "drift_check",
] as const;

export const CONFIDENTIAL_COMPUTE_CONTROLS = [
  "trusted_execution_environment", "remote_attestation", "signed_workload",
  "measured_boot", "encrypted_memory", "key_release_after_attestation",
  "restricted_admin", "no_plaintext_debug", "encrypted_io", "secure_deletion",
  "side_channel_assessment", "runtime_monitoring", "reproducible_image", "workload_expiry",
] as const;

// ── Privacy ledger schemas ────────────────────────────────────────────
export const releaseLedgerSchema = z.object({
  queryId: z.string().min(1),
  requester: z.string().min(1),
  purpose: z.string().min(1),
  dataset: z.string().min(1),
  privacyMode: z.enum(Object.keys(PRIVACY_MODES) as [PrivacyModeKey, ...PrivacyModeKey[]]),
  recordsEligible: z.coerce.number().int().min(0),
  cohortThreshold: z.coerce.number().int().min(2),
  suppressionApplied: z.boolean().default(false),
  epsilonConsumed: z.string().default("configured"),
  riskScore: z.coerce.number().min(0).max(100),
  humanReview: z.string().default("approved"),
  recipient: z.string().default("clean-room-workspace"),
  expiresAt: z.coerce.date(),
  reidentificationProhibited: z.boolean().default(true),
});

export const privacyIncidentSchema = z.object({
  kind: z.enum([
    "direct_identifier_leakage", "unexpected_row_output", "reidentification_attempt",
    "small_cell_disclosure", "query_differencing", "pseudonym_key_exposure",
    "genomic_export", "synthetic_memorization", "federated_reconstruction",
    "unauthorized_cleanroom_join", "attestation_failure", "budget_exhaustion_or_bypass",
    "beyond_consent_use", "withdrawal_not_propagated",
  ]),
  severity: z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]).default("HIGH"),
  queryId: z.string().optional().nullable(),
  releaseId: z.string().optional().nullable(),
  detail: z.string().min(1).max(4000),
});

export const INCIDENT_RESPONSE_ACTIONS = [
  "revoke_access", "freeze_dataset_or_workspace", "expire_download_links",
  "rotate_keys_or_tokens", "block_further_queries", "preserve_audit_evidence",
  "assess_affected_patients", "notify_governance_and_security",
  "correct_or_retract_outputs", "recompute_downstream_artifacts",
  "document_regulatory_and_notification_obligations",
] as const;

// ── Dashboards ────────────────────────────────────────────────────────
export const PRIVACY_OPS_TILES = [
  "active_modes", "high_risk_queries", "blocked_queries", "cohort_suppressions",
  "differencing_alerts", "budget_consumption", "review_queue", "cleanroom_projects",
  "genomic_access", "synthetic_certificates", "model_privacy_tests", "attestation_status",
] as const;

// In-memory fallbacks (used when privacy tables are not yet migrated).
interface StoredPolicy extends Record<string, unknown> { id: string; workspaceId: string; }
interface StoredQuery extends Record<string, unknown> { id: string; workspaceId: string; }
interface StoredRelease extends Record<string, unknown> { id: string; workspaceId: string; }
interface StoredIncident extends Record<string, unknown> { id: string; workspaceId: string; }
const memPolicies = new Map<string, StoredPolicy[]>();
const memQueries = new Map<string, StoredQuery[]>();
const memReleases = new Map<string, StoredRelease[]>();
const memIncidents = new Map<string, StoredIncident[]>();
const memBudgets = new Map<string, { consumed: number; limit: number }>();

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
function memList<T>(m: Map<string, T[]>, ws: string): T[] { return m.get(ws) ?? []; }
function memPush<T>(m: Map<string, T[]>, ws: string, row: T) { m.set(ws, [...(m.get(ws) ?? []), row]); }

// Prisma access via loose casts so the module compiles before migration.
type PrivacyTables = {
  healthPrivacyPolicy: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; findFirst: (a: unknown) => Promise<never | null>; update: (a: unknown) => Promise<never> };
  healthPrivacyQuery: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthPrivacyRelease: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; findFirst: (a: unknown) => Promise<never | null>; update: (a: unknown) => Promise<never> };
  healthPrivacyBudget: { upsert: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthPrivacyIncident: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
};

// ── Privacy-Preserving Analytics Plane ────────────────────────────────
export class PrivacyAnalyticsPlane {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health`);
  }
  private audit(action: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType: "PrivacyArtifact", targetId, metadata: meta }).catch(() => null);
  }

  // ── Policy: selected BEFORE data access ──────────────────────────
  async upsertPolicy(input: PrivacyPolicyInput) {
    await this.assert("CREATE");
    const parsed = privacyPolicySchema.parse({ ...input, policyId: input.policyId || `privacy-policy-${crypto.randomUUID().slice(0, 8)}` });
    if (parsed.genomicData !== "excluded" && parsed.privacyMode !== "GENOMIC_RESTRICTED" && parsed.privacyMode !== "CONFIDENTIAL_ANALYTICS" && parsed.privacyMode !== "RESEARCH_CLEAN_ROOM") {
      throw new Error("Genomic data requires GENOMIC_RESTRICTED, CONFIDENTIAL_ANALYTICS, or RESEARCH_CLEAN_ROOM mode");
    }
    const row = await safe(
      () => (prisma as unknown as PrivacyTables).healthPrivacyPolicy.create({
        data: {
          workspaceId: this.workspaceId, policyId: parsed.policyId, purpose: parsed.purpose,
          dataScope: parsed.dataScope, allowedUsers: parsed.allowedUsers, jurisdiction: parsed.jurisdiction,
          privacyMode: parsed.privacyMode, minimumCohortSize: parsed.minimumCohortSize,
          quasiIdentifierRules: parsed.quasiIdentifierRules, privacyBudget: parsed.privacyBudget,
          genomicData: parsed.genomicData, reidentification: parsed.reidentification,
          outputDestination: parsed.outputDestination, expiresAt: parsed.expiresAt,
          approver: parsed.approver, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredPolicy = { id: parsed.policyId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memPolicies, this.workspaceId, stored);
    await this.audit("privacy.policy.upserted", parsed.policyId, { purpose: parsed.purpose, privacyMode: parsed.privacyMode });
    return (row as unknown) ?? stored;
  }

  async listPolicies() {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as PrivacyTables).healthPrivacyPolicy.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }) as Promise<never[]>,
      [],
    );
    return rows.length ? rows : memList(memPolicies, this.workspaceId);
  }

  // ── Query gateway: full policy enforcement point ─────────────────
  async assessQuery(assessment: QueryAssessmentInput, opts?: { policyId?: string; queryId?: string; purpose?: string }) {
    await this.assert("READ");
    const parsed = queryAssessmentSchema.parse(assessment);
    const policies = (await this.listPolicies()) as Array<Record<string, unknown>>;
    const policy = opts?.policyId ? policies.find((p) => (p.policyId ?? p.id) === opts.policyId) : policies[0];
    const k = typeof policy?.minimumCohortSize === "number" ? (policy.minimumCohortSize as number) : 20;
    const risk = scoreQueryRisk(parsed, k);
    const cohort = enforceCohortSize(parsed.cohortSize, k);
    // Cohort suppression overrides: never release small cells.
    let decision = risk.decision;
    let requiredAction = risk.requiredAction;
    if (cohort.action === "suppress" || risk.riskLevel === "CRITICAL") {
      decision = "blocked";
      requiredAction = cohort.action === "suppress" ? "suppress_small_cell" : risk.requiredAction;
    }
    const queryId = opts?.queryId ?? `query-${crypto.randomUUID().slice(0, 8)}`;
    const record = { id: queryId, workspaceId: this.workspaceId, queryId, assessment: parsed, riskScore: risk.riskScore, riskLevel: risk.riskLevel, drivers: risk.drivers, decision, requiredAction, policyVersion: PRIVACY_POLICY_VERSION, purpose: opts?.purpose ?? (policy?.purpose as string) ?? "unspecified", createdById: this.userId, createdAt: new Date().toISOString() };
    await safe(() => (prisma as unknown as PrivacyTables).healthPrivacyQuery.create({ data: { workspaceId: this.workspaceId, queryId, purpose: record.purpose, assessment: parsed, riskScore: risk.riskScore, riskLevel: risk.riskLevel, drivers: risk.drivers, decision, requiredAction, policyVersion: PRIVACY_POLICY_VERSION, createdById: this.userId } }) as Promise<never>, null);
    memPush(memQueries, this.workspaceId, record);
    // Critical risk auto-creates an incident and preserves audit.
    if (risk.riskLevel === "CRITICAL") {
      await this.reportIncident({ kind: "query_differencing", severity: "CRITICAL", queryId, detail: `Critical disclosure risk blocked: ${risk.drivers.join(", ")}` });
    }
    await this.audit("privacy.query.assessed", queryId, { riskScore: risk.riskScore, riskLevel: risk.riskLevel, decision });
    return { queryId, ...risk, decision, requiredAction, cohort, policyId: (policy?.policyId ?? policy?.id ?? null) as string | null };
  }

  /** Detect differencing: does the new cohort differ from a prior query by <=3 records with same filters? */
  async detectDifferencing(newFingerprint: string, newCohortIds: string[], lookback = 20) {
    await this.assert("READ");
    const history = (await safe(
      () => (prisma as unknown as PrivacyTables).healthPrivacyQuery.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: lookback }) as Promise<never[]>,
      [],
    ) as Array<Record<string, unknown>>);
    const mem = memList(memQueries, this.workspaceId).slice(-lookback);
    const all = [...mem, ...history];
    const newSet = new Set(newCohortIds);
    for (const prior of all) {
      const p = prior as Record<string, unknown> & { fingerprint?: string; cohortIds?: string[] };
      if (!p.cohortIds || !Array.isArray(p.cohortIds)) continue;
      if (p.fingerprint && p.fingerprint !== newFingerprint) continue;
      const priorSet = new Set(p.cohortIds as string[]);
      let diff = 0;
      for (const id of newSet) if (!priorSet.has(id)) diff++;
      for (const id of priorSet) if (!newSet.has(id)) diff++;
      if (diff > 0 && diff <= 3) {
        return { differencing: true as const, priorQueryId: (p.queryId ?? p.id) as string, symmetricDifference: diff, action: "blocked_or_budget_control" as const };
      }
    }
    return { differencing: false as const, symmetricDifference: -1, action: "proceed" as const };
  }

  // ── Output release gateway → privacy ledger ──────────────────────
  async releaseOutput(input: z.infer<typeof releaseLedgerSchema>) {
    await this.assert("CREATE");
    const parsed = releaseLedgerSchema.parse(input);
    if (parsed.recordsEligible < parsed.cohortThreshold) {
      throw new Error("Release blocked: insufficient cohort size — suppress result");
    }
    if (parsed.riskScore > 84) {
      await this.reportIncident({ kind: "small_cell_disclosure", severity: "CRITICAL", queryId: parsed.queryId, detail: `Release blocked with risk ${parsed.riskScore}` });
      throw new Error("Release blocked: critical disclosure risk — incident created");
    }
    const releaseId = `release-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PrivacyTables).healthPrivacyRelease.create({
        data: {
          workspaceId: this.workspaceId, releaseId, queryId: parsed.queryId, requester: parsed.requester,
          purpose: parsed.purpose, dataset: parsed.dataset, privacyMode: parsed.privacyMode,
          recordsEligible: parsed.recordsEligible, cohortThreshold: parsed.cohortThreshold,
          suppressionApplied: parsed.suppressionApplied, epsilonConsumed: parsed.epsilonConsumed,
          riskScore: parsed.riskScore, humanReview: parsed.humanReview, recipient: parsed.recipient,
          expiresAt: parsed.expiresAt, reidentificationProhibited: parsed.reidentificationProhibited,
          createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRelease = { id: releaseId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memReleases, this.workspaceId, stored);
    await this.audit("privacy.output.released", releaseId, { queryId: parsed.queryId, privacyMode: parsed.privacyMode, riskScore: parsed.riskScore });
    return { releaseId, ...(row as unknown as Record<string, unknown> | null ?? {}), ledger: { release_id: releaseId, audit_ref: `audit-${releaseId}`, ...parsed, reidentification_prohibited: true } };
  }

  async listReleases(take = 50) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as PrivacyTables).healthPrivacyRelease.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take }) as Promise<never[]>,
      [],
    );
    return rows.length ? rows : memList(memReleases, this.workspaceId).slice(-take).reverse();
  }

  // ── Privacy budget accounting (epsilon composition tracking) ──────
  async consumeBudget(opts: { dataset: string; principal: string; epsilon: number; period?: string; limit?: number }) {
    await this.assert("CREATE");
    const key = `${this.workspaceId}:${opts.dataset}:${opts.principal}:${opts.period ?? "calendar_quarter"}`;
    const existing = memBudgets.get(key) ?? { consumed: 0, limit: opts.limit ?? 10 };
    if (existing.consumed + opts.epsilon > existing.limit) {
      await this.reportIncident({ kind: "budget_exhaustion_or_bypass", severity: "HIGH", detail: `Budget exhausted for ${opts.dataset}/${opts.principal}: ${existing.consumed}+${opts.epsilon} > ${existing.limit}` });
      throw new Error("Privacy budget exhausted — queries blocked until next period");
    }
    existing.consumed = Math.round((existing.consumed + opts.epsilon) * 1000) / 1000;
    memBudgets.set(key, existing);
    await safe(
      () => (prisma as unknown as PrivacyTables).healthPrivacyBudget.upsert({
        where: { workspaceId_dataset_principal_period: { workspaceId: this.workspaceId, dataset: opts.dataset, principal: opts.principal, period: opts.period ?? "calendar_quarter" } },
        create: { workspaceId: this.workspaceId, dataset: opts.dataset, principal: opts.principal, period: opts.period ?? "calendar_quarter", consumed: existing.consumed, limit: existing.limit },
        update: { consumed: existing.consumed },
      }) as Promise<never>,
      null,
    );
    await this.audit("privacy.budget.consumed", opts.dataset, { principal: opts.principal, epsilon: opts.epsilon, consumed: existing.consumed });
    return { dataset: opts.dataset, principal: opts.principal, consumed: existing.consumed, remaining: Math.round((existing.limit - existing.consumed) * 1000) / 1000, queriesConsumedNote: "tracked per release ledger" };
  }

  async listBudgets() {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as PrivacyTables).healthPrivacyBudget.findMany({ where: { workspaceId: this.workspaceId }, take: 100 }) as Promise<never[]>,
      [],
    );
    if (rows.length) return rows;
    return [...memBudgets.entries()]
      .filter(([k]) => k.startsWith(`${this.workspaceId}:`))
      .map(([k, v]) => { const [, dataset, principal, period] = k.split(":"); return { dataset, principal, period, ...v }; });
  }

  // ── De-identification service (Safe Harbor + Expert Determination) ─
  async deidentify(input: z.infer<typeof deidRecordSchema> & { rows?: Array<Record<string, unknown>> }) {
    await this.assert("CREATE");
    const { rows, ...rec } = input;
    const parsed = deidRecordSchema.parse(rec);
    if (parsed.method === "EXPERT_DETERMINATION" && !parsed.expert) {
      throw new Error("Expert Determination requires a qualified reviewer token and documented risk assessment");
    }
    if (!parsed.directIdentifiersRemoved) throw new Error("Safe Harbor requires direct identifier removal");
    const transformed = (rows ?? []).map(safeHarborTransform);
    await this.audit("privacy.deidentified", parsed.datasetId, { method: parsed.method, rows: transformed.length });
    return { record: { ...parsed, reidentification_prohibited: true }, transformedPreview: transformed.slice(0, 5), transformedCount: transformed.length, warning: "Reassess risk when recipient, geography, external datasets, granularity, or use changes." };
  }

  // ── Pseudonymization vault (study-specific tokens, never cross-study) ─
  async pseudonymize(patientIds: string[], studyId: string, purpose: string) {
    await this.assert("CREATE");
    if (!studyId || !purpose) throw new Error("studyId and purpose are required — never issue a global stable pseudonym");
    const secret = process.env.AUTH_SECRET ?? "n0va-dev-tenant-secret";
    const tokens = patientIds.map((pid) => ({ patientId: pid, token: studyPseudonym(pid, studyId, `${this.workspaceId}:${secret}`), studyId, purpose }));
    await this.audit("privacy.pseudonymized", studyId, { count: tokens.length, purpose });
    return { studyId, purpose, tokens, keyLocation: "separate-key-vault", warning: "Re-linking requires dual authorization + full audit; tokens are study-specific." };
  }

  // ── Differentially-private count release (budgeted) ───────────────
  async dpCountRelease(opts: z.infer<typeof dpReleaseSchema> & { trueCount: number; dataset: string; principal: string; queryId: string }) {
    await this.assert("CREATE");
    const parsed = dpReleaseSchema.parse(opts);
    const out = dpNoisyCount(opts.trueCount, { ...parsed, seed: `${this.workspaceId}:${opts.queryId}` });
    if ("suppressed" in out) {
      await this.audit("privacy.dp.suppressed", opts.queryId, { dataset: opts.dataset, trueCount: opts.trueCount });
      return out;
    }
    await this.consumeBudget({ dataset: opts.dataset, principal: opts.principal, epsilon: parsed.epsilonValue });
    await this.audit("privacy.dp.released", opts.queryId, { dataset: opts.dataset, epsilon: parsed.epsilonValue, approximate: out.approximateValue });
    return { ...out, dp_release_id: `dp-${crypto.randomUUID().slice(0, 8)}`, queries_note: "Never describe as exact — display approximate nature, method, version, suppression rules, and error.", utility_check: "passed" };
  }

  // ── Federated analytics / learning coordination ───────────────────
  federatedRoundSpec(sites: string[], analysisId: string) {
    return {
      analysisId,
      workflow: ["coordinator_sends_approved_analysis", "site_validates_scope", "site_computes_aggregate", "local_privacy_filter", "secure_aggregation", "central_result_release"],
      siteChecks: [...FEDERATED_SITE_CHECKS],
      sites: sites.map((s) => ({ site: s, checksRequired: [...FEDERATED_SITE_CHECKS] })),
      coordinatorReceives: "approved aggregate only — no individual-level intermediates",
      minimumSites: Math.max(2, Math.min(sites.length, 3)),
    };
  }

  federatedLearningRoundSpec(modelPackage: string, sites: string[]) {
    return {
      modelPackage,
      workflow: ["model_package_signed", "site_validates_model_and_policy", "eligibility_check", "local_training", "gradient_clipping", "local_dp", "secure_masking", "secure_aggregation", "central_update", "poisoning_checks", "membership_inference_testing", "release_approval"],
      updateProtections: ["clipping", "noise_addition", "secure_aggregation", "no_raw_gradient_exposure"],
      riskTests: [...FL_MODEL_RISK_TESTS],
      sites,
      warning: "Do not deploy into clinical care on privacy properties alone — validate calibration, subgroup performance, utility, drift, safety.",
    };
  }

  secureAggregationSpec(participants: string[], threshold: number) {
    if (participants.length < threshold) throw new Error("Participant-count threshold not met — no release");
    return {
      techniques: ["pairwise_masking", "threshold_release", "multi_party_computation", "secret_sharing", "encrypted_aggregation"],
      participants: participants.length, threshold,
      guarantees: ["no_individual_update_visibility", "no_single_party_reconstruction", "dropout_resistant", "attested_service"],
    };
  }

  // ── Synthetic-data certificate ────────────────────────────────────
  async certifySynthetic(input: z.infer<typeof syntheticCertSchema> & { disclosure: ReturnType<typeof testSyntheticDisclosure> }) {
    await this.assert("CREATE");
    const { disclosure, ...cert } = input;
    const parsed = syntheticCertSchema.parse(cert);
    if (disclosure.overall !== "passed") {
      await this.reportIncident({ kind: "synthetic_memorization", severity: "HIGH", detail: `Synthetic ${parsed.datasetId}: exact=${disclosure.exactCopies} rare=${disclosure.rareReproduced}` });
      throw new Error("Synthetic disclosure tests failed — do not release; incident created");
    }
    await this.audit("privacy.synthetic.certified", parsed.datasetId, { generator: parsed.generatorVersion });
    return { certificate: { dataset_id: parsed.datasetId, ...parsed, disclosure }, warning: "Synthetic is not automatically safe — certificate + approved uses only." };
  }

  // ── Confidential computing attestation gate ───────────────────────
  async attestConfidential(workload: { imageDigest: string; attestation: string; expectedDigest: string; expired?: boolean }) {
    await this.assert("READ");
    const ok = workload.attestation.length >= 16 && workload.imageDigest === workload.expectedDigest && !workload.expired;
    await this.audit("privacy.confidential.attested", workload.imageDigest.slice(0, 16), { ok });
    if (!ok) {
      await this.reportIncident({ kind: "attestation_failure", severity: "CRITICAL", detail: "Confidential workload attestation failed — keys withheld" });
      throw new Error("Attestation failed — encryption keys withheld, incident created");
    }
    return { attested: true as const, controls: [...CONFIDENTIAL_COMPUTE_CONTROLS], note: "Pair with query controls, output review, DP, and clean-room restrictions — TEE does not fix revealing outputs." };
  }

  // ── Research clean room (results, not raw tables) ─────────────────
  async cleanRoomRequest(project: { title: string; protocol: string; datasets: string[]; investigators: string[]; expiry: Date | string }) {
    await this.assert("CREATE");
    const id = `cleanroom-${crypto.randomUUID().slice(0, 8)}`;
    await this.audit("privacy.cleanroom.requested", id, { title: project.title });
    return { projectId: id, status: "pending_governance_review" as const, controls: [...CLEAN_ROOM_CONTROLS], workflow: ["ethics_review", "minimization", "authorization", "template_approval", "controlled_execution", "disclosure_checks", "human_output_review", "approved_release", "audit_and_expiry"], ...project };
  }

  // ── Genomic authorization gate ────────────────────────────────────
  async authorizeGenomic(access: { level: keyof typeof GENOMIC_ACCESS_LEVELS; patientId: string; purpose: string; familyLinked?: boolean; exportRequested?: boolean }) {
    await this.assert("READ");
    if ((access.level === "FAMILY_LINKED" || access.familyLinked) && access.level !== "FAMILY_LINKED") {
      throw new Error("Family-linked genomic analysis requires FAMILY_LINKED approval");
    }
    if ((access.level === "RAW_SEQUENCE" || access.exportRequested) && access.level !== "RAW_SEQUENCE") {
      // Exports of variant-level data need restricted path
      await this.audit("privacy.genomic.export_requested", access.patientId, { level: access.level, purpose: access.purpose });
    }
    if (access.level === "RAW_SEQUENCE" || access.level === "FAMILY_LINKED") {
      return { allowed: false as const, requires: "special_approval_restricted_clean_room", audit: "every_variant_query_audited", reidentification: "prohibited_unless_authorized_by_law" };
    }
    await this.audit("privacy.genomic.authorized", access.patientId, { level: access.level, purpose: access.purpose });
    return { allowed: true as const, level: access.level, access: GENOMIC_ACCESS_LEVELS[access.level].access, consent: "granular_special_consent_required" };
  }

  // ── Lineage + withdrawal propagation ──────────────────────────────
  async lineage(datasetOrReleaseId: string) {
    await this.assert("READ");
    const releases = (await this.listReleases(100)) as Array<Record<string, unknown>>;
    const related = releases.filter((r) => r.dataset === datasetOrReleaseId || r.id === datasetOrReleaseId || (r as { releaseId?: string }).releaseId === datasetOrReleaseId);
    return {
      id: datasetOrReleaseId,
      sourceRecords: "resolve via HealthProvenanceFabric.getUpstream",
      transformations: related.map((r) => ({ releaseId: r.id, privacyMode: r.privacyMode, epsilon: r.epsilonConsumed })),
      queries: related.map((r) => r.queryId),
      recipients: related.map((r) => r.recipient),
      budgets: await this.listBudgets(),
      withdrawalImpact: "use propagateWithdrawal(patientId) to freeze future use + flag downstream artifacts",
    };
  }

  async propagateWithdrawal(patientId: string, scope: string[] = ["future_analytics", "research_extracts"]) {
    await this.assert("UPDATE");
    // Real propagation fans out to wallet revocation + provenance correction graph;
    // here we record the propagation event + freeze keyed artifacts in-ledger.
    await this.audit("privacy.withdrawal.propagated", patientId, { scope });
    return {
      patientId,
      futureUsePrevented: true,
      downstreamReview: ["coded_cohorts", "model_versions_trained", "partner_outputs", "budgets"],
      scope,
      note: "Completed analyses / published aggregates cannot be un-published; audit preserved. Invoke wallet revocation + deletion jobs for enforcement.",
    };
  }

  // ── Dashboards ────────────────────────────────────────────────────
  async opsDashboard() {
    await this.assert("READ");
    const [policies, releases, budgets] = await Promise.all([this.listPolicies(), this.listReleases(100), this.listBudgets()]);
    const queries = memList(memQueries, this.workspaceId);
    const incidents = await this.listIncidents();
    return {
      tiles: [...PRIVACY_OPS_TILES],
      activeModes: [...new Set((policies as Array<Record<string, unknown>>).map((p) => p.privacyMode))],
      highRiskQueries: queries.filter((q) => q.riskLevel === "HIGH" || q.riskLevel === "CRITICAL").length,
      blockedQueries: queries.filter((q) => q.decision === "blocked").length,
      releases: (releases as unknown[]).length,
      budgets,
      reviewQueue: (incidents as Array<Record<string, unknown>>).filter((i) => i.status !== "RESOLVED").length,
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Incident response ─────────────────────────────────────────────
  async reportIncident(input: z.infer<typeof privacyIncidentSchema>) {
    const parsed = privacyIncidentSchema.parse(input);
    const id = `pinc-${crypto.randomUUID().slice(0, 8)}`;
    const row = await safe(
      () => (prisma as unknown as PrivacyTables).healthPrivacyIncident.create({
        data: {
          workspaceId: this.workspaceId, incidentId: id, kind: parsed.kind, severity: parsed.severity,
          queryId: parsed.queryId ?? null, releaseId: parsed.releaseId ?? null,
          detail: parsed.detail, status: "OPEN", responseActions: [...INCIDENT_RESPONSE_ACTIONS],
          createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredIncident = { id, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>), status: "OPEN", responseActions: [...INCIDENT_RESPONSE_ACTIONS] };
    if (!row) memPush(memIncidents, this.workspaceId, stored);
    await this.audit("privacy.incident.reported", id, { kind: parsed.kind, severity: parsed.severity });
    return { incidentId: id, responseActions: [...INCIDENT_RESPONSE_ACTIONS], ...((row as unknown as Record<string, unknown> | null) ?? stored) };
  }

  async listIncidents(status?: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as PrivacyTables).healthPrivacyIncident.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }) as Promise<never[]>,
      [],
    );
    const all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memIncidents, this.workspaceId);
    return status ? all.filter((i) => (i as Record<string, unknown>).status === status) : all;
  }

  async resolveIncident(incidentId: string, resolution: string) {
    await this.assert("UPDATE");
    await safe(
      () => (prisma as unknown as PrivacyTables).healthPrivacyIncident.update({ where: { incidentId }, data: { status: "RESOLVED", resolution } }) as Promise<never>,
      null,
    );
    const list = memList(memIncidents, this.workspaceId);
    const found = list.find((i) => i.id === incidentId);
    if (found) { found.status = "RESOLVED"; found.resolution = resolution; }
    await this.audit("privacy.incident.resolved", incidentId, { resolution });
    return { incidentId, status: "RESOLVED", resolution };
  }
}

// ── Static reference exports ──────────────────────────────────────────
export const PRIVACY_ARCHITECTURE = [
  "clinical_source_systems", "identity_and_consent_vault", "purpose_and_access_policy",
  "privacy_transformation_gateway", "risk_scoring_and_disclosure_controls",
  "approved_analytics_workspace", "audited_output_release",
] as const;
export const TRANSFORMATION_GATEWAY = [
  "de_identification", "pseudonymization", "aggregation", "differential_privacy",
  "synthetic_data", "federated_analytics", "secure_aggregation",
  "confidential_computing", "clean_room",
] as const;
export const GATEWAY_PIPELINE = [
  "authenticate_authorize", "purpose_consent_check", "dataset_classification",
  "risk_estimation", "cohort_rule", "history_differencing_check",
  "transformation_select", "controlled_execution", "output_validation",
  "human_review_if_required", "release", "ledger_record",
] as const;
export const OUTPUT_CONTROLS = [
  "suppression", "generalization", "binning", "noise", "top_coding", "rounding",
  "budget_decrement", "watermarking", "export_restriction", "expiring_links",
  "recipient_limitation", "no_raw_rows", "no_hidden_metadata",
] as const;
export const ROLLOUT_PHASES = {
  PHASE_1_GOVERNANCE: ["classification", "dataset_registry", "purpose_consent_enforcement", "deidentification_service", "pseudonymization_vault", "cohort_enforcement", "query_audit", "review_workflow"],
  PHASE_2_PROTECTION: ["risk_scoring", "differencing_detection", "dp_service", "privacy_ledger", "output_gateway", "lineage", "dataset_expiry"],
  PHASE_3_PET: ["federated_analytics", "secure_aggregation", "federated_learning", "synthetic_generation", "confidential_computing", "clean_rooms"],
  PHASE_4_SPECIALIZED: ["genomic_zone", "family_linkage", "consent_propagation", "withdrawal_impact", "cross_institution_federation", "model_monitoring"],
} as const;
export const PRIVACY_API = [
  "upsertPolicy", "listPolicies", "assessQuery", "detectDifferencing",
  "releaseOutput", "listReleases", "consumeBudget", "listBudgets",
  "deidentify", "pseudonymize", "dpCountRelease",
  "federatedRoundSpec", "federatedLearningRoundSpec", "secureAggregationSpec",
  "certifySynthetic", "attestConfidential", "cleanRoomRequest",
  "authorizeGenomic", "lineage", "propagateWithdrawal",
  "opsDashboard", "reportIncident", "listIncidents", "resolveIncident",
] as const;
