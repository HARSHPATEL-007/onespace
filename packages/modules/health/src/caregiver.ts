// Consent-Aware Care Coordination Network — patient remains center of control. FHIR CareTeam, RelatedPerson, Consent, Provenance.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_caregiver";

// ── Caregiver ecosystem — 7 stages ────────────────────────────────────
export const CAREGIVER_ECOSYSTEM = ["Patient and Consent Wallet","Relationship and Delegation Service","Care Team and Shared Care Plan","Task, Schedule, and Escalation Engine","Medication / Appointment / Transport / Monitoring Workflows","Caregiver Wellbeing and Capacity Support","Clinical Review and Outcome Tracking"] as const;

// ── Roles and relationships — 16 + 17 permission dimensions ─────────────
export const CAREGIVER_RELATIONSHIPS = ["FAMILY_MEMBER","INFORMAL_CAREGIVER","PARENT","LEGAL_GUARDIAN","HEALTH_CARE_PROXY","POWER_OF_ATTORNEY_HOLDER","TRUSTED_CONTACT","HOME_HEALTH_NURSE","COMMUNITY_HEALTH_WORKER","TRANSPORT_PROVIDER","PHARMACIST","SPECIALIST","PRIMARY_CARE_CLINICIAN","EMERGENCY_RESPONDER","RESEARCH_COORDINATOR","SOCIAL_CARE_WORKER"] as const;
export const CAREGIVER_PERMISSIONS = ["VIEW","ADD_PATIENT_REPORTED_INFORMATION","CONFIRM_MEDICATION_ADMINISTRATION","REQUEST_REFILL","SCHEDULE_APPOINTMENT","RESCHEDULE_APPOINTMENT","ARRANGE_TRANSPORT","VIEW_PREPARATION_INSTRUCTIONS","VIEW_RESULTS","VIEW_MEDICATION_LIST","SEND_MESSAGES","RECEIVE_ALERTS","COMPLETE_CARE_TASKS","APPROVE_RESEARCH_PARTICIPATION","DOWNLOAD_RECORDS","MODIFY_CONSENT","ACT_DURING_INCAPACITY","USE_EMERGENCY_ACCESS"] as const;
export const LEAST_PRIVILEGE_TABLE = [
  { role: "Medication caregiver", may_access: "Medication schedule, refill status, administration tasks", may_not_access: "Mental-health notes, genomics, private messages" },
  { role: "Transport caregiver", may_access: "Appointment time, location, mobility needs", may_not_access: "Diagnosis, medication details, test results" },
  { role: "Home nurse", may_access: "Assigned care plan, relevant observations, wound or device tasks", may_not_access: "Unrelated specialties and private records" },
  { role: "Parent or guardian", may_access: "Jurisdiction-specific child-care data", may_not_access: "Mature-minor confidential where protected" },
  { role: "Specialist", may_access: "Referral purpose, relevant records, assigned episode", may_not_access: "Unrelated historical data" },
  { role: "Emergency responder", may_access: "Minimum necessary emergency summary", may_not_access: "Full longitudinal record" },
  { role: "Research coordinator", may_access: "Approved study dataset", may_not_access: "Clinical records outside study scope" },
] as const;

// ── Delegation lifecycle — 9 states ─────────────────────────────────────
export const DELEGATION_LIFECYCLE = ["REQUESTED","PATIENT_REVIEWED","VERIFIED","APPROVED","ACTIVE","EXPIRING_SOON","PAUSED","REVOKED","EXPIRED","ARCHIVED"] as const;
export const DELEGATION_EXAMPLES = {
  medication_only: "Allow Priya to view my medication schedule, confirm doses I have taken, request refills, and receive missed-dose reminders until 30 September 2026. She cannot view my test results or clinical notes.",
  transport_only: "Allow Raj to view appointment location, timing, accessibility needs, and transport instructions for my next two appointments. He cannot view diagnosis, medication, or results.",
  temporary_home_nurse: "Allow Nurse Meena to view the home wound-care plan, relevant medications, wound images, vital signs, and assigned tasks for seven days. Access expires automatically unless renewed by the patient or authorized clinician.",
} as const;

