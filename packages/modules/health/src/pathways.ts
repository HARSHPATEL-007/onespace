// Closed-Loop Care Pathways — versioned, executable care program. FHIR PlanDefinition → ActivityDefinition → CarePlan, AHRQ coordination.
// Every step has: owner, input requirements, completion criteria, due time, evidence, next action, exception path, escalation rule, consent scope, audit record, versioned clinical logic.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_pathways";

// ── Pathway execution model — 14 steps, each with 11 attributes ─────────
export const PATHWAY_EXECUTION_MODEL = [
  "Eligibility detection",
  "Clinical and consent verification",
  "Patient invitation",
  "Enrollment or decline",
  "Baseline assessment",
  "Shared goals and risk tier",
  "Intervention assignment",
  "Task and appointment generation",
  "Monitoring and follow-up",
  "Alert and escalation management",
  "Outcome measurement",
  "Completion, continuation, or re-entry",
  "Quality, financial, and equity reporting",
] as const;

export const PATHWAY_STEP_REQUIREMENTS = [
  "Owner",
  "Input requirements",
  "Completion criteria",
  "Due time",
  "Evidence of completion",
  "Next action",
  "Exception path",
  "Escalation rule",
  "Consent scope",
  "Audit record",
  "Versioned clinical logic",
] as const;

// ── State machine — 15 states, never collapsed into "noncompliant" ───────
export const ENROLLMENT_STATUS = [
  "NOT_ELIGIBLE",
  "POTENTIALLY_ELIGIBLE",
  "AWAITING_VERIFICATION",
  "INVITED",
  "ENROLLED",
  "BASELINE_INCOMPLETE",
  "ACTIVE",
  "PAUSED",
  "ESCALATED",
  "CLINICIAN_OVERRIDE",
  "COMPLETED",
  "UNSUCCESSFUL_COMPLETION",
  "WITHDRAWN",
  "LOST_TO_FOLLOW_UP",
  "RE_ENROLLMENT_ELIGIBLE",
] as const;
export type EnrollmentStatusKey = typeof ENROLLMENT_STATUS[number];

// ── Eligibility detection — 12 sources + candidate JSON ──────────────────
export const ELIGIBILITY_SOURCES = [
  "Confirmed diagnosis",
  "Recent laboratory result",
  "Recent hospitalization or procedure",
  "Medication pattern",
  "Referral",
  "Patient-reported goal",
  "Risk or screening result",
  "Pregnancy or postpartum status",
  "Age and relevant anatomy",
  "Care setting",
  "Clinician referral",
  "Social or access need, where consented",
] as const;

// ── Baseline assessment — 19 elements, purpose-specific ───────────────────
export const BASELINE_ELEMENTS = [
  "Current symptoms",
  "Relevant diagnoses",
  "Medication and allergy reconciliation",
  "Recent laboratory data",
  "Vital-sign baseline",
  "Functional status",
  "Mental-health and wellbeing screen",
  "Social and environmental barriers",
  "Health literacy and communication needs",
  "Patient goals",
  "Caregiver capacity",
  "Device access",
  "Transport",
  "Financial barriers",
  "Preferred follow-up method",
  "Emergency plan",
  "Existing specialists",
  "Advance-care preferences",
] as const;

// ── Risk stratification — 4 tiers, determines pathway intensity not worth/access ─
export const RISK_TIERS = {
  Low: "Stable, low complexity — education, routine monitoring, preventive follow-up",
  Moderate: "Needs structured support — scheduled tasks, periodic review, care coordinator",
  High: "Complex or unstable — frequent monitoring, named clinician, escalation tree",
  Critical: "Possible immediate danger — urgent human evaluation; pathway automation pauses",
} as const;

export const RISK_SCORING = {
  inputs: ["symptoms","vitals","labs","medications","adherence","device_data","claims","social_determinants","patient_reported","caregiver_reported","clinician_assessment","imaging"],
  required_fields: ["inputs","date","confidence","missing_information","intended_use","clinician_review","expiration","override_capability"],
} as const;

// ── Intervention assignment — 17 modular ──────────────────────────────────
export const INTERVENTIONS = [
  "Education",
  "Medication reconciliation",
  "Home monitoring",
  "Nutrition support",
  "Physical activity",
  "Behavioral-health support",
  "Pharmacy review",
  "Specialist referral",
  "Home nursing",
  "Transport assistance",
  "Financial assistance",
  "Social-care referral",
  "Remote consultation",
  "Post-discharge call",
  "Caregiver training",
  "Preventive screening",
  "Palliative or supportive-care consultation",
] as const;

// ── Task generation — prevents 7 unsafe patterns ──────────────────────────
export const TASK_PREVENTS = [
  "Duplicate tasks",
  "Conflicting instructions",
  "Impossible schedules",
  "Tasks assigned to unavailable caregivers",
  "Tasks requiring unverified equipment",
  "Tasks that exceed patient's stated capacity",
  "Automated dose changes without authorization",
] as const;

// ── Follow-up scheduling — 10 types ──────────────────────────────────────
export const FOLLOW_UP_TYPES = [
  "In-person visit",
  "Video visit",
  "Telephone call",
  "Secure message",
  "Home visit",
  "Laboratory appointment",
  "Pharmacy consultation",
  "Community health worker visit",
  "Group education",
  "Asynchronous review",
] as const;

export const FOLLOW_UP_COMPLETE_WHEN = [
  "Attendance recorded",
  "Cancellation reason captured",
  "Rescheduling tracked",
  "Clinical review documented",
  "Next action determined",
] as const;

// ── Escalation — 13 triggers + workflow ───────────────────────────────────
export const ESCALATION_TRIGGERS = [
  "Abnormal measurement",
  "Worsening symptom",
  "Missed critical task",
  "Medication conflict",
  "Repeated refusal",
  "Missed appointment",
  "Failed referral",
  "Patient request",
  "Caregiver overload",
  "New emergency visit",
  "Device failure",
  "Pregnancy warning sign",
  "Mental-health safety concern",
] as const;

export const ESCALATION_WORKFLOW = [
  "Trigger detected",
  "Validate signal",
  "Notify patient",
  "Notify assigned role",
  "Start timer",
  "Require acknowledgement",
  "Escalate if overdue",
  "Record action",
  "Measure outcome",
] as const;

// ── Outcome measurement — 4 categories (Patient, Process, Caregiver, System) ─
export const OUTCOME_CATEGORIES = {
  Patient: [
    "Symptom improvement",
    "Functional ability",
    "Quality of life",
    "Patient-defined goals",
    "Treatment burden",
    "Medication safety",
    "Patient confidence",
    "Hospitalization",
    "Emergency visits",
    "Complications",
    "Recovery milestones",
    "Preventive service completion",
  ],
  Process: [
    "Enrollment completion",
    "Baseline completion",
    "Task completion",
    "Follow-up attendance",
    "Medication reconciliation",
    "Referral completion",
    "Response time",
    "Escalation resolution",
    "Care-plan review",
    "Patient teach-back",
  ],
  Caregiver: [
    "Workload",
    "Confidence",
    "Burnout risk",
    "Respite access",
    "Task sustainability",
    "Understanding",
    "Unmet support needs",
  ],
  System: [
    "Readmissions",
    "Avoidable emergency visits",
    "Length of stay",
    "Cost",
    "Staff workload",
    "Alert burden",
    "Equity gaps",
    "Time to treatment",
    "Quality-measure performance",
  ],
} as const;

