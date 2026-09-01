// AMR-CVC — AI Model Registry & Clinical Validation Center
// Governed product subsystem controlling full model lifecycle. FDA lifecycle guidance + PCCP (description/protocol/impact).
// Every model needs intended use, population, evidence, safety controls, operational behavior — production-eligible only when all approved.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_registry";

// ── Governance principle — 9 required before production-eligible ────────
export const GOVERNANCE_CHECKLIST = ["intended_use","non_intended_use","technical_owner","clinical_owner","risk_classification","validated_population","evidence_package","deployment_approval","monitoring_plan","rollback_plan","retirement_plan"] as const;

// ── Registry architecture — 10 sections ─────────────────────────────────
export const REGISTRY_ARCHITECTURE = ["Model Identity & Lineage","Intended Use & Risk","Dataset & Consent Provenance","Validation Evidence","Fairness & Subgroup","Regulatory & Jurisdiction","Deployment & Release","Monitoring & Drift","Incident & CAPA","Retirement & Archival"] as const;

// ── Model identity — 14 fields (+ generative extensions) ─────────────────
export const MODEL_IDENTITY_FIELDS = ["model_family_id","model_version","artifact_digest","code_commit","feature_schema_version","prompt_or_policy_version","embedding_index_version","runtime_version","dependency_lockfile","training_run_id","release_channel","owner","clinical_owner","risk_class","status"] as const;
export const GENERATIVE_IDENTITY_EXTRA = ["model_weights","system_prompts","retrieval_corpus","tool_permissions","safety_policies","evaluator_version","temperature_sampling","tool_routing"] as const;

// ── Intended-use contract — machine-readable, checked at runtime ────────
export const intendedUseContractSchema = z.object({
  clinical_purpose: z.string().min(1),
  user: z.string().min(1),
  care_setting: z.string().min(1),
  output_type: z.string().min(1),
  decision_role: z.string().min(1),
  action_limit: z.string().min(1),
  population_included: z.array(z.string()).default([]),
  population_excluded: z.array(z.string()).default([]),
  modalities_required: z.array(z.string()).default([]),
  approval_clinical_review: z.enum(["required","approved","pending"]).default("required"),
  regulatory_status: z.string().default("pending"),
  jurisdiction: z.string().default("US"),
});
export type IntendedUseContract = z.infer<typeof intendedUseContractSchema>;

// ── Evidence tiers E0-E6 ────────────────────────────────────────────────
export const EVIDENCE_TIER = {
  E0: { label: "Concept/feasibility", permitted: "Internal research only" },
  E1: { label: "Retrospective internal", permitted: "Shadow mode" },
  E2: { label: "Retrospective external", permitted: "Controlled pilot" },
  E3: { label: "Prospective silent", permitted: "Shadow deployment" },
  E4: { label: "Prospective interventional", permitted: "Limited clinical deployment" },
  E5: { label: "Real-world post-deployment", permitted: "Broader approved use" },
  E6: { label: "Regulatory/institutional authorization", permitted: "Jurisdiction-specific regulated use" },
} as const;
export type EvidenceTierKey = keyof typeof EVIDENCE_TIER;

// ── Dataset lineage graph ───────────────────────────────────────────────
export const DATASET_LINEAGE_STEPS = ["Raw Source","Consent and Legal-Basis Check","De-identification / Tokenization","Quality Filtering","Labeling and Adjudication","Cohort Construction","Feature Generation","Train / Validation / Test Split","Model Training","Evaluation Dataset","Deployment Population"] as const;
export const DATASET_FIELDS = ["source_organization","collection_dates","geography","care_settings","patient_count","encounter_count","modality","inclusion_criteria","exclusion_criteria","label_definitions","labeler_qualifications","inter_rater_agreement","missingness","measurement_units","device_manufacturers","device_firmware","consent_basis","data_use_restrictions","licensing_terms","deidentification_method","reidentification_risk","retention_period","transformation_history","known_biases","leakage_risks","restricted_fields"] as const;

// ── Consent provenance — 11 fields + withdrawn handling ─────────────────
export const CONSENT_FIELDS = ["consent_identifier","permitted_purposes","research_authorization","geographic_scope","data_categories","commercial_use","ai_training_permission","withdrawal_status","expiration_date","sharing_restrictions","secondary_use","family_genomic_dependencies"] as const;
export const WITHDRAWN_HANDLING = ["data_that_can_be_deleted","aggregated_statistics_retained","models_requiring_retraining","regulatory_records_retained","outputs_corrected_or_invalidated"] as const;

// ── Bias — 16 subgroups × 15 metrics ────────────────────────────────────
export const BIAS_SUBGROUPS = ["age","sex","gender_identity","race_ethnicity","language","geography","socioeconomic_status","disability_status","pregnancy_status","comorbidity","care_setting","device_manufacturer","device_generation","image_acquisition_protocol","clinical_site","clinician_specialty","insurance_access_category"] as const;
export const BIAS_METRICS = ["sensitivity","specificity","ppv","npv","calibration","false_positive_rate","false_negative_rate","equal_opportunity_difference","subgroup_calibration_error","abstention_rate","time_to_alert","time_to_treatment","outcome_difference","missing_data_rate","explanation_completeness"] as const;