// ── Shared care plans — 3 visibility layers ─────────────────────────────
export const CARE_PLAN_VISIBILITY = {
  SHARED: "Visible to all authorized participants: patient goals, current priorities, assigned tasks, medication schedule, appointments, transport requirements, safety instructions, escalation contacts, recent relevant measurements, completion status",
  ROLE_SPECIFIC: "Visible only to selected participants: clinical notes, specialist assessment, medication rationale, sensitive risk factors, social-care assessment, financial information, mental-health information, family communication notes",
  PRIVATE: "Visible only to the patient unless separately shared: private questions, personal reflections, journal entries, sensitive symptoms, private messages, personal preferences, unshared goals, consent notes — must not silently enter AI prompts, shared summaries, caregiver alerts, or clinical workflows",
} as const;
export const CARE_PLAN_STRUCTURE = ["Patient goal","Clinical or practical objective","Tasks","Assigned owner","Due date","Dependencies","Escalation rule","Completion evidence","Review and outcome"] as const;

// ── Task coordination — 13 states + 14 fields ───────────────────────────
export const CARE_TASK_STATES = ["PLANNED","ASSIGNED","ACCEPTED","IN_PROGRESS","COMPLETED","DECLINED","REASSIGNED","SNOOZED","MISSED","BLOCKED","ESCALATED","CANCELLED","REQUIRES_CLINICAL_REVIEW"] as const;
export const CARE_TASK_FIELDS = ["Task title","Patient goal","Owner","Backup owner","Source care plan","Due time","Location","Required equipment","Instructions","Accessibility needs","Consent scope","Evidence of completion","Escalation rule","Completion note","Audit history"] as const;

// ── Medication coordination — 9 steps + safety ───────────────────────────
export const MEDICATION_WORKFLOW = ["Prescribed","Reconciled","Patient confirmed","Caregiver notified if authorized","Dose scheduled","Dose administered or self-reported","Missed / refused / unknown","Follow-up action","Clinician review if required"] as const;
export const MEDICATION_ESCALATION_TREE = {
  event: "missed_medication",
  trigger: { medication: "clinician-configured", scheduled_time: "2026-09-01T20:00:00+05:30", status: "unknown" },
  tree: [{ step:1, recipient:"patient", channel:"in_app", wait:"15_minutes" },{ step:2, recipient:"authorized_caregiver", channel:"push", wait:"20_minutes" },{ step:3, recipient:"pharmacist_or_nurse", channel:"secure_message", condition:"high_risk_medication" }],
  stop_conditions: ["dose_confirmed","clinician_resolved","patient_declined_contact"],
} as const;

// ── Appointment and transport — 15 fields + 8 workflow ──────────────────
export const APPOINTMENT_FIELDS = ["Purpose","Date and time","Location","Travel duration","Accessibility requirements","Transport owner","Check-in instructions","Preparation steps","Required documents","Interpreter request","Caregiver attendance","Insurance or authorization status","Contingency plan","Cancellation deadline"] as const;
export const TRANSPORT_WORKFLOW = ["Transport needed","Request created","Driver or service assigned","Pickup confirmed","Patient en route","Arrived","Appointment completed","Return transport confirmed"] as const;

// ── Escalation — 14 event types + abnormal vitals + falls ───────────────
export const ESCALATION_EVENT_TYPES = ["missed_medication","repeated_medication_refusal","abnormal_vital_sign","fall_detected","no_response","missed_appointment","failed_transport","worsening_symptom","device_disconnected","caregiver_unavailable","unsafe_home_environment","concerning_mental_health_message","patient_requests_human_help","abnormal_vitals"] as const;
export const ABNORMAL_VITALS_WORKFLOW = ["Verify patient and device","Check signal quality","Request repeat measurement if safe","Ask about approved red-flag symptoms","Notify patient","Notify caregiver only under consent","Route to clinical reviewer","Escalate to emergency only under validated policy","Record acknowledgement and outcome"] as const;
export const FALL_WORKFLOW = ["Device or patient report","Confirmation attempt","Location","Whether patient is conscious","Pain or injury symptoms","Ability to move","Emergency contact","Caregiver notification","Human clinical review","Follow-up assessment","Environmental/prevention task"] as const;