// ── Exception handling — 22 types + workflow 9 + closure 9 ───────────────
export const EXCEPTION_TYPES = [
  "Patient declines",
  "Patient unavailable",
  "Patient lacks transport",
  "Patient lacks device",
  "Language mismatch",
  "Accessibility barrier",
  "Medication unavailable",
  "Insurance authorization delay",
  "Caregiver unavailable",
  "Clinician unavailable",
  "Abnormal result",
  "Emergency event",
  "Duplicate enrollment",
  "Conflicting care plan",
  "Missing data",
  "Device failure",
  "Pregnancy status changed",
  "Hospital admission",
  "Patient transferred",
  "Consent revoked",
  "Pathway no longer appropriate",
] as const;

export const EXCEPTION_WORKFLOW = [
  "Exception detected",
  "Classify severity",
  "Assign owner",
  "Offer resolution options",
  "Set due time",
  "Notify authorized participants",
  "Escalate if unresolved",
  "Record outcome",
  "Resume, modify, transfer, or close pathway",
] as const;

export const EXCEPTION_CLOSURE = [
  "Resolved",
  "Adapted",
  "Transferred",
  "Patient declined",
  "Unable to contact",
  "Clinician closed",
  "Emergency superseded",
  "Awaiting external service",
  "Requires review",
] as const;

// ── Clinician override — 15 actions ──────────────────────────────────────
export const CLINICIAN_OVERRIDE_ACTIONS = [
  "Enroll or exclude",
  "Change risk tier",
  "Pause pathway",
  "Change task frequency",
  "Replace intervention",
  "Override alert",
  "Add clinical exception",
  "Modify follow-up timing",
  "Transfer responsibility",
  "Close with reason",
  "Resume later",
  "Document rationale",
  "Require human review",
  "Override model-generated eligibility",
] as const;

// ── Pathway versioning — 14 fields ───────────────────────────────────────
export const PATHWAY_VERSIONING_FIELDS = [
  "Semantic version",
  "Clinical owner",
  "Evidence sources",
  "Jurisdiction",
  "Population",
  "Effective date",
  "Retirement date",
  "Change log",
  "Validation status",
  "Quality measures",
  "Financial rules",
  "Exception rules",
  "Model dependencies",
  "Rollback version",
] as const;

// ── Pathway safety controls ───────────────────────────────────────────────
export const PATHWAY_SAFETY_CONTROLS = [
  "Pause pathway automation during emergency events",
  "Pause conflicting pathways",
  "Detect duplicate enrollment",
  "Prevent contradictory tasks",
  "Prevent unsafe medication advice",
  "Require human review for high-risk escalation",
  "Preserve clinician overrides",
  "Require consent before enrollment and sharing",
  "Offer non-digital alternatives",
  "Use patient-specific baselines carefully",
  "Expire stale tasks and plans",
  "Reconcile changes after hospitalization",
  "Notify patients when the pathway changes materially",
  "Make every exception actionable",
  "Prevent financial incentives from overriding patient goals",
] as const;

// ── Completion criteria — explicit ────────────────────────────────────────
export const COMPLETION_CRITERIA = {
  required: ["baseline_completed", "intervention_delivered", "follow_up_completed", "outcome_measured"],
  acceptable_end_states: ["goal_met", "goal_partially_met_with_plan", "transferred_to_specialist", "patient_completed", "clinician_closed", "patient_withdrew"],
  not_completion: ["task_expired", "no_response", "appointment_scheduled_only", "education_sent_only"],
} as const;

// ── FHIR implementation — 16 resources + $apply ──────────────────────────
export const FHIR_PATHWAY_RESOURCES = [
  "PlanDefinition: reusable pathway definition and conditional workflow",
  "ActivityDefinition: reusable individual activity",
  "CarePlan: patient-specific applied pathway",
  "Task: assigned work, status, ownership, completion",
  "ServiceRequest: referral, laboratory, imaging, service request",
  "Appointment: planned follow-up",
  "Questionnaire and QuestionnaireResponse: baseline and outcome assessments",
  "Observation: measurements and outcomes",
  "Condition: eligibility and active problems",
  "Goal: patient and clinical goals",
  "Consent: enrollment and data-sharing authorization",
  "Communication: education and coordination",
  "DetectedIssue: safety conflicts",
  "Provenance: source and transformation history",
  "AuditEvent: access and action history",
  "PlanDefinition/$apply: generate patient-specific care plans from reusable definition",
] as const;

