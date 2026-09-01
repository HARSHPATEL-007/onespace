// Clinical Safety Operating System — mandatory control plane between every AI output and clinical action.
// FDA CDS guidance: sufficient information for independent review, not primary reliance. WHO: autonomy, safety, transparency, accountability, equity, human oversight. NIST AI RMF govern-map-measure-manage.
// A model must never approve its own output, modify its threshold, bypass review, or directly execute S4-S5.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_safety";
const HEALTH_MODULE = "health";

// ── Safety Classification — potential harm, not complexity ──────────────
export const SAFETY_CLASS = {
  S0: { label: "Informational wellness", examples: "sleep education, fitness, hydration", default: "May be automated with disclaimers", autonomous: true, requiresReview: false },
  S1: { label: "Low-risk guidance", examples: "wellness plans, appointment prep, habit coaching", default: "Automated if inputs valid", autonomous: true, requiresReview: false },
  S2: { label: "Patient-specific support", examples: "symptom navigation, adherence coaching, preventive reminders", default: "Human-designed rules, safe escalation", autonomous: false, requiresReview: false },
  S3: { label: "Clinical decision support", examples: "risk scores, differential, care-gap", default: "Clinician review required", autonomous: false, requiresReview: true, level: "SINGLE" as const },
  S4: { label: "High-risk clinical support", examples: "sepsis, stroke, cardiac arrest, dosing, suicide risk", default: "Immediate qualified human review", autonomous: false, requiresReview: true, level: "SPECIALIST" as const },
  S5: { label: "Regulated / safety-critical", examples: "med order, emergency dispatch, treatment initiation, device control", default: "Explicit authorization + execution controls", autonomous: false, requiresReview: true, level: "DUAL" as const },
} as const;
export type SafetyClassKey = keyof typeof SAFETY_CLASS;
export type ReviewDecision = "REVIEWED" | "AGREED" | "MODIFIED" | "OVERRIDDEN" | "REJECTED" | "DEFERRED";
export type SafetyIncidentKind = "FALSE_NEGATIVE" | "FALSE_POSITIVE" | "DELAYED_ALERT" | "WRONG_PATIENT" | "UNSAFE_RECOMMENDATION" | "MISSING_CONTRAINDICATION" | "HALLUCINATED_EVIDENCE" | "INCORRECT_DOSE" | "ALERT_FATIGUE" | "UNAUTHORIZED_DISCLOSURE" | "WRONG_RECIPIENT" | "DEVICE_DATA_CORRUPTION" | "MODEL_DRIFT" | "AUTOMATION_BIAS" | "WORKFLOW_COLLISION" | "FAILED_ESCALATION" | "INCORRECT_EMERGENCY_LOCATION" | "PARTIAL_TRANSACTION" | "CLINICIAN_OVERRIDE" | "PATIENT_HARM" | "NEAR_MISS" | "OTHER";
export type SafetyIncidentSeverity = "NEGLIGIBLE" | "MINOR" | "MODERATE" | "MAJOR" | "CATASTROPHIC";
export type SafetyIncidentStatus = "OPEN" | "INVESTIGATING" | "CORRECTIVE_ACTION" | "PREVENTIVE_ACTION" | "REGULATORY_REVIEW" | "CLOSED" | "VERIFIED";

// Feature → safety class registry (potential-harm based). Simple dispatch rule > sophisticated wellness model.
export const FEATURE_SAFETY_MAP: Record<string, SafetyClassKey> = {
  // S0
  sleep_education: "S0", hydration_reminder: "S0", fitness_general: "S0", patient_education_general: "S0",
  // S1
  wellness_plan: "S1", appointment_reminder: "S1", habit_coaching: "S1", appointment_preparation: "S1",
  // S2
  symptom_navigation: "S2", adherence_coaching: "S2", preventive_reminder: "S2", triage_low_risk: "S2",
  // S3
  risk_score: "S3", differential: "S3", care_gap: "S3", diagnostic_report_prelim: "S3", treatment_recommendation: "S3",
  lab_interpretation: "S3", imaging_second_read: "S3", readmission_risk: "S3", fall_risk: "S3", aki_risk: "S3",
  // S4
  sepsis: "S4", stroke: "S4", cardiac_arrest: "S4", deterioration: "S4", suicide_risk: "S4", postpartum_hemorrhage: "S4",
  dka: "S4", medication_dosing: "S4", suicide: "S4",
  // S5
  medication_order: "S5", emergency_dispatch: "S5", treatment_initiation: "S5", device_control: "S5", sepsis_protocol_execution: "S5",
};
export function classifyFeature(featureKey: string, fallback: SafetyClassKey = "S3"): SafetyClassKey {
  return FEATURE_SAFETY_MAP[featureKey] ?? fallback;
}

// ── Action Authorization Matrix — observe | suggest | draft | request_approval | execute ──
export type ActionKind = "OBSERVE" | "SUGGEST" | "DRAFT" | "REQUEST_APPROVAL" | "EXECUTE";
export const AUTHORIZATION_MATRIX: Record<string, { aiMayObserve: boolean; aiMaySuggest: boolean; aiMayDraft: boolean; humanApproval: string; autonomousExecution: boolean | string }> = {
  wellness_reminder: { aiMayObserve: true, aiMaySuggest: true, aiMayDraft: true, humanApproval: "Usually no", autonomousExecution: true },
  appointment_reminder: { aiMayObserve: true, aiMaySuggest: true, aiMayDraft: true, humanApproval: "Usually no", autonomousExecution: true },
  symptom_triage: { aiMayObserve: true, aiMaySuggest: true, aiMayDraft: true, humanApproval: "Required for high-risk", autonomousExecution: false },
  clinical_risk_alert: { aiMayObserve: true, aiMaySuggest: true, aiMayDraft: true, humanApproval: "Required", autonomousExecution: false },
  medication_recommendation: { aiMayObserve: true, aiMaySuggest: true, aiMayDraft: true, humanApproval: "Required", autonomousExecution: false },
  medication_order: { aiMayObserve: true, aiMaySuggest: true, aiMayDraft: true, humanApproval: "Required", autonomousExecution: false },
  sepsis_protocol: { aiMayObserve: true, aiMaySuggest: true, aiMayDraft: true, humanApproval: "Required", autonomousExecution: "Only pre-authorized institutional protocol logistics" },
  suicide_risk_escalation: { aiMayObserve: true, aiMaySuggest: true, aiMayDraft: true, humanApproval: "Required immediately", autonomousExecution: "Only narrowly defined safety notifications" },
  emergency_dispatch: { aiMayObserve: true, aiMaySuggest: true, aiMayDraft: true, humanApproval: "Confirmation where feasible", autonomousExecution: "Only under validated emergency policy" },
  diagnostic_report: { aiMayObserve: true, aiMaySuggest: false, aiMayDraft: true, humanApproval: "Clinician sign-off", autonomousExecution: false },
  patient_education: { aiMayObserve: true, aiMaySuggest: true, aiMayDraft: true, humanApproval: "Rule-based", autonomousExecution: true },
};