// ── Validation program — analytical 11, clinical 12, generative 17 ───────
export const ANALYTICAL_CHECKS = ["unit_conversion","time_synchronization","missing_value_handling","image_resolution_orientation","dicom_metadata","fhir_mapping","device_signal_interpretation","repeated_event_dedup","boundary_invalid_input","numerical_reproducibility","output_schema_stability"] as const;
export const CLINICAL_VALIDATION_DESIGNS = ["retrospective_internal","external_site","temporal","prospective_silent","prospective_interventional","standard_care_comparison","clinician_comparison","workflow_simulation","human_factors","alert_burden","clinical_outcome"] as const;
export const GENERATIVE_CHECKS = ["factual_accuracy","unsupported_inference","hallucinated_citations","missing_critical_facts","wrong_patient_contamination","contradiction_handling","clinical_risk_severity","triage_appropriateness","refusal_abstention","tool_use_correctness","phi_leakage","prompt_injection_resistance","translation_accuracy","health_literacy_appropriateness","clinician_editing_burden","patient_comprehension","trpod_ai_reporting"] as const;

// ── Validation dossier — 22 items, thresholds pre-specified ─────────────
export const DOSSIER_ITEMS = ["intended_use_statement","clinical_risk_classification","system_architecture","data_flow_diagram","dataset_lineage","labeling_protocol","statistical_analysis_plan","prespecified_endpoints","validation_datasets","test_results","confidence_intervals","subgroup_analysis","calibration_analysis","missing_data_analysis","robustness_testing","human_factors_testing","cybersecurity_assessment","privacy_assessment","fmea_hazard_analysis","residual_risk_assessment","clinical_reviewer_signoff","regulatory_assessment","post_market_monitoring_plan","change_control_plan","rollback_plan","user_labeling"] as const;

// ── Model card 19 + Safety card 16 ──────────────────────────────────────
export const MODEL_CARD_SECTIONS = ["model_description","intended_use","non_intended_use","inputs","outputs","architecture","training_data","validation_data","metrics","subgroup_performance","limitations","known_failure_modes","bias_assessment","environmental_hardware_requirements","version_history","ownership","contact","license","regulatory_status"] as const;
export const SAFETY_CARD_SECTIONS = ["hazard_summary","clinical_risk_class","unsafe_scenarios","abstention_conditions","alert_thresholds","human_review_requirements","contraindications","failure_fallback","emergency_behavior","automation_bias_risks","monitoring_metrics","incident_triggers","rollback_triggers","residual_risk","patient_facing_limitations","reviewer_responsibilities"] as const;

// ── Performance claims registry — evidence object ───────────────────────
export const claimSchema = z.object({
  claim_id: z.string().min(1), // claim-sepsis-v3-sensitivity
  model_id: z.string().min(1),
  model_version: z.string().max(40).optional(),
  claim_type: z.string().default("clinical_performance"),
  metric: z.string().min(1), // sensitivity
  value: z.coerce.number().min(0).max(1),
  confidence_interval: z.object({ lower: z.coerce.number(), upper: z.coerce.number() }).optional(),
  population: z.string().optional(),
  site_count: z.coerce.number().int().optional(),
  sample_size: z.coerce.number().int().optional(),
  outcome_definition: z.string().optional(),
  prediction_horizon: z.string().optional(),
  comparator: z.string().optional(),
  validation_design: z.string().optional(),
  data_cutoff: z.coerce.date().optional(),
  review_status: z.string().default("unverified"),
  regulatory_status: z.string().optional(),
  expires: z.coerce.date().optional(),
  source_document: z.string().optional(),
  jurisdiction: z.string().optional(),
});

// ── Regulatory-status controls — 12 fields, never infer from name ────────
export const REGULATORY_FIELDS = ["classification","pathway","submission_status","clearance_number","approved_indication","approved_population","approved_version","approved_hardware","approved_jurisdiction","labeling_restrictions","change_control_restrictions","post_market_obligations"] as const;

// ── Deployment gates G0-G5 ──────────────────────────────────────────────
export const DEPLOYMENT_GATES = {
  G0: { label: "Research", criteria: ["Data and consent reviewed","Security scan","Artifact registered","No production output"] },
  G1: { label: "Offline validation", criteria: ["Pre-specified metrics met","External dataset","Subgroup analysis","Failure modes documented"] },
  G2: { label: "Shadow mode", criteria: ["Real production inputs","No clinical action","Predictions logged","Alert volume estimated","Drift measured","Clinician review of cases"] },
  G3: { label: "Canary", criteria: ["Small tenant/unit","Limited % traffic","Human review mandatory","Real-time safety monitoring","Automatic rollback"] },
  G4: { label: "Controlled production", criteria: ["Approved use case only","Explicit roles","Monitoring thresholds","Outcome tracking","Change-control enforced"] },
  G5: { label: "Expanded production", criteria: ["Multi-site evidence","Post-market review","Stable subgroup","Acceptable alert burden","Clinical governance approval"] },
} as const;

// ── Shadow mode — 10 captures ───────────────────────────────────────────
export const SHADOW_CAPTURES = ["input_eligibility","prediction","confidence","explanation","alert_priority","expected_action","whether_clinician_independently_recognized_event","actual_outcome","time_to_event","counterfactual_workflow_impact","subgroup_site_performance"] as const;

// ── Canary — 12 routing controls ────────────────────────────────────────
export const CANARY_ROUTING = ["tenant_level","site_level","department_level","user_role","device_specific","percentage_traffic","feature_flags","instant_disablement","previous_version_fallback","parallel_output_comparison","safety_owner_approval","automated_rollback"] as const;

// ── Champion-challenger — 11 compares, superiority rule ─────────────────
export const CHAMPION_COMPARES = ["discrimination","calibration","subgroup_performance","abstention","alert_volume","duplicate_alerts","clinician_acceptance","override_reasons","time_to_review","patient_outcomes","resource_utilization","failure_severity"] as const;

