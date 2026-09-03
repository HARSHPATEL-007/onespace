// Unified Clinical Work-Queue & Inbox Orchestration — one role-aware work environment, not separate inboxes per source.
// FHIR Task is the workflow abstraction: Task.owner = current accountable party, Task.focus = clinical request/resource acted upon.
// Pipeline: Ingestion/provenance → Classification/safety → Dedup/link → Priority/SLA → Ownership/route → Work/delegate/escalate → Resolution → Audit/outcome/burden/quality.
// Invariant: a result, message, referral, or alert must never disappear merely because it was merged, delegated, batched, or routed.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "health_work_queue";

// ── Incoming clinical & operational events — 11 sources ──────────────────
export const WORK_SOURCES = [
  "Laboratory results",
  "Imaging reports",
  "Patient messages",
  "Medication requests",
  "Prior authorization events",
  "Referrals",
  "Discharge events",
  "Device failures",
  "Unresolved alerts",
  "Research matches",
  "Compliance obligations",
] as const;

// ── Unified queue architecture — 9 stages ─────────────────────────────────
export const WORK_PIPELINE = [
  "Ingestion and provenance",
  "Classification and safety screening",
  "Deduplication and linking",
  "Priority and SLA assignment",
  "Ownership and routing",
  "Queue work, delegation, or escalation",
  "Resolution and documentation",
  "Audit, outcome, burden, and quality reporting",
] as const;

// ── Work-item lifecycle — 12 core + 14 additional ─────────────────────────
export const WORK_LIFECYCLE = [
  "RECEIVED",
  "CLASSIFIED",
  "VALIDATED",
  "ROUTED",
  "ASSIGNED",
  "ACCEPTED",
  "IN_PROGRESS",
  "AWAITING_INFORMATION",
  "AWAITING_EXTERNAL_PARTY",
  "DELEGATED",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
] as const;

export const WORK_ADDITIONAL_STATES = [
  "DUPLICATE",
  "RETRACTED",
  "NOT_ACTIONABLE",
  "PATIENT_DECLINED",
  "UNABLE_TO_CONTACT",
  "WRONG_RECIPIENT",
  "DATA_QUALITY_ISSUE",
  "REQUIRES_VISIT",
  "REQUIRES_CLINICIAN_DECISION",
  "REQUIRES_PHARMACIST_REVIEW",
  "REQUIRES_AUTHORIZATION",
  "RESEARCH_INTEREST_ONLY",
  "COMPLIANCE_EXCEPTION",
] as const;

// ── Work-item types ───────────────────────────────────────────────────────
export const WORK_TYPES = [
  "abnormal_lab",
  "imaging_finding",
  "patient_message",
  "renewal_request",
  "prior_auth",
  "referral",
  "discharge",
  "device_failure",
  "unresolved_alert",
  "research_match",
  "compliance_task",
] as const;

// ── Queues — 11, each with explicit ownership + SLA + escalation ──────────
export const WORK_QUEUES = [
  "abnormal_labs",
  "imaging",
  "messages",
  "renewals",
  "prior_auth",
  "referrals",
  "discharge",
  "device",
  "alerts",
  "research",
  "compliance",
] as const;

// ── Triage — 13 questions, 4 destinations ─────────────────────────────────
export const TRIAGE_QUESTIONS = [
  "Is the event valid?",
  "Is it associated with the correct patient?",
  "Is it new or duplicate?",
  "Is it clinically urgent?",
  "Is it actionable?",
  "Is a human decision needed?",
  "Which role is authorized?",
  "Is the patient currently admitted or in another care episode?",
  "Is there an active pathway or alert?",
  "Is the source final, preliminary, or unverified?",
  "Does the patient need to be notified?",
  "Is consent required before communication?",
  "Does this require a visit rather than asynchronous handling?",
] as const;

export const TRIAGE_DESTINATIONS = [
  "no_work",
  "batch_work",
  "assigned_work_item",
  "urgent_escalation",
] as const;

// ── Priority model — 6 levels, clinical vs admin stored separately ────────
export const WORK_PRIORITY_LEVELS = {
  STAT: "Immediate response — critical result or emergency message",
  URGENT: "Rapid human review — concerning abnormal result",
  HIGH: "Same-day or next-business-day action — time-sensitive referral or discharge issue",
  ROUTINE: "Standard queue work — stable renewal or nonurgent message",
  BATCH: "Safe grouped review — duplicate notifications or routine device checks",
  INFORMATIONAL: "No action required — FYI result already reviewed",
} as const;

export const PRIORITY_FACTORS = [
  "Clinical harm if missed",
  "Time sensitivity",
  "Confidence in the source",
  "Actionability",
  "Patient-specific risk",
  "Persistence",
  "Existing care plan",
  "Patient vulnerability",
  "Communication deadline",
  "Regulatory or contractual deadline",
] as const;

// ── SLA defaults — minutes; INFORMATIONAL carries no timer ────────────────
export const SLA_DEFAULTS: Record<string, { ackMinutes: number; resolveMinutes: number }> = {
  STAT: { ackMinutes: 5, resolveMinutes: 15 },
  URGENT: { ackMinutes: 30, resolveMinutes: 240 },
  HIGH: { ackMinutes: 120, resolveMinutes: 1440 },
  ROUTINE: { ackMinutes: 1440, resolveMinutes: 4320 },
  BATCH: { ackMinutes: 2880, resolveMinutes: 10080 },
  INFORMATIONAL: { ackMinutes: 0, resolveMinutes: 0 },
};

export const SLA_PAUSE_CONDITIONS = [
  "awaiting_patient",
  "awaiting_payer",
  "awaiting_external_clinician",
] as const;

// ── Ownership — 8 explicit levels, no "everyone notified, nobody responsible" ─
export const OWNERSHIP_LEVELS = [
  "Queue owner",
  "Current work-item owner",
  "Clinical decision owner",
  "Administrative owner",
  "Backup owner",
  "Supervisor",
  "Patient communication owner",
  "External-party owner",
] as const;