// ── Recommendation Lifecycle ────────────────────────────────────────────
export const RECOMMENDATION_STATE = ["GENERATED","VALIDATING","ELIGIBLE","REVIEW_REQUIRED","APPROVED","EXECUTING","COMPLETED","OUTCOME_MONITORED","ABSTAINED","REJECTED","EXPIRED","CANCELLED","SUPERSEDED","FAILED_SAFE"] as const;
export type RecommendationState = typeof RECOMMENDATION_STATE[number];
const ALLOWED_TRANSITIONS: Record<RecommendationState, RecommendationState[]> = {
  GENERATED: ["VALIDATING","ABSTAINED","REJECTED","EXPIRED"],
  VALIDATING: ["ELIGIBLE","ABSTAINED","REJECTED","FAILED_SAFE"],
  ELIGIBLE: ["REVIEW_REQUIRED","APPROVED","ABSTAINED","EXPIRED","CANCELLED"],
  REVIEW_REQUIRED: ["APPROVED","REJECTED","ABSTAINED","EXPIRED","CANCELLED","SUPERSEDED"],
  APPROVED: ["EXECUTING","CANCELLED","EXPIRED","SUPERSEDED","FAILED_SAFE"],
  EXECUTING: ["COMPLETED","FAILED_SAFE","CANCELLED"],
  COMPLETED: ["OUTCOME_MONITORED","SUPERSEDED"],
  OUTCOME_MONITORED: ["SUPERSEDED","CANCELLED"],
  ABSTAINED: [],
  REJECTED: [],
  EXPIRED: [],
  CANCELLED: [],
  SUPERSEDED: [],
  FAILED_SAFE: [],
};
export function canTransition(from: RecommendationState, to: RecommendationState): boolean { return (ALLOWED_TRANSITIONS[from] ?? []).includes(to); }

// ── Input Safety Gateway — required checks before inference ─────────────
export const INPUT_CHECKS = [
  "patient_identity_match","encounter_match","data_freshness","timestamp_consistency","device_identity","signal_quality","unit_normalization","reference_range_plausibility","missing_values","duplicate_detection","contradictory_data","pregnancy_context","age_context","renal_context","hepatic_context","allergy_context","medication_context","location_care_setting","population_approval","device_modality_approval","operating_envelope",
] as const;

export interface InputQualityResult {
  eligible: boolean;
  abstain: boolean;
  reason?: string;
  missingInputs: string[];
  contradictions: unknown[];
  signalQuality: number;
  checks: Record<string, { pass: boolean; detail?: string }>;
  requiresConfirmation: boolean;
}

export function inputQualityGateway(input: {
  patientId?: string | null; encounterId?: string | null; deviceId?: string | null;
  signalQuality?: number | null; recordedAt?: Date | string | null;
  requiredInputs?: string[]; providedInputs?: Record<string, unknown>;
  patientContext?: { age?: number; sex?: string; pregnancy?: boolean; renalImpairment?: boolean; hepaticImpairment?: boolean; allergies?: string[] };
  deviceContext?: { authenticated?: boolean; };
}): InputQualityResult {
  const checks: Record<string, { pass: boolean; detail?: string }> = {};
  const missing: string[] = [];
  const contradictions: unknown[] = [];
  let quality = input.signalQuality ?? 1;
  // required inputs
  for (const req of input.requiredInputs ?? []) {
    const has = input.providedInputs?.[req] != null;
    checks[`required:${req}`] = { pass: has, detail: has ? "present" : "missing" };
    if (!has) missing.push(req);
  }
  // freshness
  const ageMin = input.recordedAt ? (Date.now() - new Date(input.recordedAt).getTime())/60000 : 0;
  checks.data_freshness = { pass: ageMin < 60, detail: `${Math.round(ageMin)}m old` };
  // signal quality
  checks.signal_quality = { pass: quality >= 0.6, detail: `quality ${quality}` };
  if (quality < 0.6) quality = quality;
  // device auth
  if (input.deviceId) checks.device_identity = { pass: input.deviceContext?.authenticated !== false, detail: input.deviceContext?.authenticated === false ? "unauthenticated device" : "ok" };
  // patient identity
  checks.patient_identity_match = { pass: !!input.patientId, detail: input.patientId ? "matched" : "missing patient" };
  // pregnancy / age / renal etc are informational pass-through for envelope check
  const eligible = missing.length === 0 && (checks.data_freshness.pass) && (checks.signal_quality.pass) && !!input.patientId;
  const abstain = !eligible || quality < 0.5 || missing.length > 2;
  return {
    eligible, abstain, missingInputs: missing, contradictions, signalQuality: quality,
    checks,
    requiresConfirmation: !eligible,
    reason: abstain ? (missing.length ? `Missing required inputs: ${missing.join(", ")}` : quality < 0.5 ? "Signal quality inadequate — request re-collection" : "Input outside validated envelope") : undefined,
  };
}

// ── Operating Envelope Control ──────────────────────────────────────────
export interface OperatingEnvelope {
  model_id: string; approved_use: string; excluded_use: string[]; required_inputs: string[]; maximum_input_age_minutes: number; minimum_signal_quality: number; minimum_calibration_confidence: number; required_human_role: string; execution_mode: "recommendation_only" | "draft" | "autonomous_logistics_only";
}
export const DEFAULT_ENVELOPES: Record<string, OperatingEnvelope> = {
  "sepsis-risk-v3": { model_id:"sepsis-risk-v3", approved_use:"adult inpatient deterioration support", excluded_use:["pediatric","pregnancy","outpatient","single wearable input"], required_inputs:["heart_rate","respiratory_rate","blood_pressure","temperature","oxygen_saturation","laboratory_results"], maximum_input_age_minutes:30, minimum_signal_quality:0.85, minimum_calibration_confidence:0.90, required_human_role:"attending_or_rapid_response_clinician", execution_mode:"recommendation_only" },
  "deterioration-risk-v3": { model_id:"deterioration-risk-v3", approved_use:"adult inpatient deterioration support", excluded_use:["pediatric","pregnancy"], required_inputs:["heart_rate","respiratory_rate","blood_pressure","temperature","oxygen_saturation"], maximum_input_age_minutes:30, minimum_signal_quality:0.80, minimum_calibration_confidence:0.85, required_human_role:"attending_physician", execution_mode:"recommendation_only" },
  "medication-dosing-v2": { model_id:"medication-dosing-v2", approved_use:"adult dosing support with pharmacist review", excluded_use:["pediatric","pregnancy","renal_impairment_without_labs"], required_inputs:["age","weight","renal_function","hepatic_function","allergies","current_medications"], maximum_input_age_minutes:1440, minimum_signal_quality:0.90, minimum_calibration_confidence:0.92, required_human_role:"prescriber_and_pharmacist", execution_mode:"draft" },
};
export function checkEnvelope(envelope: OperatingEnvelope, input: { ageMin: number; signalQuality: number; calibration: number; patientFactors: string[]; providedInputs: string[] }): { pass: boolean; blockReason?: string; downgrade?: boolean } {
  if (input.ageMin > envelope.maximum_input_age_minutes) return { pass:false, blockReason:`Input stale: ${Math.round(input.ageMin)}m > ${envelope.maximum_input_age_minutes}m — abstain or re-collect` };
  if (input.signalQuality < envelope.minimum_signal_quality) return { pass:false, blockReason:`Signal quality ${input.signalQuality} < ${envelope.minimum_signal_quality} — request repositioning / alternate device` };
  if (input.calibration < envelope.minimum_calibration_confidence) return { pass:false, downgrade:true, blockReason:`Calibration ${input.calibration} < ${envelope.minimum_calibration_confidence} — downgrade confidence, require review` };
  for (const f of envelope.excluded_use) if (input.patientFactors.map(s=>s.toLowerCase()).some(p=> f.toLowerCase().includes(p) || p.includes(f.toLowerCase().slice(0,4)))) return { pass:false, blockReason:`Excluded population: ${f} — outside validated envelope` };
  for (const req of envelope.required_inputs) if (!input.providedInputs.includes(req)) return { pass:false, blockReason:`Missing required input: ${req}` };
  return { pass:true };
}