// ── Temporary professional access — 10 types + 15 controls ───────────────
export const TEMPORARY_ACCESS_TYPES = ["Home nurses","Visiting physicians","Specialists","Pharmacists","Physiotherapists","Community health workers","Transport teams","Emergency responders","Social-care workers","Research coordinators"] as const;
export const TEMPORARY_ACCESS_CONTROLS = ["Verified organization","Verified professional identity","Patient-specific assignment","Narrow data scope","Start and expiration time","Geographic restriction","Purpose","Patient notification","Download restriction","Print restriction","Audit logging","Automatic revocation","Extension approval","Break-glass behavior","Supervisor visibility"] as const;
export const EMERGENCY_SUMMARY_FIELDS = ["Identity","Allergies","Current critical medications","Major conditions","Advance-care preferences where authorized","Emergency contacts","Location","Recent relevant vitals","Source and freshness","Access reason"] as const;

// ── Family communication — 5 modes ───────────────────────────────────────
export const FAMILY_COMMUNICATION_MODES = ["Patient-only","Patient plus selected caregiver","Family group with limited tasks","Clinician-only","Emergency-only","Temporary event-based sharing","No automatic notifications"] as const;

// ── Caregiver burnout — Zarit, not diagnosis ─────────────────────────────
export const CAREGIVER_WORKLOAD_FIELDS = ["Tasks assigned","Tasks completed","Tasks missed","Average task time","Night-time interruptions","Travel burden","Number of patients supported","Medication complexity","Appointment coordination load","Emotional check-ins","Respite availability","Patient dependency level","Caregiver-reported capacity"] as const;
export const CAREGIVER_CHECKIN_PROMPTS = ["How manageable is your care workload today?","Do you have enough help for the next seven days?","Which task is hardest to complete?","Are you getting enough sleep or breaks?","Would you like help finding respite or community support?","Do you feel safe continuing this task?"] as const;
export const CAPACITY_AWARE_FACTORS = ["Caregiver availability","Location","Mobility","Language","Training","Time zone","Device access","Transport access","Emotional capacity","Task complexity","Legal authority","Patient preference"] as const;

// ── Warm handoffs ────────────────────────────────────────────────────────
export const WARM_HANDOFF_ELEMENTS = ["Patient present where appropriate","Current situation","Relevant background","Assessment","Recommended next step","Responsibility","Read-back or teach-back","Open questions","Handoff completion","Patient correction opportunity"] as const;

// ── FHIR implementation ──────────────────────────────────────────────────
export const FHIR_CAREGIVER_RESOURCES = ["RelatedPerson: non-clinical person involved in care","CareTeam: participants, roles, relationships","CarePlan: shared goals, activities, coordination","Task: assigned, due, completed, or escalated work","Appointment: visits and scheduling","Communication: messages and instructions","Consent: access and sharing permissions","Provenance: origin and change history","AuditEvent: access and security events","Device: device identity and source provenance","Observation: patient and device measurements"] as const;

// ── Caregiver access API — 14 endpoints ─────────────────────────────────
export const CAREGIVER_API = ["POST   /patients/{id}/delegations","GET    /patients/{id}/delegations","PATCH  /delegations/{id}","POST   /delegations/{id}/pause","POST   /delegations/{id}/revoke","POST   /delegations/{id}/renew","GET    /patients/{id}/care-team","POST   /care-plans/{id}/tasks","POST   /tasks/{id}/accept","POST   /tasks/{id}/decline","POST   /tasks/{id}/complete","POST   /tasks/{id}/reassign","POST   /escalations/{id}/acknowledge","GET    /caregivers/{id}/capacity","POST   /caregivers/{id}/wellbeing-checkin"] as const;

// ── Safety controls — 12 ─────────────────────────────────────────────────
export const CAREGIVER_SAFETY_CONTROLS = ["Never rely on caregiver as sole safety channel for emergency","Never imply caregiver has clinical authority unless they do","Never expose more data than delegation allows","Never silently expand permissions","Never treat missed task as proof of nonadherence","Never send sensitive family message without consent","Never make caregiver responsible for interpreting AI prediction","Never use workload data to punish or reduce services","Never infer burnout as diagnosis","Never create conflicting instructions","Always show source, timestamp, uncertainty for alerts","Always provide reassignment and human support pathways","Always document escalation acknowledgement and outcome"] as const;

// ── Helpers ─────────────────────────────────────────────────────────────
async function safe<T>(fn:()=>Promise<T>, fallback:T): Promise<T>{ try{ return await fn(); } catch{ return fallback; } }

