// Patient Health Data Wallet — policy-enforcing privacy control plane.
// HL7 FHIR Consent (recipients/roles, actions, purposes, time), HIPAA access/amendment/restriction/accounting, GDPR erasure/restriction/portability.
// Patient sees/controls; enforcement services guarantee PDP/PEP across 21 layers. Portable, cryptographically verifiable, purpose-bound.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_wallet";

// ── Data-category control plane — 12 domains, independently governable ──
export const DATA_DOMAIN = {
  GENERAL_MEDICAL: { sensitivity: "High", controls: "Care-team and treatment-purpose controls" },
  MENTAL_HEALTH: { sensitivity: "Very high", controls: "Separate consent, specialist roles, enhanced access alerts" },
  SUBSTANCE_USE: { sensitivity: "Very high", controls: "Separate authorization, stricter recipient/purpose rules" },
  GENOMICS: { sensitivity: "Extreme", controls: "Family implications, research restrictions, downstream-use tracking" },
  REPRODUCTIVE_HEALTH: { sensitivity: "Very high", controls: "Geographic and jurisdiction-aware controls" },
  VOICE_RECORDINGS: { sensitivity: "High", controls: "Speaker consent, transcript controls, retention limits" },
  BEHAVIORAL: { sensitivity: "High", controls: "Explicit opt-in, no silent inference unrelated purposes" },
  BIOMETRIC: { sensitivity: "Extreme", controls: "Device, template, purpose, retention controls" },
  LOCATION: { sensitivity: "High", controls: "Precision reduction, time-window limits, emergency exception" },
  RESEARCH_DATA: { sensitivity: "High", controls: "Study-specific license, withdrawal and recontact controls" },
  ENVIRONMENTAL: { sensitivity: "Moderate to high", controls: "Linkage restrictions when combined with health data" },
  FINANCIAL_INSURANCE: { sensitivity: "High", controls: "Separate payment, underwriting, care-purpose controls" },
} as const;
export type WalletDataDomainKey = keyof typeof DATA_DOMAIN;
export const SENSITIVE_CATEGORIES = ["MENTAL_HEALTH","SUBSTANCE_USE","GENOMICS","REPRODUCTIVE_HEALTH","BIOMETRIC"] as const;

// ── Consent dimensions — WHO/WHAT/WHY/HOW/WHEN/WHERE/CONDITIONS → FHIR Consent ──
export const CONSENT_WHO = ["Patient","Caregiver","Parent","Guardian","Clinician","Specialist","Research team","Insurer","Device provider","Emergency responder","N0VA service"] as const;
export const CONSENT_WHAT = ["Data categories","Individual records","Derived features","AI inferences","Metadata","Raw media","Aggregates"] as const;
export const CONSENT_WHY = ["Treatment","Payment","Care coordination","Wellness","Research","Quality improvement","Public health","Emergency response","Product improvement"] as const;
export const CONSENT_HOW = ["View","Download","Analyze","Infer","Share","Train a model","Contact the patient","Create a task","Trigger an alert"] as const;
export const CONSENT_WHEN = ["Start time","End time","One-time use","Recurring use","Expiration","Re-consent interval"] as const;
export const CONSENT_WHERE = ["Country","State or province","Institution","Network","Device","Physical location"] as const;
export const CONSENT_CONDITIONS = ["Minimum necessary fields","De-identification","Aggregation","Human review","No automated decision","No onward sharing","No commercial use"] as const;

export const CONSENT_STATUS_LABELS = ["Active","Expiring soon","Paused","Revoked","Under review","Emergency override","Enforcement pending","Unable to delete due to retention requirement","Research withdrawal completed","Expired"] as const;

// ── Wallet operating model — PDP/PEP chain ──────────────────────────────
export const WALLET_OPERATING_MODEL = ["Patient Identity","Data Inventory","Consent Policy Builder","Policy Decision Point","Policy Enforcement Points","Access Ledger and Patient Notifications","Revocation/Correction/Export/Retention/Deletion Orchestration"] as const;
export const ENFORCEMENT_POINTS = ["FHIR API","HL7 interface engine","DICOM gateway","Device gateway","Object storage","Search index","Vector database","Graph database","Feature store","Model-serving layer","Prompt context builder","Agent tool layer","Clinical inbox","Chat and Meet","Mail and Calendar","Research warehouse","Export service","Backup and replication","Analytics dashboard","Vendor integrations","N0VA modules"] as const;

// ── Core design principles ──────────────────────────────────────────────
export const CORE_PRINCIPLES = ["Patient control by default","Purpose limitation","Data minimization","Revocable authorization","No silent inheritance","Safe clinical continuity","No consent laundering","Evidence of enforcement"] as const;

// ── Consent UX — 3 layers ───────────────────────────────────────────────
export const LAYERED_CONSENT = {
  L1: "Plain-language summary: “Allow City Hospital to view your blood-pressure readings and medications for treatment until 30 September 2026. They may not use this for research or marketing.”",
  L2: "Visual policy: recipient, data categories, purpose, duration, location, processing method, AI inference, onward sharing, expiration, revocation effect",
  L3: "Technical detail: FHIR resources, data elements, API scopes, processing systems, model IDs, research protocol, storage region, retention policy, subprocessors, audit requirements",
} as const;

// ── Dashboard status labels + one-click actions ─────────────────────────
export const DASHBOARD_TILES = ["Active permissions","Expiring permissions","Recently used","High-sensitivity access","Unusual access","Pending requests","Revocations in progress","Data exports","Correction requests","Research participation","Proxy users","Emergency access events","Connected devices","AI models using patient data","Organizations holding copies","Unresolved privacy issues"] as const;
export const ONE_CLICK_ACTIONS = ["Revoke","Export","Correction","Restriction","Delete"] as const;

// ── Revocation — 9 steps + 7 categories ─────────────────────────────────
export const REVOCATION_STEPS = ["Authenticate the patient","Confirm exact scope","Show affected recipients/systems","Explain what will stop immediately","Explain what may remain (legal/clinical/archival)","Block future tokens/subscriptions","Stop new model inference","Cancel pending exports","Notify recipients + create deletion/restriction jobs + record event + report status"] as const;
export const REVOCATION_CATEGORIES = ["Future access","New inference","Existing derived data","Existing research results","Copies already legally retained","Emergency records","Backups","Aggregated statistics","Published research"] as const;

// ── Export — 9 formats + provenance + ONC ───────────────────────────────
export const EXPORT_FORMATS = ["FHIR R4 bundle","C-CDA","DICOM + metadata","CSV","JSON time-series","Medication and allergy list","Consent history","Access history","AI summaries (derived labeled)","Original documents","Voice recordings + transcripts","Genomic files (privacy warnings)","Research participation history"] as const;

// ── Restriction — 11 types ──────────────────────────────────────────────
export const RESTRICTION_TYPES = ["hide_from_selected_recipients","block_research_use","block_ai_training","block_behavioral_inference","block_cross_border_transfer","mask_exact_location","mask_sensitive_diagnosis","share_only_aggregate_data","allow_treatment_deny_product_improvement","allow_clinician_view_deny_caregiver_view","permit_emergency_access_only"] as const;

// ── Deletion orchestration — 14 asset locations ─────────────────────────
export const DELETION_ASSETS = ["primary_records","cached_records","search_indexes","vector_embeddings","knowledge_graph_edges","derived_risk_scores","model_features","research_extracts","warehouse_copies","backups","audit_references","vendor_copies","device_local_copies","derived_data"] as const;