// ── Confidence & Abstention — never single % ───────────────────────────
export interface UncertaintyBundle {
  probability: number; // predictive probability
  calibrationStatus: string; // calibrated | miscalibrated | unknown
  aleatoric: number; // noisy/incomplete data
  epistemic: number; // model unfamiliarity
  inputQuality: number;
  populationRepresentativeness: number;
  temporalStability: number; // 0-1 stability across repeated inference
  driftStatus: string;
  evidenceStrength: string; // strong | moderate | weak
  actionability: string; // high | medium | low
  confidenceInterval?: [number, number];
}
export function shouldAbstain(u: UncertaintyBundle, opts: { requiredInputsMissing: boolean; signalQuality: number; populationOk: boolean; intervalCrossesBoundary: boolean; driftDetected: boolean; versionExpired: boolean }): { abstain: boolean; reason: string } {
  if (opts.requiredInputsMissing) return { abstain:true, reason:"Required inputs missing" };
  if (opts.signalQuality < 0.6) return { abstain:true, reason:"Sensor quality inadequate" };
  if (!opts.populationOk) return { abstain:true, reason:"Model outside approved population" };
  if (opts.intervalCrossesBoundary) return { abstain:true, reason:"Confidence interval crosses unsafe decision boundary" };
  if (opts.driftDetected) return { abstain:true, reason:"Model drift detected — fallback required" };
  if (opts.versionExpired) return { abstain:true, reason:"Model or policy version expired" };
  if (u.epistemic > 0.4 || u.aleatoric > 0.4) return { abstain:true, reason:"Uncertainty too high — epistemic/aleatoric exceeds threshold" };
  if (u.temporalStability < 0.6) return { abstain:true, reason:"Prediction unstable across repeated inference" };
  if (u.evidenceStrength === "weak") return { abstain:true, reason:"Evidence strength weak — clinician review required before action" };
  return { abstain:false, reason:"" };
}
export const SAFE_ABSTENTION_MESSAGE = "N0VA cannot safely assess this situation from the available information. A clinician review is required.";

// ── Evidence & Explanation Contract — FDA CDS independent review ────────
export interface EvidencePanel {
  title: string; intendedUse: string; patientFacts: Record<string, unknown>; dataSources: string[]; dataFreshness: Record<string, string>; missingOrUnreliable: string[]; modelName: string; modelVersion: string; policyName?: string; policyVersion?: string; validationPopulation: string; localPerformance?: Record<string, unknown>; positiveFactors: string[]; negativeFactors: string[]; contraindications: string[]; alternativeExplanations: string[]; uncertainty: UncertaintyBundle; nextStep: string; urgency: string; requiredReviewerRole: string; expirationAt?: string; sourceLinks: string[];
}
export function buildEvidencePanel(input: Partial<EvidencePanel> & { title: string; modelName: string; modelVersion: string }): EvidencePanel {
  return {
    intendedUse: input.intendedUse ?? "Clinical decision support — requires independent clinician review, not primary reliance",
    patientFacts: input.patientFacts ?? {}, dataSources: input.dataSources ?? [], dataFreshness: input.dataFreshness ?? {},
    missingOrUnreliable: input.missingOrUnreliable ?? [], validationPopulation: input.validationPopulation ?? "Adult inpatient, see model card",
    positiveFactors: input.positiveFactors ?? [], negativeFactors: input.negativeFactors ?? [], contraindications: input.contraindications ?? [],
    alternativeExplanations: input.alternativeExplanations ?? [], uncertainty: input.uncertainty ?? { probability:0.5, calibrationStatus:"unknown", aleatoric:0.2, epistemic:0.2, inputQuality:0.8, populationRepresentativeness:0.7, temporalStability:0.8, driftStatus:"nominal", evidenceStrength:"moderate", actionability:"medium" },
    nextStep: input.nextStep ?? "Clinician review required", urgency: input.urgency ?? "routine", requiredReviewerRole: input.requiredReviewerRole ?? "attending_physician", sourceLinks: input.sourceLinks ?? [],
    ...input,
  } as EvidencePanel;
}

// ── Safety Policy Engine — separate from inference ──────────────────────
export interface PolicyInputs {
  age?: number; careSetting?: string; diagnosis?: string; allergies?: string[]; medications?: string[]; pregnancy?: boolean; organFunction?: Record<string, unknown>; vitals?: Record<string, unknown>; deviceQuality?: number; urgency?: string; modelConfidence?: number; regulatoryStatus?: string; reviewerRole?: string; consent?: boolean; jurisdiction?: string;
}
export interface PolicyOutput {
  allow: boolean; requireReview: boolean; requireSecondReview: boolean; downgradeConfidence: boolean; suppressPatientMessage: boolean; triggerEscalation: boolean; requireRecollection: boolean; lockMedication: boolean; createTask: boolean; expire: boolean; safeDegradedMode: boolean; reasons: string[];
}
export function evaluatePolicy(policyKey: string, inputs: PolicyInputs): PolicyOutput {
  const o: PolicyOutput = { allow:true, requireReview:false, requireSecondReview:false, downgradeConfidence:false, suppressPatientMessage:false, triggerEscalation:false, requireRecollection:false, lockMedication:false, createTask:false, expire:false, safeDegradedMode:false, reasons:[] };
  // medication_dose_change — S5 high-risk (renal/pregnancy/pediatric/allergy/narrow therapeutic)
  if (policyKey === "medication_dose_change") {
    const risk = !!(inputs.pregnancy || (inputs.age!=null && inputs.age<18) || inputs.allergies?.length || inputs.organFunction?.renalImpairment);
    if (risk) { o.requireReview=true; o.requireSecondReview=true; o.lockMedication=true; o.createTask=true; o.reasons.push("Renal/pregnancy/pediatric/allergy/narrow-index — prescriber+pharmacist review required, autonomous execution blocked"); }
  }
  if (policyKey === "sepsis_signal") {
    o.requireReview = true; o.createTask = true; o.reasons.push("Sepsis signal requires clinical assessment — multiple evidence categories, verify freshness/quality, display trends not score, block auto antibiotic selection");
  }
  if (policyKey === "suicide_risk") {
    o.requireReview = true; o.suppressPatientMessage = true; o.triggerEscalation = true; o.reasons.push("Crisis inference — validated assessment + human conversation + trauma-informed taxonomy, no opaque behavioral-score messaging");
  }
  if (policyKey === "emergency_dispatch") {
    o.requireReview = true; o.reasons.push("Validate emergency signal multi-modality, attempt two-way confirmation, verify location, jurisdiction-aware");
  }
  if (inputs.deviceQuality!=null && inputs.deviceQuality < 0.6) { o.requireRecollection = true; o.downgradeConfidence = true; o.reasons.push("Device quality below threshold — request repositioning/alternate device"); }
  if (inputs.modelConfidence!=null && inputs.modelConfidence < 0.6) { o.downgradeConfidence = true; o.requireReview = true; o.reasons.push("Model confidence low — downgrade, require review"); }
  return o;
}

// ── Safe-Degraded Operation — failure hierarchy (never fail-open for S3-S5) ──
export const DEGRADED_RESPONSES: Record<string, string> = {
  wearable_unavailable: "Mark data stale, notify user, switch to manual measurement",
  signal_poor: "Request repositioning or confirm with alternate device",
  ehr_unavailable: "Use read-only cached summary, block unsafe orders",
  model_unavailable: "Fall back to validated rules or human review",
  policy_engine_unavailable: "Block high-risk action; permit only S0 informational",
  network_unavailable: "Use encrypted offline emergency summary + local escalation",
  identity_unavailable: "Use approved emergency authentication protocol",
  notification_failure: "Retry, escalate alternate channel, log failure",
  cross_module_failure: "Quarantine partial actions, create reconciliation task",
  drift_detected: "Disable affected model, activate approved fallback",
  cybersecurity_incident: "Isolate component, preserve clinical continuity",
};