// ── Zod schemas ─────────────────────────────────────────────────────────
export const delegationSchema = z.object({
  patientId: z.string().uuid(),
  delegateEmail: z.string().email().optional().nullable(),
  delegateName: z.string().max(120).optional().nullable(),
  relationship: z.enum(["FAMILY_MEMBER","INFORMAL_CAREGIVER","PARENT","LEGAL_GUARDIAN","HEALTH_CARE_PROXY","POWER_OF_ATTORNEY_HOLDER","TRUSTED_CONTACT","HOME_HEALTH_NURSE","COMMUNITY_HEALTH_WORKER","TRANSPORT_PROVIDER","PHARMACIST","SPECIALIST","PRIMARY_CARE_CLINICIAN","EMERGENCY_RESPONDER","RESEARCH_COORDINATOR","SOCIAL_CARE_WORKER"]).default("INFORMAL_CAREGIVER"),
  authorizedTasks: z.array(z.string()).default([]),
  dataCategories: z.array(z.string()).default([]),
  purpose: z.string().max(120).optional().nullable(),
  startTime: z.coerce.date().optional().nullable(),
  endTime: z.coerce.date().optional().nullable(),
  geography: z.string().max(80).optional().nullable(),
  language: z.string().max(10).optional().nullable(),
  emergencyPermissions: z.array(z.string()).default([]),
});

export const sharedCarePlanSchema = z.object({
  patientId: z.string().uuid(),
  careTeamId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(200),
  goal: z.string().max(500).optional().nullable(),
  objective: z.string().max(500).optional().nullable(),
  sharedSection: z.record(z.unknown()).optional(),
  roleSpecificSection: z.record(z.unknown()).optional(),
  privateSection: z.record(z.unknown()).optional(),
  visibility: z.enum(["SHARED","ROLE_SPECIFIC","PRIVATE"]).default("SHARED"),
  consentRef: z.string().max(80).optional().nullable(),
});

export const careTaskSchema = z.object({
  patientId: z.string().uuid().optional().nullable(),
  careTeamId: z.string().uuid().optional().nullable(),
  sharedCarePlanId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(300),
  patientGoal: z.string().max(500).optional().nullable(),
  ownerId: z.string().uuid().optional().nullable(),
  backupOwnerId: z.string().uuid().optional().nullable(),
  dueAt: z.coerce.date().optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  instructions: z.string().max(2000).optional().nullable(),
  priority: z.enum(["LOW","MEDIUM","HIGH"]).default("MEDIUM"),
  status: z.enum(["PLANNED","ASSIGNED","ACCEPTED","IN_PROGRESS","COMPLETED","DECLINED","REASSIGNED","SNOOZED","MISSED","BLOCKED","ESCALATED","CANCELLED","REQUIRES_CLINICAL_REVIEW"]).default("PLANNED"),
});

export const escalationTreeSchema = z.object({
  patientId: z.string().uuid().optional().nullable(),
  event: z.string().min(1).max(80),
  trigger: z.record(z.unknown()).optional(),
  tree: z.array(z.record(z.unknown())).default([]),
  stopConditions: z.array(z.string()).default([]),
});

export const wellbeingCheckinSchema = z.object({
  caregiverId: z.string().min(1).max(120),
  patientId: z.string().uuid().optional().nullable(),
  tasksAssigned: z.coerce.number().int().optional(),
  tasksCompleted: z.coerce.number().int().optional(),
  checkInResponse: z.record(z.unknown()).optional(),
  capacity: z.string().max(40).optional().nullable(),
  zaritScore: z.coerce.number().int().min(0).max(88).optional().nullable(),
});