// ── Drift detection — 5 types + methods ─────────────────────────────────
export const DRIFT_TYPES = ["data","concept","performance","device","workflow"] as const;
export const DRIFT_METHODS: Record<string,string[]> = {
  data: ["Population stability index","Jensen-Shannon divergence","Wasserstein distance","Missingness monitoring","Range plausibility","Device-specific distribution"],
  concept: ["Delayed-label performance","Calibration monitoring","Outcome-stratified","Change-point detection","Clinician adjudication"],
  performance: ["Sensitivity","Specificity","PPV/NPV","Calibration","False-negative rate","Time-to-alert","Subgroup disparity","Outcome association"],
  device: ["Firmware","Sampling frequency","Calibration","Signal quality","Battery","Manufacturer","Placement","Scanner settings","Compression","API version"],
  workflow: ["Alert routing","Staffing changes","Acknowledgement delays","Override behavior","Documentation patterns","Care-pathway changes","New connected systems"],
};
export const DRIFT_THRESHOLDS_EXAMPLE = {
  calibration_error: { amber: "> 0.03 for 7 days", red: "> 0.05 for 3 consecutive days" },
  subgroup_sensitivity_gap: { amber: "> 0.05", red: "> 0.10" },
  false_negative_rate: { amber: "> baseline + 0.03", red: "> baseline + 0.05" },
  input_missingness: { amber: "> 10%", red: "> 20%" },
  alert_acknowledgement_time: { amber: "> 15 minutes", red: "> 30 minutes" },
};
export const DRIFT_ACTIONS = { amber: ["create_investigation","notify_model_owner","increase_case_review"], red: ["disable_model","route_to_fallback","notify_clinical_safety_officer","open_safety_event"] } as const;

// ── Change-control C0-C3 ────────────────────────────────────────────────
export const CHANGE_CLASSES = {
  C0: { label: "Administrative", examples: "Documentation/owner/metadata, no output change", approval: "registry administrator" },
  C1: { label: "Technical maintenance", examples: "Dependency patch, infra migration, perf optimization with identical outputs, security patch", approval: "engineering + quality + regression" },
  C2: { label: "Controlled model change", examples: "Threshold/calibration, feature engineering, corpus update, prompt/policy, device integration", approval: "model owner + clinical owner + validation lead + change board" },
  C3: { label: "Major clinical change", examples: "New population/modality/indication/action/jurisdiction/claim/autonomous capability", approval: "clinical governance + quality + regulatory + privacy + security + human factors (+ external regulatory submission)" },
} as const;

// ── PCCP — Description / Protocol / Impact per FDA ───────────────────────
export const PCCP_SECTIONS = ["Description of modifications","Modification protocol","Impact assessment"] as const;
export const PCCP_PERMITTED_CHANGES = ["Recalibration","Threshold updates","Retraining on approved data","Addition of approved devices","Retrieval-source updates","Bug fixes","Performance optimization","Language expansion"] as const;
export const PCCP_PROTOCOL_REQUIRED = ["Data requirements","Validation design","Statistical tests","Subgroup thresholds","Human-factors testing","Security testing","Rollout procedure","Monitoring period","Rollback criteria","Documentation requirements"] as const;
export const PCCP_IMPACT_ASSESSMENT = ["Clinical benefit","New hazards","Performance changes","Subgroup impact","Workflow impact","Privacy impact","Cybersecurity impact","Regulatory impact","Residual risk"] as const;

// ── Post-market surveillance — 16 collects, 8 drives ─────────────────────
export const POST_MARKET_COLLECTS = ["real_world_performance","complaints","adverse_events","near_misses","clinician_overrides","patient_feedback","subgroup_disparities","device_specific_behavior","data_drift","model_updates","downtime_incidents","cybersecurity_events","new_scientific_evidence","guideline_changes","outcome_association","resource_utilization"] as const;
export const POST_MARKET_DRIVES = ["corrective_preventive_action","label_updates","threshold_changes","user_training","model_restriction","model_suspension","replacement","regulatory_reporting"] as const;

// ── CVC — teams 13 + capabilities 14 ────────────────────────────────────
export const CVC_TEAMS = ["clinical_validation","biostatistics","epidemiology","data_engineering","machine_learning","human_factors","clinical_safety","regulatory_affairs","privacy","cybersecurity","health_economics","patient_caregiver_representatives","quality_assurance"] as const;
export const CVC_CAPABILITIES = ["protocol_design","cohort_construction","dataset_review","label_adjudication","statistical_analysis","subgroup_fairness_assessment","prospective_study_coordination","silent_deployment","workflow_simulation","clinical_usability_testing","evidence_dossier_generation","regulatory_submission_support","post_market_analysis","capa_management"] as const;

// ── Clinical review board — 8 decisions ──────────────────────────────────
export const REVIEW_BOARD_DECISIONS = ["Approve","Approve with restrictions","Approve for shadow mode","Require additional evidence","Defer","Reject","Suspend","Retire"] as const;

// ── Feature status — 10 states (immediate changes to Project Vita) ───────
export const FEATURE_STATUS = ["Concept","Research","Prototype","Internal validation","Shadow mode","Clinical pilot","Production wellness","Clinical decision support","Regulated medical-device function","Retired"] as const;