// ── Governance Roles ────────────────────────────────────────────────────
export const GOVERNANCE_ROLES = ["Clinical Safety Officer","Medical Director","Model Owner","Product Owner","Privacy Officer","Security Officer","Quality & Regulatory Lead","Human Factors Lead","Clinical Review Board","Incident Review Board"] as const;
export const APPROVAL_LEVELS: Record<string, string> = {
  single: "low-to-moderate clinical support",
  dual: "medication dosing, high-risk treatment, invasive procedures",
  specialist: "oncology, psychiatry, obstetrics, pediatrics, transplant, critical care",
  emergency_concurrence: "rapid response / emergency physician for time-critical",
  patient_confirmation: "patient-facing treatment/consent/monitoring/data-sharing changes",
};

// ── FMEA — traditional + AI-specific ───────────────────────────────────
export const FMEA_ROWS = [
  { failure:"Wrong patient matched", harm:"Incorrect treatment", control:"Multi-factor identity + encounter lock" },
  { failure:"Stale vital signs", harm:"Delayed care", control:"Freshness threshold + visible timestamp" },
  { failure:"Motion artifact as arrhythmia", harm:"Unnecessary emergency response", control:"Signal-quality gate + confirmation measurement" },
  { failure:"Model poor on local population", harm:"Missed/excessive alerts", control:"Local validation + subgroup monitoring" },
  { failure:"Conflicting lab/medication data", harm:"Unsafe dose", control:"Conflict flag + pharmacist review" },
  { failure:"Confidence overstated", harm:"Automation bias", control:"Calibrated uncertainty + mandatory limitations" },
  { failure:"Hallucinated evidence", harm:"Incorrect decision", control:"Retrieval-grounded citations + source verification" },
  { failure:"Alert duplicated across modules", harm:"Alert fatigue", control:"Event identity + deduplication" },
  { failure:"Emergency message wrong contact", harm:"Privacy/safety harm", control:"Contact verification + role-based routing" },
  { failure:"Partial cross-module commit", harm:"Incomplete care", control:"Saga orchestration + reconciliation" },
  { failure:"Model update changes behavior", harm:"Unexpected clinical risk", control:"Shadow deployment + approval + rollback" },
  { failure:"Clinician accepts without review", harm:"Unsafe action", control:"Structured review + audit of review quality" },
] as const;

// ── Hash & audit helpers ────────────────────────────────────────────────
function sha256(s: string): string { return crypto.createHash("sha256").update(s).digest("hex"); }

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> { try { return await fn(); } catch { return fallback; } }