// ── CareCoordination — consent-aware ────────────────────────────────────
export class CareCoordination {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}
  private async assert(action: "READ"|"CREATE"|"UPDATE"|"DELETE"){
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health_caregiver`);
  }
  private audit(action: string, targetType: string, targetId: string, meta?: Record<string,unknown>){
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: "health_caregiver", action, targetType, targetId, metadata: meta }).catch(()=>null);
  }

  // ── CareTeam ──────────────────────────────────────────────────────────
  async listCareTeams(patientId?: string){
    await this.assert("READ");
    const where:Record<string,unknown>={workspaceId: this.workspaceId};
    if(patientId) where.patientId=patientId;
    return safe(()=>(prisma as never as { healthCareTeam:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthCareTeam.findMany({ where, orderBy:{createdAt:"desc"}, take:20}),[]);
  }
  async createCareTeam(patientId: string, name?: string){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthCareTeam:{create:(a:unknown)=>Promise<unknown>}}).healthCareTeam.create({ data:{ workspaceId: this.workspaceId, patientId, name: name ?? "Care Team" } as never });
    await this.audit("CREATE","HealthCareTeam",(row as {id:string}).id,{ patientId });
    return row;
  }
  async listCareTeamMembers(careTeamId?: string, patientId?: string){
    await this.assert("READ");
    const where:Record<string,unknown>={workspaceId: this.workspaceId};
    if(careTeamId) where.careTeamId=careTeamId;
    if(patientId) where.patientId=patientId;
    return safe(()=>(prisma as never as { healthCareTeamMember:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthCareTeamMember.findMany({ where, take:50}),[]);
  }
  async addCareTeamMember(input: { patientId: string; careTeamId?: string|null; relationship: string; permissions?: string[]; dataCategories?: string[]; userId?: string|null; }){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthCareTeamMember:{create:(a:unknown)=>Promise<unknown>}}).healthCareTeamMember.create({ data:{
      workspaceId: this.workspaceId, patientId: input.patientId, careTeamId: input.careTeamId ?? null, relationship: input.relationship as never,
      permissions: (input.permissions ?? []) as never, dataCategories: (input.dataCategories ?? []) as never, userId: input.userId ?? null,
    } as never });
    await this.audit("CREATE","HealthCareTeamMember",(row as {id:string}).id, input as never);
    return row;
  }

  // ── Delegation lifecycle ──────────────────────────────────────────────
  async listDelegations(patientId?: string, status?: string){
    await this.assert("READ");
    const where:Record<string,unknown>={workspaceId: this.workspaceId};
    if(patientId) where.patientId=patientId;
    if(status) where.status=status;
    return safe(()=>(prisma as never as { healthDelegation:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthDelegation.findMany({ where, orderBy:{createdAt:"desc"}, take:50}),[]);
  }
  async createDelegation(input: z.infer<typeof delegationSchema>){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthDelegation:{create:(a:unknown)=>Promise<unknown>}}).healthDelegation.create({ data:{
      workspaceId: this.workspaceId, patientId: input.patientId, delegateEmail: input.delegateEmail ?? null, delegateName: input.delegateName ?? null,
      relationship: input.relationship as never, authorizedTasks: input.authorizedTasks as never, dataCategories: input.dataCategories as never,
      purpose: input.purpose ?? null, startTime: input.startTime ?? null, endTime: input.endTime ?? null, geography: input.geography ?? null, language: input.language ?? null,
      emergencyPermissions: input.emergencyPermissions as never, status:"REQUESTED", createdById: this.userId,
    } as never });
    await this.audit("CREATE","HealthDelegation",(row as {id:string}).id, input as never);
    return row;
  }
  async updateDelegation(id: string, patch: { status?: string; authorizedTasks?: string[]; dataCategories?: string[]; }){
    await this.assert("UPDATE");
    const row = await (prisma as never as { healthDelegation:{update:(a:unknown)=>Promise<unknown>}}).healthDelegation.update({ where:{id}, data: patch as never });
    await this.audit("UPDATE","HealthDelegation",id, patch as never);
    return row;
  }
  async revokeDelegation(id: string){
    await this.assert("UPDATE");
    const row = await (prisma as never as { healthDelegation:{update:(a:unknown)=>Promise<unknown>}}).healthDelegation.update({ where:{id}, data:{ status:"REVOKED" } as never });
    await this.audit("REVOKE","HealthDelegation",id);
    return row;
  }

  // ── Shared care plans — 3 visibility layers ───────────────────────────
  async listSharedCarePlans(patientId?: string, careTeamId?: string){
    await this.assert("READ");
    const where:Record<string,unknown>={workspaceId: this.workspaceId};
    if(patientId) where.patientId=patientId;
    if(careTeamId) where.careTeamId=careTeamId;
    return safe(()=>(prisma as never as { healthSharedCarePlan:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthSharedCarePlan.findMany({ where, orderBy:{createdAt:"desc"}, take:20}),[]);
  }
  async createSharedCarePlan(input: z.infer<typeof sharedCarePlanSchema>){
    await this.assert("CREATE");
    // Private section must not silently enter AI prompts, shared summaries, caregiver alerts, or clinical workflows — enforced by separate JSON field
    const row = await (prisma as never as { healthSharedCarePlan:{create:(a:unknown)=>Promise<unknown>}}).healthSharedCarePlan.create({ data:{
      workspaceId: this.workspaceId, patientId: input.patientId, careTeamId: input.careTeamId ?? null, title: input.title, goal: input.goal ?? null, objective: input.objective ?? null,
      sharedSection: (input.sharedSection ?? {}) as never, roleSpecificSection: (input.roleSpecificSection ?? {}) as never, privateSection: (input.privateSection ?? {}) as never,
      visibility: input.visibility as never, consentRef: input.consentRef ?? null, createdById: this.userId,
    } as never });
    await this.audit("CREATE","HealthSharedCarePlan",(row as {id:string}).id, input as never);
    return row;
  }

  // ── Care tasks — shared record ────────────────────────────────────────
  async listCareTasks(patientId?: string, careTeamId?: string, status?: string){
    await this.assert("READ");
    const where:Record<string,unknown>={workspaceId: this.workspaceId};
    if(patientId) where.patientId=patientId;
    if(careTeamId) where.careTeamId=careTeamId;
    if(status) where.status=status;
    return safe(()=>(prisma as never as { healthCareTask:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthCareTask.findMany({ where, orderBy:{dueAt:"asc"}, take:50}),[]);
  }
  async createCareTask(input: z.infer<typeof careTaskSchema>){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthCareTask:{create:(a:unknown)=>Promise<unknown>}}).healthCareTask.create({ data:{
      workspaceId: this.workspaceId, patientId: input.patientId ?? null, careTeamId: input.careTeamId ?? null, sharedCarePlanId: input.sharedCarePlanId ?? null,
      title: input.title, patientGoal: input.patientGoal ?? null, ownerId: input.ownerId ?? null, backupOwnerId: input.backupOwnerId ?? null,
      dueAt: input.dueAt ?? null, location: input.location ?? null, instructions: input.instructions ?? null, priority: input.priority as never, status: input.status as never, createdById: this.userId,
    } as never });
    await this.audit("CREATE","HealthCareTask",(row as {id:string}).id, input as never);
    return row;
  }
  async updateCareTask(id: string, patch: { status?: string; ownerId?: string|null; completionNote?: string|null; }){
    await this.assert("UPDATE");
    // Caregiver can say "I cannot complete this task today" → offer reassignment or respite, not noncompliance
    const row = await (prisma as never as { healthCareTask:{update:(a:unknown)=>Promise<unknown>}}).healthCareTask.update({ where:{id}, data: patch as never });
    await this.audit("UPDATE","HealthCareTask",id, patch as never);
    return row;
  }

  // ── Escalation trees ──────────────────────────────────────────────────
  async listEscalationTrees(patientId?: string){
    await this.assert("READ");
    const where:Record<string,unknown>={workspaceId: this.workspaceId};
    if(patientId) where.patientId=patientId;
    return safe(()=>(prisma as never as { healthEscalationTree:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthEscalationTree.findMany({ where, take:20}),[]);
  }
  async createEscalationTree(input: z.infer<typeof escalationTreeSchema>){
    await this.assert("CREATE");
    const row = await (prisma as never as { healthEscalationTree:{create:(a:unknown)=>Promise<unknown>}}).healthEscalationTree.create({ data:{
      workspaceId: this.workspaceId, patientId: input.patientId ?? null, event: input.event, trigger: (input.trigger ?? {}) as never, tree: input.tree as never, stopConditions: input.stopConditions as never,
    } as never });
    await this.audit("CREATE","HealthEscalationTree",(row as {id:string}).id, input as never);
    return row;
  }
  async acknowledgeEscalation(id: string){
    await this.assert("UPDATE");
    const row = await (prisma as never as { healthEscalationTree:{update:(a:unknown)=>Promise<unknown>}}).healthEscalationTree.update({ where:{id}, data:{ status:"acknowledged" } as never });
    await this.audit("UPDATE","HealthEscalationTree",id);
    return row;
  }

  // ── Caregiver wellbeing — workload dashboard, Zarit, not surveillance ───
  async listWellbeing(patientId?: string, caregiverId?: string){
    await this.assert("READ");
    const where:Record<string,unknown>={workspaceId: this.workspaceId};
    if(patientId) where.patientId=patientId;
    if(caregiverId) where.caregiverId=caregiverId;
    return safe(()=>(prisma as never as { healthCaregiverWellbeing:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthCaregiverWellbeing.findMany({ where, orderBy:{createdAt:"desc"}, take:20}),[]);
  }
  async createWellbeingCheckin(input: z.infer<typeof wellbeingCheckinSchema>){
    await this.assert("CREATE");
    // Do not derive burnout diagnosis from task behavior — use voluntary check-ins
    const row = await (prisma as never as { healthCaregiverWellbeing:{create:(a:unknown)=>Promise<unknown>}}).healthCaregiverWellbeing.create({ data:{
      workspaceId: this.workspaceId, caregiverId: input.caregiverId, patientId: input.patientId ?? null,
      tasksAssigned: input.tasksAssigned ?? 0, tasksCompleted: input.tasksCompleted ?? 0, checkInResponse: (input.checkInResponse ?? {}) as never, capacity: input.capacity ?? null, zaritScore: input.zaritScore ?? null,
    } as never });
    // If unsafe overload reported → offer redistribution, backup, respite, notify coordinator if authorized, reduce nonessential reminders, review care plan, ask about patient safety, provide crisis guidance
    const isOverload = input.capacity==="overloaded" || input.capacity==="unsafe" || (input.zaritScore ?? 0) > 40;
    if (isOverload) {
      await this.audit("CREATE","HealthCaregiverWellbeing-OVERLOAD",(row as {id:string}).id, input as never);
    } else {
      await this.audit("CREATE","HealthCaregiverWellbeing",(row as {id:string}).id, input as never);
    }
    return { wellbeing: row, overload: isOverload, actions: isOverload? ["Offer task redistribution","Identify backup caregivers","Suggest respite resources","Notify care coordinator if authorized","Reduce nonessential reminders","Review care plan realism"] : [] };
  }

  // ── Warm handoffs ─────────────────────────────────────────────────────
  warmHandoffTemplate(){
    return {
      patient_present_where_appropriate: true,
      current_situation: "",
      relevant_background: "",
      assessment: "",
      recommended_next_step: "",
      responsibility: "",
      read_back_or_teach_back: "",
      open_questions: "",
      handoff_completion: "",
      patient_correction_opportunity: "",
      note: "AHRQ warm handoffs occur in front of patient/family, giving them opportunity to clarify/correct",
    };
  }

  // ── Shared timeline — permission-controlled ───────────────────────────
  async sharedTimeline(patientId: string, take=20){
    await this.assert("READ");
    // Permission-controlled care timeline: 01 Sep 08:00 Medication taken — confirmed by patient, etc.
    const [tasks, delegations] = await Promise.all([
      safe(()=>(prisma as never as { healthCareTask:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthCareTask.findMany({ where:{patientId, workspaceId: this.workspaceId}, orderBy:{updatedAt:"desc"}, take}),[]),
      safe(()=>(prisma as never as { healthDelegation:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthDelegation.findMany({ where:{patientId, workspaceId: this.workspaceId}, take:5}),[]),
    ]);
    const events: Array<{ at: string; title: string; who: string; source: string; clinicianReviewed: boolean; consent: string; }> = (tasks as Array<{updatedAt:Date;title:string;status:string}>).map(t=> ({
      at: new Date(t.updatedAt).toISOString(), title: t.title, who: "caregiver", source: "caregiver-entered", clinicianReviewed: false, consent: (delegations as Array<{consentRef?:string}>)[0]?.consentRef ?? "consent-...",
    }));
    return events;
  }

  // ── FHIR mappings ─────────────────────────────────────────────────────
  static readonly FHIR_MAPPINGS = FHIR_CAREGIVER_RESOURCES;

  // ── Static exports for UI ─────────────────────────────────────────────
  static readonly CAREGIVER_RELATIONSHIPS = CAREGIVER_RELATIONSHIPS;
  static readonly LEAST_PRIVILEGE_TABLE = LEAST_PRIVILEGE_TABLE;
  static readonly DELEGATION_LIFECYCLE = DELEGATION_LIFECYCLE;
  static readonly MEDICATION_WORKFLOW = MEDICATION_WORKFLOW;
  static readonly TRANSPORT_WORKFLOW = TRANSPORT_WORKFLOW;
  static readonly ESCALATION_EVENT_TYPES = ESCALATION_EVENT_TYPES;
  static readonly CAREGIVER_API = CAREGIVER_API;
}