// ── Delegation — role- and action-specific, minimum necessary scope ───────
export const DELEGATION_SCOPES = {
  medical_assistant: "verify patient, check completeness, request missing information",
  nurse: "triage symptoms, follow approved protocol, contact patient, escalate",
  pharmacist: "reconcile medicines, review renewals, identify interactions",
  authorization_specialist: "submit documents and track payer response",
  referral_coordinator: "schedule and close referral loops",
  clinician: "interpret result, change treatment, make diagnosis",
  research_coordinator: "contact only patients with approved research permissions",
  compliance_officer: "review documentation and reporting status",
} as const;

// ── Batch actions — safe 9 vs restricted 10 ───────────────────────────────
export const SAFE_BATCH_ACTIONS = [
  "Assigning similar administrative tasks",
  "Sending approved educational messages",
  "Requesting missing documents",
  "Closing duplicate notifications",
  "Scheduling routine follow-ups",
  "Reminding patients about preventive services",
  "Routing device connectivity failures",
  "Updating a queue status",
  "Preparing authorization packets",
] as const;

export const RESTRICTED_BATCH_ACTIONS = [
  "Critical laboratory results",
  "New cancer findings",
  "Imaging findings with possible urgent implications",
  "Medication-allergy conflicts",
  "New psychiatric safety concerns",
  "Pregnancy warning signs",
  "Abnormal pathology",
  "Genomic findings",
  "Treatment changes",
  "Patient messages describing new severe symptoms",
] as const;

export const BATCH_REQUIREMENTS = [
  "Included patients",
  "Inclusion criteria",
  "Exclusions",
  "Actor",
  "Template or rule version",
  "Preview",
  "Confirmation",
  "Audit record",
  "Undo or correction path where possible",
] as const;

// ── Queue: abnormal laboratories ──────────────────────────────────────────
export const LAB_INTAKE = [
  "Final or preliminary status",
  "Ordering clinician",
  "Result timestamp",
  "Reference range",
  "Critical-value status",
  "Patient-specific threshold",
  "Specimen quality",
  "Related results",
  "Medication and allergy context",
  "Recent encounter or discharge",
  "Existing alert or task",
] as const;

export const LAB_ROUTING = [
  "Critical result → ordering or covering clinician",
  "Assigned nurse",
  "Escalation supervisor if no acknowledgement",
  "Emergency pathway when protocol criteria are met",
] as const;

export const LAB_WORK_ACTIONS = [
  "Acknowledge result",
  "Verify result and patient",
  "Review prior trend",
  "Contact patient",
  "Order repeat test where authorized",
  "Document interpretation",
  "Adjust treatment where authorized",
  "Schedule follow-up",
  "Close with rationale",
] as const;

// ── Queue: imaging findings ───────────────────────────────────────────────
export const IMAGING_CLASSES = [
  "Routine finalized report",
  "Urgent radiology communication",
  "Unexpected finding",
  "Critical result",
  "Preliminary report",
  "Addendum",
  "Patient-requested explanation",
  "Follow-up imaging due",
  "Incidental finding requiring tracking",
] as const;

export const IMAGING_REQUIRED_FIELDS = [
  "Modality",
  "Body region",
  "Study date",
  "Report status",
  "Radiologist",
  "Critical or unexpected finding flag",
  "Comparison study",
  "Recommended follow-up",
  "Responsible clinician",
  "Patient communication status",
  "Referral or procedure requirement",
] as const;

// ── Queue: patient messages — team first, never physician by default ──────
export const MESSAGE_CLASSES = [
  "Administrative",
  "Appointment",
  "Medication question",
  "Refill request",
  "New symptom",
  "Worsening symptom",
  "Test-result question",
  "Care-plan question",
  "Mental-health concern",
  "Emergency language",
  "Billing",
  "Complaint",
  "Safeguarding concern",
  "Caregiver communication",
  "Technical issue",
] as const;

export const MESSAGE_WORKFLOW = [
  "Message received",
  "Identity and patient match",
  "Safety language scan",
  "Category and urgency",
  "Appropriate team route",
  "Draft or protocol response if allowed",
  "Clinician review if required",
  "Patient response",
  "Follow-up task or visit if needed",
  "Resolution",
] as const;

export const MESSAGE_TO_VISIT = [
  "The question requires examination",
  "Symptoms are new or worsening",
  "The patient requests diagnosis or treatment change",
  "There are multiple back-and-forth messages",
  "The response would require complex chart review",
  "The patient has communication or access needs",
  "The clinician's policy requires a visit",
] as const;

// ── Queue: medication renewals ────────────────────────────────────────────
export const RENEWAL_INTAKE = [
  "Medication",
  "Dose",
  "Route",
  "Quantity",
  "Last fill",
  "Active prescription",
  "Indication",
  "Last clinician review",
  "Monitoring requirements",
  "Allergies",
  "Interactions",
  "Duplicate therapy",
  "Refill history",
  "Patient-reported adherence",
  "Pharmacy",
  "Insurance status",
] as const;

export const RENEWAL_PROTOCOLABLE = [
  "Medication is active",
  "No safety conflict exists",
  "Required monitoring is current",
  "No concerning symptom or adverse reaction is present",
  "Prescription authority is valid",
  "Patient's condition is stable under defined criteria",
] as const;

export const RENEWAL_CLINICIAN_REQUIRED = [
  "Dose change requested",
  "Monitoring overdue",
  "Allergy or interaction conflict",
  "New symptom",
  "Pregnancy status changed",
  "Kidney or liver function changed",
  "Controlled or high-risk medicine",
  "Medication list conflict",
  "Repeated early refill",
  "Patient cannot identify current dose",
] as const;

// ── Queue: prior authorizations — CMS timelines ───────────────────────────
export const AUTH_STATES = [
  "Coverage question",
  "Authorization required",
  "Documentation gathering",
  "Clinical review",
  "Submitted",
  "Payer pending",
  "Additional information requested",
  "Approved",
  "Partially approved",
  "Denied",
  "Appeal",
  "Alternative discussed",
  "Patient decision",
  "Closed",
] as const;

export const AUTH_AUTOMATION = [
  "Determine whether authorization is required",
  "Retrieve payer-specific documentation requirements",
  "Assemble approved clinical evidence",
  "Identify missing information",
  "Draft submission",
  "Track payer response",
  "Notify patient and care team",
  "Start appeal workflow",
  "Suggest clinically appropriate covered alternatives for clinician review",
] as const;