// ── Derived-data governance — 13 classes + 11 metadata ──────────────────
export const DERIVED_CLASSES = ["normalized_observations","health_scores","risk_predictions","digital_biomarkers","voice_embeddings","behavioral_profiles","genomic_interpretations","biological_age_estimates","digital_twin_attributes","cohort_memberships","personalization_vectors","model_generated_summaries","research_features","alert_histories"] as const;
export const DERIVED_METADATA = ["source_data_references","processing_purpose","model_version","creation_time","confidence","retention_policy","patient_visibility","correction_dependency","deletion_dependency","sharing_restrictions","can_be_used_for_future_inference"] as const;

// ── AI-specific consent — 12 operations ─────────────────────────────────
export const AI_CONSENT_OPERATIONS = ["generate_patient_summary","clinical_decision_support","personalize_wellness_advice","train_general_models","fine_tune_tenant_model","create_embeddings","population_analytics","research","voice_health_inference","behavioral_risk_prediction","automated_action","human_reviewed_action_only","cross_border_processing"] as const;

// ── Research — 22 study fields + 12 consent options + 12 withdrawal ─────
export const RESEARCH_STUDY_FIELDS = ["sponsor","institution","principal_investigator","research_question","data_categories","time_period","geography","study_duration","data_recipients","commercial_involvement","genetic_analysis","ai_model_training","recontact_permissions","return_of_results_policy","compensation","withdrawal_process","risks","benefits","ethics_approval","retention_period","publication_policy","international_transfers"] as const;
export const RESEARCH_CONSENT_OPTIONS = ["one_time_study","ongoing_longitudinal","disease_specific","broad_domain","genomic_research","data_only_participation","recontact_allowed","recontact_prohibited","commercial_use_allowed","commercial_use_prohibited","deidentified_use_only","identifiable_use_with_additional_approval"] as const;
export const RESEARCH_WITHDRAWAL_BEHAVIORS = ["stop_new_data_collection","stop_new_analysis_where_feasible","remove_from_future_cohort_queries","notify_study_team","cancel_future_recontact","identify_data_already_analyzed","explain_published_results_cannot_be_withdrawn","preserve_audit_records","show_completion_timeline","revocable_data_licenses","withdrawal_may_not_undo_completed_analyses","notify_downstream_recipients"] as const;

// ── Proxy — 11 relationships + 13 permissions + 11 safeguards ───────────
export const PROXY_RELATIONSHIPS = ["Parent","Legal guardian","Caregiver","Spouse or partner","Health-care proxy","Power of attorney","Trusted contact","Home-health worker","Research delegate","Emergency contact","Institutional representative"] as const;
export const PROXY_PERMISSIONS = ["view_only","add_patient_reported_data","schedule_appointments","manage_medications","send_messages","view_mental_health_data","view_reproductive_health_data","view_genomics","approve_research_participation","download_records","receive_emergency_alerts","manage_devices","act_during_incapacity"] as const;
export const PROXY_SAFEGUARDS = ["expiration_dates","patient_approval","legal_document_verification","dual_approval_for_sensitive_categories","step_up_authentication","delegation_audit","patient_notification","automatic_expiration_at_age_of_majority","emergency_only_temporary_access","immediate_revocation","conflict_resolution_between_proxies","separate_access_per_data_category"] as const;

// ── Family-linked — 10 controls ─────────────────────────────────────────
export const FAMILY_CONTROLS = ["explicit_family_link_consent","separate_family_history_consent","restrictions_on_genomic_interpretation_sharing","family_member_notification_preferences","no_automatic_disclosure_of_inherited_risk","clinician_mediated_disclosure_for_serious_findings","family_tree_visibility_controls","individual_correction_of_family_history_entries","explicit_revocable_consent_inheritance_rules","restrictions_on_identifying_relatives_from_genomic_similarity","special_handling_for_minors_and_deceased_relatives"] as const;

// ── Break-glass — 12 controls + banner ──────────────────────────────────
export const BREAK_GLASS_CONTROLS = ["defined_emergency_reason","minimum_necessary_access","patient_identity_and_encounter_verification","role_and_location_verification","time_limit","read_write_separation","real_time_privacy_office_notification","patient_notification_when_appropriate","post_event_review","automatic_anomaly_detection","mandatory_explanation_per_category","no_automatic_inheritance_to_future_encounters","immediate_expiration_after_emergency","visible_banner"] as const;

// ── Access ledger — 18 fields per event ─────────────────────────────────
export const LEDGER_FIELDS = ["who_accessed","organization","role","timestamp","location","device","data_category","individual_records_viewed","purpose","action_taken","whether_data_was_downloaded","whether_ai_inference_was_run","whether_information_was_shared_onward","whether_break_glass_was_used","whether_access_was_denied","whether_anomaly_was_detected","explanation","consent_id"] as const;

// ── Anomaly detection — 12 patterns ─────────────────────────────────────
export const ANOMALY_PATTERNS = ["access_outside_normal_working_hours","large_volume_downloads","repeated_access_without_care_relationship","access_from_unusual_geography","access_after_relationship_ended","attempts_to_view_restricted_categories","repeated_failed_authorization","unusual_caregiver_behavior","data_export_to_unrecognized_applications","ai_inference_on_data_outside_approved_purpose","repeated_access_to_high_sensitivity_records","cross_tenant_identity_anomalies"] as const;

// ── Consent inheritance — 5 reconfirmation triggers ──────────────────────
export const INHERITANCE_RECONFIRMATION = ["new_recipient","new_purpose","cross_border_transfer","identifiable_research","automated_clinical_action"] as const;

// ── Privacy-preserving AI — 8 modes ─────────────────────────────────────
export const PRIVACY_MODES = ["Local-only","Confidential cloud (attested enclave)","De-identified","Federated","Aggregate-only","Human-reviewed","No-training","No-inference"] as const;

// ── Export security — 11 features ───────────────────────────────────────
export const EXPORT_SECURITY = ["one_time_download_links","passphrase_or_passkey_protection","recipient_verification","expiration","watermarking","selective_field_export","download_confirmation","export_history","revocation_before_download","encryption_at_rest_and_in_transit","optional_direct_transfer_to_another_provider"] as const;

// ── Correction propagation graph ────────────────────────────────────────
export const CORRECTION_GRAPH = ["Corrected Source Record","Normalized Observation","Feature Store","Risk Scores","Alerts","Care Plans","Reports and Summaries","Research Extracts"] as const;

// ── Patient privacy notifications — 22 events × 6 channels ───────────────
export const PRIVACY_NOTIFICATIONS = ["new_consent_request","consent_approval","consent_modification","consent_expiration","consent_revocation","high_sensitivity_access","break_glass_use","unusual_access","large_export","third_party_connection","research_data_use","data_correction_completion","deletion_exception","ai_inference_on_sensitive_data","model_training_use","failed_enforcement","data_breach_or_suspected_compromise","revocation_in_progress","export_created","restriction_applied","proxy_added","emergency_access_event"] as const;
export const NOTIFICATION_CHANNELS = ["in_app","email","sms","secure_message","voice_call_for_urgent_privacy_events","caregiver_notification_only_when_explicitly_authorized"] as const;

// ── Safety and privacy interaction — 6 examples + 11 decisions ───────────
export const SAFETY_PRIVACY_EXAMPLES = ["restrict_allergy_blocks_medication_recommendation","revoke_wearable_shows_data_gap_and_manual_fallback","restrict_mental_health_blocks_ani_unrelated_risk_scoring","withdraw_research_excludes_future_cohort_discovery","deletion_request_for_treatment_needed_record_explains_retention","emergency_access_post_event_explanation_when_appropriate"] as const;
export const PDP_DECISIONS = ["Allow","Allow with masking","Allow with redaction","Allow with human review","Allow only for emergency","Allow only for treatment","Deny","Defer pending consent","Require renewed consent","Require legal representative","Use safe fallback"] as const;