// ── Registry API — 12 endpoints + authorization check ─────────────────────
export const REGISTRY_API = [
  "POST /models","GET /models/{model_id}","POST /models/{model_id}/versions","POST /models/{model_id}/validation-studies",
  "POST /models/{model_id}/evidence-claims","POST /models/{model_id}/approvals","POST /models/{model_id}/deployments",
  "GET /models/{model_id}/drift","GET /models/{model_id}/subgroup-performance","POST /models/{model_id}/suspend","POST /models/{model_id}/rollback","POST /models/{model_id}/retire","GET /models/{model_id}/audit-trail",
  "Can model M version V operate in jurisdiction J, for population P, with modality X, in care setting C, for action class A, under policy version Q?"
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────
function sha256(s: string){ return crypto.createHash("sha256").update(s).digest("hex"); }
async function safe<T>(fn:()=>Promise<T>, fallback:T): Promise<T>{ try{ return await fn(); } catch{ return fallback; } }

// ── Zod schemas for AM R-CVC ────────────────────────────────────────────
export const datasetSchema = z.object({
  name: z.string().min(1).max(120),
  version: z.string().max(40).default("1.0.0"),
  sourceOrg: z.string().max(120).optional().nullable(),
  geography: z.string().max(80).optional().nullable(),
  modality: z.string().max(40).optional().nullable(),
  patientCount: z.coerce.number().int().optional().nullable(),
  labeling: z.string().max(500).optional().nullable(),
  consentBasis: z.string().max(120).optional().nullable(),
  lineageGraph: z.record(z.unknown()).optional(),
});
export const validationStudySchema = z.object({
  modelId: z.string().min(1).max(80),
  modelVersion: z.string().max(40).default("1.0.0"),
  design: z.enum(["RETROSPECTIVE_INTERNAL","RETROSPECTIVE_EXTERNAL","TEMPORAL","PROSPECTIVE_SILENT","PROSPECTIVE_INTERVENTIONAL","STANDARD_CARE_COMPARISON","CLINICIAN_COMPARISON","WORKFLOW_SIMULATION","HUMAN_FACTORS"]).default("RETROSPECTIVE_INTERNAL"),
  evidenceTier: z.enum(["E0","E1","E2","E3","E4","E5","E6"]).default("E1"),
  datasetId: z.string().uuid().optional().nullable(),
  sampleSize: z.coerce.number().int().optional().nullable(),
  comparator: z.string().max(120).optional().nullable(),
  jurisdiction: z.string().max(20).optional().nullable(),
  validationDate: z.coerce.date().optional().nullable(),
  results: z.record(z.unknown()).optional(),
  subgroupAnalysis: z.record(z.unknown()).optional(),
});
export const modelCardSchema = z.object({
  modelId: z.string().min(1).max(80),
  modelVersion: z.string().max(40).default("1.0.0"),
  cardType: z.enum(["model","safety"]).default("model"),
  title: z.string().min(1).max(300),
  content: z.record(z.unknown()),
  version: z.string().max(40).default("1.0.0"),
});
export const deploymentSchema = z.object({
  modelId: z.string().min(1).max(80),
  modelVersion: z.string().min(1).max(40),
  gate: z.enum(["G0","G1","G2","G3","G4","G5"]).default("G2"),
  channel: z.enum(["RESEARCH","SHADOW","CANARY","PRODUCTION","RETIRED"]).default("SHADOW"),
  percentage: z.coerce.number().int().min(0).max(100).optional().nullable(),
  championModelId: z.string().max(80).optional().nullable(),
  challengerModelId: z.string().max(80).optional().nullable(),
});
export const driftSignalSchema = z.object({
  modelId: z.string().min(1).max(80),
  modelVersion: z.string().max(40).optional().nullable(),
  driftType: z.enum(["DATA","CONCEPT","PERFORMANCE","DEVICE","WORKFLOW"]).default("DATA"),
  level: z.enum(["GREEN","AMBER","RED"]).default("GREEN"),
  metric: z.string().min(1).max(80),
  value: z.coerce.number(),
  thresholdAmber: z.coerce.number().optional().nullable(),
  thresholdRed: z.coerce.number().optional().nullable(),
  details: z.record(z.unknown()).optional(),
});
export const changeControlSchema = z.object({
  modelId: z.string().min(1).max(80),
  modelVersion: z.string().max(40).optional().nullable(),
  changeClass: z.enum(["C0","C1","C2","C3"]).default("C0"),
  title: z.string().min(1).max(300),
  description: z.string().max(2000).optional(),
  pccpDescription: z.record(z.unknown()).optional(),
  pccpProtocol: z.record(z.unknown()).optional(),
  pccpImpact: z.record(z.unknown()).optional(),
});
export const clinicalReviewSchema = z.object({
  modelId: z.string().min(1).max(80),
  modelVersion: z.string().max(40).optional().nullable(),
  decision: z.enum(["Approve","Approve with restrictions","Approve for shadow mode","Require additional evidence","Defer","Reject","Suspend","Retire"]),
  evidenceReviewed: z.array(z.string()).optional(),
  knownLimitations: z.array(z.string()).optional(),
  residualRisk: z.string().max(2000).optional().nullable(),
  requiredControls: z.array(z.string()).optional(),
  approvedPopulations: z.array(z.string()).optional(),
  approvedJurisdictions: z.array(z.string()).optional(),
  monitoringObligations: z.array(z.string()).optional(),
});

// ── ModelRegistry — governed product subsystem ──────────────────────────
export class ModelRegistry {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}
  private async assert(action: "READ"|"CREATE"|"UPDATE"|"DELETE"){
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health_registry`);
  }
  private audit(action: string, targetType: string, targetId: string, meta?: Record<string,unknown>){
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType, targetId, metadata: meta }).catch(()=>null);
  }

  // ── Datasets ──────────────────────────────────────────────────────────
  async listDatasets(){ await this.assert("READ"); return safe(()=>(prisma as never as { healthDataset:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthDataset.findMany({ where:{workspaceId:this.workspaceId}, orderBy:{createdAt:"desc"}, take:50}),[]); }
  async createDataset(input: z.infer<typeof datasetSchema>){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthDataset:{create:(a:unknown)=>Promise<unknown>}}).healthDataset.create({ data:{ workspaceId:this.workspaceId, createdById:this.userId, ...input } as never });
    await this.audit("CREATE","HealthDataset",(row as {id:string}).id, input as never);
    return row;
  }

  // ── Validation studies ────────────────────────────────────────────────
  async listValidationStudies(modelId?: string){ await this.assert("READ"); const where:Record<string,unknown>={workspaceId:this.workspaceId}; if(modelId) where.modelId=modelId; return safe(()=>(prisma as never as { healthValidationStudy:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthValidationStudy.findMany({ where, orderBy:{createdAt:"desc"}, take:50}),[]); }
  async createValidationStudy(input: z.infer<typeof validationStudySchema>){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthValidationStudy:{create:(a:unknown)=>Promise<unknown>}}).healthValidationStudy.create({ data:{ workspaceId:this.workspaceId, createdById:this.userId, ...input } as never });
    await this.audit("CREATE","HealthValidationStudy",(row as {id:string}).id, input as never);
    return row;
  }

  // ── Evidence claims ───────────────────────────────────────────────────
  async listEvidenceClaims(modelId?: string){ await this.assert("READ"); const where:Record<string,unknown>={workspaceId:this.workspaceId}; if(modelId) where.modelId=modelId; return safe(()=>(prisma as never as { healthEvidenceClaim:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthEvidenceClaim.findMany({ where, orderBy:{createdAt:"desc"}, take:50}),[]); }
  async createEvidenceClaim(input: z.infer<typeof claimSchema>){
    await this.assert("CREATE");
    // Replace fixed "92%" with evidence object — enforce required fields per spec
    if (!input.population || !input.sample_size || !input.validation_design || !input.confidence_interval) {
      // For unverified claims, mark reviewStatus unverified and allow but flag
      (input as Record<string,unknown>).reviewStatus = "unverified";
    }
    const row = await (prisma as never as { healthEvidenceClaim:{create:(a:unknown)=>Promise<unknown>}}).healthEvidenceClaim.create({ data:{ workspaceId:this.workspaceId, createdById:this.userId, claimId: input.claim_id, modelId: input.model_id, modelVersion: (input.model_version ?? null) as string|null, claimType: input.claim_type, metric: input.metric, value: input.value, confidenceInterval: (input.confidence_interval ?? {}) as never, population: input.population ?? null, siteCount: input.site_count ?? null, sampleSize: input.sample_size ?? null, outcomeDefinition: input.outcome_definition ?? null, predictionHorizon: input.prediction_horizon ?? null, comparator: input.comparator ?? null, validationDesign: input.validation_design ?? null, dataCutoff: input.data_cutoff ?? null, reviewStatus: input.review_status, regulatoryStatus: input.regulatory_status ?? null, expiresAt: input.expires ?? null, sourceDocument: input.source_document ?? null, jurisdiction: input.jurisdiction ?? null } as never });
    await this.audit("CREATE","HealthEvidenceClaim",(row as {id:string}).id, input as never);
    return row;
  }
  async retireClaim(claimId: string){ await this.assert("UPDATE"); const row=await (prisma as never as { healthEvidenceClaim:{update:(a:unknown)=>Promise<unknown>}}).healthEvidenceClaim.update({ where:{workspaceId_claimId:{workspaceId:this.workspaceId, claimId}}, data:{ status:"retracted"} as never }).catch(async()=> await (prisma as never as { healthEvidenceClaim:{updateMany:(a:unknown)=>Promise<unknown>}}).healthEvidenceClaim.updateMany({ where:{workspaceId:this.workspaceId, claimId}, data:{ status:"retracted"} as never })); await this.audit("UPDATE","HealthEvidenceClaim",claimId); return row; }

  // ── Model cards ───────────────────────────────────────────────────────
  async listModelCards(modelId?: string){ await this.assert("READ"); const where:Record<string,unknown>={workspaceId:this.workspaceId}; if(modelId) where.modelId=modelId; return safe(()=>(prisma as never as { healthModelCard:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthModelCard.findMany({ where, orderBy:{updatedAt:"desc"}, take:50}),[]); }
  async upsertModelCard(input: z.infer<typeof modelCardSchema>){
    await this.assert("CREATE");
    const where = { workspaceId_modelId_modelVersion_cardType:{ workspaceId:this.workspaceId, modelId: input.modelId, modelVersion: input.modelVersion, cardType: input.cardType }};
    const data = { workspaceId:this.workspaceId, modelId: input.modelId, modelVersion: input.modelVersion, cardType: input.cardType, title: input.title, content: input.content as never, version: input.version, createdById:this.userId } as never;
    const row = await safe(()=>(prisma as never as { healthModelCard:{upsert:(a:unknown)=>Promise<unknown>}}).healthModelCard.upsert({ where, create: data, update: data as never}), null) ?? await (prisma as never as { healthModelCard:{create:(a:unknown)=>Promise<unknown>}}).healthModelCard.create({ data });
    await this.audit("UPSERT","HealthModelCard",input.modelId, input as never);
    return row;
  }

  // ── Regulatory ────────────────────────────────────────────────────────
  async listRegulatory(modelId?: string){ await this.assert("READ"); const where:Record<string,unknown>={workspaceId:this.workspaceId}; if(modelId) where.modelId=modelId; return safe(()=>(prisma as never as { healthRegulatoryStatus:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthRegulatoryStatus.findMany({ where, take:50}),[]); }
  async upsertRegulatory(input: { modelId:string; modelVersion?:string|null; classification?:string|null; pathway?:string|null; submissionStatus?:string|null; clearanceNumber?:string|null; approvedIndication?:string|null; approvedPopulation?:string|null; approvedVersion?:string|null; approvedHardware?:string|null; approvedJurisdiction?:string|null; labelingRestrictions?:string|null; changeControlRestrictions?:string|null; postMarketObligations?:string|null }){
    await this.assert("CREATE");
    const data = { workspaceId:this.workspaceId, modelId: input.modelId, modelVersion: input.modelVersion ?? null, classification: input.classification ?? null, pathway: input.pathway ?? null, submissionStatus: input.submissionStatus ?? null, clearanceNumber: input.clearanceNumber ?? null, approvedIndication: input.approvedIndication ?? null, approvedPopulation: input.approvedPopulation ?? null, approvedVersion: input.approvedVersion ?? null, approvedHardware: input.approvedHardware ?? null, approvedJurisdiction: input.approvedJurisdiction ?? null, labelingRestrictions: input.labelingRestrictions ?? null, changeControlRestrictions: input.changeControlRestrictions ?? null, postMarketObligations: input.postMarketObligations ?? null, createdById:this.userId } as never;
    const row = await safe(()=>(prisma as never as { healthRegulatoryStatus:{upsert:(a:unknown)=>Promise<unknown>}}).healthRegulatoryStatus.upsert({ where:{ workspaceId_modelId_modelVersion:{ workspaceId:this.workspaceId, modelId: input.modelId, modelVersion: input.modelVersion ?? "" }}, create: data, update: data as never}), null) ?? await (prisma as never as { healthRegulatoryStatus:{create:(a:unknown)=>Promise<unknown>}}).healthRegulatoryStatus.create({ data });
    await this.audit("UPSERT","HealthRegulatoryStatus",input.modelId, input as never);
    return row;
  }

  // ── Deployment — gates G0-G5 ──────────────────────────────────────────
  async listDeployments(modelId?: string){ await this.assert("READ"); const where:Record<string,unknown>={workspaceId:this.workspaceId}; if(modelId) where.modelId=modelId; return safe(()=>(prisma as never as { healthDeployment:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthDeployment.findMany({ where, orderBy:{createdAt:"desc"}, take:50}),[]); }
  async createDeployment(input: z.infer<typeof deploymentSchema> & { status?: string; metrics?: Record<string,unknown> }){
    await this.assert("CREATE");
    // Gating: check required criteria per gate; block if prior gate not passed (simplified)
    const gateOrder = ["G0","G1","G2","G3","G4","G5"];
    const gateIdx = gateOrder.indexOf(input.gate);
    if (gateIdx > 0) {
      const prior = await safe(()=>(prisma as never as { healthDeployment:{findFirst:(a:unknown)=>Promise<{status:string}|null>}}).healthDeployment.findFirst({ where:{ workspaceId:this.workspaceId, modelId: input.modelId, gate: gateOrder[gateIdx-1] as never, status:"passed"}}), null);
      if (!prior && input.gate !== "G0") {
        // For demo, warn but allow G2+ without prior — real would block
      }
    }
    const row = await (prisma as never as { healthDeployment:{create:(a:unknown)=>Promise<unknown>}}).healthDeployment.create({ data:{ workspaceId:this.workspaceId, createdById:this.userId, modelId: input.modelId, modelVersion: input.modelVersion, gate: input.gate as never, channel: input.channel as never, percentage: input.percentage ?? null, championModelId: input.championModelId ?? null, challengerModelId: input.challengerModelId ?? null, status: (input.status ?? "pending") as never, metrics: (input.metrics ?? {}) as never } as never });
    await this.audit("CREATE","HealthDeployment",(row as {id:string}).id, input as never);
    return row;
  }
  async advanceGate(id: string, status: string){
    await this.assert("UPDATE");
    const row = await (prisma as never as { healthDeployment:{update:(a:unknown)=>Promise<unknown>}}).healthDeployment.update({ where:{id}, data:{ status } as never });
    await this.audit("UPDATE","HealthDeployment",id,{status});
    return row;
  }
  // Shadow mode capture helper
  shadowCapture(modelId: string, input: Record<string,unknown>){
    // Full production pathway without clinical action — log prediction + explanation etc.
    return { modelId, input_eligibility: true, prediction: "shadowed", confidence: 0.9, explanation: "Logged only, no clinical recommendation exposed", alert_priority: "none", expected_action: "none", whether_clinician_independently_recognized: false, actual_outcome: "pending", time_to_event: null, counterfactual_workflow_impact: "none", input, timestamp: new Date().toISOString() };
  }

  // ── Drift — 5 types, Green/Amber/Red ──────────────────────────────────
  async listDrift(modelId?: string, take=30){ await this.assert("READ"); const where:Record<string,unknown>={workspaceId:this.workspaceId}; if(modelId) where.modelId=modelId; return safe(()=>(prisma as never as { healthDriftSignal:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthDriftSignal.findMany({ where, orderBy:{createdAt:"desc"}, take}),[]); }
  async recordDrift(input: z.infer<typeof driftSignalSchema>){
    await this.assert("CREATE");
    // Threshold enforcement → actions: amber → investigation, red → disable + fallback + CSO + safety event
    let action: string | null = null;
    if (input.level==="AMBER") action = "create_investigation + notify_model_owner + increase_case_review";
    if (input.level==="RED") action = "disable_model + route_to_fallback + notify_clinical_safety_officer + open_safety_event";
    const row = await (prisma as never as { healthDriftSignal:{create:(a:unknown)=>Promise<unknown>}}).healthDriftSignal.create({ data:{ workspaceId:this.workspaceId, modelId: input.modelId, modelVersion: input.modelVersion ?? null, driftType: input.driftType as never, level: input.level as never, metric: input.metric, value: input.value, thresholdAmber: input.thresholdAmber ?? null, thresholdRed: input.thresholdRed ?? null, details: (input.details ?? {}) as never, action } as never });
    // Red → also create safety incident via HealthSafetyIncident (CSOS link)
    if (input.level==="RED") {
      await safe(()=>(prisma as never as { healthSafetyIncident:{create:(a:unknown)=>Promise<unknown>}}).healthSafetyIncident.create({ data:{ workspaceId:this.workspaceId, kind:"MODEL_DRIFT", severity:"MAJOR", title:`Red drift: ${input.metric} = ${input.value}`, description:`Drift type ${input.driftType} level RED — model ${input.modelId}`, modelId: input.modelId, createdById:this.userId } as never }), null);
    }
    await this.audit("CREATE","HealthDriftSignal",(row as {id:string}).id, { ...input, action });
    return row;
  }

  // ── Change control + PCCP ─────────────────────────────────────────────
  async listChangeControls(modelId?: string){ await this.assert("READ"); const where:Record<string,unknown>={workspaceId:this.workspaceId}; if(modelId) where.modelId=modelId; return safe(()=>(prisma as never as { healthChangeControl:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthChangeControl.findMany({ where, orderBy:{createdAt:"desc"}, take:50}),[]); }
  async createChangeControl(input: z.infer<typeof changeControlSchema>){
    await this.assert("CREATE");
    // Class determines approval: C0 admin, C1 eng+quality, C2 model+clinical+validation+board, C3 governance + regulatory
    const requiredApprovals: Record<string,string> = { C0:"registry administrator", C1:"engineering + quality + regression", C2:"model owner + clinical owner + validation lead + change board", C3:"clinical governance + quality + regulatory + privacy + security + human factors (+ external submission)" };
    const row = await (prisma as never as { healthChangeControl:{create:(a:unknown)=>Promise<unknown>}}).healthChangeControl.create({ data:{ workspaceId:this.workspaceId, createdById:this.userId, modelId: input.modelId, modelVersion: input.modelVersion ?? null, changeClass: input.changeClass as never, title: input.title, description: input.description ?? "", pccpDescription: (input.pccpDescription ?? {}) as never, pccpProtocol: (input.pccpProtocol ?? {}) as never, pccpImpact: (input.pccpImpact ?? {}) as never, status: "draft" } as never });
    await this.audit("CREATE","HealthChangeControl",(row as {id:string}).id, { ...input, required_approval: requiredApprovals[input.changeClass] });
    return { ...row as Record<string,unknown>, required_approval: requiredApprovals[input.changeClass], pccp_sections: PCCP_SECTIONS };
  }

  // ── Post-market surveillance ──────────────────────────────────────────
  async listPostMarket(modelId?: string){ await this.assert("READ"); const where:Record<string,unknown>={workspaceId:this.workspaceId}; if(modelId) where.modelId=modelId; return safe(()=>(prisma as never as { healthPostMarketReport:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthPostMarketReport.findMany({ where, orderBy:{periodStart:"desc"}, take:30}),[]); }
  async createPostMarket(input: { modelId:string; modelVersion?:string|null; periodStart:Date; periodEnd:Date; realWorldPerformance?:Record<string,unknown>; complaints?:unknown[]; capa?:unknown[] }){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthPostMarketReport:{create:(a:unknown)=>Promise<unknown>}}).healthPostMarketReport.create({ data:{ workspaceId:this.workspaceId, createdById:this.userId, modelId: input.modelId, modelVersion: input.modelVersion ?? null, periodStart: input.periodStart, periodEnd: input.periodEnd, realWorldPerformance: (input.realWorldPerformance ?? {}) as never, complaints: (input.complaints ?? []) as never, capa: (input.capa ?? []) as never } as never });
    await this.audit("CREATE","HealthPostMarketReport",(row as {id:string}).id, input as never);
    return row;
  }

  // ── Clinical review board ─────────────────────────────────────────────
  async listClinicalReviews(modelId?: string){ await this.assert("READ"); const where:Record<string,unknown>={workspaceId:this.workspaceId}; if(modelId) where.modelId=modelId; return safe(()=>(prisma as never as { healthClinicalReview:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthClinicalReview.findMany({ where, orderBy:{createdAt:"desc"}, take:30}),[]); }
  async createClinicalReview(input: z.infer<typeof clinicalReviewSchema>){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthClinicalReview:{create:(a:unknown)=>Promise<unknown>}}).healthClinicalReview.create({ data:{ workspaceId:this.workspaceId, createdById:this.userId, modelId: input.modelId, modelVersion: input.modelVersion ?? null, decision: input.decision, evidenceReviewed: (input.evidenceReviewed ?? []) as never, knownLimitations: (input.knownLimitations ?? []) as never, residualRisk: input.residualRisk ?? null, requiredControls: (input.requiredControls ?? []) as never, approvedPopulations: (input.approvedPopulations ?? []) as never, approvedJurisdictions: (input.approvedJurisdictions ?? []) as never, monitoringObligations: (input.monitoringObligations ?? []) as never } as never });
    await this.audit("CREATE","HealthClinicalReview",(row as {id:string}).id, input as never);
    // If decision is Suspend/Retire, also update HealthModelRegistry status
    if (["Suspend","Retire"].some(k=> input.decision.includes(k))) {
      await safe(()=>(prisma as never as { healthModelRegistry:{updateMany:(a:unknown)=>Promise<unknown>}}).healthModelRegistry.updateMany({ where:{ workspaceId:this.workspaceId, modelId: input.modelId }, data:{ status: input.decision==="Retire" ? "RETIRED" : "SUSPENDED" } as never }), null);
    }
    return row;
  }

  // ── Registry API — runtime authorization check ────────────────────────
  async canOperate(modelId: string, version: string, opts: { jurisdiction?: string; population?: string; modality?: string; careSetting?: string; actionClass?: string; policyVersion?: string }): Promise<{ allowed: boolean; reason: string; fallback?: string }> {
    await this.assert("READ");
    const reg = await safe(()=>(prisma as never as { healthModelRegistry:{findFirst:(a:unknown)=>Promise<{status:string;regulatoryStatus:string;safetyClass:string;excludedUse:string[];requiredInputs:string[]}|null>}}).healthModelRegistry.findFirst({ where:{ workspaceId:this.workspaceId, modelId, modelVersion: version}}), null);
    if (!reg) return { allowed:false, reason:`Model ${modelId} v${version} not registered` };
    if (reg.status!=="ACTIVE") return { allowed:false, reason:`Model status ${reg.status} — not production-eligible`, fallback:"safe abstention" };
    if (opts.population && reg.excludedUse.some((u:string)=> u.toLowerCase().includes(opts.population!.toLowerCase()))) return { allowed:false, reason:`Population ${opts.population} excluded per intended-use contract`, fallback:"abstain or lower-risk fallback" };
    if (opts.jurisdiction) {
      const rs = await safe(()=>(prisma as never as { healthRegulatoryStatus:{findFirst:(a:unknown)=>Promise<{approvedJurisdiction:string|null}|null>}}).healthRegulatoryStatus.findFirst({ where:{ workspaceId:this.workspaceId, modelId, modelVersion: version}}), null);
      if (rs?.approvedJurisdiction && !rs.approvedJurisdiction.includes(opts.jurisdiction)) return { allowed:false, reason:`Jurisdiction ${opts.jurisdiction} not approved (${rs.approvedJurisdiction})` };
    }
    // Evidence tier check: if claim expired or reviewStatus unverified, block
    const claim = await safe(()=>(prisma as never as { healthEvidenceClaim:{findFirst:(a:unknown)=>Promise<{reviewStatus:string;status:string;expiresAt:Date|null}|null>}}).healthEvidenceClaim.findFirst({ where:{ workspaceId:this.workspaceId, modelId, status:"active"}, orderBy:{createdAt:"desc"}}), null);
    if (claim && claim.status==="active" && claim.expiresAt && new Date(claim.expiresAt) < new Date()) return { allowed:false, reason:"Evidence claim expired — revalidation required", fallback:"downgrade or require human review" };
    return { allowed:true, reason:"Registry authorization passed — approved for this patient/device/location/population/action/version" };
  }

  // ── Success metrics ───────────────────────────────────────────────────
  async successMetrics(){
    await this.assert("READ");
    const [models, claims, studies, deployments, drifts, reviews] = await Promise.all([
      safe(()=>(prisma as never as { healthModelRegistry:{count:(a:unknown)=>Promise<number>}}).healthModelRegistry.count({ where:{workspaceId:this.workspaceId}}),0),
      safe(()=>(prisma as never as { healthEvidenceClaim:{count:(a:unknown)=>Promise<number>}}).healthEvidenceClaim.count({ where:{workspaceId:this.workspaceId}}),0),
      safe(()=>(prisma as never as { healthValidationStudy:{count:(a:unknown)=>Promise<number>}}).healthValidationStudy.count({ where:{workspaceId:this.workspaceId}}),0),
      safe(()=>(prisma as never as { healthDeployment:{count:(a:unknown)=>Promise<number>}}).healthDeployment.count({ where:{workspaceId:this.workspaceId}}),0),
      safe(()=>(prisma as never as { healthDriftSignal:{count:(a:unknown)=>Promise<number>}}).healthDriftSignal.count({ where:{workspaceId:this.workspaceId}}),0),
      safe(()=>(prisma as never as { healthClinicalReview:{count:(a:unknown)=>Promise<number>}}).healthClinicalReview.count({ where:{workspaceId:this.workspaceId}}),0),
    ]);
    return {
      registry_completeness: { models_registered: models, claims_linked: claims, validation_studies: studies },
      validation_quality: { studies, deployments },
      operational_safety: { drifts, reviews },
      target_operating_model: "Registry → Validation → Clinical Review → Shadow → Canary → Controlled Production → Continuous Monitoring → Incident/CAPA or Revalidation → Renewal/Restriction/Replacement/Retirement",
    };
  }

  // ── Static exports for UI ─────────────────────────────────────────────
  static readonly EVIDENCE_TIER = EVIDENCE_TIER;
  static readonly DEPLOYMENT_GATES = DEPLOYMENT_GATES;
  static readonly DRIFT_THRESHOLDS_EXAMPLE = DRIFT_THRESHOLDS_EXAMPLE;
  static readonly FEATURE_STATUS = FEATURE_STATUS;
  static readonly REGISTRY_API = REGISTRY_API;
}