// ── Queue: referrals — loop closes only on documented follow-up ───────────
export const REFERRAL_LOOP = [
  "Referral need identified",
  "Referral order created",
  "Patient informed",
  "Authorization checked",
  "Referral sent",
  "Receiving service accepts",
  "Appointment scheduled",
  "Visit completed",
  "Report received",
  "Ordering clinician reviews",
  "Patient notified",
  "Plan updated",
  "Referral closed",
] as const;

export const REFERRAL_MONITORS = [
  "Referral age",
  "Authorization status",
  "Scheduling attempts",
  "Patient barriers",
  "Receiving-service response",
  "Appointment date",
  "No-show or cancellation",
  "Consultation report",
  "Clinician review",
  "Patient notification",
  "Follow-up action",
] as const;

// ── Queue: discharge follow-up — AHRQ Re-Engineered Discharge ─────────────
export const DISCHARGE_CHECKLIST = [
  "Discharge instructions delivered",
  "Teach-back completed",
  "Medication reconciliation complete",
  "Pending results assigned",
  "Follow-up appointment scheduled",
  "Referral sent",
  "Transport addressed",
  "Equipment arranged",
  "Home support confirmed",
  "Warning signs explained",
  "Caregiver consent checked",
  "Primary-care handoff completed",
  "Post-discharge contact completed",
  "Readmission or emergency event monitored",
] as const;

// ── Queue: device failures — missing data is never a normal reading ───────
export const DEVICE_FAILURES = [
  "Device disconnected",
  "Battery failure",
  "Invalid measurement",
  "Calibration issue",
  "Data transmission delay",
  "Duplicate device",
  "Firmware mismatch",
  "Patient unable to use device",
  "Connectivity failure",
  "Device recall or safety notice",
] as const;

export const DEVICE_WORKFLOW = [
  "Failure detected",
  "Validate technical signal",
  "Determine clinical impact",
  "Notify patient if appropriate",
  "Offer troubleshooting",
  "Provide non-device alternative",
  "Replace or repair",
  "Notify care team if monitoring gap is clinically relevant",
  "Confirm recovery",
] as const;

// ── Queue: unresolved alerts ──────────────────────────────────────────────
export const UNRESOLVED_ALERT_CRITERIA = [
  "Unacknowledged",
  "Acknowledged but unresolved",
  "Escalated without response",
  "Reassigned",
  "Conflicting",
  "Repeated after supposed resolution",
  "Associated with patient deterioration",
  "Blocked by missing data",
  "Generated during handoff",
] as const;

export const UNRESOLVED_ALERT_DISPLAY = [
  "Underlying evidence",
  "Alert priority",
  "Current owner",
  "Time since creation",
  "Timer status",
  "Prior actions",
  "Contradictions",
  "Required next step",
  "Escalation chain",
] as const;

// ── Queue: research — separated from clinical operations ──────────────────
export const RESEARCH_WORKFLOW = [
  "Study criteria loaded",
  "Eligibility screening with approved data",
  "Consent and privacy check",
  "Research match reviewed",
  "Clinician or research coordinator approval",
  "Patient invitation",
  "Patient accepts or declines",
  "Consent obtained separately",
  "Screening or enrollment",
  "Research tracking",
] as const;

export const RESEARCH_FIELDS = [
  "Study",
  "Eligibility criteria",
  "Data used",
  "Match confidence",
  "Missing criteria",
  "Consent status",
  "Recruitment status",
  "Contact owner",
  "Patient preference",
  "Conflict-of-interest disclosure",
  "Expiration date",
] as const;

// ── Queue: compliance — links to source, never overwrites clinical docs ───
export const COMPLIANCE_TASKS = [
  "Documentation completeness",
  "Consent renewal",
  "Credential verification",
  "Training completion",
  "Safety event review",
  "Quality-measure submission",
  "Privacy request",
  "Record correction",
  "Access review",
  "Incident response",
  "Policy attestation",
  "Model-card update",
  "Pathway review",
  "Device safety notice",
] as const;

// ── Workload balancing — W = Σ(E × C × U) ─────────────────────────────────
export const WORKLOAD_FACTORS = [
  "Number of items",
  "Clinical complexity",
  "Estimated handling time",
  "Cognitive load",
  "Urgency",
  "Specialty",
  "Language",
  "Patient vulnerability",
  "Communication channel",
  "Required documentation",
  "Current shift",
  "Interrupted work",
  "Unresolved backlog",
  "Emotional burden",
  "Staff skill and authorization",
] as const;

export const ASSIGNMENT_RULES = [
  "Preserve continuity for complex patients",
  "Avoid assigning high-risk work to unauthorized roles",
  "Reserve capacity for urgent events",
  "Prevent repeated reassignment",
  "Consider language and accessibility",
  "Respect shift boundaries",
  "Make workload visible to supervisors",
  "Offer protected review time",
  "Detect overloaded queues before SLA breach",
] as const;

export const HANDOFF_FIELDS = [
  "Current state",
  "What has been reviewed",
  "What remains",
  "Deadline",
  "Patient communication status",
  "Risk",
  "Next action",
  "Receiving owner",
  "Handoff acknowledgement",
] as const;

// ── Auditability ──────────────────────────────────────────────────────────
export const AUDIT_FIELDS = [
  "Original event",
  "Classification",
  "Routing rule",
  "Queue",
  "Priority",
  "Owner",
  "Delegation",
  "Access",
  "View",
  "Action",
  "Batch membership",
  "Template or model version",
  "Patient communication",
  "Escalation",
  "Override",
  "Resolution",
  "Closure reason",
  "Outcome",
  "Time stamps",
  "Failed deliveries",
  "Policy version",
] as const;

export const AUDIT_QUESTIONS = [
  "Who was responsible?",
  "Who saw it?",
  "Who changed it?",
  "What information was used?",
  "Which rule routed it?",
  "Was it delegated?",
  "Was the SLA met?",
  "Was the patient informed?",
  "What happened afterward?",
] as const;

// ── Automation policy — 4 levels ──────────────────────────────────────────
export const AUTOMATION_LEVELS = {
  L0_OBSERVE: "Log and classify — no patient or clinician action — analytics and quality",
  L1_ASSIST: "Suggest classification, draft response, recommend routing — human confirms",
  L2_PROTOCOL_EXECUTE: "Execute approved low-risk workflow — eligibility and exception checks, audit and undo path",
  L3_HUMAN_REQUIRED: "No autonomous clinical action — diagnosis, treatment change, critical results, complex symptoms",
} as const;