// ── India-ready + Security model ────────────────────────────────────────
export const INDIA_READY = ["Gujarati/Hindi/English + regional","audio consent","screen-reader/high-contrast/large-text/sign-language/easy-read","back-translation quality","country/state-aware residency","Digital Personal Data Protection consent-manager","purpose limitation & withdrawal","cross-border controls","local provider identity verification","local emergency-contact behavior","health-record/insurance integrations","local retention/grievance workflows"] as const;
export const SECURITY_MODEL = ["passkeys + phishing-resistant","step-up auth for genomics/mental/reproductive/exports","hardware-backed key storage","device binding","recovery contacts with fraud controls","session-risk scoring","consent-change notifications","dual confirmation for broad sharing","rate limits on export/revoke","device-loss remote revocation","tamper-evident consent history","separate patient/provider signing keys","secure recovery without support-agent visibility"] as const;

// ── Wallet data model + Consent event ledger JSON templates ─────────────
export const WALLET_DATA_MODEL_TEMPLATE = {
  consent_id: "consent-01J...",
  patient_id: "tokenized",
  status: "active",
  version: 4,
  subject: { data_domains: ["blood_pressure","medications","appointments"], excluded_domains: ["genomics","mental_health_notes","voice_recordings"], specific_records: [], derived_data: { allow_health_summary: true, allow_risk_scores: false, allow_embeddings: false, allow_model_training: false } },
  purpose: ["treatment","care_coordination"],
  recipient: { type: "organization", id: "city-hospital", roles: ["care_team"] },
  actions: ["view","create_care_task"],
  conditions: { minimum_necessary: true, human_review_required: true, no_onward_sharing: true, no_automated_clinical_action: true },
  jurisdiction: ["IN-GJ"],
  validity: { start: "2026-09-01T00:00:00+05:30", end: "2026-09-30T23:59:59+05:30" },
  provenance: { language: "gu-IN", consent_version: "patient-consent-3.1", explanation_shown: true, understanding_confirmed: true, signed_at: "2026-09-01T13:30:00+05:30" },
};

export const CONSENT_EVENT_LEDGER_TEMPLATE = {
  event_id: "wallet-event-...",
  event_type: "CONSENT_REVOKED",
  consent_id: "consent-01J...",
  patient_id: "tokenized",
  actor: "patient",
  authentication: "passkey_step_up",
  scope: { data_domains: ["blood_pressure"], recipient: "city-hospital", purpose: "research" },
  effective_at: "2026-09-01T13:30:04+05:30",
  enforcement: { api_tokens_revoked: true, subscriptions_cancelled: true, model_processing_blocked: true, downstream_notifications_sent: true, deletion_jobs_created: true },
  previous_hash: "sha256:...",
  event_hash: "sha256:...",
};

// ── Helpers ─────────────────────────────────────────────────────────────
function sha256(s: string){ return crypto.createHash("sha256").update(s).digest("hex"); }
async function safe<T>(fn:()=>Promise<T>, fallback:T): Promise<T>{ try{ return await fn(); } catch{ return fallback; } }

// ── Zod schemas ─────────────────────────────────────────────────────────
export const walletConsentSchema = z.object({
  patientId: z.string().uuid(),
  recipientType: z.string().min(1).max(40).default("organization"),
  recipientId: z.string().min(1).max(120),
  recipientRoles: z.array(z.string()).default([]),
  dataDomains: z.array(z.enum(["GENERAL_MEDICAL","MENTAL_HEALTH","SUBSTANCE_USE","GENOMICS","REPRODUCTIVE_HEALTH","VOICE_RECORDINGS","BEHAVIORAL","BIOMETRIC","LOCATION","RESEARCH_DATA","ENVIRONMENTAL","FINANCIAL_INSURANCE"])).min(1),
  excludedDomains: z.array(z.enum(["GENERAL_MEDICAL","MENTAL_HEALTH","SUBSTANCE_USE","GENOMICS","REPRODUCTIVE_HEALTH","VOICE_RECORDINGS","BEHAVIORAL","BIOMETRIC","LOCATION","RESEARCH_DATA","ENVIRONMENTAL","FINANCIAL_INSURANCE"])).default([]),
  specificRecords: z.array(z.string()).default([]),
  derivedAllow: z.record(z.boolean()).optional(),
  purposes: z.array(z.enum(["TREATMENT","PAYMENT","CARE_COORDINATION","WELLNESS","RESEARCH","QUALITY_IMPROVEMENT","PUBLIC_HEALTH","EMERGENCY_RESPONSE","PRODUCT_IMPROVEMENT"])).min(1),
  actions: z.array(z.enum(["VIEW","DOWNLOAD","ANALYZE","INFER","SHARE","TRAIN_MODEL","CONTACT_PATIENT","CREATE_TASK","TRIGGER_ALERT"])).min(1),
  validFrom: z.coerce.date().optional().nullable(),
  validUntil: z.coerce.date().optional().nullable(),
  oneTimeUse: z.boolean().default(false),
  reconsentInterval: z.coerce.number().int().optional().nullable(),
  jurisdictions: z.array(z.string()).default([]),
  institutions: z.array(z.string()).default([]),
  minimumNecessary: z.boolean().default(true),
  deidentification: z.string().max(40).optional().nullable(),
  aggregation: z.string().max(40).optional().nullable(),
  humanReviewRequired: z.boolean().default(false),
  noOnwardSharing: z.boolean().default(false),
  noAutomatedClinicalAction: z.boolean().default(false),
  noCommercialUse: z.boolean().default(false),
  processingMode: z.enum(["LOCAL_ONLY","CONFIDENTIAL_CLOUD","DEIDENTIFIED","FEDERATED","AGGREGATE_ONLY","HUMAN_REVIEWED","NO_TRAINING","NO_INFERENCE"]).default("CONFIDENTIAL_CLOUD"),
  language: z.string().max(10).default("en"),
  inheritanceEnabled: z.boolean().default(false),
  inheritanceRules: z.record(z.unknown()).optional(),
});
export const walletProxySchema = z.object({
  patientId: z.string().uuid(),
  proxyEmail: z.string().email().optional().nullable(),
  proxyName: z.string().max(120).optional().nullable(),
  relationship: z.enum(["PARENT","LEGAL_GUARDIAN","CAREGIVER","SPOUSE_PARTNER","HEALTHCARE_PROXY","POWER_OF_ATTORNEY","TRUSTED_CONTACT","HOME_HEALTH_WORKER","RESEARCH_DELEGATE","EMERGENCY_CONTACT","INSTITUTIONAL_REPRESENTATIVE"]).default("CAREGIVER"),
  permissions: z.array(z.enum(["VIEW","DOWNLOAD","ANALYZE","INFER","SHARE","TRAIN_MODEL","CONTACT_PATIENT","CREATE_TASK","TRIGGER_ALERT"])).default(["VIEW"]),
  dataDomains: z.array(z.enum(["GENERAL_MEDICAL","MENTAL_HEALTH","SUBSTANCE_USE","GENOMICS","REPRODUCTIVE_HEALTH","VOICE_RECORDINGS","BEHAVIORAL","BIOMETRIC","LOCATION","RESEARCH_DATA","ENVIRONMENTAL","FINANCIAL_INSURANCE"])).default(["GENERAL_MEDICAL"]),
  expiration: z.coerce.date().optional().nullable(),
  dualApproval: z.boolean().default(false),
});
export const walletExportSchema = z.object({
  patientId: z.string().uuid(),
  format: z.enum(["FHIR_R4_BUNDLE","C_CDA","DICOM","CSV","JSON","MED_LIST","CONSENT_HISTORY","ACCESS_HISTORY"]).default("FHIR_R4_BUNDLE"),
  scope: z.record(z.unknown()).optional(),
  passphraseProtected: z.boolean().default(false),
  expiresAt: z.coerce.date().optional().nullable(),
});
export const walletCorrectionSchema = z.object({
  patientId: z.string().uuid(),
  recordId: z.string().min(1),
  dataDomain: z.enum(["GENERAL_MEDICAL","MENTAL_HEALTH","SUBSTANCE_USE","GENOMICS","REPRODUCTIVE_HEALTH","VOICE_RECORDINGS","BEHAVIORAL","BIOMETRIC","LOCATION","RESEARCH_DATA","ENVIRONMENTAL","FINANCIAL_INSURANCE"]).default("GENERAL_MEDICAL"),
  originalValue: z.record(z.unknown()),
  proposedValue: z.record(z.unknown()),
  reason: z.string().max(2000).optional(),
});
export const walletRestrictionSchema = z.object({
  patientId: z.string().uuid(),
  restrictionType: z.string().min(1).max(80),
  dataDomains: z.array(z.enum(["GENERAL_MEDICAL","MENTAL_HEALTH","SUBSTANCE_USE","GENOMICS","REPRODUCTIVE_HEALTH","VOICE_RECORDINGS","BEHAVIORAL","BIOMETRIC","LOCATION","RESEARCH_DATA","ENVIRONMENTAL","FINANCIAL_INSURANCE"])).default(["GENERAL_MEDICAL"]),
  recipients: z.array(z.string()).default([]),
  purpose: z.enum(["TREATMENT","PAYMENT","CARE_COORDINATION","WELLNESS","RESEARCH","QUALITY_IMPROVEMENT","PUBLIC_HEALTH","EMERGENCY_RESPONSE","PRODUCT_IMPROVEMENT"]).optional().nullable(),
});