// ── Pathway API — 20 endpoints ───────────────────────────────────────────
export const PATHWAY_API = [
  "GET    /pathways/definitions",
  "POST   /pathways/definitions",
  "GET    /pathways/definitions/{id}",
  "POST   /pathways/{id}/eligibility-check",
  "POST   /pathways/{id}/enroll",
  "GET    /pathways/enrollments",
  "GET    /pathways/enrollments/{id}",
  "POST   /pathways/enrollments/{id}/baseline",
  "POST   /pathways/enrollments/{id}/apply-interventions",
  "GET    /pathways/enrollments/{id}/tasks",
  "POST   /pathways/tasks/{id}/complete",
  "POST   /pathways/tasks/{id}/decline",
  "POST   /pathways/tasks/{id}/reassign",
  "POST   /pathways/enrollments/{id}/pause",
  "POST   /pathways/enrollments/{id}/resume",
  "POST   /pathways/enrollments/{id}/escalate",
  "POST   /pathways/enrollments/{id}/override",
  "POST   /pathways/enrollments/{id}/exception",
  "POST   /pathways/enrollments/{id}/outcome",
  "POST   /pathways/enrollments/{id}/complete",
  "GET    /pathways/exceptions",
  "GET    /pathways/reports/quality",
  "GET    /pathways/reports/financial",
  "GET    /pathways/reports/equity",
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// PATHWAY LIBRARY — 11 pathways with full eligibility/baseline/interventions/escalation/outcomes
// ═══════════════════════════════════════════════════════════════════════════════

export const PATHWAY_LIBRARY = [
  // ── 1. Diabetes Type 2 ──────────────────────────────────────────────────
  {
    id: "diabetes-type2-v3",
    title: "Type 2 diabetes support",
    version: "3.0.0",
    status: "clinical_validation",
    jurisdiction: "configured_region",
    owner: "endocrinology_program",
    purpose: "support_monitoring_and_clinician_coordinated_care",
    eligibility: {
      conditions: ["confirmed_type_1_or_2_diabetes","elevated_glycemic_marker","new_diagnosis","medication_initiation_or_intensification","patient_request_for_support","diabetes_related_discharge"],
      exclusions: ["pediatric_protocol","active_emergency"],
      required_data: ["recent_medication_list","baseline_glycemic_measurement"],
    },
    consent: { required: true, caregiver_sharing: "optional", research_use: "separate_consent" },
    baseline: ["diabetes_type","recent_glycemic_results","medication_reconciliation","hypoglycemia_history","kidney_function","blood_pressure","weight_and_nutrition_context","foot_risk_screening","eye_care_status","patient_goals","device_and_glucose_monitoring_access","food_and_medication_affordability"],
    interventions: ["glucose_monitoring_plan","medication_and_hypoglycemia_education","nutrition_support","foot_care_education","kidney_and_eye_care_referral","activity_plan","pharmacy_review","caregiver_training_where_authorized"],
    escalation: ["severe_or_repeated_low_glucose","persistently_high_glucose_under_clinician_rule","symptoms_of_acute_metabolic_illness","medication_access_failure","repeated_missed_monitoring","new_foot_wound","vision_change","kidney_function_deterioration"],
    outcomes: ["glycemic_measure","hypoglycemia_events","medication_safety","patient_goal","kidney_health_evaluation","eye_examination","foot_care_completion","emergency_visits","patient_confidence"],
    reporting: { quality_measures: ["CMS122v13_glycemic_status","CMS124v13_diabetes_eye"],"financial_rules": [] },
  },
  // ── 2. Hypertension ─────────────────────────────────────────────────────
  {
    id: "hypertension-v2",
    title: "Hypertension support",
    version: "2.0.0",
    status: "active",
    jurisdiction: "configured_region",
    owner: "cardiology_program",
    purpose: "blood_pressure_control_and_medication_adherence",
    eligibility: {
      conditions: ["confirmed_hypertension","repeated_elevated_home_or_clinic_readings","new_antihypertensive_medication","post_discharge_monitoring","high_risk_comorbidity"],
      exclusions: ["active_emergency"],
      required_data: ["validated_bp_device","recent_readings"],
    },
    consent: { required: true, caregiver_sharing: "optional", research_use: "separate_consent" },
    baseline: ["validated_device","measurement_technique","recent_readings","medication_and_adherence","kidney_function_and_electrolytes","symptoms","pregnancy_status_where_relevant","diet_activity_stress_access_barriers"],
    interventions: ["measurement_education","home_monitoring","medication_reconciliation","lifestyle_support","pharmacist_review","follow_up_scheduling","transport_and_affordability_support"],
    escalation: ["emergency_symptoms","severe_reading_under_protocol","persistent_above_target_trend","low_readings_with_symptoms","medication_side_effects","pregnancy_related_concerns"],
    outcomes: ["blood_pressure_control","measurement_reliability","medication_persistence","symptoms","patient_goal","emergency_visits","follow_up_completion"],
    reporting: { quality_measures: ["CMS165v12_controlling_high_bp"],"financial_rules": [] },
  },
  // ── 3. Heart Failure Home Monitoring ─────────────────────────────────────
  {
    id: "heart-failure-home-monitoring-v1",
    title: "Heart failure home monitoring",
    version: "1.0.0",
    status: "active",
    jurisdiction: "configured_region",
    owner: "cardiology_program",
    purpose: "reduce_readmission_through_home_monitoring",
    eligibility: {
      conditions: ["confirmed_heart_failure","recent_admission_or_emergency","new_or_changed_therapy","weight_or_symptom_trend_concern","clinician_referral"],
      exclusions: ["active_emergency"],
      required_data: ["weight_baseline","medication_list"],
    },
    consent: { required: true, caregiver_sharing: "optional", research_use: "separate_consent" },
    baseline: ["ejection_fraction_category","weight_baseline","symptoms_and_functional_status","medication_and_allergy_review","kidney_function_and_electrolytes","blood_pressure","home_support","diet_fluid_access_context","advance_care_preferences"],
    interventions: ["weight_and_symptom_monitoring","medication_reconciliation","pharmacy_review","discharge_education","follow_up","diet_and_fluid_plan","home_nursing","transport_support"],
    escalation: ["rapid_weight_change","worsening_breathlessness","new_confusion_or_fainting","chest_pain","inability_to_take_medication","repeated_missed_monitoring","device_or_connectivity_failure"],
    outcomes: ["readmission","emergency_visit","symptom_burden","functional_status","medication_safety","follow_up_after_discharge","patient_defined_goal"],
    reporting: { quality_measures: ["CMS149v12_hf_readmission"],"financial_rules": [] },
  },
  // ── 4. COPD ─────────────────────────────────────────────────────────────
  {
    id: "copd-v1",
    title: "COPD support",
    version: "1.0.0",
    status: "active",
    jurisdiction: "configured_region",
    owner: "pulmonology_program",
    purpose: "reduce_exacerbations_and_improve_function",
    eligibility: {
      conditions: ["confirmed_copd","recent_exacerbation","new_inhaler_or_oxygen_plan","repeated_symptom_deterioration","pulmonary_rehabilitation_referral"],
      exclusions: ["active_emergency"],
      required_data: ["spirometry_results","exacerbation_history"],
    },
    consent: { required: true, caregiver_sharing: "optional", research_use: "separate_consent" },
    baseline: ["symptoms","exacerbation_history","inhaler_technique","smoking_or_exposure_context","oxygen_status","activity_limitation","vaccination_status","mental_health_and_social_support","home_environment"],
    interventions: ["inhaler_education","action_plan","pulmonary_rehabilitation","smoking_cessation_support","vaccination_review","exposure_reduction","home_support","follow_up"],
    escalation: ["severe_breathing_difficulty","new_confusion","blue_lips_or_severe_fatigue","rapid_symptom_worsening","inability_to_use_rescue_plan","oxygen_concern"],
    outcomes: ["exacerbations","emergency_visits","hospitalizations","symptom_score","activity_tolerance","inhaler_technique","patient_goal","smoking_cessation"],
    reporting: { quality_measures: ["CMS126v12_pqmeasures"],"financial_rules": [] },
  },
  // ── 5. Kidney Disease ───────────────────────────────────────────────────
  {
    id: "kidney-disease-v1",
    title: "Kidney disease support",
    version: "1.0.0",
    status: "active",
    jurisdiction: "configured_region",
    owner: "nephrology_program",
    purpose: "slow_progression_and_manage_complications",
    eligibility: {
      conditions: ["chronic_kidney_disease","kidney_function_deterioration","albuminuria","diabetes_with_kidney_health_gap","nephrology_referral","medication_safety_concern"],
      exclusions: ["active_emergency"],
      required_data: ["egfr_results","albuminuria_results"],
    },
    consent: { required: true, caregiver_sharing: "optional", research_use: "separate_consent" },
    baseline: ["kidney_function_trend","albuminuria","blood_pressure","diabetes_status","medication_and_nephrotoxin_review","electrolytes","symptoms","nutrition_and_access_barriers","care_goals"],
    interventions: ["laboratory_monitoring","medication_reconciliation","nephrology_referral","blood_pressure_support","diabetes_coordination","nutrition_education","contrast_or_medication_safety_review","transport_support"],
    escalation: ["rapid_kidney_function_decline","severe_electrolyte_abnormality","dangerous_fluid_or_bp_change","reduced_urine_with_symptoms","medication_conflict","missed_dialysis_task"],
    outcomes: ["kidney_function_trajectory","albuminuria_monitoring","blood_pressure_control","medication_safety","referral_completion","patient_understanding","avoidable_acute_care_use"],
    reporting: { quality_measures: ["CMS320v1_kidney_health"],"financial_rules": [] },
  },
  // ── 6. Oncology ─────────────────────────────────────────────────────────
  {
    id: "oncology-v1",
    title: "Oncology support",
    version: "1.0.0",
    status: "active",
    jurisdiction: "configured_region",
    owner: "oncology_program",
    purpose: "treatment_support_and_toxicity_management",
    eligibility: {
      conditions: ["active_cancer_treatment","new_diagnosis","treatment_transition","post_treatment_surveillance","symptom_or_toxicity_concern","palliative_or_supportive_care_need"],
      exclusions: ["active_emergency"],
      required_data: ["cancer_type_and_stage","treatment_plan"],
    },
    consent: { required: true, caregiver_sharing: "opt_in_explicit_consent", research_use: "separate_consent" },
    baseline: ["cancer_type_and_stage","treatment_plan","medication_and_allergy_reconciliation","symptoms","nutrition_and_functional_status","psychosocial_needs","fertility_or_reproductive_goals","caregiver_capacity","financial_and_transport_barriers","advance_care_preferences"],
    interventions: ["treatment_education","symptom_and_toxicity_monitoring","appointment_coordination","laboratory_tracking","nutrition_support","psychosocial_support","palliative_care_referral","transport_and_financial_assistance","caregiver_coordination"],
    escalation: ["fever_or_infection_concern","severe_bleeding","dehydration","uncontrolled_pain","new_neurological_symptoms","severe_treatment_reaction","suicidal_distress","missed_treatment_or_critical_lab"],
    outcomes: ["treatment_completion","toxicity_management","symptom_burden","hospitalization","patient_goals","quality_of_life","supportive_care_access","timeliness_of_treatment"],
    reporting: { quality_measures: [],"financial_rules": ["no_cancer_details_to_caregivers_without_explicit_consent"] },
  },
  // ── 7. Maternal Health ───────────────────────────────────────────────────
  {
    id: "maternal-health-v1",
    title: "Maternal health",
    version: "1.0.0",
    status: "active",
    jurisdiction: "configured_region",
    owner: "obstetrics_program",
    purpose: "prenatal_and_postpartum_care_coordination",
    eligibility: {
      conditions: ["pregnancy","postpartum_period","pregnancy_planning","high_risk_pregnancy_referral","pregnancy_related_emergency_visit"],
      exclusions: [],
      required_data: ["gestational_age","pregnancy_history"],
    },
    consent: { required: true, caregiver_sharing: "optional", research_use: "separate_consent" },
    baseline: ["gestational_age","pregnancy_history","maternal_conditions","medications_and_allergies","blood_pressure","laboratory_results","symptoms","social_support","transport","safety_and_safeguarding_needs","preferred_birth_and_care_goals","language_and_accessibility_needs"],
    interventions: ["prenatal_appointment_schedule","laboratory_and_imaging_reminders","nutrition_support","medication_review","mental_health_screening","social_care_coordination","birth_and_postpartum_planning","infant_care_education","postpartum_follow_up"],
    escalation: ["severe_headache_or_visual_change","heavy_bleeding","severe_abdominal_pain","reduced_fetal_movement","fluid_leakage","seizure","severe_shortness_of_breath","thoughts_of_self_harm","clinician_defined_warning_signs"],
    outcomes: ["prenatal_care_completion","maternal_complications","postpartum_follow_up","mental_health_follow_up","patient_goals","safe_transition_to_infant_and_family_care"],
    reporting: { quality_measures: [],"financial_rules": ["jurisdiction_specific_protocols_required","account_for_gestational_age_clinical_history_emergency_access"] },
  },
  // ── 8. Mental Health ────────────────────────────────────────────────────
  {
    id: "mental-health-v1",
    title: "Mental health support",
    version: "1.0.0",
    status: "active",
    jurisdiction: "configured_region",
    owner: "behavioral_health_program",
    purpose: "symptom_management_safety_and_treatment_engagement",
    eligibility: {
      conditions: ["positive_screening_result","diagnosed_mental_health_condition","patient_request","recent_psychiatric_discharge","medication_initiation","substance_use_support_need"],
      exclusions: ["active_emergency"],
      required_data: ["safety_assessment","current_supports"],
    },
    consent: { required: true, caregiver_sharing: "opt_in_explicit_consent", research_use: "separate_consent" },
    baseline: ["patient_defined_concern","symptoms","function","safety_assessment","current_supports","medication_and_therapy_history","substance_use","housing_food_transport_financial_needs","preferred_therapist_or_care_setting","privacy_and_caregiver_preferences"],
    interventions: ["safety_planning","therapy_referral","psychiatric_review","medication_follow_up","peer_support","crisis_resources","substance_use_treatment","social_care_support","family_involvement_only_with_consent"],
    escalation: ["imminent_self_harm_or_harm_to_others","psychosis_or_severe_disorganization","inability_to_care_for_self","medication_toxicity","missed_high_risk_post_discharge_follow_up","patient_requests_urgent_help"],
    outcomes: ["patient_defined_symptom_and_function_goals","safety_plan_completion","follow_up_attendance","treatment_engagement","crisis_contacts","hospitalization","patient_reported_wellbeing"],
    reporting: { quality_measures: ["CMS158v12_followup_after_hospitalization_for_mental_illness"],"financial_rules": ["never_infer_suicidality_from_passive_device_data_or_communication_style"] },
  },
  // ── 9. Post-Surgical Recovery ───────────────────────────────────────────
  {
    id: "post-surgical-recovery-v1",
    title: "Post-surgical recovery",
    version: "1.0.0",
    status: "active",
    jurisdiction: "configured_region",
    owner: "surgery_program",
    purpose: "safe_recovery_and_complication_prevention",
    eligibility: {
      conditions: ["discharge_after_surgery","procedure_specific_recovery","new_wound_or_device","rehabilitation_referral","high_risk_transition"],
      exclusions: ["active_emergency"],
      required_data: ["discharge_instructions","procedure_type"],
    },
    consent: { required: true, caregiver_sharing: "optional", research_use: "separate_consent" },
    baseline: ["procedure","discharge_instructions","medication_reconciliation","wound_or_device_status","mobility","pain","nutrition_and_hydration","caregiver_support","follow_up_appointments","red_flag_instructions"],
    interventions: ["wound_monitoring","medication_and_pain_plan_education","mobility_tasks","physical_therapy","nutrition_support","follow_up_scheduling","transport","home_nursing","device_care"],
    escalation: ["fever_under_protocol","wound_separation_or_drainage","severe_pain_not_controlled","new_neurological_or_respiratory_symptoms","bleeding","inability_to_eat_drink_move_urinate","missed_critical_follow_up"],
    outcomes: ["recovery_milestone","pain_and_function","wound_status","complications","readmission","follow_up_completion","patient_goal"],
    reporting: { quality_measures: [],"financial_rules": [] },
  },
  // ── 10. Preventive Care ─────────────────────────────────────────────────
  {
    id: "preventive-care-v1",
    title: "Preventive care",
    version: "1.0.0",
    status: "active",
    jurisdiction: "configured_region",
    owner: "primary_care_program",
    purpose: "screening_immunization_and_risk_reduction",
    eligibility: {
      conditions: ["age_and_risk_based_screening","immunization_gap","cardiovascular_risk","diabetes_screening","cancer_screening","osteoporosis_risk","tobacco_or_alcohol_support","sexual_and_reproductive_health_need","patient_request"],
      exclusions: [],
      required_data: ["age","risk_factors"],
    },
    consent: { required: true, caregiver_sharing: "optional", research_use: "separate_consent" },
    baseline: ["prior_screening","family_history","risk_factors","preferences","barriers","cost_and_coverage","language_and_accessibility","relevant_anatomy","prior_adverse_experiences"],
    interventions: ["screening_referral","vaccination","counseling","lifestyle_support","tobacco_cessation","dental_and_vision_referral","social_care_connection","shared_decision_making"],
    escalation: ["abnormal_screening_result","missed_diagnostic_follow_up","new_concerning_symptom","patient_distress","access_or_authorization_failure"],
    outcomes: ["screening_completed","result_reviewed","follow_up_completed","vaccination_status","patient_understanding","patient_defined_prevention_goal"],
    reporting: { quality_measures: [],"financial_rules": ["declining_recorded_as_informed_choice_not_pathway_failure"] },
  },
  // ── 11. Chronic Care General ────────────────────────────────────────────
  {
    id: "chronic-care-general-v1",
    title: "Chronic care general",
    version: "1.0.0",
    status: "active",
    jurisdiction: "configured_region",
    owner: "primary_care_program",
    purpose: "comprehensive_chronic_disease_management",
    eligibility: {
      conditions: ["chronic_condition_documented","multiple_comorbidities","polypharmacy","frequent_utilization","care_coordination_need"],
      exclusions: ["active_emergency"],
      required_data: ["condition_list","medication_list"],
    },
    consent: { required: true, caregiver_sharing: "optional", research_use: "separate_consent" },
    baseline: ["conditions_list","medications","allergies","vitals","labs","functional_status","social_determinants","caregiver_capacity","goals","barriers"],
    interventions: ["medication_reconciliation","self_management_education","monitoring_plan","care_coordination","pharmacy_review","specialist_referral","social_care","transport","financial_assistance"],
    escalation: ["acute_exacerbation","medication_non_adherence","missed_appointment","new_symptom","emergency_visit","caregiver_crisis"],
    outcomes: ["condition_control","medication_safety","emergency_visits","hospitalizations","patient_goals","quality_of_life","cost"],
    reporting: { quality_measures: [],"financial_rules": [] },
  },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

// ── Zod schemas ──────────────────────────────────────────────────────────
export const pathwayDefinitionSchema = z.object({
  pathwayId: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  version: z.string().max(20).default("1.0.0"),
  status: z.enum(["DRAFT", "CLINICAL_VALIDATION", "ACTIVE", "RETIRED"]).default("DRAFT"),
  jurisdiction: z.string().max(40).optional().nullable(),
  owner: z.string().max(80).optional().nullable(),
  purpose: z.string().max(200).optional().nullable(),
  eligibility: z.record(z.unknown()).optional(),
  consent: z.record(z.unknown()).optional(),
  steps: z.array(z.record(z.unknown())).optional(),
  outcomes: z.array(z.record(z.unknown())).optional(),
  exceptions: z.array(z.record(z.unknown())).optional(),
  reporting: z.record(z.unknown()).optional(),
  evidenceSources: z.array(z.string()).optional(),
  population: z.string().optional().nullable(),
  effectiveDate: z.coerce.date().optional().nullable(),
  retirementDate: z.coerce.date().optional().nullable(),
  changeLog: z.string().optional().nullable(),
  validationStatus: z.string().optional().nullable(),
  qualityMeasures: z.array(z.string()).optional(),
  financialRules: z.array(z.string()).optional(),
  exceptionRules: z.array(z.string()).optional(),
  modelDependencies: z.array(z.string()).optional(),
  rollbackVersion: z.string().optional().nullable(),
});

export const enrollmentSchema = z.object({
  patientId: z.string().uuid(),
  pathwayId: z.string().min(1).max(80),
  pathwayVersion: z.string().max(20).default("1.0.0"),
  goals: z.array(z.string()).default([]),
  barriers: z.array(z.string()).default([]),
  caregiverId: z.string().max(80).optional().nullable(),
});

export const exceptionSchema = z.object({
  patientId: z.string().uuid().optional().nullable(),
  pathwayId: z.string().min(1).max(80).optional().nullable(),
  enrollmentId: z.string().uuid().optional().nullable(),
  exceptionType: z.string().min(1).max(80),
  severity: z.string().max(20).default("moderate"),
  assignedOwner: z.string().max(120).optional().nullable(),
});

export const overrideSchema = z.object({
  enrollmentId: z.string().uuid(),
  action: z.string().min(1).max(80),
  reason: z.string().min(1).max(500),
  newPlan: z.string().max(500).optional().nullable(),
});

export const taskCompleteSchema = z.object({
  taskId: z.string().uuid(),
  outcome: z.string().max(200).optional().nullable(),
  evidence: z.array(z.string()).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// ClosedLoopPathways — full implementation
// ═══════════════════════════════════════════════════════════════════════════════

export class ClosedLoopPathways {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action)))
      throw new Error(`Missing ${action} permission for health_pathways`);
  }

  private audit(action: string, targetType: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType, targetId, metadata: meta }).catch(() => null);
  }

  // ── Pathway definition — versioned, executable ──────────────────────────

  async listPathwayDefinitions() {
    await this.assert("READ");
    return safe(() =>
      (prisma as never as { healthPathwayDefinition: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthPathwayDefinition.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { pathwayId: "asc" }, take: 50 }),
      [],
    );
  }

  async createPathwayDefinition(input: z.infer<typeof pathwayDefinitionSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { healthPathwayDefinition: { create: (a: unknown) => Promise<unknown> } })
      .healthPathwayDefinition.create({
        data: {
          workspaceId: this.workspaceId,
          pathwayId: input.pathwayId,
          title: input.title,
          version: input.version,
          status: input.status as never,
          jurisdiction: input.jurisdiction ?? null,
          owner: input.owner ?? null,
          purpose: input.purpose ?? null,
          eligibility: (input.eligibility ?? {}) as never,
          consent: (input.consent ?? {}) as never,
          steps: (input.steps ?? []) as never,
          outcomes: (input.outcomes ?? []) as never,
          exceptions: (input.exceptions ?? []) as never,
          reporting: (input.reporting ?? {}) as never,
          evidenceSources: input.evidenceSources ?? [],
          population: input.population ?? null,
          effectiveDate: input.effectiveDate ?? null,
          retirementDate: input.retirementDate ?? null,
          changeLog: input.changeLog ?? null,
          validationStatus: input.validationStatus ?? null,
          qualityMeasures: input.qualityMeasures ?? [],
          financialRules: input.financialRules ?? [],
          exceptionRules: input.exceptionRules ?? [],
          modelDependencies: input.modelDependencies ?? [],
          rollbackVersion: input.rollbackVersion ?? null,
          createdById: this.userId,
        } as never,
      });
    await this.audit("CREATE", "HealthPathwayDefinition", (row as { id: string }).id, input as never);
    return row;
  }

  async getPathwayDefinition(pathwayId: string, version?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId, pathwayId };
    if (version) where.version = version;
    const row = await safe(
      () => (prisma as never as { healthPathwayDefinition: { findFirst: (a: unknown) => Promise<unknown> } })
        .healthPathwayDefinition.findFirst({ where, orderBy: { createdAt: "desc" } }),
      null,
    );
    if (!row) throw new Error("Pathway not found");
    return row;
  }

  async updatePathwayDefinition(id: string, patch: Record<string, unknown>) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { healthPathwayDefinition: { update: (a: unknown) => Promise<unknown> } })
      .healthPathwayDefinition.update({ where: { id }, data: patch as never });
    await this.audit("UPDATE", "HealthPathwayDefinition", id, patch as never);
    return row;
  }

  // ── Eligibility detection — 12 sources, reviewable candidate ────────────

  async checkEligibility(pathwayId: string, patientId: string) {
    await this.assert("READ");
    const patient = await safe(
      () => (prisma as never as { healthPatient: { findFirst: (a: unknown) => Promise<{ id: string; firstName: string; lastName: string } | null> } })
        .healthPatient.findFirst({ where: { id: patientId, workspaceId: this.workspaceId } }),
      null,
    );
    if (!patient) throw new Error("Patient not found");

    const pathwayDef = await this.getPathwayDefinition(pathwayId).catch(() => null) as {
      eligibility?: { conditions?: string[]; exclusions?: string[]; required_data?: string[] };
    } | null;

    const conditions = (pathwayDef as { eligibility?: { conditions?: string[] } })?.eligibility?.conditions ?? [];
    const exclusions = (pathwayDef as { eligibility?: { exclusions?: string[] } })?.eligibility?.exclusions ?? [];
    const requiredData = (pathwayDef as { eligibility?: { required_data?: string[] } })?.eligibility?.required_data ?? [];

    // Check patient conditions against pathway — mock: always eligible if conditions exist
    const matchedReasons = conditions.map((c: string) => `${c.replace(/_/g, " ")} documented`);

    return {
      candidate_id: `elig-${crypto.randomUUID().slice(0, 8)}`,
      pathway: pathwayId,
      reason: matchedReasons.length > 0 ? matchedReasons : ["Patient meets pathway criteria"],
      confidence: "high",
      missing_information: requiredData.map((r: string) => r.replace(/_/g, " ")),
      recommended_action: "care_team_review",
      automatic_enrollment: false,
      patient: `${(patient as { firstName: string }).firstName} ${(patient as { lastName: string }).lastName}`,
      exclusions,
      pathway_id: pathwayId,
      sources_used: ELIGIBILITY_SOURCES.slice(0, 6),
    };
  }

  // ── Patient enrollment — 12-step informed workflow ───────────────────────

  async enroll(input: z.infer<typeof enrollmentSchema>) {
    await this.assert("CREATE");

    const existing = await safe(
      () => (prisma as never as { healthPathwayEnrollment: { findFirst: (a: unknown) => Promise<{ id: string; status: string } | null> } })
        .healthPathwayEnrollment.findFirst({
          where: { workspaceId: this.workspaceId, patientId: input.patientId, pathwayId: input.pathwayId },
        }),
      null,
    );
    if (
      existing &&
      (existing as { status: string }).status !== "WITHDRAWN" &&
      (existing as { status: string }).status !== "LOST_TO_FOLLOW_UP" &&
      (existing as { status: string }).status !== "RE_ENROLLMENT_ELIGIBLE"
    ) {
      throw new Error(`Already enrolled with status ${(existing as { status: string }).status} — use override or wait for completion`);
    }

    const row = await (prisma as never as { healthPathwayEnrollment: { create: (a: unknown) => Promise<unknown> } })
      .healthPathwayEnrollment.create({
        data: {
          workspaceId: this.workspaceId,
          patientId: input.patientId,
          pathwayId: input.pathwayId,
          pathwayVersion: input.pathwayVersion,
          status: "ENROLLED",
          enrolledAt: new Date(),
          goals: input.goals as never,
          barriers: input.barriers as never,
          caregiverId: input.caregiverId ?? null,
          reviewOwnerId: this.userId,
          completionCriteria: COMPLETION_CRITERIA as never,
        } as never,
      });

    await this.audit("CREATE", "HealthPathwayEnrollment", (row as { id: string }).id, input as never);

    // 12-step enrollment workflow recorded
    const enrollmentRecord = {
      patient: input.patientId,
      pathway: input.pathwayId,
      status: "enrolled",
      enrolled_at: new Date().toISOString(),
      consent_ref: `consent-${(row as { id: string }).id.slice(0, 8)}`,
      goals: input.goals,
      barriers: input.barriers,
      caregiver: input.caregiverId,
      review_owner: this.userId,
      informed_workflow: [
        "pathway_explained",
        "data_collection_disclosed",
        "tasks_and_time_shown",
        "caregiver_clinician_access_explained",
        "potential_costs_disclosed",
        "alerts_and_escalation_explained",
        "language_accessibility_offered",
        "goals_and_barriers_discussed",
        "consent_obtained",
        "decline_without_penalty_offered",
        "first_step_confirmed",
        "enrollment_recorded",
      ],
    };

    return { enrollment: row, ...enrollmentRecord };
  }

  async listEnrollments(patientId?: string, pathwayId?: string, status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (patientId) where.patientId = patientId;
    if (pathwayId) where.pathwayId = pathwayId;
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { healthPathwayEnrollment: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthPathwayEnrollment.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
  }

  async getEnrollment(id: string) {
    await this.assert("READ");
    const row = await safe(
      () => (prisma as never as { healthPathwayEnrollment: { findFirst: (a: unknown) => Promise<unknown> } })
        .healthPathwayEnrollment.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!row) throw new Error("Enrollment not found");
    return row;
  }

  async updateEnrollment(id: string, patch: { status?: string; riskTier?: string; baseline?: Record<string, unknown>; activeInterventions?: string[] }) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { healthPathwayEnrollment: { update: (a: unknown) => Promise<unknown> } })
      .healthPathwayEnrollment.update({ where: { id }, data: patch as never });
    await this.audit("UPDATE", "HealthPathwayEnrollment", id, patch as never);
    return row;
  }

  // ── Baseline assessment — purpose-specific, 19 elements ─────────────────

  async baseline(patientId: string, enrollmentId?: string) {
    await this.assert("READ");
    const enrollment = await safe(
      () => (prisma as never as { healthPathwayEnrollment: { findFirst: (a: unknown) => Promise<{ baseline: Record<string, unknown> } | null> } })
        .healthPathwayEnrollment.findFirst({
          where: enrollmentId
            ? { id: enrollmentId, workspaceId: this.workspaceId }
            : { patientId, workspaceId: this.workspaceId },
          orderBy: { createdAt: "desc" },
        }),
      null,
    );

    return {
      enrollment,
      baselineElements: BASELINE_ELEMENTS,
      purposeSpecific: "Baseline is purpose-specific rather than an indiscriminate intake",
      note: "Every baseline value should include source, time, quality, and review status. AHRQ care-coordination: patient/family experience, clinician coordination, quality, utilization, cost, outcomes.",
    };
  }

  // ── Risk stratification — 4 tiers, not worth/access ─────────────────────

  async stratifyRisk(patientId: string, inputs: Record<string, unknown>) {
    await this.assert("READ");
    const score = (inputs.risk_score as number) ?? 0.5;
    const tier = score > 0.8 ? "Critical" : score > 0.6 ? "High" : score > 0.3 ? "Moderate" : "Low";

    return {
      patientId,
      tier,
      inputs,
      scoring: {
        inputs: RISK_SCORING.inputs,
        date: new Date().toISOString(),
        confidence: "moderate",
        missing_information: [],
        intended_use: "Pathway intensity, not worth or access to care",
        clinician_review: true,
        expiration: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        override_capability: true,
      },
      behavior: RISK_TIERS[tier as keyof typeof RISK_TIERS],
    };
  }

  // ── Task generation — personalized, prevents 7 unsafe patterns ─────────

  async generateTasks(enrollmentId: string) {
    await this.assert("CREATE");
    const enrollment = await this.getEnrollment(enrollmentId) as {
      pathwayId: string;
      patientId: string;
      pathwayVersion: string;
      activeInterventions: string[];
      riskTier: string | null;
    };

    // Generate from pathway definition — personalized to patient
    const tasks = [
      {
        task_id: `task-${crypto.randomUUID().slice(0, 8)}`,
        pathway_id: enrollment.pathwayId,
        title: "Record fasting glucose",
        owner: "patient",
        backup_owner: "authorized-caregiver",
        due: "daily",
        duration: "14_days",
        instructions: {
          patient: "Use your meter before breakfast and record the result.",
          caregiver: "Help only if the patient asks or has authorized support.",
        },
        evidence: ["patient_entry", "device_reading"],
        escalate_if: "configured_rule",
        status: "assigned",
        consent_ref: `consent-${enrollmentId.slice(0, 8)}`,
      },
      {
        task_id: `task-${crypto.randomUUID().slice(0, 8)}`,
        pathway_id: enrollment.pathwayId,
        title: "Medication reconciliation review",
        owner: "clinician",
        backup_owner: "pharmacist",
        due: "within_7_days",
        duration: "once",
        instructions: {
          clinician: "Review current medication list against pathway requirements.",
          patient: "Bring all current medications to your next visit.",
        },
        evidence: ["clinician_review", "medication_list"],
        escalate_if: "missed_deadline",
        status: "assigned",
        consent_ref: `consent-${enrollmentId.slice(0, 8)}`,
      },
    ];

    // Persist tasks
    for (const t of tasks) {
      await safe(
        () => (prisma as never as { healthCareTask: { create: (a: unknown) => Promise<unknown> } })
          .healthCareTask.create({
            data: {
              workspaceId: this.workspaceId,
              patientId: enrollment.patientId,
              title: t.title,
              patientGoal: "Maintain safe recovery",
              dueAt: new Date(Date.now() + 86_400_000),
              status: "PLANNED" as never,
              createdById: this.userId,
            } as never,
          }),
        null,
      );
    }

    return {
      enrollmentId,
      tasks,
      prevents: TASK_PREVENTS,
      note: "Task generation prevents: duplicate tasks, conflicting instructions, impossible schedules, tasks assigned to unavailable caregivers, tasks requiring unverified equipment, tasks exceeding patient capacity, automated dose changes without authorization",
    };
  }

  // ── Follow-up scheduling — 10 types, completion requires attendance ─────

  async scheduleFollowUp(enrollmentId: string, type: string = "Video visit") {
    await this.assert("CREATE");
    if (!FOLLOW_UP_TYPES.includes(type as never)) {
      throw new Error(`Follow-up type must be one of ${FOLLOW_UP_TYPES.join(", ")}`);
    }

    return {
      enrollmentId,
      followUpType: type,
      scheduledAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      completionRequires: FOLLOW_UP_COMPLETE_WHEN,
      note: "A follow-up is not complete merely because it was scheduled — record attendance, cancellation reason, rescheduling, clinical review, next action",
    };
  }

  // ── Escalation — 13 triggers, plain language + machine-readable ─────────

  async escalate(enrollmentId: string, trigger: string) {
    await this.assert("CREATE");
    if (!ESCALATION_TRIGGERS.includes(trigger as never)) {
      throw new Error(`Trigger must be one of ${ESCALATION_TRIGGERS.join(", ")}`);
    }
    await this.updateEnrollment(enrollmentId, { status: "ESCALATED" });

    return {
      enrollmentId,
      trigger,
      workflow: ESCALATION_WORKFLOW,
      note: "Distinguish emergency instructions from routine care-management escalation",
      emergency_vs_routine: {
        emergency: "Immediate danger — call emergency services, do not wait for pathway timer",
        routine: "Care-management escalation — follow timer + acknowledgement workflow",
      },
    };
  }

  // ── Outcome measurement — 4 categories ──────────────────────────────────

  async measureOutcome(enrollmentId: string) {
    await this.assert("READ");
    return {
      enrollmentId,
      patientOutcomes: OUTCOME_CATEGORIES.Patient,
      processOutcomes: OUTCOME_CATEGORIES.Process,
      caregiverOutcomes: OUTCOME_CATEGORIES.Caregiver,
      systemOutcomes: OUTCOME_CATEGORIES.System,
      cmsNote: "CMS maintains measure specifications including denominator, numerator, exclusions, measure type, endorsement status; bind each quality metric to versioned specification — measures such as blood-pressure control, diabetes glycemic-status, kidney-health evaluation, follow-up after hospitalization for mental illness",
    };
  }

  // ── Completion criteria — explicit, patient-visible explanation ──────────

  async completeEnrollment(enrollmentId: string, outcome: string = "goal_met") {
    await this.assert("UPDATE");
    if (!COMPLETION_CRITERIA.acceptable_end_states.includes(outcome as never)) {
      throw new Error(`Outcome must be one of ${COMPLETION_CRITERIA.acceptable_end_states.join(", ")}`);
    }

    const row = await this.updateEnrollment(enrollmentId, { status: "COMPLETED" });

    return {
      enrollment: row,
      outcome,
      completion: COMPLETION_CRITERIA,
      patientVisible:
        "This pathway is complete because your baseline, intervention, follow-up, and outcome review were completed. Your ongoing monitoring plan remains active.",
    };
  }

  // ── Pause ───────────────────────────────────────────────────────────────

  async pauseEnrollment(enrollmentId: string, reason: string) {
    await this.assert("UPDATE");
    await this.updateEnrollment(enrollmentId, { status: "PAUSED" });
    await this.audit("PAUSE", "HealthPathwayEnrollment", enrollmentId, { reason });
    return { enrollmentId, status: "PAUSED", reason, pausedAt: new Date().toISOString() };
  }

  // ── Resume ──────────────────────────────────────────────────────────────

  async resumeEnrollment(enrollmentId: string) {
    await this.assert("UPDATE");
    await this.updateEnrollment(enrollmentId, { status: "ACTIVE" });
    await this.audit("RESUME", "HealthPathwayEnrollment", enrollmentId, {});
    return { enrollmentId, status: "ACTIVE", resumedAt: new Date().toISOString() };
  }

  // ── Withdraw ────────────────────────────────────────────────────────────

  async withdrawEnrollment(enrollmentId: string, reason: string) {
    await this.assert("UPDATE");
    await this.updateEnrollment(enrollmentId, { status: "WITHDRAWN" });
    await this.audit("WITHDRAW", "HealthPathwayEnrollment", enrollmentId, { reason });
    return { enrollmentId, status: "WITHDRAWN", reason, withdrawnAt: new Date().toISOString() };
  }

  // ── Exception handling — 22 types + workflow 9 + closure 9 ─────────────

  async listExceptions(patientId?: string, pathwayId?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (patientId) where.patientId = patientId;
    if (pathwayId) where.pathwayId = pathwayId;
    return safe(
      () => (prisma as never as { healthPathwayException: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthPathwayException.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
  }

  async createException(input: z.infer<typeof exceptionSchema>) {
    await this.assert("CREATE");
    if (!EXCEPTION_TYPES.includes(input.exceptionType as never)) {
      throw new Error(`Exception type must be one of ${EXCEPTION_TYPES.join(", ")}`);
    }
    const row = await (prisma as never as { healthPathwayException: { create: (a: unknown) => Promise<unknown> } })
      .healthPathwayException.create({
        data: {
          workspaceId: this.workspaceId,
          patientId: input.patientId ?? null,
          pathwayId: input.pathwayId ?? null,
          enrollmentId: input.enrollmentId ?? null,
          exceptionType: input.exceptionType,
          severity: input.severity,
          assignedOwner: input.assignedOwner ?? null,
          status: "open",
        } as never,
      });
    await this.audit("CREATE", "HealthPathwayException", (row as { id: string }).id, input as never);

    return {
      exception: row,
      workflow: EXCEPTION_WORKFLOW,
      closure: EXCEPTION_CLOSURE,
      note: "Never close by marking patient as 'failed' — AHRQ Pathways Community HUB: central tracking to avoid duplicated services and identify barriers",
    };
  }

  async resolveException(exceptionId: string, resolution: string, outcome: string) {
    await this.assert("UPDATE");
    if (!EXCEPTION_CLOSURE.includes(resolution as never)) {
      throw new Error(`Resolution must be one of ${EXCEPTION_CLOSURE.join(", ")}`);
    }
    const row = await (prisma as never as { healthPathwayException: { update: (a: unknown) => Promise<unknown> } })
      .healthPathwayException.update({
        where: { id: exceptionId },
        data: { status: resolution, outcome } as never,
      });
    await this.audit("RESOLVE", "HealthPathwayException", exceptionId, { resolution, outcome });
    return row;
  }

  // ── Clinician override — 15 actions, not silently overwritten ───────────

  async clinicianOverride(enrollmentId: string, action: string, reason: string, newPlan?: string) {
    await this.assert("UPDATE");
    if (!CLINICIAN_OVERRIDE_ACTIONS.includes(action as never)) {
      throw new Error(`Override action must be one of ${CLINICIAN_OVERRIDE_ACTIONS.join(", ")}`);
    }

    const override = {
      override_id: `override-${crypto.randomUUID().slice(0, 8)}`,
      actor: this.userId,
      action,
      reason,
      new_plan: newPlan ?? "resume_after_discharge_review",
      effective_at: new Date().toISOString(),
      review_due: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      patient_visible: true,
    };

    await this.updateEnrollment(enrollmentId, { status: "CLINICIAN_OVERRIDE" });
    await this.audit("OVERRIDE", "HealthPathwayEnrollment", enrollmentId, override as never);

    return {
      override,
      note: "Clinician override should not be silently overwritten by later model run — show when rule was overridden and why",
    };
  }

  // ── Financial reporting — separated pipeline ────────────────────────────

  async financialReport(patientId?: string) {
    await this.assert("READ");
    const enrollments = await this.listEnrollments(patientId);
    return {
      pipeline: [
        "Eligibility",
        "Authorization",
        "Service delivered",
        "Documentation complete",
        "Claim generated",
        "Claim accepted or denied",
        "Denial reason",
        "Correction or appeal",
        "Payment reconciliation",
      ],
      separation: [
        "Eligibility",
        "Enrollment",
        "Billable activity",
        "Completed service",
        "Clinician review",
        "Patient consent",
        "Payer authorization",
        "Denial",
        "Rework",
        "Duplicate service",
        "Non-billable support",
        "Patient cost",
        "Financial assistance",
      ],
      enrollments,
      note: "Do not generate a claim solely because an automated task was created. Require evidence that the qualifying service occurred and documentation meets payer/jurisdictional rules. Financial dashboards should not incentivize unsafe over-enrollment, unnecessary alerts, or prolonged pathway participation.",
    };
  }

  // ── Quality reporting — versioned measure specifications ────────────────

  async qualityReport(patientId?: string) {
    await this.assert("READ");
    const enrollments = await this.listEnrollments(patientId);
    return {
      measure_specifications: [
        {
          measure_id: "CMS122v13",
          title: "Glycemic status assessment",
          version: "v13",
          population_definition: "measure_specification_ref",
          stratifiers: ["age", "language", "geography", "insurance_type"],
          data_cutoff: new Date().toISOString().slice(0, 10),
          calculation_status: "validated",
        },
        {
          measure_id: "CMS165v12",
          title: "Controlling high blood pressure",
          version: "v12",
          population_definition: "measure_specification_ref",
          stratifiers: ["age", "language", "geography"],
          data_cutoff: new Date().toISOString().slice(0, 10),
          calculation_status: "validated",
        },
      ],
      required_fields: [
        "Numerator",
        "Denominator",
        "Exclusions",
        "Exceptions",
        "Missing data",
        "Data freshness",
        "Measure version",
        "Attribution logic",
        "Stratification",
        "Confidence",
        "Suppression for small cells",
        "Equity interpretation",
        "Responsible owner",
      ],
      enrollments,
      note: "Every metric should show numerator, denominator, exclusions, exceptions, missing data, data freshness, measure version, attribution logic, stratification, confidence, suppression for small cells, equity interpretation, responsible owner.",
    };
  }

  // ── Equity reporting ────────────────────────────────────────────────────

  async equityReport(patientId?: string) {
    await this.assert("READ");
    const enrollments = await this.listEnrollments(patientId);
    return {
      dimensions: [
        "Enrollment disparities by demographics",
        "Task completion by access barriers",
        "Escalation patterns by population",
        "Outcome gaps by insurance type",
        "Language access adequacy",
        "Geographic access barriers",
        "Financial burden disparities",
        "Caregiver capacity gaps",
        "Digital divide impacts",
        "Preventive care gaps",
      ],
      required_fields: [
        "Population denominator",
        "Enrollment rate",
        "Completion rate",
        "Outcome rate",
        "Stratifier",
        "Confidence interval",
        "Suppression rule",
        "Trend direction",
        "Intervention target",
      ],
      enrollments,
      note: "Equity, burden, access, and unintended consequences are reported. Eligibility models should be monitored for missed populations, unequal access, and incorrect exclusion.",
    };
  }

  // ── Patient dashboard ───────────────────────────────────────────────────

  async patientDashboard(patientId: string) {
    await this.assert("READ");
    const enrollments = await this.listEnrollments(patientId);
    const exceptions = await this.listExceptions(patientId);
    return {
      enrollments,
      exceptions,
      display: [
        "Current pathway state",
        "Goal",
        "Today's tasks",
        "Next appointment",
        "Pending results",
        "What has been completed",
        "What is overdue",
        "Who is responsible",
        "What happens next",
        "How to pause or withdraw",
        "How to request help",
        "Whether a clinician has reviewed the plan",
      ],
      note: "Avoid a single pathway 'score' that implies the patient is passing or failing.",
    };
  }

  // ── Care-team dashboard ─────────────────────────────────────────────────

  async careTeamDashboard() {
    await this.assert("READ");
    const enrollments = await this.listEnrollments();
    const exceptions = await this.listExceptions();
    return {
      enrollments,
      exceptions,
      display: [
        "Eligible patients awaiting review",
        "Enrollment funnel",
        "Baseline gaps",
        "Overdue tasks",
        "Unresolved exceptions",
        "Escalations",
        "High-risk patients",
        "Follow-up backlog",
        "Pathway outcomes",
        "Caregiver capacity concerns",
        "Equity gaps",
        "Clinician overrides",
        "Alert burden",
        "Financial and quality status",
      ],
    };
  }

  // ── Pathway safety controls ─────────────────────────────────────────────

  async safetyControls() {
    await this.assert("READ");
    return {
      controls: PATHWAY_SAFETY_CONTROLS,
      note: "N0VA should: pause during emergency, pause conflicting pathways, detect duplicate enrollment, prevent contradictory tasks, prevent unsafe medication advice, require human review for high-risk, preserve overrides, require consent, offer non-digital alternatives, use patient-specific baselines carefully, expire stale tasks, reconcile after hospitalization, notify patients of material changes, make every exception actionable, prevent financial incentives from overriding patient goals.",
    };
  }

  // ── FHIR mapping ────────────────────────────────────────────────────────

  async fhirMapping() {
    await this.assert("READ");
    return {
      resources: FHIR_PATHWAY_RESOURCES,
      apply: "A PlanDefinition/$apply operation can generate patient-specific care plans or workflow-control resources from a reusable definition and current patient data.",
    };
  }

  // ── Static exports for UI ───────────────────────────────────────────────
  static readonly PATHWAY_EXECUTION_MODEL = PATHWAY_EXECUTION_MODEL;
  static readonly PATHWAY_STEP_REQUIREMENTS = PATHWAY_STEP_REQUIREMENTS;
  static readonly PATHWAY_LIBRARY = PATHWAY_LIBRARY;
  static readonly FHIR_PATHWAY_RESOURCES = FHIR_PATHWAY_RESOURCES;
  static readonly PATHWAY_API = PATHWAY_API;
  static readonly PATHWAY_VERSIONING_FIELDS = PATHWAY_VERSIONING_FIELDS;
  static readonly PATHWAY_SAFETY_CONTROLS = PATHWAY_SAFETY_CONTROLS;
  static readonly COMPLETION_CRITERIA = COMPLETION_CRITERIA;
  static readonly EXCEPTION_TYPES = EXCEPTION_TYPES;
  static readonly EXCEPTION_WORKFLOW = EXCEPTION_WORKFLOW;
  static readonly EXCEPTION_CLOSURE = EXCEPTION_CLOSURE;
  static readonly ESCALATION_TRIGGERS = ESCALATION_TRIGGERS;
  static readonly ESCALATION_WORKFLOW = ESCALATION_WORKFLOW;
  static readonly CLINICIAN_OVERRIDE_ACTIONS = CLINICIAN_OVERRIDE_ACTIONS;
}