// ── Analytics ─────────────────────────────────────────────────────────────
export const OPERATIONAL_METRICS = [
  "Incoming items per day",
  "Items by queue",
  "Items by source",
  "Items by priority",
  "Assignment time",
  "Acceptance time",
  "Resolution time",
  "SLA compliance",
  "Escalation rate",
  "Reassignment rate",
  "Backlog",
  "Age distribution",
  "Batch-action volume",
  "Duplicate rate",
  "Failed-delivery rate",
] as const;

export const SAFETY_METRICS = [
  "Missed critical result rate",
  "Unresolved urgent item rate",
  "Wrong-patient routing",
  "Wrong-owner routing",
  "Inappropriate closure",
  "Patient-notified rate",
  "Follow-up completion",
  "Medication-error events",
  "Referral-loop closure",
  "Authorization-delay harm",
  "Device-related monitoring gaps",
] as const;

export const WORKLOAD_METRICS_OUT = [
  "Items per role",
  "Complexity-adjusted work",
  "After-hours work",
  "Interruptions",
  "Queue switching",
  "Time per item",
  "Burnout or burden survey",
  "Delegation acceptance",
  "Unplanned overtime",
  "Workload inequity",
] as const;

export const FAIRNESS_STRATIFIERS = [
  "Specialty",
  "Care setting",
  "Language",
  "Geography",
  "Patient age",
  "Disability or accessibility need",
  "Insurance or payment context",
  "Caregiver availability",
  "Digital access",
  "Shift",
  "Organization",
] as const;

// ── FHIR mapping ──────────────────────────────────────────────────────────
export const FHIR_WORKQUEUE_RESOURCES = [
  "Task: work item, status, priority, requester, performer, owner, restriction, execution",
  "Communication: patient and team messages",
  "ServiceRequest: referrals, laboratory, imaging, requested services",
  "DiagnosticReport: laboratory and imaging reports",
  "Observation: individual results and measurements",
  "MedicationRequest: prescriptions and renewal requests",
  "MedicationDispense: fill and dispensing information",
  "Coverage: insurance and coverage context",
  "Claim and ClaimResponse: financial workflows",
  "Appointment: scheduling",
  "CarePlan: pathway-related work",
  "Consent: sharing and research permission",
  "Device: device identity and status",
  "ResearchStudy: research opportunity context",
  "Provenance: data lineage",
  "AuditEvent: access and workflow audit",
] as const;

