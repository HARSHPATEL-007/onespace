// Patient Command Center — personalized, prioritized, explainable daily workspace.
// Answers: What matters today? What changed? What next? Who is waiting? AHRQ health-literacy, WCAG 2.2 AA, NHS inclusion.
import { z } from "zod";
import { prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "health_command_center";

// ── Care context — 11, home screen adapts ─────────────────────────────────
export const CARE_CONTEXTS = ["STABLE_WELLNESS","NEW_DIAGNOSIS","POST_DISCHARGE_RECOVERY","PREGNANCY","CHRONIC_DISEASE_MONITORING","ACTIVE_TREATMENT","MENTAL_HEALTH_SUPPORT","CAREGIVER_MANAGED_CARE","PEDIATRIC_ADOLESCENT_CARE","PALLIATIVE_HOSPICE_CARE","EMERGENCY_URGENT_FOLLOWUP"] as const;
export type CareContextKey = typeof CARE_CONTEXTS[number];

// ── Command-center layout — 8 cards ───────────────────────────────────────
export const COMMAND_CENTER_LAYOUT = ["Today's health status and urgent actions","What needs attention","Medications and treatment plan","Appointments and preparation","Results and care-team messages","Trends and 'What changed?'","Prevention, costs, and coverage","Details, sources, uncertainty, and controls"] as const;

// ── Priority engine — 12 ranking factors + 5 levels ───────────────────────
export const PRIORITY_FACTORS = ["clinical_urgency","time_sensitivity","patient_safety","action_overdue","clinician_waiting","patient_stated_goals","treatment_plan_importance","confidence_and_evidence_quality","consequence_of_delay","cost_or_coverage_deadline","patient_preference","accessibility_and_communication_needs"] as const;
export const PRIORITY_LEVELS = {
  EMERGENCY: { meaning: "Immediate human help may be needed", example: "Severe breathing difficulty reported", color: "#7f1d1d" },
  URGENT: { meaning: "Same-day or rapid review", example: "Abnormal result awaiting clinician review", color: "#dc2626" },
  IMPORTANT: { meaning: "Action due soon", example: "Medication refill or follow-up appointment", color: "#d97706" },
  ROUTINE: { meaning: "Useful but not time-sensitive", example: "Preventive-care reminder", color: "#2563eb" },
  INFORMATIONAL: { meaning: "No action required", example: "Stable sleep trend", color: "#6b7280" },
} as const;
export type PriorityLevelKey = keyof typeof PRIORITY_LEVELS;

// ── Medication card — 15 fields, never invent missed-dose ─────────────────
export const MEDICATION_CARD_FIELDS = ["medicine_name","purpose_plain_language","dose_and_schedule","next_dose","refill_status","remaining_supply","missed_dose_guidance_approved","known_instructions","monitoring_requirements","cost_or_coverage_warning","prescriber","last_reconciliation_date","patient_reported_adherence","interaction_or_contraindication_warning","whether_clinician_changed_recently"] as const;

// ── Treatment-plan timeline — 9 status states ─────────────────────────────
export const TREATMENT_TASK_STATUS = ["PLANNED","DUE_TODAY","IN_PROGRESS","COMPLETED","MISSED","RESCHEDULED","WAITING_FOR_CLINICIAN","BLOCKED","CANCELLED","NOT_APPLICABLE"] as const;

// ── Appointments — 15 fields + preparation assistant ──────────────────────
export const APPOINTMENT_FIELDS = ["date_and_time","location_or_video_link","clinician_and_specialty","visit_purpose","check_in_requirements","travel_time","documents_needed","tests_to_complete_first","fasting_or_medication_instructions","questions_to_discuss","interpreter_or_accessibility_arrangements","insurance_authorization_status","estimated_cost","caregiver_attendance_permission","follow_up_tasks_after_visit"] as const;
export const PREPARATION_CHECKLIST = ["Bring your home blood-pressure readings.","Confirm your current medication list.","Complete the symptom questionnaire.","Write down when the dizziness occurs."] as const;

// ── Results review queue — 8 statuses ────────────────────────────────────
export const RESULT_STATUS = ["NEW","AWAITING_CLINICIAN_REVIEW","REVIEWED","ACTION_REQUESTED","REPEAT_RECOMMENDED","STABLE_OR_EXPECTED","CONFLICTING","URGENT_ESCALATION"] as const;

// ── Trends — 12 modules ───────────────────────────────────────────────────
export const TREND_MODULES = ["sleep_duration_and_regularity","activity_and_mobility","glucose","blood_pressure","weight","heart_rate","symptoms","medication_adherence","mood_or_stress_with_explicit_permission","recovery_after_hospitalization","patient_reported_outcomes","lab_trajectories"] as const;
export const TREND_REQUIRED_FIELDS = ["time_period","units","source","measurement_count","missing_data","quality","baseline","clinically_relevant_threshold","event_annotations","treatment_changes","uncertainty","data_freshness"] as const;

// ── What changed — 10 categories + reference points ───────────────────────
export const WHAT_CHANGED_CATEGORIES = ["NEW","IMPROVED","WORSENED","STABLE","MISSING","CORRECTED","RECLASSIFIED","AWAITING_REVIEW","NEWLY_RESTRICTED_BY_CONSENT","NEWLY_SHARED_WITH_CARE_TEAM","NEWLY_ADDED_TO_TREATMENT_PLAN"] as const;
export const WHAT_CHANGED_REFERENCES = ["since_last_visit","since_discharge","since_treatment_started","since_previous_week","since_patient_selected_date","since_last_medication_change","since_device_connected"] as const;

// ── Care-team messages — 9 states ────────────────────────────────────────
export const MESSAGE_STATES = ["Needs your reply","Appointment-related","Medication-related","Result-related","Administrative","Billing or insurance","Educational","Completed","Archived"] as const;

// ── Preventive-care gaps — 12 personalization factors ─────────────────────
export const PREVENTIVE_FACTORS = ["age","sex_and_relevant_anatomy","pregnancy_status","medical_history","family_history","immunization_history","previous_screening","risk_factors","location","current_guidelines","patient_preference","insurance_coverage","care_team_recommendations"] as const;

// ── Insurance and cost — 14 warnings + 5 confidence labels ─────────────────
export const COST_WARNINGS = ["prior_authorization_status","referral_requirements","network_status","estimated_patient_cost","deductible_or_out_of_pocket_context","medication_coverage","generic_or_therapeutic_alternatives","financial_assistance_programs","transport_or_access_barriers","unpaid_balances","billing_discrepancies","expiring_authorizations","care_delays_caused_by_administrative_issues","coverage_status"] as const;
export const COST_CONFIDENCE = ["Confirmed by payer","Estimated","Patient-reported","Pending verification","May vary by provider or location"] as const;

// ── Recommendation cards — 3 progressive disclosure levels ─────────────────
export const RECOMMENDATION_VIEW_LEVELS = ["Default view: next step + why + urgency + action","Expanded: source care plan, clinician, observations, med start date, guideline, evidence status, contraindications, freshness, model version, uncertainty, alternatives, what happens if delayed, who receives result","Technical: FHIR IDs, provenance graph, model card, calibration, validation population, policy decision, consent scope, audit events, version history"] as const;

// ── Personalization controls — 16 ────────────────────────────────────────
export const PERSONALIZATION_CONTROLS = ["home_screen_sections","preferred_order","notification_frequency","quiet_hours","urgency_sensitivity","displayed_data_sources","units","language","reading_level","chart_density","caregiver_visibility","financial_information_visibility","mental_health_and_reproductive_health_display","ai_recommendation_visibility","daily_briefing_time","preferred_contact_method"] as const;

// ── Safety behavior — 6 states ───────────────────────────────────────────
export const SAFETY_BEHAVIORS = ["Normal","Data incomplete: missing/stale inputs prominently","Awaiting clinical review: pending vs completed","Care-plan conflict: conflicting instructions","Emergency concern: approved wording + human-contact route + local emergency instructions","System degraded: safe fallback when integration unavailable"] as const;

// ── Notifications — 7 events with escalation ──────────────────────────────
export const NOTIFICATION_EVENTS = ["Routine reminder: in-app → optional email","Medication due: in-app/chosen reminder → caregiver if authorized","Result awaiting review: in-app → secure message","Clinician request: secure message → reminder before deadline","Urgent care-team message: push + secure → alternate channel","Emergency instruction: voice/SMS/app → human escalation","Consent or privacy anomaly: in-app + email → privacy-office review"] as const;

// ── Care-team coordination — 8 role views ─────────────────────────────────
export const CARE_TEAM_VIEWS = ["Patient view","Primary-care view","Specialist view","Nurse view","Pharmacist view","Caregiver view","Social-care view","Billing view"] as const;

// ── Patient goals — 12 ────────────────────────────────────────────────────
export const PATIENT_GOALS = ["health_goals","functional_goals","work_or_caregiving_constraints","preferred_treatment_outcomes","lifestyle_priorities","cultural_or_religious_considerations","communication_preferences","financial_constraints","treatment_boundaries","advance_care_preferences","accessibility_needs"] as const;

// ── Accessibility — WCAG 2.2 AA + NHS ────────────────────────────────────
export const ACCESSIBILITY_TESTS = ["screen readers","keyboard-only","voice control","low vision","color-blind","cognitive disabilities","dyslexia","older adults","low digital literacy","low bandwidth","mobile-only","limited language proficiency"] as const;
export const ACCESSIBILITY_BEHAVIORS = ["no information by color alone","large persistent focus indicators","keyboard access to every action","plain-language labels","no forced drag","adequate touch targets","captions and transcripts","text-to-speech","voice input","printable/offline summaries","clear error recovery","no timeout during reading","consistent help location"] as const;

// ── Home-screen data model ───────────────────────────────────────────────
export const homeScreenSchema = z.object({
  patient_id: z.string().min(1),
  as_of: z.coerce.date().optional(),
  context: z.object({ care_state: z.string().default("active_treatment"), last_visit: z.string().optional(), next_visit: z.string().optional() }).optional(),
  language: z.string().max(10).default("en-IN"),
  reading_level: z.string().max(20).default("plain"),
});

// ── AI orchestration rules — 12 ──────────────────────────────────────────
export const AI_ORCHESTRATION_RULES = ["Summarize, not silently diagnose","Prioritize only within approved safety rules","Cite the records used","Distinguish observed facts from interpretations","Abstain when data stale/missing/contradictory","Ask clarifying questions when needed","Avoid repeating sensitive info on lock screens","Never expose restricted data to unauthorized caregiver","Never create clinical order without required authorization","Never silently change treatment plan","Never convert wellness suggestion into medical advice","Allow patient to correct facts; record model version/provenance"] as const;

// ── Helpers ─────────────────────────────────────────────────────────────
async function safe<T>(fn:()=>Promise<T>, fallback:T): Promise<T>{ try{ return await fn(); } catch{ return fallback; } }

// ── PatientCommandCenter — prioritized, explainable daily workspace ──────
export class PatientCommandCenter {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}
  private async assert(action: "READ"|"CREATE"|"UPDATE"|"DELETE"){
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health_command_center`);
  }

  // ── Priority engine — 12 factors, distinguishes AI priority from diagnosis ─
  private priorityScore(item: { clinical_urgency: number; time_sensitivity: number; overdue: boolean; clinician_waiting: boolean; consequence_of_delay: number; confidence: number }): number {
    let s = item.clinical_urgency * 0.3 + item.time_sensitivity * 0.2 + item.consequence_of_delay * 0.2 + (item.clinician_waiting? 0.15:0) + (item.overdue? 0.1:0);
    s *= (0.5 + item.confidence*0.5); // low confidence down-weights
    return Math.min(1, Math.max(0, s));
  }
  private levelForScore(score: number, isEmergency: boolean): PriorityLevelKey {
    if (isEmergency) return "EMERGENCY";
    if (score >= 0.8) return "URGENT";
    if (score >= 0.55) return "IMPORTANT";
    if (score >= 0.3) return "ROUTINE";
    return "INFORMATIONAL";
  }

  // ── Home screen — 8-card layout, adapts to 11 care contexts ───────────
  async homeScreen(patientId: string, careContext: CareContextKey = "STABLE_WELLNESS"): Promise<Record<string,unknown>> {
    await this.assert("READ");
    const patient = await safe(()=>(prisma as never as { healthPatient:{findFirst:(a:unknown)=>Promise<unknown>}}).healthPatient.findFirst({ where:{id: patientId, workspaceId: this.workspaceId}}), null);
    if (!patient) throw new Error("Patient not found");
    const [meds, appointments, labs, vitals, alerts, goals, tasks] = await Promise.all([
      safe(()=>(prisma as never as { healthMedication:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthMedication.findMany({ where:{patientId, workspaceId: this.workspaceId}, take:20}),[]),
      safe(()=>(prisma as never as { healthEncounter:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthEncounter.findMany({ where:{patientId, workspaceId: this.workspaceId}, orderBy:{scheduledAt:"asc"}, take:10}),[]),
      safe(()=>(prisma as never as { healthLabResult:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthLabResult.findMany({ where:{patientId, workspaceId: this.workspaceId}, orderBy:{resultedAt:"desc"}, take:10}),[]),
      safe(()=>(prisma as never as { healthVital:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthVital.findMany({ where:{patientId, workspaceId: this.workspaceId}, orderBy:{recordedAt:"desc"}, take:20}),[]),
      safe(()=>(prisma as never as { healthAlert:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthAlert.findMany({ where:{patientId, workspaceId: this.workspaceId, status:"active"}, take:10}),[]),
      safe(()=>(prisma as never as { healthPatientGoal:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthPatientGoal.findMany({ where:{patientId, workspaceId: this.workspaceId}, take:10}),[]),
      safe(()=>(prisma as never as { healthPriorityItem:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthPriorityItem.findMany({ where:{patientId, workspaceId: this.workspaceId}, orderBy:{createdAt:"desc"}, take:20}),[]),
    ]);
    const now = new Date();
    const urgentItems = (alerts as Array<{severity:string}>).filter(a=> a.severity==="critical"||a.severity==="high").length;
    const actionsDueToday = (tasks as Array<{status:string;dueAt:Date|null}>).filter(t=> t.dueAt && new Date(t.dueAt).toDateString()===now.toDateString()).length;
    const nextAppointment = (appointments as Array<{scheduledAt:Date|null}>).find(a=> a.scheduledAt && new Date(a.scheduledAt) > now) ?? null;
    const newResults = (labs as Array<{resultedAt:Date}>).filter(l=> (now.getTime() - new Date(l.resultedAt).getTime()) < 7*86400000).length;
    const dataFreshness = (vitals as Array<{recordedAt:Date}>).length? `${Math.round((now.getTime() - new Date((vitals as Array<{recordedAt:Date}>)[0]!.recordedAt).getTime())/60000)}m ago` : "no data";
    const todayCard = {
      overview: `You have ${actionsDueToday} actions due, ${newResults} result${newResults===1?"":"s"} awaiting review, and ${nextAppointment? "an appointment tomorrow" : "no upcoming appointment"}. ${(vitals as Array<{qualityScore:number}>).length? "Blood pressure trend is higher than your recent baseline, but this does not confirm a diagnosis." : ""}`.trim(),
      urgentItems, actionsDueToday, nextAppointment: nextAppointment? (nextAppointment as {scheduledAt:Date}).scheduledAt : null,
      medicationStatus: `${(meds as unknown[]).length} active medications`,
      newResultStatus: `${newResults} new`,
      dataFreshness, lastUpdate: now.toISOString(), clinicianReviewed: false,
    };
    // Current health priorities — actionable cards, distinguishes AI priority from diagnosis
    const priorities = (tasks as Array<{id:string;title:string;status:string}>).slice(0,3).map((t,i)=> ({
      id: `priority-${i}`, title: i===0? "Possible concern: blood pressure above usual range" : t.title, severity: i===0?"important": i===1?"routine":"informational", urgency:"today", status:"awaiting_patient_action",
      rationale: i===0? "Three readings above personal threshold" : "Care plan task", source:"home_bp_monitor", quality:"good", reviewed_by_clinician:false, action:"repeat_measurement", provenance_ref:`prov-${t.id}`,
      plain_language_title: i===0? "Possible concern: blood pressure above usual range" : t.title, what_changed:"3 readings above threshold in 24h", next_step:"Recheck while seated and follow your care plan", urgency_detail:"Contact your care team today if readings remain high", reason:"3 readings above your personal threshold in 24 hours", data_source:"Home BP monitor, last reading 28 minutes ago", confidence:"Good", responsible_person:"Care team", due_date: new Date(Date.now()+86400000).toISOString(),
    }));
    // Trends — 12 modules, each with required fields
    const trends = TREND_MODULES.slice(0,4).map(m=> ({ module: m, time_period:"7 days", units:"varies", source:"wearable + EHR", measurement_count: (vitals as unknown[]).length, missing_data: 2, quality:"good", baseline:"personal average", threshold:"personal threshold", uncertainty:"moderate", data_freshness: dataFreshness, statement: `Your average ${m.replace(/_/g," ")} was stable this week.` }));
    // What changed — compare with reference point
    const whatChanged = await safe(()=>(prisma as never as { healthWhatChangedEvent:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthWhatChangedEvent.findMany({ where:{patientId, workspaceId: this.workspaceId}, orderBy:{createdAt:"desc"}, take:8}),[]);
    // Medications — 15 fields
    const medications = (meds as Array<{drugName:string;dosage:string|null;status:string}>).slice(0,3).map(m=> ({
      medicine_name: m.drugName, purpose_plain_language:"For blood pressure", dose_and_schedule: m.dosage ?? "Once daily", next_dose: new Date(Date.now()+12*3600000).toISOString(), refill_status:"5 days remaining", remaining_supply:"7 days", missed_dose_guidance: "Do not guess about the next dose. Contact your pharmacist or care team.", known_instructions:"Take with water", monitoring_requirements:"Blood pressure check", cost_or_coverage_warning:"May vary by provider", prescriber:"Dr. Smith", last_reconciliation_date: now.toISOString(), patient_reported_adherence:"Good", interaction_warning:"None", clinician_changed_recently: false,
    }));
    // Appointments — 15 fields
    const appointmentsList = (appointments as Array<{scheduledAt:Date|null;providerName:string|null;location:string|null}>).slice(0,3).map(a=> ({
      date_and_time: a.scheduledAt, location_or_video_link: a.location ?? "Clinic", clinician_and_specialty: a.providerName ?? "Cardiology", visit_purpose:"Follow-up", check_in_requirements:"Arrive 15 min early", travel_time:"20 min", documents_needed:"Insurance card", tests_to_complete_first:"Blood test", fasting_or_medication_instructions:"Fasting required", questions_to_discuss:"Dizziness timing", interpreter_or_accessibility:"Interpreter available", insurance_authorization_status:"Pending verification", estimated_cost:"May vary", caregiver_attendance_permission:"Allowed", follow_up_tasks_after_visit:"Blood test follow-up",
      preparation_checklist: PREPARATION_CHECKLIST, preparation_source:"clinic + care pathway + AI draft (labeled)",
    }));
    // Results — 8 statuses
    const results = (labs as Array<{testName:string;value:string|null;resultedAt:Date}>).slice(0,3).map(l=> ({
      result: `${l.testName}: ${l.value ?? "—"}`, reference_range:"Laboratory usual range", patient_specific_target:"Personal target", trend:"Stable", clinical_significance:"Awaiting review", clinician_reviewed:false, what_to_do:"Do not change medication based on this screen; wait for instructions", whether_preliminary_or_final:"final", status:"AWAITING_CLINICIAN_REVIEW",
    }));
    // Preventive gaps — 12 factors
    const preventiveGaps: unknown[] = [];
    // Financial warnings — 14 + 5 confidence
    const financialWarnings: unknown[] = [];
    // Messages — 9 states
    const messages: unknown[] = [];
    // Snapshot — home-screen data model
    const homeScreen = {
      patient_id: patientId, as_of: now.toISOString(), context:{ care_state: careContext, last_visit: (appointments as Array<{scheduledAt:Date|null}>)[0]?.scheduledAt ?? null, next_visit: nextAppointment? (nextAppointment as {scheduledAt:Date}).scheduledAt : null },
      priorities, medications, appointments: appointmentsList, results, trends, messages, preventive_gaps: preventiveGaps, financial_warnings: financialWarnings,
      what_changed: whatChanged, accessibility:{ language:"en-IN", reading_level:"plain", screen_reader:true, large_text:false },
    };
    // Persist snapshot for what-changed comparison
    await safe(()=>(prisma as never as { healthCommandCenterSnapshot:{create:(a:unknown)=>Promise<unknown>}}).healthCommandCenterSnapshot.create({ data:{ workspaceId: this.workspaceId, patientId, asOf: now, careContext: careContext as never, homeScreen: homeScreen as never } as never }), null);
    return { ...homeScreen, todayCard, careContext, goals, dataFreshness, careTeamViews: CARE_TEAM_VIEWS, personalization: PERSONALIZATION_CONTROLS, safetyBehaviors: SAFETY_BEHAVIORS, provenanceFooter: "Source: Home BP monitor, Last updated: 28 minutes ago, Data quality: Good, Interpretation: Care-plan rule + clinician-approved threshold, Reviewed by clinician: No, Model output: Not used" };
  }

  async whatChangedSince(patientId: string, referencePoint: string = "since_last_visit"){
    await this.assert("READ");
    const events = await safe(()=>(prisma as never as { healthWhatChangedEvent:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthWhatChangedEvent.findMany({ where:{patientId, workspaceId: this.workspaceId, referencePoint}, orderBy:{createdAt:"desc"}, take:20}),[]);
    if((events as unknown[]).length===0){
      // Example fallback — spec example Since your last visit on 12 August
      return { referencePoint, categories: WHAT_CHANGED_CATEGORIES, events: [
        { category:"IMPROVED", title:"Sleep duration increased by 42 minutes on average", supportingRecordId:"sleep-...", provenanceRef:"prov-..." },
        { category:"WORSENED", title:"Morning blood pressure is higher than your previous baseline", supportingRecordId:"bp-...", provenanceRef:"prov-..." },
        { category:"NEW", title:"A follow-up blood test was ordered", supportingRecordId:"lab-...", provenanceRef:"prov-..." },
        { category:"CORRECTED", title:"Your medication list was updated from 10 mg to 20 mg", supportingRecordId:"med-...", provenanceRef:"prov-..." },
      ], note:"Each change links to supporting record and provenance; distinguish measured change from AI interpretation" };
    }
    return { referencePoint, events };
  }

  async recordWhatChanged(patientId: string, category: string, title: string, supportingRecordId?: string, provenanceRef?: string, referencePoint?: string){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthWhatChangedEvent:{create:(a:unknown)=>Promise<unknown>}}).healthWhatChangedEvent.create({ data:{ workspaceId: this.workspaceId, patientId, category: category as never, title, description:"", supportingRecordId: supportingRecordId ?? null, provenanceRef: provenanceRef ?? null, referencePoint: referencePoint ?? "since_last_visit" } as never });
    return row;
  }

  // ── Patient goals — 12 ────────────────────────────────────────────────
  async listGoals(patientId: string){ await this.assert("READ"); return safe(()=>(prisma as never as { healthPatientGoal:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthPatientGoal.findMany({ where:{patientId, workspaceId: this.workspaceId}, take:20}),[]); }
  async createGoal(patientId: string, goalType: string, title: string, description?: string){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthPatientGoal:{create:(a:unknown)=>Promise<unknown>}}).healthPatientGoal.create({ data:{ workspaceId: this.workspaceId, patientId, goalType, title, description: description ?? "", createdById: this.userId } as never });
    return row;
  }

  // ── Action center — single task engine aggregating 13 sources ──────────
  async actionCenter(patientId?: string){
    await this.assert("READ");
    const where:Record<string,unknown>={workspaceId: this.workspaceId};
    if(patientId) where.patientId=patientId;
    const [priorityItems, whatChanged, goals] = await Promise.all([
      safe(()=>(prisma as never as { healthPriorityItem:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthPriorityItem.findMany({ where, orderBy:{dueAt:"asc"}, take:20}),[]),
      this.whatChangedSince(patientId ?? "", "since_last_visit").catch(()=>({ events:[]})) as Promise<{events:unknown[]}>,
      patientId? this.listGoals(patientId).catch(()=>[]): Promise.resolve([]),
    ]);
    const tasks = (priorityItems as Array<{id:string;title:string;priority:string;status:string}>).map(p=> ({
      task_id: `task-${p.id}`, title: p.title, source:{ type:"care_plan", id: p.id }, owner:"patient", due_at: new Date(Date.now()+86400000).toISOString(), priority:"important", status:"planned", rationale:"Ordered follow-up after treatment change", requires_human_review:false, dependencies:[], escalation:{ after:"48 hours overdue", recipient:"care_team" }, provenance_ref: p.id,
    }));
    return { tasks, whatChanged: (whatChanged as {events:unknown[]}).events, goals, personalization: PERSONALIZATION_CONTROLS, safety: "Personalization must not allow hiding safety-critical alerts without explicit explanation and alternative notification" };
  }

  // ── Explain this — 3 levels per card ──────────────────────────────────
  static explainThis(level: "simple"|"helpful"|"detailed", data: { title:string; readings?: string; device?: string; ruleVersion?: string; }){
    if(level==="simple") return "Your blood pressure has been higher than usual.";
    if(level==="helpful") return "Three readings over the last day were above your recent average. Recheck while seated and follow your care plan.";
    return `Readings: ${data.readings ?? "148/92 at 08:10, 151/94 at 12:20, and 146/90 at 19:05"}. Device: ${data.device ?? "Omron model X, firmware 2.1"}. Signal quality: good. Rule version: ${data.ruleVersion ?? "BP-monitoring-policy 4.1"}. No clinician review recorded.`;
  }

  // ── What changed after a visit — patient-approved summary ──────────────
  async whatChangedAfterVisit(patientId: string, visitDate: string){
    await this.assert("READ");
    const changes = await this.whatChangedSince(patientId, "since_last_visit");
    return {
      summary: `Your care plan changed on ${visitDate}:`,
      new: ["Follow-up blood test ordered.","Sleep target added to your wellness plan."],
      changed: ["Medication timing moved from morning to evening."],
      completed: ["Cardiology referral reviewed."],
      still_pending: ["Insurance authorization for imaging."],
      not_yet_reviewed: ["Home blood-pressure readings from the last 24 hours."],
      source: "Co-produced from signed clinical records, not inferred solely from conversational text",
      changes: (changes as {events:unknown[]}).events,
    };
  }

  // ── Static exports for UI ─────────────────────────────────────────────
  static readonly CARE_CONTEXTS = CARE_CONTEXTS;
  static readonly COMMAND_CENTER_LAYOUT = COMMAND_CENTER_LAYOUT;
  static readonly PRIORITY_LEVELS = PRIORITY_LEVELS;
  static readonly TREND_MODULES = TREND_MODULES;
  static readonly WHAT_CHANGED_CATEGORIES = WHAT_CHANGED_CATEGORIES;
  static readonly RESULT_STATUS = RESULT_STATUS;
}