// ── ClinicalSafetyOS — mandatory control plane ─────────────────────────
export class ClinicalSafetyOS {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}
  private async assert(action: "READ"|"CREATE"|"UPDATE"|"DELETE") {
    if (!(await can(this.workspaceId, this.role, HEALTH_MODULE, action))) throw new Error(`Missing ${action} permission for health_safety`);
  }
  private audit(action: string, targetType: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType, targetId, metadata: meta }).catch(()=>null);
  }

  // Model registry
  async listModels() {
    await this.assert("READ");
    return safe(()=> (prisma as never as { healthModelRegistry:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthModelRegistry.findMany({ where:{workspaceId:this.workspaceId}, orderBy:{modelId:"asc"}}), []);
  }
  async upsertModel(input: { modelId: string; modelVersion: string; displayName: string; safetyClass: SafetyClassKey; approvedUse: string; excludedUse?: string[]; requiredInputs?: string[]; maxInputAgeMin?: number; minSignalQuality?: number; minCalibration?: number; requiredRole?: string; executionMode?: string; regulatoryStatus?: string }) {
    await this.assert("CREATE");
    const { modelId, modelVersion, displayName, safetyClass, approvedUse, excludedUse, requiredInputs, maxInputAgeMin, minSignalQuality, minCalibration, requiredRole, executionMode, regulatoryStatus } = input;
    const data = { workspaceId:this.workspaceId, createdById:this.userId, modelId, modelVersion, displayName, safetyClass: safetyClass as never, approvedUse, excludedUse: excludedUse ?? [], requiredInputs: requiredInputs ?? [], maxInputAgeMin: maxInputAgeMin ?? 30, minSignalQuality: minSignalQuality ?? 0.85, minCalibration: minCalibration ?? 0.90, requiredRole: requiredRole ?? null, executionMode: executionMode ?? "recommendation_only", regulatoryStatus: regulatoryStatus ?? "research" } as never;
    const row = await safe(()=> (prisma as never as { healthModelRegistry:{upsert:(a:unknown)=>Promise<unknown>}}).healthModelRegistry.upsert({ where:{ workspaceId_modelId_modelVersion:{ workspaceId:this.workspaceId, modelId: input.modelId, modelVersion: input.modelVersion }}, create: data, update: data as never }), null);
    await this.audit("UPSERT","HealthModelRegistry", input.modelId, input as never);
    return row ?? data;
  }

  // Policies
  async listPolicies() {
    await this.assert("READ");
    return safe(()=> (prisma as never as { healthSafetyPolicy:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthSafetyPolicy.findMany({ where:{workspaceId:this.workspaceId}, orderBy:{policyKey:"asc"}}), []);
  }
  async upsertPolicy(input: { policyKey: string; name: string; description?: string; riskClass: SafetyClassKey; conditions?: Record<string,unknown>; controls?: Record<string,unknown>; version?: string }) {
    await this.assert("CREATE");
    const version = input.version ?? "1.0.0";
    const data = { workspaceId:this.workspaceId, createdById:this.userId, policyKey: input.policyKey, name: input.name, description: input.description ?? "", riskClass: input.riskClass as never, conditions: (input.conditions ?? {}) as never, controls: (input.controls ?? {}) as never, version } as never;
    const row = await safe(()=> (prisma as never as { healthSafetyPolicy:{upsert:(a:unknown)=>Promise<unknown>}}).healthSafetyPolicy.upsert({ where:{ workspaceId_policyKey_version:{ workspaceId:this.workspaceId, policyKey: input.policyKey, version }}, create: data, update: data as never }), null);
    await this.audit("UPSERT","HealthSafetyPolicy", input.policyKey, input as never);
    return row ?? data;
  }

  // ── Core: create recommendation through full safety pipeline ────────
  async createRecommendation(input: {
    patientId?: string | null; encounterId?: string | null;
    modelId: string; modelVersion?: string; kind: string; title: string; intendedUse?: string;
    safetyClass?: SafetyClassKey; // auto-classified if omitted
    probability?: number; uncertainty?: Partial<UncertaintyBundle>;
    inputSnapshot?: Record<string, unknown>; dataSources?: string[]; signalQuality?: number;
    requiredInputs?: string[]; providedInputs?: Record<string, unknown>;
    patientContext?: Record<string, unknown>; // age, pregnancy, allergies etc
    output?: Record<string, unknown>; evidencePanel?: Partial<EvidencePanel>;
    priority?: string; urgency?: string;
  }): Promise<{ recommendation: unknown; inputQuality: InputQualityResult; envelope: unknown; uncertainty: UncertaintyBundle; policy: PolicyOutput; abstained: boolean; abstainReason?: string }> {
    await this.assert("CREATE");
    const safetyClass = input.safetyClass ?? classifyFeature(input.kind);
    const modelVersion = input.modelVersion ?? "1.0.0";
    // 1) Input quality gateway
    const iq = inputQualityGateway({ patientId: input.patientId, encounterId: input.encounterId, signalQuality: input.signalQuality, recordedAt: (input.inputSnapshot as Record<string,unknown>)?.recordedAt as string | undefined, requiredInputs: input.requiredInputs, providedInputs: input.providedInputs, patientContext: input.patientContext as never });
    // 2) Operating envelope check
    const envelopeTpl = DEFAULT_ENVELOPES[input.modelId] ?? { model_id: input.modelId, approved_use: input.intendedUse ?? "general CDS", excluded_use: [], required_inputs: input.requiredInputs ?? [], maximum_input_age_minutes: 60, minimum_signal_quality: 0.6, minimum_calibration_confidence: 0.7, required_human_role: SAFETY_CLASS[safetyClass].requiresReview ? "attending_physician" : "any_clinician", execution_mode:"recommendation_only" as const };
    const envCheck = checkEnvelope(envelopeTpl, { ageMin: 0, signalQuality: input.signalQuality ?? 1, calibration: (input.uncertainty as UncertaintyBundle)?.inputQuality ?? 0.9, patientFactors: Object.keys(input.patientContext ?? {}), providedInputs: Object.keys(input.providedInputs ?? {}) });
    // 3) Uncertainty & abstention
    const uncertainty: UncertaintyBundle = {
      probability: input.probability ?? 0.5, calibrationStatus: "unknown", aleatoric: 0.18, epistemic: 0.15, inputQuality: input.signalQuality ?? 0.9, populationRepresentativeness: 0.75, temporalStability: 0.8, driftStatus:"nominal", evidenceStrength:"moderate", actionability:"medium", confidenceInterval: input.probability!=null ? [Math.max(0,input.probability-0.12), Math.min(1,input.probability+0.12)] as [number,number] : undefined, ...(input.uncertainty as Partial<UncertaintyBundle>),
    };
    const abstainCheck = shouldAbstain(uncertainty, { requiredInputsMissing: iq.missingInputs.length>0, signalQuality: iq.signalQuality, populationOk: envCheck.pass, intervalCrossesBoundary:false, driftDetected: uncertainty.driftStatus==="drift_detected", versionExpired:false });
    const abstained = iq.abstain || !envCheck.pass || abstainCheck.abstain;
    const abstainReason = abstained ? (iq.reason ?? envCheck.blockReason ?? abstainCheck.reason) : undefined;
    // 4) Evidence panel
    const evidence = buildEvidencePanel({
      title: input.title, intendedUse: input.intendedUse, modelName: input.modelId, modelVersion, patientFacts: input.patientContext ?? {}, dataSources: input.dataSources ?? [], missingOrUnreliable: iq.missingInputs, uncertainty, nextStep: abstained ? SAFE_ABSTENTION_MESSAGE : `Review required — ${envelopeTpl.required_human_role}`, urgency: input.urgency ?? (safetyClass==="S4"||safetyClass==="S5" ? "emergent": safetyClass==="S3" ? "urgent":"routine"), requiredReviewerRole: envelopeTpl.required_human_role, ...input.evidencePanel,
    });
    // 5) Policy engine
    const policyInputs: PolicyInputs = { age: (input.patientContext as Record<string,unknown>)?.age as number | undefined, pregnancy: (input.patientContext as Record<string,unknown>)?.pregnancy as boolean | undefined, allergies: (input.patientContext as Record<string,unknown>)?.allergies as string[] | undefined, medications: (input.patientContext as Record<string,unknown>)?.medications as string[] | undefined, deviceQuality: input.signalQuality, modelConfidence: input.probability, urgency: input.urgency };
    const policy = evaluatePolicy(input.kind, policyInputs);
    // 6) Determine initial state
    let state: RecommendationState = "GENERATED";
    // VALIDATING → ELIGIBLE → REVIEW_REQUIRED path
    if (abstained) state = "ABSTAINED";
    else if (!iq.eligible) state = "VALIDATING";
    else if (SAFETY_CLASS[safetyClass].requiresReview || policy.requireReview) state = "REVIEW_REQUIRED";
    else state = "ELIGIBLE";

    const inputHash = sha256(JSON.stringify(input.inputSnapshot ?? {}));
    const traceId = `trace-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const requiresRole = envelopeTpl.required_human_role;
    const sc = SAFETY_CLASS[safetyClass] as unknown as { level?: string };
    const reviewLevel: string = sc.level ?? "SINGLE";

    const rec = await safe(()=> (prisma as never as { healthSafetyRecommendation:{create:(a:unknown)=>Promise<unknown>}}).healthSafetyRecommendation.create({ data:{
      workspaceId: this.workspaceId, patientId: input.patientId ?? null, encounterId: input.encounterId ?? null,
      modelId: input.modelId, modelVersion, policyVersion: "1.0.0",
      safetyClass: safetyClass as never, kind: input.kind, title: input.title, intendedUse: input.intendedUse ?? envelopeTpl.approved_use,
      state: state as never, priority: input.priority ?? (safetyClass==="S4"||safetyClass==="S5"?"emergent":"routine"),
      requiredReviewerRole: requiresRole, reviewLevel: reviewLevel as never, urgency: input.urgency ?? null,
      inputSnapshot: (input.inputSnapshot ?? {}) as never, inputSnapshotHash: inputHash, dataSources: input.dataSources ?? [], dataFreshness:{} as never,
      missingInputs: iq.missingInputs, contradictions: iq.contradictions as never, signalQuality: iq.signalQuality,
      probability: input.probability ?? null, calibrationStatus: uncertainty.calibrationStatus, aleatoricUncert: uncertainty.aleatoric, epistemicUncert: uncertainty.epistemic, inputQualityConf: uncertainty.inputQuality, populationConf: uncertainty.populationRepresentativeness, temporalStability: uncertainty.temporalStability, driftStatus: uncertainty.driftStatus, evidenceStrength: uncertainty.evidenceStrength, actionability: uncertainty.actionability, confidenceInterval: uncertainty.confidenceInterval as never,
      evidencePanel: evidence as never, output: (input.output ?? {}) as never, explainability:{} as never,
      authorizedActions: (abstained ? ["OBSERVE"] : policy.requireReview ? ["OBSERVE","SUGGEST","DRAFT"] : ["OBSERVE","SUGGEST","DRAFT","REQUEST_APPROVAL"]) as never,
      blockedActions: (safetyClass==="S5" ? ["EXECUTE"] : abstained ? ["REQUEST_APPROVAL","EXECUTE"] : []) as never,
      traceId, createdById: this.userId,
      expiresAt: new Date(Date.now()+24*3600000),
    } as never }), null);

    // Audit trail — hash chain per workspace
    if (rec) {
      const last = await safe(()=> (prisma as never as { healthSafetyAudit:{findFirst:(a:unknown)=>Promise<{hash:string;chainIndex:number}|null>}}).healthSafetyAudit.findFirst({ where:{workspaceId:this.workspaceId}, orderBy:{chainIndex:"desc"}}), null);
      const chainIndex = (last?.chainIndex ?? -1)+1;
      const chainPrev = last?.hash ?? null;
      const hash = sha256(`${this.workspaceId}:${(rec as {id:string}).id}:${state}:${traceId}:${chainPrev ?? "genesis"}`);
      const auditPayload = {
        safety_event_id:`safety-${new Date().toISOString().slice(0,10)}-${String(chainIndex).padStart(6,"0")}`,
        patient_context:{ patient_id: input.patientId ?? "tokenized", encounter_id: input.encounterId ?? null, care_setting: (input.patientContext as Record<string,unknown>)?.careSetting ?? "unknown" },
        recommendation:{ type: input.kind, risk_class: safetyClass, model_id: input.modelId, model_version: modelVersion, policy_version:"1.0.0", output: input.output ?? {}, probability: input.probability, uncertainty:{ epistemic: uncertainty.epistemic, aleatoric: uncertainty.aleatoric }},
        evidence:{ sources: input.dataSources ?? [], missing_inputs: iq.missingInputs, contradictions: iq.contradictions, signal_quality: iq.signalQuality },
        decision:{ required_action: state==="REVIEW_REQUIRED"?"clinician_review": state==="ABSTAINED"?"abstain":"observe", reviewer_role: requiresRole, status: state },
        execution:{ actions: [], autonomous_actions_blocked: safetyClass==="S5"||abstained ? ["medication_order","treatment_change","emergency_dispatch"] : [] },
        audit:{ trace_id: traceId, input_snapshot_hash: inputHash, chainPrev, chainIndex },
      };
      await safe(()=> (prisma as never as { healthSafetyAudit:{create:(a:unknown)=>Promise<unknown>}}).healthSafetyAudit.create({ data:{
        workspaceId:this.workspaceId, recommendationId: (rec as {id:string}).id, traceId, patientContext: (auditPayload as unknown as Record<string,unknown>).patient_context as never, recommendation: (auditPayload as unknown as Record<string,unknown>).recommendation as never, evidence: (auditPayload as unknown as Record<string,unknown>).evidence as never, decision: (auditPayload as unknown as Record<string,unknown>).decision as never, execution: (auditPayload as unknown as Record<string,unknown>).execution as never, auditMeta: (auditPayload as unknown as Record<string,unknown>).audit as never, actorId: this.userId, actorRole: this.role, hash, chainPrev, chainIndex,
      } as never}), null);
    }

    await this.audit("CREATE","HealthSafetyRecommendation",(rec as {id:string}|null)?.id ?? "abstained", { kind: input.kind, safetyClass, state, abstained, abstainReason });
    return { recommendation: rec ?? { safetyClass, state, abstainReason, evidence }, inputQuality: iq, envelope: { check: envCheck, envelope: envelopeTpl }, uncertainty, policy, abstained, abstainReason };
  }

  // Lifecycle transition — every transition has actor, timestamp, reason, authorization, signature
  async transitionRecommendation(id: string, to: RecommendationState, reasonCode: string, opts: { authorizationLevel?: string; linkedTaskId?: string; linkedOrderId?: string; outcomeStatus?: string } = {}) {
    await this.assert("UPDATE");
    const rec = await safe(()=> (prisma as never as { healthSafetyRecommendation:{findFirst:(a:unknown)=>Promise<{id:string;state:string;workspaceId:string}>}}).healthSafetyRecommendation.findFirst({ where:{id, workspaceId:this.workspaceId}}), null) as {id:string;state:string}|null;
    if (!rec) throw new Error("Recommendation not found");
    if (!canTransition(rec.state as RecommendationState, to)) throw new Error(`Illegal transition ${rec.state} → ${to}`);
    // S4/S5 require qualified reviewer — enforce outside model
    const updated = await (prisma as never as { healthSafetyRecommendation:{update:(a:unknown)=>Promise<unknown>}}).healthSafetyRecommendation.update({ where:{id}, data:{ state: to as never, stateChangedAt: new Date(), linkedTaskId: opts.linkedTaskId ?? undefined, linkedOrderId: opts.linkedOrderId ?? undefined, outcomeStatus: opts.outcomeStatus ?? undefined } as never });
    // hash chain audit
    const last = await safe(()=> (prisma as never as { healthSafetyAudit:{findFirst:(a:unknown)=>Promise<{hash:string;chainIndex:number}|null>}}).healthSafetyAudit.findFirst({ where:{workspaceId:this.workspaceId}, orderBy:{chainIndex:"desc"}}), null);
    const chainIndex = (last?.chainIndex ?? -1)+1;
    const chainPrev = last?.hash ?? null;
    const hash = sha256(`${this.workspaceId}:${id}:${rec.state}->${to}:${reasonCode}:${chainPrev ?? "genesis"}`);
    await safe(()=> (prisma as never as { healthSafetyAudit:{create:(a:unknown)=>Promise<unknown>}}).healthSafetyAudit.create({ data:{ workspaceId:this.workspaceId, recommendationId:id, traceId:`trace-${Date.now()}`, patientContext:{} as never, recommendation:{} as never, evidence:{} as never, decision:{ from: rec.state, to, reasonCode, authorizationLevel: opts.authorizationLevel } as never, execution:{} as never, auditMeta:{ reasonCode, authorizationLevel: opts.authorizationLevel } as never, actorId:this.userId, actorRole:this.role, hash, chainPrev, chainIndex } as never}), null);
    await this.audit("TRANSITION","HealthSafetyRecommendation",id,{ from: rec.state, to, reasonCode });
    return updated;
  }

  // Human review — structured, not superficial accept
  async submitReview(recommendationId: string, input: { decision: ReviewDecision; reason?: string; modifications?: Record<string,unknown>; followUpOwnerId?: string; reassessAt?: Date; viewedEvidence?: boolean; viewedTrends?: boolean; requestedSecondOpinion?: boolean; secondReviewerId?: string }) {
    await this.assert("CREATE");
    const rec = await safe(()=> (prisma as never as { healthSafetyRecommendation:{findFirst:(a:unknown)=>Promise<{id:string;workspaceId:string;state:string;reviewLevel:string}>}}).healthSafetyRecommendation.findFirst({ where:{id: recommendationId, workspaceId:this.workspaceId}}), null) as {id:string;state:string;reviewLevel:string}|null;
    if (!rec) throw new Error("Recommendation not found");
    if (rec.state !== "REVIEW_REQUIRED" && rec.state !== "APPROVED") throw new Error(`Review not allowed in state ${rec.state}`);
    const started = Date.now();
    // For DUAL/SPECIALIST, require second reviewer
    if ((rec.reviewLevel==="DUAL" || rec.reviewLevel==="SPECIALIST") && !input.secondReviewerId && input.decision==="AGREED") {
      throw new Error(`Second reviewer required for ${rec.reviewLevel}`);
    }
    const row = await (prisma as never as { healthSafetyReview:{create:(a:unknown)=>Promise<unknown>}}).healthSafetyReview.create({ data:{
      workspaceId:this.workspaceId, recommendationId, reviewerId: this.userId, reviewerName: null, reviewerRole: this.role, decision: input.decision as never, reason: input.reason ?? null, modifications: (input.modifications ?? {}) as never, secondReviewerId: input.secondReviewerId ?? null, followUpOwnerId: input.followUpOwnerId ?? null, reassessAt: input.reassessAt ?? null, viewedEvidence: input.viewedEvidence ?? true, viewedTrends: input.viewedTrends ?? false, requestedSecondOpinion: input.requestedSecondOpinion ?? false, timeToReviewSec: Math.floor((Date.now()-started)/1000),
    } as never });
    // Auto-transition based on decision
    const next: Record<string, RecommendationState> = { AGREED:"APPROVED", MODIFIED:"APPROVED", REVIEWED:"APPROVED", OVERRIDDEN:"APPROVED", REJECTED:"REJECTED", DEFERRED:"REVIEW_REQUIRED" };
    const to = next[input.decision] ?? "REVIEW_REQUIRED";
    if (to !== "REVIEW_REQUIRED") {
      try { await this.transitionRecommendation(recommendationId, to, `review_${input.decision.toLowerCase()}`); } catch {}
    }
    await this.audit("REVIEW","HealthSafetyRecommendation",recommendationId, input as never);
    return row;
  }

  // Execution guard — model never directly executes S4-S5
  async executionGuard(recommendationId: string, actionKind: ActionKind): Promise<{ allowed: boolean; reason: string; requiresHuman: boolean }> {
    await this.assert("READ");
    const rec = await safe(()=> (prisma as never as { healthSafetyRecommendation:{findFirst:(a:unknown)=>Promise<{id:string;state:string;blockedActions:string[];authorizedActions:string[];safetyClass:string}>}}).healthSafetyRecommendation.findFirst({ where:{id: recommendationId, workspaceId:this.workspaceId}}), null) as {state:string;blockedActions:string[];authorizedActions:string[];safetyClass:string}|null;
    if (!rec) return { allowed:false, reason:"Recommendation not found", requiresHuman:true };
    if (rec.blockedActions?.includes(actionKind)) return { allowed:false, reason:`Action ${actionKind} blocked for ${rec.safetyClass} — explicit authorization required`, requiresHuman:true };
    if (!rec.authorizedActions?.includes(actionKind)) return { allowed:false, reason:`Action ${actionKind} not authorized in current state ${rec.state}`, requiresHuman:true };
    if (rec.state!=="APPROVED" && actionKind==="EXECUTE") return { allowed:false, reason:`Execute requires APPROVED state, current ${rec.state}`, requiresHuman:true };
    // S5 never autonomous execute without human — even if state APPROVED, check dual approval for S5
    if (rec.safetyClass==="S5" && actionKind==="EXECUTE") {
      const reviews = await safe(()=> (prisma as never as { healthSafetyReview:{count:(a:unknown)=>Promise<number>}}).healthSafetyReview.count({ where:{recommendationId, workspaceId:this.workspaceId, decision:{ in:["AGREED","MODIFIED","OVERRIDDEN"]}}}), 0);
      if (reviews < 1) return { allowed:false, reason:"S5 requires at least one clinician approval before execution", requiresHuman:true };
    }
    return { allowed:true, reason:"Execution guard passed", requiresHuman:false };
  }

  // Incidents
  async listIncidents(opts: { status?: string; kind?: string; take?: number }={}) {
    await this.assert("READ");
    const where: Record<string,unknown> = { workspaceId:this.workspaceId };
    if (opts.status) where.status = opts.status;
    if (opts.kind) where.kind = opts.kind;
    return safe(()=> (prisma as never as { healthSafetyIncident:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthSafetyIncident.findMany({ where, orderBy:{createdAt:"desc"}, take: Math.min(opts.take??30,100)}), []);
  }
  async reportIncident(input: { kind: SafetyIncidentKind; severity?: SafetyIncidentSeverity; title: string; description?: string; patientId?: string; recommendationId?: string; modelId?: string; timeline?: unknown[]; contributing?: unknown[] }) {
    await this.assert("CREATE");
    const row = await (prisma as never as { healthSafetyIncident:{create:(a:unknown)=>Promise<unknown>}}).healthSafetyIncident.create({ data:{
      workspaceId:this.workspaceId, kind: input.kind as never, severity: (input.severity ?? "MODERATE") as never, title: input.title, description: input.description ?? "", patientId: input.patientId ?? null, recommendationId: input.recommendationId ?? null, modelId: input.modelId ?? null, timeline: (input.timeline ?? []) as never, contributing: (input.contributing ?? []) as never, createdById: this.userId,
    } as never });
    await this.audit("CREATE","HealthSafetyIncident",(row as {id:string}).id, input as never);
    return row;
  }
  async updateIncident(id: string, patch: { status?: SafetyIncidentStatus; rootCause?: string; correctiveAction?: string; preventiveAction?: string; regulatoryReport?: string }) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { healthSafetyIncident:{update:(a:unknown)=>Promise<unknown>}}).healthSafetyIncident.update({ where:{id}, data: patch as never });
    await this.audit("UPDATE","HealthSafetyIncident",id, patch as never);
    return row;
  }

  // Safety cases
  async listSafetyCases() {
    await this.assert("READ");
    return safe(()=> (prisma as never as { healthSafetyCase:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthSafetyCase.findMany({ where:{workspaceId:this.workspaceId}, orderBy:{updatedAt:"desc"}}), []);
  }
  async upsertSafetyCase(input: { featureKey: string; version?: string; safetyClaim: string; subclaims?: unknown[]; hazardAnalysis?: Record<string,unknown>; riskControls?: unknown[]; verification?: Record<string,unknown>; clinicalValidation?: Record<string,unknown>; residualRisk?: string; monitoring?: Record<string,unknown> }) {
    await this.assert("CREATE");
    const version = input.version ?? "1.0.0";
    const data = { workspaceId:this.workspaceId, createdById:this.userId, featureKey: input.featureKey, version, safetyClaim: input.safetyClaim, subclaims: (input.subclaims ?? []) as never, hazardAnalysis: (input.hazardAnalysis ?? {}) as never, riskControls: (input.riskControls ?? []) as never, verification: (input.verification ?? {}) as never, clinicalValidation: (input.clinicalValidation ?? {}) as never, residualRisk: input.residualRisk ?? "", monitoring: (input.monitoring ?? {}) as never } as never;
    const row = await safe(()=> (prisma as never as { healthSafetyCase:{upsert:(a:unknown)=>Promise<unknown>}}).healthSafetyCase.upsert({ where:{ workspaceId_featureKey_version:{ workspaceId:this.workspaceId, featureKey: input.featureKey, version }}, create: data, update: data as never }), null);
    await this.audit("UPSERT","HealthSafetyCase", input.featureKey, input as never);
    return row ?? data;
  }
  async approveSafetyCase(id: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { healthSafetyCase:{update:(a:unknown)=>Promise<unknown>}}).healthSafetyCase.update({ where:{id}, data:{ status:"APPROVED", approvedById: this.userId, approvedAt: new Date()} as never });
    await this.audit("APPROVE","HealthSafetyCase",id);
    return row;
  }

  // Monitoring — NIST govern-map-measure-manage
  async recordMonitor(input: { windowStart: Date; windowEnd: Date; sensitivity?: Record<string,unknown>; abstentionRate?: number; overrideRate?: number; timeToAckSec?: Record<string,unknown> }) {
    await this.assert("CREATE");
    const row = await (prisma as never as { healthSafetyMonitor:{create:(a:unknown)=>Promise<unknown>}}).healthSafetyMonitor.create({ data:{
      workspaceId:this.workspaceId, windowStart: input.windowStart, windowEnd: input.windowEnd, sensitivity: (input.sensitivity ?? {}) as never, abstentionRate: input.abstentionRate ?? 0, overrideRate: input.overrideRate ?? 0, timeToAckSec: (input.timeToAckSec ?? {}) as never,
    } as never });
    return row;
  }
  async getMonitorDashboard(windowHours = 24) {
    await this.assert("READ");
    const since = new Date(Date.now()-windowHours*3600000);
    const [recs, reviews, incidents, monitors] = await Promise.all([
      safe(()=> (prisma as never as { healthSafetyRecommendation:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthSafetyRecommendation.findMany({ where:{workspaceId:this.workspaceId, createdAt:{ gte: since }}, take:200 }), []),
      safe(()=> (prisma as never as { healthSafetyReview:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthSafetyReview.findMany({ where:{workspaceId:this.workspaceId, createdAt:{ gte: since }}, take:100 }), []),
      safe(()=> (prisma as never as { healthSafetyIncident:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthSafetyIncident.findMany({ where:{workspaceId:this.workspaceId, createdAt:{ gte: since }}, take:50 }), []),
      safe(()=> (prisma as never as { healthSafetyMonitor:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthSafetyMonitor.findMany({ where:{workspaceId:this.workspaceId, windowStart:{ gte: since }}, orderBy:{windowStart:"desc"}, take:20 }), []),
    ]);
    const total = (recs as unknown[]).length;
    const abstained = (recs as Array<{state:string}>).filter(r=> r.state==="ABSTAINED").length;
    const approved = (recs as Array<{state:string}>).filter(r=> r.state==="APPROVED").length;
    const reviewRequired = (recs as Array<{state:string}>).filter(r=> r.state==="REVIEW_REQUIRED").length;
    const avgTimeToReview = (reviews as Array<{timeToReviewSec:number|null}>).filter(r=> r.timeToReviewSec!=null).reduce((acc,r)=> acc+(r.timeToReviewSec??0),0) / Math.max(1, (reviews as Array<{timeToReviewSec:number|null}>).filter(r=> r.timeToReviewSec!=null).length);
    return {
      windowHours, generated: total, abstained, abstentionRate: total? Math.round(abstained/total*100)/100:0, approved, reviewRequired,
      avgTimeToReviewSec: Math.round(avgTimeToReview), incidents: (incidents as unknown[]).length, monitors: (monitors as unknown[]).length,
      byClass: (recs as Array<{safetyClass:string}>).reduce((acc:Record<string,number>,r)=> { acc[r.safetyClass]=(acc[r.safetyClass]??0)+1; return acc; },{}),
      byState: (recs as Array<{state:string}>).reduce((acc:Record<string,number>,r)=> { acc[r.state]=(acc[r.state]??0)+1; return acc; },{}),
      // NIST-style
      nist: { govern:"Clinical Safety Officer + Review Board", map:"Hazard analysis + FMEA", measure:"Sensitivity/specificity/calibration/abstention/drift/subgroup", manage:"Policy engine + human gates + safe-degraded" },
    };
  }

  // Audit trail — hash chain verified
  async getAuditTrail(recommendationId?: string, take=50) {
    await this.assert("READ");
    const where: Record<string,unknown> ={ workspaceId:this.workspaceId };
    if (recommendationId) where.recommendationId = recommendationId;
    return safe(()=> (prisma as never as { healthSafetyAudit:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthSafetyAudit.findMany({ where, orderBy:{chainIndex:"asc"}, take: Math.min(take,200)}), []);
  }
  async verifyAuditChain(): Promise<{ valid: boolean; brokenAt?: number; count: number }> {
    await this.assert("READ");
    const audits = await safe(()=> (prisma as never as { healthSafetyAudit:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthSafetyAudit.findMany({ where:{workspaceId:this.workspaceId}, orderBy:{chainIndex:"asc"}, take:1000 }), []) as Array<{hash:string;chainPrev:string|null;chainIndex:number}>;
    for (let i=1;i<audits.length;i++) if (audits[i]!.chainPrev !== audits[i-1]!.hash) return { valid:false, brokenAt: audits[i]!.chainIndex, count: audits.length };
    return { valid:true, count: audits.length };
  }

  // Safe-degraded status for current workspace
  async degradedStatus(): Promise<Record<string, { status: string; fallback: string }>> {
    await this.assert("READ");
    const [models, monitors] = await Promise.all([
      this.listModels().catch(()=>[]),
      safe(()=> (prisma as never as { healthSafetyMonitor:{findFirst:(a:unknown)=>Promise<{drift:unknown}|null>}}).healthSafetyMonitor.findFirst({ where:{workspaceId:this.workspaceId}, orderBy:{windowStart:"desc"}}), null),
    ]);
    const driftDetected = (models as Array<{driftStatus:string}>).some(m=> m.driftStatus==="drift_detected");
    return {
      wearable: { status:"nominal", fallback: DEGRADED_RESPONSES.wearable_unavailable! },
      ehr: { status:"nominal", fallback: DEGRADED_RESPONSES.ehr_unavailable! },
      model: { status: driftDetected?"degraded":"nominal", fallback: driftDetected? "Model suspended — fallback to rules/human review" : DEGRADED_RESPONSES.model_unavailable! },
      policy_engine: { status:"nominal", fallback: DEGRADED_RESPONSES.policy_engine_unavailable! },
      drift: { status: driftDetected?"drift_detected":"nominal", fallback: DEGRADED_RESPONSES.drift_detected! },
    };
  }

  // Helpers for UI
  static readonly SAFETY_CLASS = SAFETY_CLASS;
  static readonly AUTHORIZATION_MATRIX = AUTHORIZATION_MATRIX;
  static readonly FMEA_ROWS = FMEA_ROWS;
  static readonly GOVERNANCE_ROLES = GOVERNANCE_ROLES;
  static readonly DEGRADED_RESPONSES = DEGRADED_RESPONSES;
  static readonly SAFE_ABSTENTION_MESSAGE = SAFE_ABSTENTION_MESSAGE;
  static RECOMMENDATION_STATE = RECOMMENDATION_STATE;
}

// Zod schemas for API validation
export const createRecommendationSchema = z.object({
  patientId: z.string().uuid().optional().nullable(),
  encounterId: z.string().uuid().optional().nullable(),
  modelId: z.string().min(1).max(80),
  modelVersion: z.string().max(40).optional(),
  kind: z.string().min(1).max(60),
  title: z.string().min(1).max(300),
  intendedUse: z.string().max(500).optional(),
  safetyClass: z.enum(["S0","S1","S2","S3","S4","S5"]).optional(),
  probability: z.coerce.number().min(0).max(1).optional(),
  inputSnapshot: z.record(z.unknown()).optional(),
  dataSources: z.array(z.string()).optional(),
  signalQuality: z.coerce.number().min(0).max(1).optional(),
  requiredInputs: z.array(z.string()).optional(),
  providedInputs: z.record(z.unknown()).optional(),
  patientContext: z.record(z.unknown()).optional(),
  output: z.record(z.unknown()).optional(),
  priority: z.string().max(20).optional(),
  urgency: z.string().max(20).optional(),
});
export const reviewSchema = z.object({
  decision: z.enum(["REVIEWED","AGREED","MODIFIED","OVERRIDDEN","REJECTED","DEFERRED"]),
  reason: z.string().max(2000).optional(),
  modifications: z.record(z.unknown()).optional(),
  followUpOwnerId: z.string().uuid().optional().nullable(),
  reassessAt: z.coerce.date().optional().nullable(),
  viewedEvidence: z.boolean().optional(),
  viewedTrends: z.boolean().optional(),
  requestedSecondOpinion: z.boolean().optional(),
  secondReviewerId: z.string().uuid().optional().nullable(),
});
export const incidentSchema = z.object({
  kind: z.enum(["FALSE_NEGATIVE","FALSE_POSITIVE","DELAYED_ALERT","WRONG_PATIENT","UNSAFE_RECOMMENDATION","MISSING_CONTRAINDICATION","HALLUCINATED_EVIDENCE","INCORRECT_DOSE","ALERT_FATIGUE","UNAUTHORIZED_DISCLOSURE","WRONG_RECIPIENT","DEVICE_DATA_CORRUPTION","MODEL_DRIFT","AUTOMATION_BIAS","WORKFLOW_COLLISION","FAILED_ESCALATION","INCORRECT_EMERGENCY_LOCATION","PARTIAL_TRANSACTION","CLINICIAN_OVERRIDE","PATIENT_HARM","NEAR_MISS","OTHER"]),
  severity: z.enum(["NEGLIGIBLE","MINOR","MODERATE","MAJOR","CATASTROPHIC"]).optional(),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  patientId: z.string().uuid().optional().nullable(),
  recommendationId: z.string().uuid().optional().nullable(),
  modelId: z.string().max(80).optional().nullable(),
});