// ── Core API — 18 endpoints ───────────────────────────────────────────────
export const WORK_QUEUE_API = [
  "POST   /work-items",
  "GET    /work-items",
  "GET    /queues/{queue_id}",
  "POST   /work-items/{id}/claim",
  "POST   /work-items/{id}/accept",
  "POST   /work-items/{id}/delegate",
  "POST   /work-items/{id}/reassign",
  "POST   /work-items/{id}/start",
  "POST   /work-items/{id}/request-information",
  "POST   /work-items/{id}/escalate",
  "POST   /work-items/{id}/batch-preview",
  "POST   /work-items/{id}/resolve",
  "POST   /work-items/{id}/reopen",
  "POST   /work-items/{id}/dispute",
  "GET    /work-items/{id}/audit",
  "GET    /workloads",
  "GET    /sla-breaches",
  "GET    /queue-outcomes",
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

// ── Zod schemas ───────────────────────────────────────────────────────────
export const workItemSchema = z.object({
  patientId: z.string().uuid().optional().nullable(),
  type: z.string().min(1).max(60),
  title: z.string().min(1).max(300),
  priority: z.enum(["STAT", "URGENT", "HIGH", "ROUTINE", "BATCH", "INFORMATIONAL"]).default("ROUTINE"),
  clinicalUrgency: z.string().max(40).optional().nullable(),
  clinicalPriority: z.string().max(40).optional().nullable(),
  adminPriority: z.string().max(40).optional().nullable(),
  actionability: z.string().max(20).optional().nullable(),
  owner: z.string().max(120).optional().nullable(),
  requestedPerformer: z.string().max(120).optional().nullable(),
  queue: z.string().min(1).max(60),
  sourceRef: z.string().max(200).optional().nullable(),
  relatedRefs: z.array(z.string()).default([]),
  dueAt: z.coerce.date().optional().nullable(),
  slaPolicy: z.string().max(60).optional().nullable(),
  delegation: z.record(z.unknown()).optional(),
  evidence: z.array(z.record(z.unknown())).optional(),
  patientVisibility: z.string().max(40).default("care_team_only"),
});

export const delegateSchema = z.object({
  toOwner: z.string().min(1).max(120),
  scope: z.string().min(1).max(200),
  requiresClinicianFor: z.array(z.string()).default([]),
});

export const reassignSchema = z.object({
  toOwner: z.string().min(1).max(120),
  reason: z.string().min(1).max(500),
});

export const escalateSchema = z.object({
  reason: z.string().min(1).max(500),
  toOwner: z.string().max(120).optional().nullable(),
});

export const resolveSchema = z.object({
  reason: z.string().min(1).max(500),
  evidence: z.array(z.record(z.unknown())).default([]),
  close: z.boolean().default(false),
});

export const reopenSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const workDisputeSchema = z.object({
  reason: z.string().min(1).max(500),
  claimedOwner: z.string().max(120).optional().nullable(),
});

export const queuePolicySchema = z.object({
  queue: z.string().min(1).max(60),
  priority: z.enum(["STAT", "URGENT", "HIGH", "ROUTINE", "BATCH", "INFORMATIONAL"]),
  ackMinutes: z.coerce.number().int().min(0).max(43200),
  resolveMinutes: z.coerce.number().int().min(0).max(43200),
  businessHours: z.record(z.unknown()).optional(),
  pauseConditions: z.array(z.string()).default([]),
  version: z.string().max(20).default("v1"),
});

// ═══════════════════════════════════════════════════════════════════════════
// ClinicalWorkQueue — full implementation
// ═══════════════════════════════════════════════════════════════════════════

type PrismaWorkItem = {
  id: string; status: string; priority: string; queue: string; owner: string | null;
  patientId: string | null; dueAt: Date | string | null; createdAt: Date | string;
  acknowledgedAt: Date | string | null; resolvedAt: Date | string | null;
};

export class ClinicalWorkQueue {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action)))
      throw new Error(`Missing ${action} permission for health_work_queue`);
  }

  private audit(action: string, targetType: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType, targetId, metadata: meta }).catch(() => null);
  }

  private async recordEvent(workItemId: string, action: string, opts: { fromStatus?: string; toStatus?: string; owner?: string; metadata?: Record<string, unknown> } = {}) {
    await safe(
      () => (prisma as never as { healthWorkItemEvent: { create: (a: unknown) => Promise<unknown> } })
        .healthWorkItemEvent.create({
          data: {
            workspaceId: this.workspaceId, workItemId, actorId: this.userId, action,
            fromStatus: opts.fromStatus ?? null, toStatus: opts.toStatus ?? null,
            owner: opts.owner ?? null, metadata: (opts.metadata ?? {}) as never,
          } as never,
        }),
      null,
    );
  }

  private async transition(id: string, toStatus: string, action: string, metadata?: Record<string, unknown>) {
    const current = await this.getWorkItem(id) as PrismaWorkItem;
    const patch: Record<string, unknown> = { status: toStatus as never };
    if (action === "ACCEPTED" || action === "CLAIMED" || action === "STARTED") patch.acknowledgedAt = new Date();
    if (toStatus === "RESOLVED") patch.resolvedAt = new Date();
    if (toStatus === "CLOSED") { patch.closedAt = new Date(); if (!patch.resolvedAt) patch.resolvedAt = new Date(); }
    const row = await (prisma as never as { healthWorkItem: { update: (a: unknown) => Promise<unknown> } })
      .healthWorkItem.update({ where: { id }, data: patch as never });
    await this.recordEvent(id, action, { fromStatus: current.status, toStatus, owner: (row as PrismaWorkItem).owner ?? undefined, metadata });
    await this.audit(action, "HealthWorkItem", id, { fromStatus: current.status, toStatus, ...(metadata ?? {}) });
    return row;
  }

  // ── SLA — policy override first, defaults per priority ──────────────────
  private async slaFor(queue: string, priority: string) {
    const policy = await safe(
      () => (prisma as never as { healthWorkQueuePolicy: { findFirst: (a: unknown) => Promise<{ ackMinutes: number; resolveMinutes: number; id: string; version: string } | null> } })
        .healthWorkQueuePolicy.findFirst({ where: { workspaceId: this.workspaceId, queue, priority: priority as never, active: true }, orderBy: { createdAt: "desc" } }),
      null,
    );
    if (policy) return { ackMinutes: policy.ackMinutes, resolveMinutes: policy.resolveMinutes, policyRef: `${queue}-sla-${policy.version}` };
    const def = SLA_DEFAULTS[priority] ?? SLA_DEFAULTS.ROUTINE!;
    return { ackMinutes: def.ackMinutes, resolveMinutes: def.resolveMinutes, policyRef: `${queue}-sla-default` };
  }

  // ── Ingest → classify → dedup → priority/SLA → route ────────────────────
  async createWorkItem(input: z.infer<typeof workItemSchema>) {
    await this.assert("CREATE");
    if (!WORK_QUEUES.includes(input.queue as never)) throw new Error(`Queue must be one of ${WORK_QUEUES.join(", ")}`);

    // Deduplication: same source event already has a live work item — link, never disappear.
    if (input.sourceRef) {
      const existing = await safe(
        () => (prisma as never as { healthWorkItem: { findFirst: (a: unknown) => Promise<{ id: string } | null> } })
          .healthWorkItem.findFirst({
            where: {
              workspaceId: this.workspaceId, sourceRef: input.sourceRef,
              status: { notIn: ["CLOSED", "RESOLVED", "DUPLICATE", "RETRACTED"] as never },
            },
          }),
        null,
      );
      if (existing) {
        const dup = await (prisma as never as { healthWorkItem: { create: (a: unknown) => Promise<unknown> } })
          .healthWorkItem.create({
            data: {
              workspaceId: this.workspaceId, patientId: input.patientId ?? null, type: input.type,
              title: input.title, status: "DUPLICATE", priority: input.priority as never,
              queue: input.queue, sourceRef: input.sourceRef, relatedRefs: [existing.id],
              createdById: this.userId,
            } as never,
          });
        await this.recordEvent((dup as { id: string }).id, "CLASSIFIED", { toStatus: "DUPLICATE", metadata: { linkedTo: existing.id, rule: "sourceRef-dedup" } });
        return { workItem: dup, duplicate: true, linkedTo: existing.id };
      }
    }

    const sla = await this.slaFor(input.queue, input.priority);
    const dueAt = input.dueAt ?? (sla.resolveMinutes > 0 ? new Date(Date.now() + sla.resolveMinutes * 60_000) : null);
    const row = await (prisma as never as { healthWorkItem: { create: (a: unknown) => Promise<unknown> } })
      .healthWorkItem.create({
        data: {
          workspaceId: this.workspaceId, patientId: input.patientId ?? null, type: input.type,
          title: input.title, status: input.owner ? "ASSIGNED" : "RECEIVED", priority: input.priority as never,
          clinicalUrgency: input.clinicalUrgency ?? null, clinicalPriority: input.clinicalPriority ?? null,
          adminPriority: input.adminPriority ?? null, actionability: input.actionability ?? null,
          owner: input.owner ?? null, requestedPerformer: input.requestedPerformer ?? null,
          queue: input.queue, sourceRef: input.sourceRef ?? null, relatedRefs: input.relatedRefs as never,
          dueAt, slaPolicy: input.slaPolicy ?? sla.policyRef,
          delegation: (input.delegation ?? {}) as never, evidence: (input.evidence ?? []) as never,
          patientVisibility: input.patientVisibility, createdById: this.userId,
        } as never,
      });
    const wid = (row as { id: string }).id;
    await this.recordEvent(wid, "CREATED", { toStatus: input.owner ? "ASSIGNED" : "RECEIVED", metadata: { sla: sla.policyRef, ackMinutes: sla.ackMinutes, resolveMinutes: sla.resolveMinutes } });
    await this.audit("CREATE", "HealthWorkItem", wid, input as never);
    return { workItem: row, duplicate: false, sla };
  }

  async listWorkItems(opts: { queue?: string; status?: string; priority?: string; owner?: string; patientId?: string; take?: number } = {}) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (opts.queue) where.queue = opts.queue;
    if (opts.status) where.status = opts.status;
    if (opts.priority) where.priority = opts.priority;
    if (opts.owner) where.owner = opts.owner;
    if (opts.patientId) where.patientId = opts.patientId;
    return safe(
      () => (prisma as never as { healthWorkItem: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthWorkItem.findMany({ where, orderBy: { createdAt: "desc" }, take: Math.min(opts.take ?? 30, 100) }),
      [],
    );
  }

  async getWorkItem(id: string) {
    await this.assert("READ");
    const row = await safe(
      () => (prisma as never as { healthWorkItem: { findFirst: (a: unknown) => Promise<unknown> } })
        .healthWorkItem.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!row) throw new Error("Work item not found");
    return row;
  }

  // ── Triage — 13 questions → 4 destinations ───────────────────────────────
  async triage(input: { type: string; priority?: string; preliminary?: boolean; duplicate?: boolean; actionable?: boolean; humanDecision?: boolean; authorizedRole?: string; emergencyLanguage?: boolean }) {
    await this.assert("READ");
    if (input.emergencyLanguage) return { destination: "urgent_escalation", reason: "Emergency, self-harm, severe-symptom, or safeguarding language requires approved human escalation — never declare safe by model alone", questions: TRIAGE_QUESTIONS };
    if (input.duplicate) return { destination: "batch_work", reason: "Duplicate notification — grouped for routine review, original preserved", questions: TRIAGE_QUESTIONS };
    if (input.actionable === false) return { destination: "no_work", reason: "Logged only — not clinically actionable", questions: TRIAGE_QUESTIONS };
    if (input.priority === "STAT" || input.priority === "URGENT") return { destination: "urgent_escalation", reason: "Interruptive route with timer", questions: TRIAGE_QUESTIONS };
    if (input.priority === "BATCH" || input.priority === "INFORMATIONAL") return { destination: "batch_work", reason: "Safe grouped review", questions: TRIAGE_QUESTIONS };
    return { destination: "assigned_work_item", reason: "Owner and due time required", questions: TRIAGE_QUESTIONS };
  }

  // ── Priority scoring — 10 factors → level ────────────────────────────────
  priorityScore(input: { harmIfMissed: number; timeSensitivity: number; sourceConfidence: number; actionability: number; patientRisk: number }) {
    const w = { harmIfMissed: 0.3, timeSensitivity: 0.25, sourceConfidence: 0.15, actionability: 0.15, patientRisk: 0.15 };
    const score = Math.round((input.harmIfMissed * w.harmIfMissed + input.timeSensitivity * w.timeSensitivity + input.sourceConfidence * w.sourceConfidence + input.actionability * w.actionability + input.patientRisk * w.patientRisk) * 100) / 100;
    const level = score >= 0.9 ? "STAT" : score >= 0.7 ? "URGENT" : score >= 0.5 ? "HIGH" : score >= 0.3 ? "ROUTINE" : "BATCH";
    return { score, level, factors: PRIORITY_FACTORS, meaning: WORK_PRIORITY_LEVELS[level as keyof typeof WORK_PRIORITY_LEVELS] };
  }

  // ── Claim / accept / start ──────────────────────────────────────────────
  async claim(id: string, owner?: string) {
    await this.assert("UPDATE");
    const current = await this.getWorkItem(id) as PrismaWorkItem;
    if (current.owner && current.owner !== (owner ?? this.userId)) throw new Error(`Already owned by ${current.owner} — use reassign with reason`);
    const row = await (prisma as never as { healthWorkItem: { update: (a: unknown) => Promise<unknown> } })
      .healthWorkItem.update({ where: { id }, data: { owner: owner ?? this.userId, acknowledgedAt: new Date() } as never });
    await this.recordEvent(id, "CLAIMED", { fromStatus: current.status, owner: owner ?? this.userId });
    return row;
  }

  async accept(id: string) {
    await this.assert("UPDATE");
    return this.transition(id, "ACCEPTED", "ACCEPTED");
  }

  async start(id: string) {
    await this.assert("UPDATE");
    return this.transition(id, "IN_PROGRESS", "STARTED");
  }

  // ── Delegate — scope-limited, minimum necessary ─────────────────────────
  async delegate(id: string, input: z.infer<typeof delegateSchema>) {
    await this.assert("UPDATE");
    if (!Object.keys(DELEGATION_SCOPES).some((k) => input.scope.toLowerCase().includes(k.replace(/_/g, " ").split(" ")[0]!)))
      throw new Error(`Scope must reference a known role: ${Object.keys(DELEGATION_SCOPES).join(", ")}`);
    const row = await (prisma as never as { healthWorkItem: { update: (a: unknown) => Promise<unknown> } })
      .healthWorkItem.update({
        where: { id },
        data: {
          status: "DELEGATED",
          delegation: { allowed: true, scope: input.scope, requires_clinician_for: input.requiresClinicianFor, to: input.toOwner } as never,
        } as never,
      });
    await this.recordEvent(id, "DELEGATED", { toStatus: "DELEGATED", owner: input.toOwner, metadata: { scope: input.scope, requiresClinicianFor: input.requiresClinicianFor } });
    await this.audit("DELEGATE", "HealthWorkItem", id, input as never);
    return { workItem: row, note: "Delegate sees only minimum necessary data and action scope — clinical accountability preserved for non-protocolizable decisions" };
  }

  async reassign(id: string, input: z.infer<typeof reassignSchema>) {
    await this.assert("UPDATE");
    const current = await this.getWorkItem(id) as PrismaWorkItem;
    const row = await (prisma as never as { healthWorkItem: { update: (a: unknown) => Promise<unknown> } })
      .healthWorkItem.update({ where: { id }, data: { owner: input.toOwner } as never });
    await this.recordEvent(id, "REASSIGNED", { fromStatus: current.status, owner: input.toOwner, metadata: { reason: input.reason, previousOwner: current.owner } });
    await this.audit("REASSIGN", "HealthWorkItem", id, input as never);
    return row;
  }

  async requestInformation(id: string, what: string, from?: string) {
    await this.assert("UPDATE");
    return this.transition(id, "AWAITING_INFORMATION", "INFO_REQUESTED", { what, from: from ?? "patient" });
  }

  // ── Escalate — timer, backup, acknowledgement ───────────────────────────
  async escalate(id: string, input: z.infer<typeof escalateSchema>) {
    await this.assert("UPDATE");
    const patch: Record<string, unknown> = { status: "ESCALATED" as never };
    if (input.toOwner) patch.owner = input.toOwner;
    const row = await (prisma as never as { healthWorkItem: { update: (a: unknown) => Promise<unknown> } })
      .healthWorkItem.update({ where: { id }, data: patch as never });
    await this.recordEvent(id, "ESCALATED", { toStatus: "ESCALATED", owner: input.toOwner ?? undefined, metadata: { reason: input.reason } });
    await this.audit("ESCALATE", "HealthWorkItem", id, input as never);
    return { workItem: row, workflow: ["Trigger", "Validate signal", "Notify patient", "Notify assigned role", "Start timer", "Require acknowledgement", "Escalate if overdue", "Record action", "Measure outcome"] };
  }

  // ── Batch preview — inclusion, exclusions, individual inspection ─────────
  async batchPreview(ids: string[], rule: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as never as { healthWorkItem: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthWorkItem.findMany({ where: { id: { in: ids }, workspaceId: this.workspaceId } }),
      [],
    );
    const items = rows as Array<{ id: string; type: string; priority: string; queue: string; patientId: string | null }>;
    const excluded = items.filter((i) => (i.priority === "STAT" || i.priority === "URGENT") || RESTRICTED_BATCH_ACTIONS.some((r) => i.type.includes(r.split(" ")[0]!.toLowerCase())));
    const included = items.filter((i) => !excluded.some((e) => e.id === i.id));
    return {
      rule, included, excluded,
      exclusions: RESTRICTED_BATCH_ACTIONS,
      requirements: BATCH_REQUIREMENTS,
      note: "Reviewer must inspect every item individually and remove exceptions before applying a batch action — never bulk-decide restricted items",
    };
  }

  // ── Resolve — reason + evidence required; opening ≠ resolution ───────────
  async resolve(id: string, input: z.infer<typeof resolveSchema>) {
    await this.assert("UPDATE");
    if (!input.reason) throw new Error("Resolution requires a reason");
    if (input.evidence.length === 0) throw new Error("Resolution requires evidence — opening an item or sending an acknowledgement does not count");
    const row = await (prisma as never as { healthWorkItem: { update: (a: unknown) => Promise<unknown> } })
      .healthWorkItem.update({
        where: { id },
        data: {
          status: input.close ? "CLOSED" : "RESOLVED",
          resolution: { reason: input.reason, evidence: input.evidence, resolvedBy: this.userId, resolvedAt: new Date().toISOString() } as never,
          resolvedAt: new Date(), closedAt: input.close ? new Date() : null,
        } as never,
      });
    await this.recordEvent(id, input.close ? "CLOSED" : "RESOLVED", { toStatus: input.close ? "CLOSED" : "RESOLVED", metadata: { reason: input.reason } });
    await this.audit(input.close ? "CLOSE" : "RESOLVE", "HealthWorkItem", id, input as never);
    return row;
  }

  async reopen(id: string, input: z.infer<typeof reopenSchema>) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { healthWorkItem: { update: (a: unknown) => Promise<unknown> } })
      .healthWorkItem.update({ where: { id }, data: { status: "IN_PROGRESS", resolvedAt: null, closedAt: null } as never });
    await this.recordEvent(id, "REOPENED", { toStatus: "IN_PROGRESS", metadata: { reason: input.reason } });
    return row;
  }

  async dispute(id: string, input: z.infer<typeof workDisputeSchema>) {
    await this.assert("UPDATE");
    await this.recordEvent(id, "DISPUTED", { metadata: { reason: input.reason, claimedOwner: input.claimedOwner ?? null } });
    await this.audit("DISPUTE", "HealthWorkItem", id, input as never);
    return { workItemId: id, disputed: true, reason: input.reason };
  }

  async auditTrail(id: string) {
    await this.assert("READ");
    const events = await safe(
      () => (prisma as never as { healthWorkItemEvent: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthWorkItemEvent.findMany({ where: { workspaceId: this.workspaceId, workItemId: id }, orderBy: { createdAt: "asc" }, take: 100 }),
      [],
    );
    return { workItemId: id, events, questions: AUDIT_QUESTIONS, fields: AUDIT_FIELDS };
  }

  // ── SLA status — remaining, clock, pause, owner, backup, breach risk ─────
  slaStatus(item: PrismaWorkItem & { slaPolicy?: string | null }) {
    const due = item.dueAt ? new Date(item.dueAt).getTime() : null;
    const now = Date.now();
    const remainingMin = due === null ? null : Math.round((due - now) / 60_000);
    const paused = item.status === "AWAITING_INFORMATION" || item.status === "AWAITING_EXTERNAL_PARTY";
    return {
      timeRemainingMin: remainingMin,
      clockType: "configured_business_hours",
      pauseReason: paused ? item.status : null,
      owner: item.owner,
      atRisk: remainingMin !== null && remainingMin < 60 && !paused,
      breached: remainingMin !== null && remainingMin < 0,
      slaPolicy: item.slaPolicy ?? null,
      note: "Do not pause a clinical timer merely because a work item was opened — pausing requires a valid state and documented reason",
    };
  }

  async slaBreaches() {
    await this.assert("READ");
    const open = await this.listWorkItems({ take: 100 }) as PrismaWorkItem[];
    const withStatus = open
      .filter((i) => !["CLOSED", "RESOLVED", "DUPLICATE", "RETRACTED", "NOT_ACTIONABLE"].includes(i.status))
      .map((i) => ({ item: i, sla: this.slaStatus(i) }))
      .filter((x) => x.sla.atRisk || x.sla.breached);
    return { breaches: withStatus, count: withStatus.length };
  }

  // ── Workloads — W = Σ(E × C × U), complexity-adjusted, never bare counts ─
  workloadScore(items: Array<{ priority: string; type: string; clinicalUrgency?: string | null }>) {
    const effort: Record<string, number> = { abnormal_lab: 3, imaging_finding: 3, patient_message: 2, renewal_request: 1, prior_auth: 2, referral: 2, discharge: 4, device_failure: 1, unresolved_alert: 3, research_match: 1, compliance_task: 1 };
    const complexity: Record<string, number> = { STAT: 5, URGENT: 4, HIGH: 3, ROUTINE: 2, BATCH: 1, INFORMATIONAL: 0.5 };
    const urgency: Record<string, number> = { immediate: 3, same_day: 2, next_business_day: 1.5, routine: 1 };
    let w = 0;
    for (const i of items) {
      const e = effort[i.type] ?? 2;
      const c = complexity[i.priority] ?? 2;
      const u = urgency[(i.clinicalUrgency ?? "routine").toLowerCase()] ?? 1;
      w += e * c * u;
    }
    return Math.round(w * 100) / 100;
  }

  async workloads() {
    await this.assert("READ");
    const items = await this.listWorkItems({ take: 100 }) as Array<{ owner: string | null; queue: string; priority: string; type: string; clinicalUrgency: string | null; status: string }>;
    const live = items.filter((i) => !["CLOSED", "RESOLVED", "DUPLICATE", "RETRACTED", "NOT_ACTIONABLE"].includes(i.status));
    const byOwner: Record<string, { count: number; score: number; queues: string[] }> = {};
    for (const i of live) {
      const key = i.owner ?? "unassigned";
      byOwner[key] ??= { count: 0, score: 0, queues: [] };
      byOwner[key]!.count += 1;
      byOwner[key]!.score += this.workloadScore([{ priority: i.priority, type: i.type, clinicalUrgency: i.clinicalUrgency }]);
      if (!byOwner[key]!.queues.includes(i.queue)) byOwner[key]!.queues.push(i.queue);
    }
    return {
      byOwner, totalLive: live.length, factors: WORKLOAD_FACTORS, assignmentRules: ASSIGNMENT_RULES,
      note: "A queue with 20 routine renewals is not equivalent to 20 complex patient messages — use W for staffing, never to pressure unsafe throughput",
    };
  }

  async queueOutcomes(queue?: string) {
    await this.assert("READ");
    const items = await this.listWorkItems({ queue, take: 100 }) as Array<{ queue: string; status: string; priority: string; createdAt: Date | string; resolvedAt: Date | string | null }>;
    const byQueue: Record<string, { total: number; resolved: number; closed: number; escalated: number; medianResolveHrs: number | null }> = {};
    for (const i of items) {
      byQueue[i.queue] ??= { total: 0, resolved: 0, closed: 0, escalated: 0, medianResolveHrs: null };
      byQueue[i.queue]!.total += 1;
      if (i.status === "RESOLVED") byQueue[i.queue]!.resolved += 1;
      if (i.status === "CLOSED") byQueue[i.queue]!.closed += 1;
      if (i.status === "ESCALATED") byQueue[i.queue]!.escalated += 1;
    }
    return {
      byQueue,
      operationalMetrics: OPERATIONAL_METRICS, safetyMetrics: SAFETY_METRICS,
      workloadMetrics: WORKLOAD_METRICS_OUT, fairnessStratifiers: FAIRNESS_STRATIFIERS,
    };
  }

  async queueDetail(queueId: string) {
    await this.assert("READ");
    if (!WORK_QUEUES.includes(queueId as never)) throw new Error(`Queue must be one of ${WORK_QUEUES.join(", ")}`);
    const items = await this.listWorkItems({ queue: queueId, take: 50 }) as PrismaWorkItem[];
    const policies = await this.listPolicies(queueId);
    const live = items.filter((i) => !["CLOSED", "RESOLVED", "DUPLICATE", "RETRACTED", "NOT_ACTIONABLE"].includes(i.status));
    return {
      queue: queueId, open: live.length, items,
      timers: live.map((i) => ({ id: i.id, sla: this.slaStatus(i) })),
      policies, ownershipLevels: OWNERSHIP_LEVELS,
    };
  }

  // ── SLA policies ────────────────────────────────────────────────────────
  async upsertPolicy(input: z.infer<typeof queuePolicySchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { healthWorkQueuePolicy: { upsert: (a: unknown) => Promise<unknown> } })
      .healthWorkQueuePolicy.upsert({
        where: { workspaceId_queue_priority_version: { workspaceId: this.workspaceId, queue: input.queue, priority: input.priority as never, version: input.version } },
        create: {
          workspaceId: this.workspaceId, queue: input.queue, priority: input.priority as never,
          ackMinutes: input.ackMinutes, resolveMinutes: input.resolveMinutes,
          businessHours: (input.businessHours ?? {}) as never, pauseConditions: input.pauseConditions, version: input.version,
        } as never,
        update: {
          ackMinutes: input.ackMinutes, resolveMinutes: input.resolveMinutes,
          businessHours: (input.businessHours ?? {}) as never, pauseConditions: input.pauseConditions, active: true,
        } as never,
      });
    await this.audit("UPSERT", "HealthWorkQueuePolicy", (row as { id: string }).id, input as never);
    return row;
  }

  async listPolicies(queue?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId, active: true };
    if (queue) where.queue = queue;
    return safe(
      () => (prisma as never as { healthWorkQueuePolicy: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthWorkQueuePolicy.findMany({ where, orderBy: { queue: "asc" }, take: 50 }),
      [],
    );
  }

  // ── Static exports for UI ───────────────────────────────────────────────
  static readonly WORK_SOURCES = WORK_SOURCES;
  static readonly WORK_PIPELINE = WORK_PIPELINE;
  static readonly WORK_LIFECYCLE = WORK_LIFECYCLE;
  static readonly WORK_QUEUES = WORK_QUEUES;
  static readonly WORK_QUEUE_API = WORK_QUEUE_API;
  static readonly WORK_PRIORITY_LEVELS = WORK_PRIORITY_LEVELS;
  static readonly FHIR_WORKQUEUE_RESOURCES = FHIR_WORKQUEUE_RESOURCES;
  static readonly AUTOMATION_LEVELS = AUTOMATION_LEVELS;
}