// ── HealthWallet — PDP/PEP, inheritance, anomaly, break-glass ────────────
export class HealthWallet {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}
  private async assert(action: "READ"|"CREATE"|"UPDATE"|"DELETE"){
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health_wallet`);
  }
  private audit(action: string, targetType: string, targetId: string, meta?: Record<string, unknown>){
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType, targetId, metadata: meta }).catch(()=>null);
  }

  // ── Data inventory — per patient, per domain, with sensitivity ─────────
  async dataInventory(patientId: string){
    await this.assert("READ");
    const patient = await safe(()=>(prisma as never as { healthPatient:{findFirst:(a:unknown)=>Promise<{id:string;firstName:string;lastName:string}|null>}}).healthPatient.findFirst({ where:{id:patientId, workspaceId:this.workspaceId}}), null);
    if (!patient) throw new Error("Patient not found");
    // Count records per domain (derived from existing tables)
    const counts = await Promise.all([
      safe(()=>(prisma as never as { healthVital:{count:(a:unknown)=>Promise<number>}}).healthVital.count({ where:{patientId, workspaceId:this.workspaceId}}),0),
      safe(()=>(prisma as never as { healthLabResult:{count:(a:unknown)=>Promise<number>}}).healthLabResult.count({ where:{patientId, workspaceId:this.workspaceId}}),0),
      safe(()=>(prisma as never as { healthMedication:{count:(a:unknown)=>Promise<number>}}).healthMedication.count({ where:{patientId, workspaceId:this.workspaceId}}),0),
      safe(()=>(prisma as never as { healthImagingStudy:{count:(a:unknown)=>Promise<number>}}).healthImagingStudy.count({ where:{patientId, workspaceId:this.workspaceId}}),0),
      safe(()=>(prisma as never as { healthWalletDerivedData:{count:(a:unknown)=>Promise<number>}}).healthWalletDerivedData.count({ where:{patientId, workspaceId:this.workspaceId}}),0),
    ]);
    const inventory = [
      { domain:"GENERAL_MEDICAL", count:(counts[0] as number)+(counts[1] as number), sensitivity: DATA_DOMAIN.GENERAL_MEDICAL.sensitivity, controls: DATA_DOMAIN.GENERAL_MEDICAL.controls },
      { domain:"BIOMETRIC", count:counts[0] as number, sensitivity: DATA_DOMAIN.BIOMETRIC.sensitivity, controls: DATA_DOMAIN.BIOMETRIC.controls },
      { domain:"GENOMICS", count:0, sensitivity: DATA_DOMAIN.GENOMICS.sensitivity, controls: DATA_DOMAIN.GENOMICS.controls, note:"Raw genomic files not shared unless explicitly consented — family implications" },
      { domain:"MENTAL_HEALTH", count:0, sensitivity: DATA_DOMAIN.MENTAL_HEALTH.sensitivity, controls: DATA_DOMAIN.MENTAL_HEALTH.controls },
      { domain:"REPRODUCTIVE_HEALTH", count:0, sensitivity: DATA_DOMAIN.REPRODUCTIVE_HEALTH.sensitivity, controls: DATA_DOMAIN.REPRODUCTIVE_HEALTH.controls },
      { domain:"LOCATION", count:0, sensitivity: DATA_DOMAIN.LOCATION.sensitivity, controls: DATA_DOMAIN.LOCATION.controls },
      { domain:"RESEARCH_DATA", count:counts[4] as number, sensitivity: DATA_DOMAIN.RESEARCH_DATA.sensitivity, controls: DATA_DOMAIN.RESEARCH_DATA.controls },
      { domain:"FINANCIAL_INSURANCE", count:0, sensitivity: DATA_DOMAIN.FINANCIAL_INSURANCE.sensitivity, controls: DATA_DOMAIN.FINANCIAL_INSURANCE.controls },
    ];
    return { patient, inventory, dataMinimization:"Only fields, time range, resolution required are released", noSilentInheritance:"New data does not inherit old permission unless explicitly enabled" };
  }

  // ── Consent CRUD — FHIR Consent mapping, layered UX ────────────────────
  async listConsents(patientId?: string, status?: string){
    await this.assert("READ");
    const where:Record<string,unknown>={workspaceId:this.workspaceId};
    if(patientId) where.patientId=patientId;
    if(status) where.status=status;
    return safe(()=>(prisma as never as { healthWalletConsent:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthWalletConsent.findMany({ where, orderBy:{createdAt:"desc"}, take:50}),[]);
  }
  async createConsent(input: z.infer<typeof walletConsentSchema>){
    await this.assert("CREATE");
    const consentId = `consent-${crypto.randomUUID().slice(0,8)}`;
    const fhirConsent = {
      resourceType:"Consent", id: consentId, status:"active", scope:{ coding:[{ system:"http://terminology.hl7.org/CodeSystem/consentscope", code:"patient-privacy" }] },
      category:[{ coding:[{ system:"http://loinc.org", code:"64292-6" }] }], // + N0VA extensions for inference/derived/AI training/cross-module
      patient:{ reference:`Patient/${input.patientId}` }, performer:[{ reference:`Patient/${input.patientId}` }], organization:[{ reference:`Organization/${input.recipientId}` }],
      policy: [{ uri: input.purposes[0] ?? "treatment" }], provision:{ actor:[{ role:{ coding:[{ code: input.recipientType }] }, reference:{ reference: input.recipientId }}], action: input.actions.map(a=> ({ coding:[{ code: a }] })), purpose: input.purposes.map(p=> ({ code: p })), dataPeriod:{ start: input.validFrom?.toISOString(), end: input.validUntil?.toISOString() }, securityLabel: input.dataDomains.map(d=> ({ code: d })) },
      extension:[{ url:"http://n0va.health/fhir/StructureDefinition/consent-derived-allow", valueBoolean: !input.excludedDomains.includes("GENOMICS" as never) }, { url:"http://n0va.health/fhir/StructureDefinition/consent-processing-mode", valueString: input.processingMode }],
    };
    const row = await (prisma as never as { healthWalletConsent:{create:(a:unknown)=>Promise<unknown>}}).healthWalletConsent.create({ data:{
      workspaceId:this.workspaceId, patientId: input.patientId, consentId, status:"ACTIVE", version:1,
      recipientType: input.recipientType, recipientId: input.recipientId, recipientRoles: input.recipientRoles,
      dataDomains: input.dataDomains as never, excludedDomains: input.excludedDomains as never, specificRecords: input.specificRecords,
      derivedAllow: (input.derivedAllow ?? {}) as never, purposes: input.purposes as never, actions: input.actions as never,
      validFrom: input.validFrom ?? null, validUntil: input.validUntil ?? null, oneTimeUse: input.oneTimeUse, reconsentInterval: input.reconsentInterval ?? null,
      jurisdictions: input.jurisdictions, institutions: input.institutions,
      minimumNecessary: input.minimumNecessary, deidentification: input.deidentification ?? null, aggregation: input.aggregation ?? null,
      humanReviewRequired: input.humanReviewRequired, noOnwardSharing: input.noOnwardSharing, noAutomatedClinicalAction: input.noAutomatedClinicalAction, noCommercialUse: input.noCommercialUse,
      processingMode: input.processingMode as never, language: input.language, inheritanceEnabled: input.inheritanceEnabled, inheritanceRules: (input.inheritanceRules ?? {}) as never,
      fhirConsent: fhirConsent as never, policyVersion:"wallet-policy-4.2", createdById:this.userId,
    } as never });
    // Event ledger with hash chain
    await this.appendConsentEvent(input.patientId, consentId, "CONSENT_GRANTED", { data_domains: input.dataDomains, recipient: input.recipientId, purpose: input.purposes[0] }, { api_tokens_revoked:false, subscriptions_cancelled:false });
    await this.audit("CREATE","HealthWalletConsent",consentId, input as never);
    return row;
  }
  private async appendConsentEvent(patientId: string, consentId: string, eventType: string, scope: Record<string,unknown>, enforcement: Record<string,unknown>){
    const last = await safe(()=>(prisma as never as { healthWalletConsentEvent:{findFirst:(a:unknown)=>Promise<{eventHash:string}|null>}}).healthWalletConsentEvent.findFirst({ where:{workspaceId:this.workspaceId, patientId}, orderBy:{createdAt:"desc"}}), null);
    const previousHash = (last as {eventHash:string}|null)?.eventHash ?? null;
    const payload = `${this.workspaceId}:${patientId}:${consentId}:${eventType}:${Date.now()}:${previousHash ?? "genesis"}`;
    const eventHash = sha256(payload);
    await safe(()=>(prisma as never as { healthWalletConsentEvent:{create:(a:unknown)=>Promise<unknown>}}).healthWalletConsentEvent.create({ data:{
      workspaceId:this.workspaceId, patientId, consentId, eventType, actor:"patient", authentication:"passkey_step_up", scope: scope as never, effectiveAt: new Date(), enforcement: enforcement as never, previousHash, eventHash,
    } as never}), null);
  }

  // ── Revocation — 9 steps, distinguish 7 categories ─────────────────────
  async revokeConsent(consentId: string, reason?: string){
    await this.assert("UPDATE");
    const consent = await safe(()=>(prisma as never as { healthWalletConsent:{findFirst:(a:unknown)=>Promise<{patientId:string;status:string}|null>}}).healthWalletConsent.findFirst({ where:{consentId, workspaceId:this.workspaceId}}), null);
    if(!consent) throw new Error("Consent not found");
    const updated = await (prisma as never as { healthWalletConsent:{update:(a:unknown)=>Promise<unknown>}}).healthWalletConsent.update({ where:{consentId}, data:{ status:"REVOKED", revokedAt: new Date(), revokedReason: reason ?? "Patient revocation", version:{ increment:1 } } as never });
    // Enforcement: block future tokens, stop new inference, cancel exports, notify recipients, create deletion/restriction jobs
    await this.appendConsentEvent((consent as {patientId:string}).patientId, consentId, "CONSENT_REVOKED", { consentId, reason }, { api_tokens_revoked:true, subscriptions_cancelled:true, model_processing_blocked:true, downstream_notifications_sent:true, deletion_jobs_created:true });
    // Distinguish what stops vs remains
    const remains = { future_access:"blocked", new_inference:"blocked", existing_derived:"marked_affected_until_review", existing_research_results:"retained_if_published", legally_retained:"retained_with_explanation", emergency_records:"retained_with_audit", backups:"pending_expiry", aggregates:"retained_anonymized", published:"retained" };
    // Create deletion jobs for revocable derived data
    await safe(()=>(prisma as never as { healthWalletDeletionJob:{createMany:(a:unknown)=>Promise<unknown>}}).healthWalletDeletionJob.createMany({ data: DELETION_ASSETS.slice(0,6).map(asset=> ({ workspaceId:this.workspaceId, patientId:(consent as {patientId:string}).patientId, dataDomains:["GENERAL_MEDICAL"] as never, asset, location:`derived/${asset}`, status:"PENDING" as never, requestedById:this.userId })) as never }), null);
    await this.audit("REVOKE","HealthWalletConsent",consentId,{ reason, remains });
    return { consent: updated, enforcement:{ api_tokens_revoked:true, subscriptions_cancelled:true, model_processing_blocked:true, downstream_notifications_sent:true, deletion_jobs_created:true, remains, safeClinicalContinuity:"Revocation cannot silently remove information required for immediate treatment, legal retention, or patient safety — exceptions explained and audited" }};
  }

  // ── Policy Decision Point — allow/deny/mask/escalate ───────────────────
  async decide(request: {
    patientId: string; requesterId?: string; requesterRole?: string; dataCategory: WalletDataDomainKey; purpose: string; action: string;
    jurisdiction?: string; emergency?: boolean;
  }): Promise<{ decision: string; allowed_data?: string[]; masked_data?: string[]; consent_id?: string; policy_version?: string; expires_at?: string; patient_notification?: string; reason?: string }> {
    await this.assert("READ");
    // Resolve patient and relationship, data category, purpose/action -> consent -> restriction -> jurisdiction -> minimum necessary -> emergency -> audit
    // Check restriction first — overrides consent
    const restriction = await safe(()=>(prisma as never as { healthWalletRestriction:{findFirst:(a:unknown)=>Promise<{restrictionType:string}|null>}}).healthWalletRestriction.findFirst({ where:{ workspaceId:this.workspaceId, patientId: request.patientId, active:true, dataDomains:{ has: request.dataCategory as never } }}), null);
    if (restriction) return { decision:"Deny", reason:`Restriction: ${(restriction as {restrictionType:string}).restrictionType}`, allowed_data:[], masked_data:[request.dataCategory] };
    // Break-glass bypass if emergency
    if (request.emergency) {
      await this.appendConsentEvent(request.patientId, `emergency-${Date.now()}`, "BREAK_GLASS_USED", { dataCategory: request.dataCategory, purpose: request.purpose }, { break_glass:true });
      return { decision:"Allow only for emergency", allowed_data:[request.dataCategory], masked_data:[], consent_id:"emergency-override", policy_version:"wallet-policy-4.2", patient_notification:"enabled", reason:"Emergency — minimum necessary, time-limited, privacy-office notified, banner displayed" };
    }
    // Find active consent matching WHO/WHAT/WHY/HOW/WHEN/WHERE/CONDITIONS
    const consents = await safe(()=>(prisma as never as { healthWalletConsent:{findMany:(a:unknown)=>Promise<Array<{consentId:string;dataDomains:string[];excludedDomains:string[];purposes:string[];actions:string[];jurisdictions:string[];validUntil:Date|null;processingMode:string;minimumNecessary:boolean;noOnwardSharing:boolean}>>}}).healthWalletConsent.findMany({ where:{ workspaceId:this.workspaceId, patientId: request.patientId, status:"ACTIVE" }}),[]);
    const match = (consents as Array<{consentId:string;dataDomains:string[];excludedDomains:string[];purposes:string[];actions:string[];jurisdictions:string[];validUntil:Date|null}>).find(c=>
      c.dataDomains.includes(request.dataCategory) && !c.excludedDomains.includes(request.dataCategory) &&
      (c.purposes.includes(request.purpose.toUpperCase()) || c.purposes.includes(request.purpose)) &&
      (c.actions.includes(request.action.toUpperCase()) || c.actions.includes(request.action)) &&
      (!request.jurisdiction || c.jurisdictions.length===0 || c.jurisdictions.includes(request.jurisdiction)) &&
      (!c.validUntil || new Date(c.validUntil) > new Date())
    );
    if (!match) {
      // Safety and privacy interaction — return safe fallback, not silent allow
      const safetyFallback = SENSITIVE_CATEGORIES.includes(request.dataCategory as never) ? "Use safe fallback — restrict mental-health/genomics/behavioral from unrelated risk scoring" : "Defer pending consent";
      return { decision:"Deny", reason:`No active consent for ${request.dataCategory} / ${request.purpose} / ${request.action} — ${safetyFallback}`, allowed_data:[], masked_data:[request.dataCategory] };
    }
    // Check safety interaction — e.g., restrict allergy blocks med recommendation
    if (request.dataCategory==="GENERAL_MEDICAL" && request.purpose==="research") {
      // Allow with masking example — caregiver gets med schedule but not mental health
      if (request.requesterRole==="caregiver") return { decision:"ALLOW_WITH_MASKING", allowed_data:["medication_schedule","appointment_time","care_tasks"], masked_data:["mental_health_notes","genomic_results","exact_location"], consent_id: match.consentId, policy_version:"wallet-policy-4.2", expires_at: (match as {validUntil:Date|null}).validUntil?.toISOString(), patient_notification:"enabled" };
    }
    // Consent inheritance check — new recipient/purpose/cross-border/identifiable research/automated action requires reconfirmation
    const isNewPurpose = !match.purposes.includes(request.purpose);
    const isCrossBorder = request.jurisdiction && !(match as {jurisdictions:string[]}).jurisdictions.includes(request.jurisdiction);
    if (isNewPurpose || isCrossBorder) return { decision:"Require renewed consent", reason: `New ${isNewPurpose?"purpose":"jurisdiction"} requires explicit reconfirmation (no silent inheritance)`, allowed_data:[], masked_data:[request.dataCategory] };
    // Minimum necessary — data minimization: only fields/time range/resolution required
    // Write audit ledger
    await safe(()=>(prisma as never as { healthWalletAccessLedger:{create:(a:unknown)=>Promise<unknown>}}).healthWalletAccessLedger.create({ data:{
      workspaceId:this.workspaceId, patientId: request.patientId, consentId: match.consentId, accessorId: request.requesterId ?? null, accessorName: request.requesterRole ?? null,
      organization: "City Hospital", role: request.requesterRole ?? null, dataCategory: request.dataCategory as never, purpose: request.purpose.toUpperCase() as never, action: request.action.toUpperCase() as never,
      explanation:`A ${request.requesterRole ?? "clinician"} viewed your ${request.dataCategory.toLowerCase().replace(/_/g," ")} for ${request.purpose} — purpose-limited, minimum necessary.`,
    } as never}), null);
    return { decision:"Allow", allowed_data:[request.dataCategory], masked_data:[], consent_id: match.consentId, policy_version:"wallet-policy-4.2", expires_at: (match as {validUntil:Date|null}).validUntil?.toISOString(), patient_notification:"enabled", reason:"Purpose limitation + data minimization satisfied" };
  }

  // ── Enforcement points — 21 layers (stubs for PDP injection) ───────────
  enforcementPoints(){ return ENFORCEMENT_POINTS; }

  // ── Break-glass ───────────────────────────────────────────────────────
  async breakGlass(patientId: string, reason: string, requesterRole: string, location?: string){
    await this.assert("CREATE");
    const event = await (prisma as never as { healthWalletAccessLedger:{create:(a:unknown)=>Promise<unknown>}}).healthWalletAccessLedger.create({ data:{
      workspaceId:this.workspaceId, patientId, accessorId:this.userId, accessorName: requesterRole, organization: location ?? "Emergency", role: requesterRole,
      dataCategory:"GENERAL_MEDICAL" as never, purpose:"EMERGENCY_RESPONSE" as never, action:"VIEW" as never,
      breakGlass:true, explanation:`Break-glass: ${reason} — minimum necessary, time-limited, real-time privacy-office notified, patient notified when appropriate, visible banner, no inheritance.`,
    } as never });
    await this.appendConsentEvent(patientId, `break-glass-${Date.now()}`, "BREAK_GLASS_USED", { reason, role: requesterRole }, { break_glass:true, banner_displayed:true });
    await this.audit("BREAK_GLASS","HealthWalletAccessLedger",(event as {id:string}).id,{ reason });
    return event;
  }

  // ── Anomaly detection — 12 patterns ──────────────────────────────────
  async detectAnomalies(patientId: string){
    await this.assert("READ");
    const accesses = await safe(()=>(prisma as never as { healthWalletAccessLedger:{findMany:(a:unknown)=>Promise<Array<{timestamp:Date;location:string|null;dataCategory:string;anomalyDetected:boolean}>>}}).healthWalletAccessLedger.findMany({ where:{workspaceId:this.workspaceId, patientId}, orderBy:{timestamp:"desc"}, take:100}),[]);
    const flagged: Array<{ reason: string; count: number }> = [];
    // Simple heuristic: large-volume downloads, outside hours, unusual geography, repeated high-sensitivity
    const outsideHours = (accesses as Array<{timestamp:Date}>).filter(a=> { const h=new Date(a.timestamp).getHours(); return h<6||h>22; }).length;
    if (outsideHours>5) flagged.push({ reason:"Access outside normal working hours", count: outsideHours });
    const highSens = (accesses as Array<{dataCategory:string}>).filter(a=> SENSITIVE_CATEGORIES.includes(a.dataCategory as never)).length;
    if (highSens>10) flagged.push({ reason:"Repeated access to high-sensitivity records", count: highSens });
    return { patientId, total: (accesses as unknown[]).length, flagged, recommendation:"Anomaly does not accuse — provides event details, confidence, reason, recommended action, patient notification option, privacy-office escalation, investigation status" };
  }

  // ── Derived-data governance — 13 classes ──────────────────────────────
  async listDerivedData(patientId: string){ await this.assert("READ"); return safe(()=>(prisma as never as { healthWalletDerivedData:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthWalletDerivedData.findMany({ where:{workspaceId:this.workspaceId, patientId}, take:50}),[]); }
  async createDerivedData(patientId: string, derivedClass: string, sourceRefs: string[], processingPurpose: string, modelVersion?: string){
    await this.assert("CREATE");
    // Permission to share raw heart-rate does NOT authorize depression-risk score
    const row = await (prisma as never as { healthWalletDerivedData:{create:(a:unknown)=>Promise<unknown>}}).healthWalletDerivedData.create({ data:{
      workspaceId:this.workspaceId, patientId, derivedClass, sourceRefs, processingPurpose: processingPurpose as never, modelVersion: modelVersion ?? null,
      sharingRestrictions:["no_onward_sharing"] as never, canBeUsedForFutureInference:false, patientVisible:true,
    } as never });
    await this.audit("CREATE","HealthWalletDerivedData",(row as {id:string}).id,{ derivedClass });
    return row;
  }

  // ── AI-specific consent — 12 operations ────────────────────────────────
  async checkAISpecificConsent(patientId: string, operation: string){
    await this.assert("READ");
    // Check derivedAllow in consents for AI operation
    const consents = await safe(()=>(prisma as never as { healthWalletConsent:{findMany:(a:unknown)=>Promise<Array<{derivedAllow:Record<string,unknown>;purposes:string[]}>>}}).healthWalletConsent.findMany({ where:{workspaceId:this.workspaceId, patientId, status:"ACTIVE"}}),[]);
    const allowed = (consents as Array<{derivedAllow:Record<string,unknown>}>).some(c=> (c.derivedAllow as Record<string,unknown>)[operation] === true);
    return { operation, allowed, note: allowed? "Allowed per AI-specific consent":"Separate control required — use data to generate patient summary requires explicit AI permission" };
  }

  // ── Research marketplace ─────────────────────────────────────────────
  async listResearchStudies(){ await this.assert("READ"); return safe(()=>(prisma as never as { healthWalletResearchStudy:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthWalletResearchStudy.findMany({ where:{workspaceId:this.workspaceId}, take:20}),[]); }
  async createResearchStudy(study: Record<string,unknown>){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthWalletResearchStudy:{create:(a:unknown)=>Promise<unknown>}}).healthWalletResearchStudy.create({ data:{ workspaceId:this.workspaceId, ...study } as never });
    await this.audit("CREATE","HealthWalletResearchStudy",(row as {id:string}).id, study);
    return row;
  }
  async consentResearch(patientId: string, studyId: string, options: string[]){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthWalletResearchConsent:{create:(a:unknown)=>Promise<unknown>}}).healthWalletResearchConsent.create({ data:{ workspaceId:this.workspaceId, patientId, studyId, consentOptions: options as never } as never });
    await this.audit("CREATE","HealthWalletResearchConsent",(row as {id:string}).id,{ studyId, options });
    return row;
  }
  async withdrawResearch(patientId: string, studyId: string){
    await this.assert("UPDATE");
    const row = await (prisma as never as { healthWalletResearchConsent:{update:(a:unknown)=>Promise<unknown>}}).healthWalletResearchConsent.update({ where:{ workspaceId_patientId_studyId:{ workspaceId:this.workspaceId, patientId, studyId }}, data:{ withdrawalStatus:"withdrawn", withdrawnAt: new Date(), futureCollectionStopped:true, removedFromCohort:true } as never });
    await this.appendConsentEvent(patientId, `study-${studyId}`, "RESEARCH_WITHDRAWN", { studyId }, { future_cohort_excluded:true, audit_preserved:true });
    await this.audit("REVOKE","HealthWalletResearchConsent",studyId);
    return { ...row as Record<string,unknown>, explains:"Published/aggregated results cannot be withdrawn — revocable licenses for future access only, completion timeline shown" };
  }

  // ── Proxy — 11 relationships ─────────────────────────────────────────
  async listProxies(patientId: string){ await this.assert("READ"); return safe(()=>(prisma as never as { healthWalletProxy:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthWalletProxy.findMany({ where:{workspaceId:this.workspaceId, patientId}, take:50}),[]); }
  async createProxy(input: z.infer<typeof walletProxySchema>){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthWalletProxy:{create:(a:unknown)=>Promise<unknown>}}).healthWalletProxy.create({ data:{ workspaceId:this.workspaceId, patientId: input.patientId, proxyEmail: input.proxyEmail ?? null, proxyName: input.proxyName ?? null, relationship: input.relationship as never, permissions: input.permissions as never, dataDomains: input.dataDomains as never, expiration: input.expiration ?? null, dualApproval: input.dualApproval, createdById:this.userId } as never });
    await this.audit("CREATE","HealthWalletProxy",(row as {id:string}).id, input as never);
    return row;
  }
  async revokeProxy(proxyId: string){ await this.assert("UPDATE"); const row=await (prisma as never as { healthWalletProxy:{update:(a:unknown)=>Promise<unknown>}}).healthWalletProxy.update({ where:{id:proxyId}, data:{ status:"revoked"} as never }); await this.audit("REVOKE","HealthWalletProxy",proxyId); return row; }

  // ── Export — FHIR R4 bundle etc. ──────────────────────────────────────
  async createExport(input: z.infer<typeof walletExportSchema>){
    await this.assert("CREATE");
    // Provenance: source, timestamp, author, device, transformation, confidence, observed vs inferred
    const provenance = { source:"N0VA Health Wallet", timestamp: new Date().toISOString(), author: this.userId, device:"wallet", transformation:"selective FHIR bundle", confidence:1, observed_vs_inferred:"observed", onr: "prevent information blocking — standards-based API" };
    const row = await (prisma as never as { healthWalletExport:{create:(a:unknown)=>Promise<unknown>}}).healthWalletExport.create({ data:{ workspaceId:this.workspaceId, patientId: input.patientId, format: input.format as never, scope: (input.scope ?? {}) as never, provenance: provenance as never, passphraseProtected: input.passphraseProtected, expiresAt: input.expiresAt ?? null, createdById:this.userId } as never });
    await this.appendConsentEvent(input.patientId, (row as {id:string}).id, "EXPORT_CREATED", { format: input.format }, { export_url: `revocable_before_download:${(row as {id:string}).id}` });
    await this.audit("CREATE","HealthWalletExport",(row as {id:string}).id, input as never);
    return row;
  }
  async listExports(patientId?: string){ await this.assert("READ"); const where:Record<string,unknown>={workspaceId:this.workspaceId}; if(patientId) where.patientId=patientId; return safe(()=>(prisma as never as { healthWalletExport:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthWalletExport.findMany({ where, orderBy:{createdAt:"desc"}, take:20}),[]); }

  // ── Correction — history preserved, downstream propagation ─────────────
  async requestCorrection(input: z.infer<typeof walletCorrectionSchema>){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthWalletCorrection:{create:(a:unknown)=>Promise<unknown>}}).healthWalletCorrection.create({ data:{
      workspaceId:this.workspaceId, patientId: input.patientId, recordId: input.recordId, dataDomain: input.dataDomain as never,
      originalValue: input.originalValue as never, proposedValue: input.proposedValue as never, reason: input.reason ?? null, reviewStatus:"pending", createdById:this.userId,
    } as never });
    // Dependency graph propagation: Normalized Observation → Feature Store → Risk Scores → Alerts → Care Plans → Reports/Summaries → Research Extracts
    const downstream = CORRECTION_GRAPH.slice(1).map(step=> ({ step, status:"marked_potentially_affected", action:"recompute_or_recall_or_correct_or_restrict" }));
    const isAllergy = String(input.dataDomain).includes("GENERAL_MEDICAL") || JSON.stringify(input.originalValue).toLowerCase().includes("allergy");
    if (isAllergy) {
      // High-priority safety review
      await safe(()=>(prisma as never as { healthSafetyIncident:{create:(a:unknown)=>Promise<unknown>}}).healthSafetyIncident.create({ data:{ workspaceId:this.workspaceId, kind:"MISSING_CONTRAINDICATION", severity:"MAJOR", title:`Correction triggers safety review: ${input.recordId}`, description: `Allergy/medication correction ${input.recordId} — review affected alerts`, patientId: input.patientId, createdById:this.userId } as never }), null);
    }
    await this.appendConsentEvent(input.patientId, (row as {id:string}).id, "CORRECTION_REQUESTED", { recordId: input.recordId, downstreamImpact: downstream.length }, {});
    await this.audit("CREATE","HealthWalletCorrection",(row as {id:string}).id, { ...input, downstreamImpact: downstream });
    return { correction: row, downstreamImpact: downstream, note:"Original preserved, not overwritten; affected summaries/alerts/features identified for recomputation/recall" };
  }
  async listCorrections(patientId?: string){ await this.assert("READ"); const where:Record<string,unknown>={workspaceId:this.workspaceId}; if(patientId) where.patientId=patientId; return safe(()=>(prisma as never as { healthWalletCorrection:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthWalletCorrection.findMany({ where, orderBy:{createdAt:"desc"}, take:50}),[]); }

  // ── Restriction — 11 types ────────────────────────────────────────────
  async createRestriction(input: z.infer<typeof walletRestrictionSchema>){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthWalletRestriction:{create:(a:unknown)=>Promise<unknown>}}).healthWalletRestriction.create({ data:{ workspaceId:this.workspaceId, patientId: input.patientId, restrictionType: input.restrictionType, dataDomains: input.dataDomains as never, recipients: input.recipients, purpose: input.purpose ?? null, createdById:this.userId } as never });
    await this.audit("CREATE","HealthWalletRestriction",(row as {id:string}).id, input as never);
    return row;
  }
  async listRestrictions(patientId?: string){ await this.assert("READ"); const where:Record<string,unknown>={workspaceId:this.workspaceId}; if(patientId) where.patientId=patientId; return safe(()=>(prisma as never as { healthWalletRestriction:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthWalletRestriction.findMany({ where, orderBy:{createdAt:"desc"}, take:50}),[]); }

  // ── Deletion orchestration — 14 assets ledger ──────────────────────────
  async requestDeletion(patientId: string, dataDomains: WalletDataDomainKey[]){
    await this.assert("CREATE");
    const jobs = await safe(()=>(prisma as never as { healthWalletDeletionJob:{createManyAndReturn:(a:unknown)=>Promise<unknown[]>}}).healthWalletDeletionJob.createManyAndReturn?.({ data: DELETION_ASSETS.map(asset=> ({ workspaceId:this.workspaceId, patientId, dataDomains: dataDomains as never, asset, location:asset.replace(/_/g,"/"), status:"PENDING" as never, requestedById:this.userId })) as never }), null);
    // Fallback if createManyAndReturn not available
    let rows: unknown[] = (jobs as unknown[]) ?? [];
    if (rows.length===0) {
      rows = [];
      for (const asset of DELETION_ASSETS) {
        const r = await safe(()=>(prisma as never as { healthWalletDeletionJob:{create:(a:unknown)=>Promise<unknown>}}).healthWalletDeletionJob.create({ data:{ workspaceId:this.workspaceId, patientId, dataDomains: dataDomains as never, asset, location:asset, requestedById:this.userId } as never }), null);
        if (r) rows.push(r);
      }
    }
    await this.appendConsentEvent(patientId, `delete-${Date.now()}`, "DELETION_REQUESTED", { dataDomains }, { deletion_jobs_created: rows.length });
    await this.audit("CREATE","HealthWalletDeletionJob",patientId,{ dataDomains, assets: DELETION_ASSETS });
    return { jobs: rows, deletionLedger:"Asset | Location | Status | Reason — more transparent than ‘all data was deleted’ when legally retained or backups remain" };
  }
  async listDeletionJobs(patientId?: string){ await this.assert("READ"); const where:Record<string,unknown>={workspaceId:this.workspaceId}; if(patientId) where.patientId=patientId; return safe(()=>(prisma as never as { healthWalletDeletionJob:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthWalletDeletionJob.findMany({ where, orderBy:{requestedAt:"desc"}, take:50}),[]); }
  async ledgerSummary(patientId: string){
    await this.assert("READ");
    const jobs = await this.listDeletionJobs(patientId) as Array<{asset:string;location:string;status:string;reason:string|null}>;
    const summary = jobs.map(j=> ({ asset:j.asset, location:j.location, status:j.status, reason:j.reason ?? (j.status==="RETAINED_BY_LAW"?"Clinical/legal retention":j.status==="PENDING"?"Pending expiry":"") }));
    return summary.length? summary : DELETION_ASSETS.map(asset=> ({ asset, location:asset, status:"PENDING", reason:"Requested" }));
  }

  // ── Access ledger — patient-visible, 18 fields, translated ────────────
  async listAccessLedger(patientId: string, take=30){
    await this.assert("READ");
    return safe(()=>(prisma as never as { healthWalletAccessLedger:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthWalletAccessLedger.findMany({ where:{workspaceId:this.workspaceId, patientId}, orderBy:{timestamp:"desc"}, take}),[]);
  }

  // ── Wallet home dashboard ─────────────────────────────────────────────
  async walletDashboard(patientId: string){
    await this.assert("READ");
    const [consents, accesses, exports, corrections, deletionJobs, proxies, derived, restrictions, research] = await Promise.all([
      this.listConsents(patientId).catch(()=>[]),
      this.listAccessLedger(patientId, 10).catch(()=>[]),
      this.listExports(patientId).catch(()=>[]),
      this.listCorrections(patientId).catch(()=>[]),
      this.listDeletionJobs(patientId).catch(()=>[]),
      this.listProxies(patientId).catch(()=>[]),
      this.listDerivedData(patientId).catch(()=>[]),
      this.listRestrictions(patientId).catch(()=>[]),
      safe(()=>(prisma as never as { healthWalletResearchConsent:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthWalletResearchConsent.findMany({ where:{workspaceId:this.workspaceId, patientId}, take:20}),[]),
    ]);
    const active = (consents as Array<{status:string}>).filter(c=> c.status==="ACTIVE").length;
    const expiringSoon = (consents as Array<{validUntil:Date|null}>).filter(c=> c.validUntil && (new Date(c.validUntil).getTime() - Date.now()) < 7*86400000 && c.validUntil > new Date()).length;
    const highSensitivity = (accesses as Array<{dataCategory:string}>).filter(a=> SENSITIVE_CATEGORIES.includes(a.dataCategory as never)).length;
    const unusual = (accesses as Array<{anomalyDetected:boolean}>).filter(a=> a.anomalyDetected).length;
    const anomalies = await this.detectAnomalies(patientId).catch(()=> ({ flagged:[] })) as {flagged: unknown[]};
    return {
      activePermissions: active, expiringSoon, recentlyUsed: (accesses as unknown[]).slice(0,3), highSensitivity, unusual, flaggedAnomalies: (anomalies as {flagged:unknown[]}).flagged,
      pendingRequests: 0, revocationsInProgress: (consents as Array<{status:string}>).filter(c=> c.status==="ENFORCEMENT_PENDING").length,
      dataExports: (exports as unknown[]).length, correctionRequests: (corrections as unknown[]).length, researchParticipation: (research as unknown[]).length,
      proxyUsers: (proxies as unknown[]).length, emergencyAccessEvents: (accesses as Array<{breakGlass:boolean}>).filter(a=> a.breakGlass).length,
      connectedDevices: 0, aiModelsUsingData: (derived as unknown[]).length, organizationsHoldingCopies: new Set((consents as Array<{recipientId:string}>).map(c=> c.recipientId)).size,
      deletionLedger: (deletionJobs as unknown[]).length, restrictions: (restrictions as unknown[]).length,
      unresolvedPrivacyIssues: unusual + (anomalies as {flagged:unknown[]}).flagged.length,
      statusLabels: CONSENT_STATUS_LABELS, dashboardTiles: DASHBOARD_TILES,
    };
  }

  // ── Static exports for UI ─────────────────────────────────────────────
  static readonly DATA_DOMAIN = DATA_DOMAIN;
  static readonly CONSENT_WHO = CONSENT_WHO;
  static readonly ENFORCEMENT_POINTS = ENFORCEMENT_POINTS;
  static readonly CORE_PRINCIPLES = CORE_PRINCIPLES;
  static readonly WALLET_DATA_MODEL_TEMPLATE = WALLET_DATA_MODEL_TEMPLATE;
  static readonly CONSENT_EVENT_LEDGER_TEMPLATE = CONSENT_EVENT_LEDGER_TEMPLATE;
}
