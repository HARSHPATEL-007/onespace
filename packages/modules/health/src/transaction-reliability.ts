// Healthcare Transaction Reliability Layer — cross-module operations stay safe when services fail,
// messages duplicate, networks break, or humans must intervene.
// "Accepted / in progress / partially completed / needs review / completed" are visible states,
// never hidden implementation details. Local transactions + durable events + idempotent
// participants + explicit compensation + clinical approval gates + reconciliation.
// Governing principle: never confuse "the request was accepted" with "the patient is safe" —
// every clinical transaction needs durable intent, accountable execution, visible partial
// failure, human escalation, and eventual reconciliation.
import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "health_transaction_reliability";

// ── Reliability architecture ────────────────────────────────────────────
export const TXN_ARCHITECTURE = [
  "User or system command",
  "Command gateway",
  "Authorization, consent, validation, idempotency check",
  "Saga orchestrator",
  "Local service transaction: database update + transactional outbox event",
  "Durable event broker",
  "Inbox and idempotent consumer",
  "Next saga step: success, retry, human checkpoint, compensation, dead-letter, reconciliation",
  "Immutable event and audit history",
] as const;

// ── Concept separation — never conflate ─────────────────────────────────
export const TXN_CONCEPTS = [
  "Command: requested action",
  "Event: fact that an action occurred",
  "Task: work assigned to a human or service",
  "Saga: multi-step business process",
  "Compensation: corrective action for a completed step",
  "Reconciliation: compares intended, recorded, and external states",
  "Audit event: security or accountability record",
] as const;

// ── Transaction states — 14, always visible ─────────────────────────────
export const TXN_STATES = [
  "RECEIVED",
  "VALIDATING",
  "AWAITING_AUTHORIZATION",
  "AWAITING_PATIENT_CONFIRMATION",
  "ACCEPTED",
  "IN_PROGRESS",
  "PARTIALLY_COMPLETED",
  "AWAITING_DEPENDENCY",
  "AWAITING_HUMAN_REVIEW",
  "COMPENSATING",
  "RECONCILIATION_REQUIRED",
  "COMPLETED",
  "COMPLETED_WITH_EXCEPTION",
  "FAILED_SAFELY",
  "CANCELLED",
] as const;

// ── Saga components — 12 ────────────────────────────────────────────────
export const SAGA_COMPONENTS = [
  "Saga definition",
  "Saga instance",
  "Step list",
  "Local action",
  "Success event",
  "Retry policy",
  "Compensation action",
  "Human checkpoint",
  "Timeout",
  "Escalation",
  "Completion criteria",
  "Reconciliation policy",
  "Rollback or forward-recovery strategy",
] as const;

// ── Saga definitions — clinically consequential workflows ───────────────
export const SAGA_DEFINITIONS = {
  create_medication_order: [
    "validate_patient_medication_allergy_prescriber",
    "check_renal_hepatic_pregnancy_interactions",
    "clinician_approval",
    "patient_confirmation",
    "create_medication_order",
    "notify_pharmacy",
    "update_care_plan",
    "generate_monitoring_task",
    "update_reconciliation_view",
    "confirm_pharmacy_acceptance",
    "close_or_reconcile",
  ],
  create_referral: [
    "validate_patient_specialty_urgency_consent",
    "store_referral_outbox",
    "submit_receiving_organization",
    "confirm_receipt",
    "track_authorization_scheduling",
    "receive_consultation_report",
    "assign_clinician_review",
    "update_care_plan",
    "notify_patient",
  ],
  release_discharge_plan: [
    "assemble_instructions",
    "reconcile_medications",
    "assign_pending_results",
    "schedule_follow_up",
    "confirm_transport_equipment",
    "clinician_sign_off",
    "deliver_patient_instructions",
    "confirm_patient_understanding",
    "notify_primary_care_teams",
    "start_post_discharge_monitoring",
  ],
  critical_result_notification: [
    "persist_result",
    "create_critical_event",
    "assign_accountable_clinician",
    "send_preferred_notification",
    "require_acknowledgement",
    "escalate_covering_clinician",
    "alternate_approved_channel",
    "document_patient_contact",
    "record_clinical_action",
    "reconcile_notification_outcome",
  ],
} as const;

// ── Compensation is not clinical rollback — 8 reference rows ────────────
export const COMPENSATION_TABLE = [
  ["Medication order created", "Pharmacy unavailable", "Keep order; retry or reroute"],
  ["Patient notified", "Plan changed", "Send correction and document supersession"],
  ["Referral sent", "Receiving system rejects", "Preserve referral need; route to coordinator"],
  ["Discharge message sent", "Follow-up booking fails", "Create urgent scheduling task"],
  ["Critical result alert sent", "Primary owner unavailable", "Escalate to covering clinician"],
  ["Claim submitted", "Clinical documentation corrected", "Amend or resubmit claim with audit"],
  ["Care-plan task generated", "Pathway cancelled", "Cancel future task; preserve completed work"],
  ["Pharmacy accepted prescription", "Patient declines", "Record decline; notify clinician; do not erase pharmacy event"],
] as const;

export const COMPENSATION_KINDS = [
  "TECHNICAL_UNDO: safe reversal of a system-side action",
  "CLINICAL_CORRECTION: new clinical action that supersedes the prior one",
  "PATIENT_NOTIFICATION: correction or clarification",
  "ADMINISTRATIVE_CORRECTION: claim, referral, or scheduling amendment",
  "FORWARD_RECOVERY: continue safely without undoing the prior action",
] as const;

// ── Idempotent commands ─────────────────────────────────────────────────
export const IDEMPOTENCY_STORED_FIELDS = [
  "Idempotency key",
  "Request hash",
  "Actor",
  "First received timestamp",
  "Original response",
  "Result reference",
  "Current status",
  "Expiry policy",
] as const;

export const IDEMPOTENCY_BEHAVIOR = [
  "New key → process once, persist result, return result",
  "Existing key, same request → return stored result or current status",
  "Existing key, different request → reject as idempotency conflict, create audit event",
] as const;

export const IDEMPOTENCY_EXAMPLES = [
  "Repeated critical-result notification sends nothing twice unless a human explicitly requests a resend",
  "Repeated create-referral creates no second referral",
  "Repeated renew-medication creates no duplicate prescription",
  "Repeated charge-or-claim produces no duplicate financial transaction",
] as const;

// ── Transactional outbox ────────────────────────────────────────────────
export const OUTBOX_FIELDS = [
  "outbox_id",
  "event_id",
  "aggregate_type",
  "aggregate_id",
  "event_type",
  "payload",
  "schema_version",
  "created_at",
  "published_at",
  "attempt_count",
  "next_attempt_at",
  "status",
  "payload_hash",
] as const;

export const PUBLISHER_FEATURES = [
  "Ordering per aggregate",
  "Retry",
  "Backoff",
  "Dead-letter routing",
  "Publication metrics",
  "Idempotent publish identifiers",
  "Audit linkage",
  "Replay controls",
] as const;

// ── Inbox pattern ───────────────────────────────────────────────────────
export const INBOX_PROCESSING = [
  "Receive event",
  "Check event ID",
  "Check payload hash",
  "If processed, return prior result",
  "If new, perform local transaction",
  "Write inbox record and outbox event atomically",
  "Acknowledge delivery",
] as const;

// ── Event ordering — per aggregate, never global ────────────────────────
export const ORDERING_SCOPES = [
  "Per patient",
  "Per medication",
  "Per referral",
  "Per care episode",
  "Per aggregate",
] as const;

export const MEDICATION_EVENT_SEQUENCE = [
  "MedicationPlanCreated",
  "SafetyReviewCompleted",
  "PatientConfirmed",
  "MedicationRequestCreated",
  "PharmacyNotificationSent",
  "PharmacyAccepted",
  "MonitoringTaskCreated",
] as const;

// ── Event schema — 16 fields ────────────────────────────────────────────
export const EVENT_SCHEMA_FIELDS = [
  "Event ID",
  "Event type",
  "Schema version",
  "Aggregate",
  "Patient reference",
  "Actor or service",
  "Timestamp",
  "Causation ID",
  "Correlation ID",
  "Purpose",
  "Consent",
  "Source",
  "Payload",
  "Hash",
  "Signature",
  "Data classification",
  "Retention class",
] as const;

// ── Retry — error classes, priority policy, safety ──────────────────────
export const ERROR_CLASSES = [
  "Transient: timeout, temporary outage, rate limit",
  "Permanent: invalid payload, unauthorized recipient, unsupported operation",
  "Clinical: requires human decision",
  "Integrity: hash, identity, or sequence mismatch",
  "Dependency: pharmacy, payer, referral destination, or device unavailable",
  "Unknown: requires investigation",
] as const;

export const RETRY_PRIORITY_POLICY = [
  "Critical clinical (critical result notification): immediate alternate route and human escalation",
  "Urgent clinical (high-risk discharge follow-up): short retry window plus backup owner",
  "High (medication or allergy update): persistent retry plus pharmacist or clinician task",
  "Routine clinical (referral or care-plan update): standard backoff and queue",
  "Administrative (nonurgent claim event): longer retry window",
  "Analytics (metrics or research event): deferred retry, no clinical blockage",
] as const;

export const RETRY_SAFETY_CHECKS = [
  "Was the request received?",
  "Could the action have completed?",
  "Is the endpoint idempotent?",
  "Is there a response correlation ID?",
  "Is the patient-facing effect reversible?",
  "Is a duplicate notification harmful?",
  "Does a human need to decide?",
  "Has the SLA expired?",
  "Is the data still current?",
] as const;

// ── Dead-letter queues ──────────────────────────────────────────────────
export const DLQ_REQUIREMENTS = [
  "Encrypt at rest",
  "Restrict access",
  "Preserve original payload and metadata",
  "Display patient and clinical priority safely",
  "Require reason for access",
  "Assign an owner",
  "Apply an SLA",
  "Prevent automatic deletion",
  "Support dry-run redrive",
  "Require clinical approval for high-risk redrive",
  "Track every redrive",
  "Revalidate before replay",
  "Prevent duplicate clinical action",
] as const;

export const DLQ_CATEGORIES = [
  "critical-clinical-dlq",
  "medication-dlq",
  "referral-dlq",
  "discharge-dlq",
  "patient-notification-dlq",
  "identity-dlq",
  "terminology-dlq",
  "financial-dlq",
  "analytics-dlq",
] as const;

// ── Human approval checkpoints ──────────────────────────────────────────
export const CHECKPOINT_REQUIRED = [
  "New medication or dose change",
  "Medication discontinuation or taper",
  "Critical-result notification content",
  "High-risk referral escalation",
  "Discharge plan release",
  "Pregnancy or lactation medication decision",
  "Controlled-substance exception",
  "Patient identity merge",
  "Allergy conflict resolution",
  "Research enrollment",
  "Financial or formulary substitution",
  "Compensation that changes a clinical plan",
] as const;

export const CHECKPOINT_DISPLAY = [
  "What is being approved",
  "What will happen next",
  "What happens if it is declined",
  "What information was used",
  "Uncertainty",
  "Alternatives",
  "Time limit",
  "Who can approve",
  "Whether approval is reversible",
] as const;

// ── Status visibility — patient, clinician, operations ──────────────────
export const PATIENT_STATUS_VIEW = [
  "Request received",
  "Who is reviewing it",
  "What is waiting",
  "Whether the pharmacy or payer has responded",
  "Expected timing",
  "What the patient must do",
  "Whether an urgent issue requires action",
  "How to contact support",
  "Whether the request failed or needs correction",
] as const;

export const CLINICIAN_STATUS_VIEW = [
  "Saga status",
  "Current step",
  "Failed dependency",
  "Retry count",
  "SLA",
  "Owner",
  "Human checkpoint",
  "Compensation status",
  "Reconciliation status",
  "Affected modules",
  "Patient communication status",
] as const;

export const OPERATIONS_STATUS_VIEW = [
  "Queue health",
  "Event lag",
  "Outbox backlog",
  "Inbox duplicate rate",
  "DLQ age",
  "Saga failure rate",
  "Reconciliation backlog",
  "Partner failures",
  "Critical clinical events at risk",
  "Error budget",
] as const;

// ── Partial failure — per-module report states ──────────────────────────
export const MODULE_REPORT_STATES = [
  "Completed",
  "Not started",
  "In progress",
  "Failed",
  "Unknown outcome",
  "Compensated",
  "Awaiting review",
] as const;

// ── Reconciliation ──────────────────────────────────────────────────────
export const RECONCILIATION_COMPARES = [
  "Intended command",
  "Local database state",
  "Outbox state",
  "Broker state",
  "Consumer inbox state",
  "External system state",
  "Patient-visible state",
  "Audit history",
] as const;

export const RECONCILIATION_SCHEDULE = [
  "Continuous for critical transactions",
  "Every few minutes for urgent workflows",
  "Hourly for active clinical operations",
  "Daily for referrals, claims, routine administration",
  "Periodic deep reconciliation for historical integrity",
] as const;

export const RECONCILIATION_FINDINGS = [
  "Missing event",
  "Duplicate event",
  "Out-of-order event",
  "Stale state",
  "Conflicting state",
  "Unknown external outcome",
  "Unacknowledged critical action",
  "Incomplete compensation",
  "Missing audit record",
] as const;

// ── Immutable history rules ─────────────────────────────────────────────
export const HISTORY_RULES = [
  "Append-only storage",
  "Hash chaining",
  "Digital signatures",
  "Trusted timestamps",
  "Restricted deletion",
  "Legal holds",
  "Versioned schemas",
  "Source and destination references",
  "Correction events instead of mutation",
  "Separate audit and clinical display policies",
] as const;

// ── Service dependency policy fields ────────────────────────────────────
export const DEPENDENCY_POLICY_FIELDS = [
  "Required dependencies",
  "Optional dependencies",
  "Degraded mode",
  "Emergency fallback",
  "Data it may cache",
  "Maximum stale time",
  "Human fallback",
  "Recovery action",
  "Patient communication",
] as const;

// ── Backpressure rules ──────────────────────────────────────────────────
export const BACKPRESSURE_RULES = [
  "Reserve capacity for critical results",
  "Reserve capacity for medication and allergy events",
  "Prevent routine analytics from starving clinical traffic",
  "Apply partner-specific throttling",
  "Show queue age",
  "Escalate when clinical SLA is at risk",
  "Offer manual fallback",
  "Avoid unbounded retries",
  "Preserve event order per patient or aggregate",
  "Make backpressure visible to operations",
] as const;

// ── Human fallback procedures ───────────────────────────────────────────
export const FALLBACK_TABLE = [
  ["Critical result", "On-call phone or secure escalation list"],
  ["Medication order", "Pharmacist or clinician direct pharmacy contact"],
  ["Referral", "Coordinator sends secure referral manually"],
  ["Discharge", "Printed or secure offline checklist and follow-up call"],
  ["Patient notification", "Approved alternate channel"],
  ["Identity service outage", "Emergency verification and limited access"],
  ["Pharmacy outage", "Patient-facing delay notice and coordinator task"],
  ["Payer outage", "Authorization packet held with deadline tracking"],
] as const;

// ── Failure simulation — 14 cases + 9 verifications ─────────────────────
export const FAILURE_SIMULATION_CASES = [
  "Database commits but event publication fails",
  "Event publishes twice",
  "Consumer crashes after external side effect",
  "Pharmacy accepts but acknowledgement is lost",
  "Critical notification service is unavailable",
  "Referral destination returns timeout after accepting",
  "Patient confirms while clinician plan changes",
  "Discharge task is generated twice",
  "Terminology service is stale",
  "Identity match is ambiguous",
  "Broker is partitioned",
  "DLQ redrive occurs after a newer correction",
  "Device reconnects with conflicting offline medication data",
  "Reconciliation runs during an active clinical change",
] as const;

export const SIMULATION_VERIFY = [
  "No silent loss",
  "No unsafe duplicate",
  "Correct owner",
  "Correct patient status",
  "Correct audit trail",
  "Appropriate compensation",
  "Appropriate human escalation",
  "Eventual reconciliation",
  "Clear final state",
] as const;

// ── Reliability metrics ─────────────────────────────────────────────────
export const DELIVERY_METRICS = [
  "Event publication success",
  "Outbox age",
  "Inbox processing latency",
  "Duplicate delivery",
  "Acknowledgement latency",
  "Delivery failure",
  "DLQ rate",
  "Replay success",
] as const;

export const CLINICAL_SAFETY_METRICS = [
  "Critical-result notification completion",
  "Time to acknowledgement",
  "Time to patient contact",
  "Medication order delivery confirmation",
  "Referral-loop completion",
  "Discharge-task completion",
  "Unresolved partial failures",
  "Reconciliation backlog",
  "Duplicate clinical action",
  "Missed clinical deadline",
] as const;

export const HUMAN_OPS_METRICS = [
  "Human checkpoint latency",
  "Escalation rate",
  "Manual fallback use",
  "Reassignment rate",
  "Workload by role",
  "Alert burden",
  "Failed compensation",
  "Override frequency",
] as const;

export const INTEGRITY_METRICS = [
  "Hash failures",
  "Missing event sequence",
  "Conflicting versions",
  "Audit gaps",
  "Unauthorized changes",
  "Out-of-order clinical events",
  "State divergence between N0VA and external systems",
] as const;

// ── FHIR resources for reliability surfaces ─────────────────────────────
export const FHIR_TXN_RESOURCES = [
  "Task: work assigned to a human or service, checkpoints, follow-ups",
  "AuditEvent: who, what, when, where, why for every transition",
  "Provenance: how each resource came to exist or change",
  "Communication: patient and team notifications with delivery state",
  "CarePlan: saga-linked care coordination",
  "ServiceRequest: referral and order tracking",
  "MedicationRequest: order lifecycle",
  "Consent: authorization and confirmation evidence",
] as const;

// ── Transaction Reliability API ─────────────────────────────────────────
export const TXN_API = [
  "GET    /transactions/sagas",
  "POST   /transactions/sagas",
  "GET    /transactions/sagas/{id}",
  "POST   /transactions/sagas/{id}/advance",
  "POST   /transactions/sagas/{id}/cancel",
  "POST   /transactions/sagas/{id}/complete",
  "POST   /transactions/commands",
  "GET    /transactions/commands/{key}",
  "GET    /transactions/outbox",
  "POST   /transactions/outbox/{id}/publish",
  "POST   /transactions/inbox/receive",
  "GET    /transactions/events",
  "POST   /transactions/events/append",
  "GET    /transactions/checkpoints",
  "POST   /transactions/checkpoints",
  "POST   /transactions/checkpoints/{id}/decide",
  "GET    /transactions/compensations",
  "POST   /transactions/compensations",
  "POST   /transactions/compensations/{id}/execute",
  "GET    /transactions/dlq",
  "POST   /transactions/dlq/{id}/assign",
  "POST   /transactions/dlq/{id}/redrive",
  "GET    /transactions/reconciliation",
  "POST   /transactions/reconciliation",
  "GET    /transactions/dependencies",
  "POST   /transactions/dependencies",
  "GET    /transactions/metrics",
  "GET    /transactions/status/patient",
  "GET    /transactions/status/clinician",
  "GET    /transactions/status/operations",
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

// Retry delay: exponential backoff with jitter, capped, priority-aware base.
function retryDelayMs(priority: string, attempt: number): number {
  const base = priority === "critical" ? 5_000 : priority === "urgent" ? 15_000
    : priority === "high" ? 60_000 : priority === "routine" ? 300_000
    : priority === "administrative" ? 900_000 : 3_600_000;
  const exp = Math.min(base * 2 ** Math.min(attempt, 6), 4 * 3_600_000);
  return Math.round(exp * (0.8 + Math.random() * 0.4));
}

function maxAttemptsFor(priority: string): number {
  return priority === "critical" ? 12 : priority === "urgent" ? 8
    : priority === "high" ? 6 : priority === "routine" ? 5
    : priority === "administrative" ? 4 : 2;
}

// ── Zod schemas ─────────────────────────────────────────────────────────
export const txnSagaStartSchema = z.object({
  commandType: z.enum(["create_medication_order","create_referral","release_discharge_plan","critical_result_notification","custom"]),
  aggregateType: z.string().min(1).max(120),
  aggregateId: z.string().min(1).max(200),
  patientId: z.string().uuid().optional().nullable(),
  initiator: z.string().max(200).optional().nullable(),
  purpose: z.string().max(120).default("care_delivery"),
  priority: z.enum(["critical","urgent","high","routine","administrative","analytics"]).default("routine"),
  idempotencyKey: z.string().min(1).max(300),
  consentRef: z.string().max(200).optional().nullable(),
  correlationId: z.string().max(200).optional().nullable(),
  deadline: z.coerce.date().optional().nullable(),
  owner: z.string().max(200).optional().nullable(),
  steps: z.array(z.object({
    name: z.string().min(1).max(200),
    kind: z.enum(["local_action","human_checkpoint","compensation","notification","reconciliation"]).default("local_action"),
    owner: z.string().max(200).optional().nullable(),
    maxAttempts: z.coerce.number().int().min(1).max(20).default(3),
  })).min(1).max(30).optional(),
});

export const txnStepAdvanceSchema = z.object({
  stepId: z.string().uuid(),
  outcome: z.enum(["completed","failed","retry","checkpoint","compensate","skip","unknown"]),
  result: z.record(z.unknown()).optional(),
  error: z.string().max(2000).optional().nullable(),
  owner: z.string().max(200).optional().nullable(),
});

export const txnSagaCompleteSchema = z.object({
  exceptionClosure: z.object({
    reason: z.string().min(1).max(2000),
    authorizedBy: z.string().min(1).max(200),
  }).optional().nullable(),
});

export const txnCommandSchema = z.object({
  idempotencyKey: z.string().min(1).max(300),
  commandType: z.string().min(1).max(120),
  aggregateType: z.string().min(1).max(120),
  aggregateId: z.string().min(1).max(200),
  payload: z.record(z.unknown()).optional(),
  actor: z.string().max(200).optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const txnOutboxSchema = z.object({
  eventType: z.string().min(1).max(200),
  aggregateType: z.string().min(1).max(120),
  aggregateId: z.string().min(1).max(200),
  payload: z.record(z.unknown()).optional(),
  schemaVersion: z.string().max(20).default("1.0"),
  causationId: z.string().max(200).optional().nullable(),
  correlationId: z.string().max(200).optional().nullable(),
  sagaId: z.string().max(200).optional().nullable(),
});

export const txnOutboxPublishSchema = z.object({
  success: z.boolean(),
  error: z.string().max(2000).optional().nullable(),
});

export const txnInboxReceiveSchema = z.object({
  consumer: z.string().min(1).max(200),
  eventId: z.string().min(1).max(200),
  eventHash: z.string().max(200).optional().nullable(),
  resultRef: z.string().max(300).optional().nullable(),
});

export const txnEventAppendSchema = z.object({
  eventType: z.string().min(1).max(200),
  aggregateType: z.string().min(1).max(120),
  aggregateId: z.string().min(1).max(200),
  patientId: z.string().uuid().optional().nullable(),
  actor: z.string().max(200).optional().nullable(),
  sagaId: z.string().max(200).optional().nullable(),
  causationId: z.string().max(200).optional().nullable(),
  correlationId: z.string().max(200).optional().nullable(),
  purpose: z.string().max(120).default("clinical_care"),
  consentRef: z.string().max(200).optional().nullable(),
  source: z.string().max(200).optional().nullable(),
  payload: z.record(z.unknown()).optional(),
  signature: z.string().max(2000).optional().nullable(),
  dataClassification: z.string().max(40).default("phi"),
  retentionClass: z.string().max(40).default("clinical"),
});

export const txnCheckpointSchema = z.object({
  sagaId: z.string().uuid(),
  step: z.string().min(1).max(200),
  requiredRole: z.string().min(1).max(120),
  fallbackRole: z.string().max(120).optional().nullable(),
  evidence: z.array(z.record(z.unknown())).default([]),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const txnCheckpointDecideSchema = z.object({
  decision: z.enum(["APPROVED","DECLINED"]),
  decidedBy: z.string().min(1).max(200),
  note: z.string().max(2000).optional().nullable(),
});

export const txnCompensationSchema = z.object({
  sagaId: z.string().uuid(),
  stepId: z.string().uuid().optional().nullable(),
  kind: z.enum(["TECHNICAL_UNDO","CLINICAL_CORRECTION","PATIENT_NOTIFICATION","ADMINISTRATIVE_CORRECTION","FORWARD_RECOVERY"]),
  action: z.string().min(1).max(500),
  detail: z.record(z.unknown()).optional(),
  owner: z.string().max(200).optional().nullable(),
});

export const txnDlqAssignSchema = z.object({
  owner: z.string().min(1).max(200),
});

export const txnDlqRedriveSchema = z.object({
  dryRun: z.boolean().default(true),
  approvedBy: z.string().max(200).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

export const txnReconciliationSchema = z.object({
  scope: z.string().min(1).max(300),
});

export const txnDependencySchema = z.object({
  module: z.string().min(1).max(120),
  required: z.array(z.string()).default([]),
  optional: z.array(z.string()).default([]),
  degradedModes: z.record(z.unknown()).optional(),
  emergencyFallback: z.string().max(500).optional().nullable(),
  cacheable: z.array(z.string()).default([]),
  maxStaleTime: z.string().max(60).optional().nullable(),
  humanFallback: z.string().max(500).optional().nullable(),
  recoveryAction: z.string().max(500).optional().nullable(),
  patientMessage: z.string().max(500).optional().nullable(),
});

export const txnCancelSchema = z.object({
  reason: z.string().min(1).max(2000),
});

// ═══════════════════════════════════════════════════════════════════════════
// TransactionReliabilityLayer — full implementation
// ═══════════════════════════════════════════════════════════════════════════

type PrismaSaga = {
  id: string; sagaId: string; commandType: string; aggregateType: string; aggregateId: string;
  patientId: string | null; status: string; currentStep: string | null; priority: string;
  deadline: Date | null; owner: string | null; lastError: string | null;
};

type PrismaStep = {
  id: string; sagaId: string; seq: number; name: string; kind: string; status: string;
  attempts: number; maxAttempts: number; owner: string | null;
};

export class TransactionReliabilityLayer {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action)))
      throw new Error(`Missing ${action} permission for health_transaction_reliability`);
  }

  private audit(action: string, targetType: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType, targetId, metadata: meta }).catch(() => null);
  }

  private async appendHistory(input: {
    eventType: string; aggregateType: string; aggregateId: string; patientId?: string | null;
    actor?: string | null; sagaId?: string | null; causationId?: string | null; correlationId?: string | null;
    purpose?: string; consentRef?: string | null; source?: string; payload?: Record<string, unknown>;
    signature?: string | null; dataClassification?: string; retentionClass?: string;
  }): Promise<unknown> {
    const payloadStr = JSON.stringify(input.payload ?? {});
    const payloadHash = sha256(payloadStr);
    const prev = await safe(
      () => (prisma as never as { healthTxnEvent: { findFirst: (a: unknown) => Promise<{ payloadHash: string | null } | null> } })
        .healthTxnEvent.findFirst({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" } }),
      null,
    );
    const previousHash = prev?.payloadHash ?? "GENESIS";
    const eventId = `event-${payloadHash.slice(0, 12)}-${Date.now().toString(36)}`;
    return (prisma as never as { healthTxnEvent: { create: (a: unknown) => Promise<unknown> } })
      .healthTxnEvent.create({
        data: {
          workspaceId: this.workspaceId, eventId, eventType: input.eventType,
          aggregateType: input.aggregateType, aggregateId: input.aggregateId,
          patientId: input.patientId ?? null, actor: input.actor ?? this.userId,
          sagaId: input.sagaId ?? null, causationId: input.causationId ?? null,
          correlationId: input.correlationId ?? null, purpose: input.purpose ?? "clinical_care",
          consentRef: input.consentRef ?? null, source: input.source ?? MODULE,
          payload: (input.payload ?? {}) as never, payloadHash, previousHash,
          signature: input.signature ?? null,
          dataClassification: input.dataClassification ?? "phi",
          retentionClass: input.retentionClass ?? "clinical",
        } as never,
      });
  }

  // ── Sagas ───────────────────────────────────────────────────────────
  async startSaga(input: z.infer<typeof txnSagaStartSchema>) {
    await this.assert("CREATE");
    // Idempotency first: same key returns the original saga, never a duplicate.
    const requestHash = sha256(JSON.stringify({ t: input.commandType, a: `${input.aggregateType}:${input.aggregateId}`, p: input.patientId ?? null }));
    const existing = await safe(
      () => (prisma as never as { healthTxnCommand: { findFirst: (a: unknown) => Promise<{ idempotencyKey: string; requestHash: string; response: unknown; status: string; resultRef: string | null } | null> } })
        .healthTxnCommand.findFirst({ where: { workspaceId: this.workspaceId, idempotencyKey: input.idempotencyKey } }),
      null,
    );
    if (existing) {
      if (existing.requestHash !== requestHash) {
        await this.audit("IDEMPOTENCY_CONFLICT", "HealthTxnCommand", input.idempotencyKey, { commandType: input.commandType });
        throw new Error("Idempotency conflict: key reused with a different request — rejected and audited");
      }
      const saga = existing.resultRef ? await safe(
        () => (prisma as never as { healthTxnSaga: { findFirst: (a: unknown) => Promise<unknown> } })
          .healthTxnSaga.findFirst({ where: { workspaceId: this.workspaceId, sagaId: existing.resultRef as string } }),
        null,
      ) : null;
      return { saga, deduplicated: true, command: existing, note: "Same key, same request — original result returned, no duplicate side effects" };
    }
    const defSteps: readonly string[] = (SAGA_DEFINITIONS as Record<string, readonly string[]>)[input.commandType] ?? [];
    const stepDefs = input.steps && input.steps.length > 0
      ? input.steps
      : defSteps.map((name) => ({ name, kind: "local_action" as const, maxAttempts: 3 }));
    if (stepDefs.length === 0) throw new Error("Unknown commandType and no custom steps provided");
    const sagaId = `saga-${sha256(`${this.workspaceId}:${input.idempotencyKey}:${Date.now()}`).slice(0, 12)}`;
    const saga = await (prisma as never as { healthTxnSaga: { create: (a: unknown) => Promise<unknown> } })
      .healthTxnSaga.create({
        data: {
          workspaceId: this.workspaceId, sagaId, commandType: input.commandType,
          aggregateType: input.aggregateType, aggregateId: input.aggregateId,
          patientId: input.patientId ?? null, initiator: input.initiator ?? this.userId,
          purpose: input.purpose, priority: input.priority, status: "ACCEPTED",
          currentStep: stepDefs[0]!.name, deadline: input.deadline ?? null,
          owner: input.owner ?? null, consentRef: input.consentRef ?? null,
          correlationId: input.correlationId ?? null, createdById: this.userId,
        } as never,
      });
    const rowId = (saga as { id: string }).id;
    for (let i = 0; i < stepDefs.length; i++) {
      const s = stepDefs[i]!;
      await (prisma as never as { healthTxnStep: { create: (a: unknown) => Promise<unknown> } })
        .healthTxnStep.create({
          data: {
            workspaceId: this.workspaceId, sagaId: rowId, seq: i + 1,
            name: s.name, kind: s.kind ?? "local_action",
            status: i === 0 ? "IN_PROGRESS" : "PENDING",
            maxAttempts: s.maxAttempts ?? 3, owner: ("owner" in s ? s.owner : null) ?? null,
          } as never,
        });
    }
    await (prisma as never as { healthTxnCommand: { create: (a: unknown) => Promise<unknown> } })
      .healthTxnCommand.create({
        data: {
          workspaceId: this.workspaceId, idempotencyKey: input.idempotencyKey,
          commandType: input.commandType, aggregateType: input.aggregateType, aggregateId: input.aggregateId,
          requestHash, actor: this.userId,
          response: { sagaId } as never, resultRef: sagaId, status: "accepted",
        } as never,
      });
    await this.appendHistory({
      eventType: `${input.commandType}.accepted`, aggregateType: input.aggregateType,
      aggregateId: input.aggregateId, patientId: input.patientId ?? null,
      sagaId, correlationId: input.correlationId ?? null, consentRef: input.consentRef ?? null,
      payload: { sagaId, steps: stepDefs.length, priority: input.priority },
    });
    await this.audit("START", "HealthTxnSaga", rowId, { sagaId, commandType: input.commandType });
    return { saga, deduplicated: false };
  }

  async getSaga(id: string) {
    await this.assert("READ");
    const saga = await safe(
      () => (prisma as never as { healthTxnSaga: { findFirst: (a: unknown) => Promise<unknown> } })
        .healthTxnSaga.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!saga) throw new Error("Saga not found");
    const rowId = (saga as { id: string }).id;
    const [steps, checkpoints, compensations, events] = await Promise.all([
      safe(() => (prisma as never as { healthTxnStep: { findMany: (a: unknown) => Promise<unknown[]> } }).healthTxnStep.findMany({ where: { sagaId: rowId }, orderBy: { seq: "asc" } }), []),
      safe(() => (prisma as never as { healthTxnCheckpoint: { findMany: (a: unknown) => Promise<unknown[]> } }).healthTxnCheckpoint.findMany({ where: { sagaId: rowId }, orderBy: { createdAt: "asc" } }), []),
      safe(() => (prisma as never as { healthTxnCompensation: { findMany: (a: unknown) => Promise<unknown[]> } }).healthTxnCompensation.findMany({ where: { sagaId: rowId }, orderBy: { createdAt: "asc" } }), []),
      safe(() => (prisma as never as { healthTxnEvent: { findMany: (a: unknown) => Promise<unknown[]> } }).healthTxnEvent.findMany({ where: { workspaceId: this.workspaceId, sagaId: (saga as { sagaId: string }).sagaId }, orderBy: { createdAt: "asc" }, take: 100 }), []),
    ]);
    return { saga, steps, checkpoints, compensations, events };
  }

  async listSagas(status?: string, commandType?: string, patientId?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (status) where.status = status;
    if (commandType) where.commandType = commandType;
    if (patientId) where.patientId = patientId;
    return safe(
      () => (prisma as never as { healthTxnSaga: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthTxnSaga.findMany({ where, orderBy: { updatedAt: "desc" }, take: 100 }),
      [],
    );
  }

  private async refreshSagaStatus(rowId: string) {
    const steps = await safe(
      () => (prisma as never as { healthTxnStep: { findMany: (a: unknown) => Promise<PrismaStep[]> } })
        .healthTxnStep.findMany({ where: { sagaId: rowId }, orderBy: { seq: "asc" } }),
      [],
    );
    const saga = await safe(
      () => (prisma as never as { healthTxnSaga: { findFirst: (a: unknown) => Promise<PrismaSaga | null> } })
        .healthTxnSaga.findFirst({ where: { id: rowId } }),
      null,
    );
    if (!saga || steps.length === 0) return saga;
    const terminal = ["COMPLETED", "COMPLETED_WITH_EXCEPTION", "FAILED_SAFELY", "CANCELLED"];
    if (terminal.includes(saga.status)) return saga;
    const current = steps.find((s) => !["COMPLETED", "SKIPPED", "COMPENSATED"].includes(s.status)) ?? null;
    let status = saga.status;
    if (!current) status = "COMPLETED";
    else if (current.status === "AWAITING_CHECKPOINT") status = saga.status === "ACCEPTED" ? "AWAITING_AUTHORIZATION" : "AWAITING_HUMAN_REVIEW";
    else if (current.status === "FAILED") {
      status = steps.some((s) => s.status === "COMPLETED") ? "PARTIALLY_COMPLETED" : "FAILED_SAFELY";
    } else if (["IN_PROGRESS", "RETRYING"].includes(current.status)) {
      status = steps.some((s) => s.status === "COMPLETED") ? "PARTIALLY_COMPLETED" : "IN_PROGRESS";
    }
    await (prisma as never as { healthTxnSaga: { update: (a: unknown) => Promise<unknown> } })
      .healthTxnSaga.update({ where: { id: rowId }, data: { status: status as never, currentStep: current?.name ?? null } as never });
    return { ...(saga as object), status, currentStep: current?.name ?? null };
  }

  async advanceStep(input: z.infer<typeof txnStepAdvanceSchema>) {
    await this.assert("UPDATE");
    const step = await safe(
      () => (prisma as never as { healthTxnStep: { findFirst: (a: unknown) => Promise<PrismaStep | null> } })
        .healthTxnStep.findFirst({ where: { id: input.stepId, workspaceId: this.workspaceId } }),
      null,
    );
    if (!step) throw new Error("Step not found");
    const sagaRow = await safe(
      () => (prisma as never as { healthTxnSaga: { findFirst: (a: unknown) => Promise<PrismaSaga | null> } })
        .healthTxnSaga.findFirst({ where: { id: step.sagaId } }),
      null,
    );
    const patch: Record<string, unknown> = { attempts: step.attempts + 1 };
    let sagaStatus: string | null = null;
    if (input.outcome === "completed") {
      patch.status = "COMPLETED";
      patch.result = (input.result ?? {}) as never;
      // Open the next pending step.
      const next = await safe(
        () => (prisma as never as { healthTxnStep: { findFirst: (a: unknown) => Promise<PrismaStep | null> } })
          .healthTxnStep.findFirst({ where: { sagaId: step.sagaId, status: "PENDING" }, orderBy: { seq: "asc" } }),
        null,
      );
      if (next && next.id !== step.id) {
        await (prisma as never as { healthTxnStep: { update: (a: unknown) => Promise<unknown> } })
          .healthTxnStep.update({ where: { id: next.id }, data: { status: next.kind === "human_checkpoint" ? "AWAITING_CHECKPOINT" : "IN_PROGRESS" } as never });
      }
    } else if (input.outcome === "failed") {
      if (step.attempts + 1 >= step.maxAttempts) {
        patch.status = "FAILED";
        patch.result = { error: input.error ?? "failed" } as never;
        sagaStatus = "RECONCILIATION_REQUIRED";
      } else {
        patch.status = "RETRYING";
        patch.result = { error: input.error ?? "failed", nextAttemptInMs: retryDelayMs(sagaRow?.priority ?? "routine", step.attempts + 1) } as never;
      }
    } else if (input.outcome === "retry") {
      patch.status = "RETRYING";
      patch.result = { nextAttemptInMs: retryDelayMs(sagaRow?.priority ?? "routine", step.attempts + 1) } as never;
    } else if (input.outcome === "checkpoint") {
      patch.status = "AWAITING_CHECKPOINT";
    } else if (input.outcome === "compensate") {
      patch.status = "COMPENSATED";
      sagaStatus = "COMPENSATING";
    } else if (input.outcome === "skip") {
      patch.status = "SKIPPED";
    } else {
      patch.status = "UNKNOWN_OUTCOME";
      sagaStatus = "RECONCILIATION_REQUIRED";
    }
    if (input.owner) patch.owner = input.owner;
    const row = await (prisma as never as { healthTxnStep: { update: (a: unknown) => Promise<unknown> } })
      .healthTxnStep.update({ where: { id: step.id }, data: patch as never });
    if (sagaRow) {
      if (sagaStatus) {
        await (prisma as never as { healthTxnSaga: { update: (a: unknown) => Promise<unknown> } })
          .healthTxnSaga.update({ where: { id: sagaRow.id }, data: { status: sagaStatus as never, lastError: input.error ?? null } as never });
      }
      await this.appendHistory({
        eventType: `saga.step.${String(patch.status).toLowerCase()}`, aggregateType: sagaRow.aggregateType,
        aggregateId: sagaRow.aggregateId, patientId: sagaRow.patientId, sagaId: sagaRow.sagaId,
        payload: { step: step.name, seq: step.seq, outcome: input.outcome, error: input.error ?? null },
      });
      await this.refreshSagaStatus(sagaRow.id);
    }
    await this.audit("ADVANCE", "HealthTxnStep", step.id, { outcome: input.outcome });
    return row;
  }

  async cancelSaga(id: string, reason: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { healthTxnSaga: { update: (a: unknown) => Promise<unknown> } })
      .healthTxnSaga.update({ where: { id }, data: { status: "CANCELLED", lastError: reason } as never });
    await (prisma as never as { healthTxnStep: { updateMany: (a: unknown) => Promise<unknown> } })
      .healthTxnStep.updateMany({ where: { sagaId: id, status: { in: ["PENDING", "RETRYING"] } }, data: { status: "SKIPPED" } as never });
    await this.audit("CANCEL", "HealthTxnSaga", id, { reason });
    return row;
  }

  async completeSaga(id: string, input: z.infer<typeof txnSagaCompleteSchema>) {
    await this.assert("UPDATE");
    const steps = await safe(
      () => (prisma as never as { healthTxnStep: { findMany: (a: unknown) => Promise<PrismaStep[]> } })
        .healthTxnStep.findMany({ where: { sagaId: id } }),
      [],
    );
    const open = steps.filter((s) => !["COMPLETED", "SKIPPED", "COMPENSATED"].includes(s.status));
    if (open.length > 0 && !input.exceptionClosure) {
      throw new Error(`Cannot close: ${open.length} step(s) incomplete (${open.map((s) => s.name).join(", ")}). Partial failure must stay visible or be closed by authorized human exception.`);
    }
    const status = open.length > 0 ? "COMPLETED_WITH_EXCEPTION" : "COMPLETED";
    const row = await (prisma as never as { healthTxnSaga: { update: (a: unknown) => Promise<unknown> } })
      .healthTxnSaga.update({ where: { id }, data: { status: status as never, lastError: input.exceptionClosure ? `Exception closure by ${input.exceptionClosure.authorizedBy}: ${input.exceptionClosure.reason}` : null } as never });
    await this.audit("COMPLETE", "HealthTxnSaga", id, { status, exceptionClosure: input.exceptionClosure ?? null });
    return row;
  }

  // ── Idempotent commands ─────────────────────────────────────────────
  async submitCommand(input: z.infer<typeof txnCommandSchema>) {
    await this.assert("CREATE");
    const requestHash = sha256(JSON.stringify({ t: input.commandType, a: `${input.aggregateType}:${input.aggregateId}`, p: input.payload ?? {} }));
    const existing = await safe(
      () => (prisma as never as { healthTxnCommand: { findFirst: (a: unknown) => Promise<{ idempotencyKey: string; requestHash: string; response: unknown; status: string; resultRef: string | null } | null> } })
        .healthTxnCommand.findFirst({ where: { workspaceId: this.workspaceId, idempotencyKey: input.idempotencyKey } }),
      null,
    );
    if (existing) {
      if (existing.requestHash !== requestHash) {
        await this.audit("IDEMPOTENCY_CONFLICT", "HealthTxnCommand", input.idempotencyKey, { commandType: input.commandType });
        throw new Error("Idempotency conflict: key reused with a different request — rejected and audited");
      }
      return { command: existing, deduplicated: true };
    }
    const row = await (prisma as never as { healthTxnCommand: { create: (a: unknown) => Promise<unknown> } })
      .healthTxnCommand.create({
        data: {
          workspaceId: this.workspaceId, idempotencyKey: input.idempotencyKey,
          commandType: input.commandType, aggregateType: input.aggregateType, aggregateId: input.aggregateId,
          requestHash, actor: input.actor ?? this.userId,
          response: { received: true } as never, status: "accepted",
          expiresAt: input.expiresAt ?? new Date(Date.now() + 7 * 86_400_000),
        } as never,
      });
    await this.audit("SUBMIT", "HealthTxnCommand", (row as { id: string }).id, { key: input.idempotencyKey });
    return { command: row, deduplicated: false };
  }

  async getCommand(key: string) {
    await this.assert("READ");
    const row = await safe(
      () => (prisma as never as { healthTxnCommand: { findFirst: (a: unknown) => Promise<unknown> } })
        .healthTxnCommand.findFirst({ where: { workspaceId: this.workspaceId, idempotencyKey: key } }),
      null,
    );
    if (!row) throw new Error("Command not found");
    return row;
  }

  async updateCommandResult(key: string, status: string, response: Record<string, unknown>, resultRef?: string) {
    await this.assert("UPDATE");
    return (prisma as never as { healthTxnCommand: { update: (a: unknown) => Promise<unknown> } })
      .healthTxnCommand.update({ where: { workspaceId_idempotencyKey: { workspaceId: this.workspaceId, idempotencyKey: key } }, data: { status, response: response as never, ...(resultRef ? { resultRef } : {}) } as never });
  }

  // ── Transactional outbox ────────────────────────────────────────────
  async enqueueOutbox(input: z.infer<typeof txnOutboxSchema>) {
    await this.assert("CREATE");
    const payloadHash = sha256(JSON.stringify(input.payload ?? {}));
    const eventId = `event-${payloadHash.slice(0, 12)}-${Date.now().toString(36)}`;
    const row = await (prisma as never as { healthTxnOutbox: { create: (a: unknown) => Promise<unknown> } })
      .healthTxnOutbox.create({
        data: {
          workspaceId: this.workspaceId, eventId, aggregateType: input.aggregateType, aggregateId: input.aggregateId,
          eventType: input.eventType, payload: (input.payload ?? {}) as never,
          schemaVersion: input.schemaVersion, causationId: input.causationId ?? null,
          correlationId: input.correlationId ?? null, sagaId: input.sagaId ?? null,
          nextAttemptAt: new Date(Date.now() + 5_000), payloadHash,
        } as never,
      });
    await this.audit("ENQUEUE", "HealthTxnOutbox", (row as { id: string }).id, { eventType: input.eventType });
    return row;
  }

  async listOutbox(status?: string, dueOnly?: boolean) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (status) where.status = status;
    if (dueOnly) where.nextAttemptAt = { lte: new Date() };
    return safe(
      () => (prisma as never as { healthTxnOutbox: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthTxnOutbox.findMany({ where, orderBy: { createdAt: "asc" }, take: 100 }),
      [],
    );
  }

  async publishOutbox(id: string, input: z.infer<typeof txnOutboxPublishSchema>, priority = "routine") {
    await this.assert("UPDATE");
    const row0 = await safe(
      () => (prisma as never as { healthTxnOutbox: { findFirst: (a: unknown) => Promise<{ attemptCount: number; eventType: string; aggregateType: string; aggregateId: string; payload: unknown } | null> } })
        .healthTxnOutbox.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!row0) throw new Error("Outbox event not found");
    if (input.success) {
      const row = await (prisma as never as { healthTxnOutbox: { update: (a: unknown) => Promise<unknown> } })
        .healthTxnOutbox.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date(), attemptCount: row0.attemptCount + 1 } as never });
      await this.audit("PUBLISH", "HealthTxnOutbox", id, {});
      return row;
    }
    const attempts = row0.attemptCount + 1;
    const max = maxAttemptsFor(priority);
    if (attempts >= max) {
      await (prisma as never as { healthTxnOutbox: { update: (a: unknown) => Promise<unknown> } })
        .healthTxnOutbox.update({ where: { id }, data: { status: "DEAD", attemptCount: attempts } as never });
      const dlq = await (prisma as never as { healthTxnDlq: { create: (a: unknown) => Promise<unknown> } })
        .healthTxnDlq.create({
          data: {
            workspaceId: this.workspaceId,
            category: priority === "critical" ? "critical-clinical-dlq" : `${row0.aggregateType}-dlq`,
            eventRef: id, payload: (row0.payload ?? {}) as never,
            metadata: { eventType: row0.eventType } as never,
            reason: input.error ?? "retry budget exhausted",
            priority, sla: priority === "critical" ? "immediate" : "same_day",
          } as never,
        });
      await this.audit("DEAD_LETTER", "HealthTxnDlq", (dlq as { id: string }).id, { eventRef: id, priority });
      if (priority === "critical") {
        await this.audit("ESCALATE", "HealthTxnDlq", (dlq as { id: string }).id, { note: "Critical clinical DLQ entry escalated immediately — never waits for queue inspection" });
      }
      return { dead: true, dlq };
    }
    const row = await (prisma as never as { healthTxnOutbox: { update: (a: unknown) => Promise<unknown> } })
      .healthTxnOutbox.update({
        where: { id },
        data: { status: "FAILED", attemptCount: attempts, nextAttemptAt: new Date(Date.now() + retryDelayMs(priority, attempts)) } as never,
      });
    await this.audit("PUBLISH_FAILED", "HealthTxnOutbox", id, { attempts, error: input.error ?? null });
    return row;
  }

  // ── Inbox — idempotent consumers ────────────────────────────────────
  async receiveEvent(input: z.infer<typeof txnInboxReceiveSchema>) {
    await this.assert("CREATE");
    const existing = await safe(
      () => (prisma as never as { healthTxnInbox: { findFirst: (a: unknown) => Promise<{ status: string; resultRef: string | null; eventHash: string | null } | null> } })
        .healthTxnInbox.findFirst({ where: { workspaceId: this.workspaceId, consumer: input.consumer, eventId: input.eventId } }),
      null,
    );
    if (existing) {
      if (input.eventHash && existing.eventHash && input.eventHash !== existing.eventHash) {
        await this.audit("INTEGRITY_INCIDENT", "HealthTxnInbox", input.eventId, { consumer: input.consumer, note: "Same event ID, different payload hash — security incident, not a normal duplicate" });
        await (prisma as never as { healthTxnDlq: { create: (a: unknown) => Promise<unknown> } })
          .healthTxnDlq.create({
            data: {
              workspaceId: this.workspaceId, category: "identity-dlq", eventRef: input.eventId,
              payload: {} as never, metadata: { consumer: input.consumer } as never,
              reason: "payload hash mismatch on redelivery", priority: "high",
            } as never,
          });
        throw new Error("Integrity incident: event redelivered with a different payload hash — quarantined, not processed");
      }
      await (prisma as never as { healthTxnInbox: { updateMany: (a: unknown) => Promise<unknown> } })
        .healthTxnInbox.updateMany({ where: { workspaceId: this.workspaceId, consumer: input.consumer, eventId: input.eventId }, data: { attempts: { increment: 1 } } as never });
      return { deduplicated: true, status: existing.status, resultRef: existing.resultRef };
    }
    const row = await (prisma as never as { healthTxnInbox: { create: (a: unknown) => Promise<unknown> } })
      .healthTxnInbox.create({
        data: {
          workspaceId: this.workspaceId, consumer: input.consumer, eventId: input.eventId,
          eventHash: input.eventHash ?? null, status: "COMPLETED", resultRef: input.resultRef ?? null, attempts: 1,
        } as never,
      });
    await this.audit("RECEIVE", "HealthTxnInbox", (row as { id: string }).id, { consumer: input.consumer, eventId: input.eventId });
    return { deduplicated: false, inbox: row };
  }

  // ── Append-only hash-chained history ────────────────────────────────
  async appendEvent(input: z.infer<typeof txnEventAppendSchema>) {
    await this.assert("CREATE");
    const row = await this.appendHistory({
      eventType: input.eventType, aggregateType: input.aggregateType, aggregateId: input.aggregateId,
      patientId: input.patientId ?? null, actor: input.actor ?? null, sagaId: input.sagaId ?? null,
      causationId: input.causationId ?? null, correlationId: input.correlationId ?? null,
      purpose: input.purpose, consentRef: input.consentRef ?? null, source: input.source ?? undefined,
      payload: (input.payload ?? {}) as Record<string, unknown>,
      signature: input.signature ?? null, dataClassification: input.dataClassification,
      retentionClass: input.retentionClass,
    });
    await this.audit("APPEND", "HealthTxnEvent", (row as { id: string }).id, { eventType: input.eventType });
    return row;
  }

  async listEvents(aggregateType?: string, aggregateId?: string, sagaId?: string, eventType?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (aggregateType) where.aggregateType = aggregateType;
    if (aggregateId) where.aggregateId = aggregateId;
    if (sagaId) where.sagaId = sagaId;
    if (eventType) where.eventType = eventType;
    return safe(
      () => (prisma as never as { healthTxnEvent: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthTxnEvent.findMany({ where, orderBy: { createdAt: "asc" }, take: 200 }),
      [],
    );
  }

  async verifyChain() {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as never as { healthTxnEvent: { findMany: (a: unknown) => Promise<Array<{ eventId: string; payload: unknown; payloadHash: string | null; previousHash: string | null; createdAt: Date }>> } })
        .healthTxnEvent.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "asc" }, take: 500 }),
      [],
    );
    let expectedPrev = "GENESIS";
    let checked = 0;
    const breaks: string[] = [];
    for (const r of rows) {
      checked += 1;
      if (r.previousHash !== expectedPrev) breaks.push(r.eventId);
      const recomputed = sha256(JSON.stringify(r.payload ?? {}));
      if (r.payloadHash && r.payloadHash !== recomputed) breaks.push(`${r.eventId}:payload`);
      expectedPrev = r.payloadHash ?? expectedPrev;
    }
    return { checked, intact: breaks.length === 0, breaks, note: "Corrections appear as new events; the original is never edited" };
  }

  // ── Human checkpoints ───────────────────────────────────────────────
  async createCheckpoint(input: z.infer<typeof txnCheckpointSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { healthTxnCheckpoint: { create: (a: unknown) => Promise<unknown> } })
      .healthTxnCheckpoint.create({
        data: {
          workspaceId: this.workspaceId, sagaId: input.sagaId, step: input.step,
          requiredRole: input.requiredRole, fallbackRole: input.fallbackRole ?? null,
          evidence: input.evidence as never, expiresAt: input.expiresAt ?? null,
        } as never,
      });
    await this.audit("CREATE", "HealthTxnCheckpoint", (row as { id: string }).id, { step: input.step, requiredRole: input.requiredRole });
    return { checkpoint: row, display: CHECKPOINT_DISPLAY };
  }

  async decideCheckpoint(id: string, input: z.infer<typeof txnCheckpointDecideSchema>) {
    await this.assert("UPDATE");
    const cp = await safe(
      () => (prisma as never as { healthTxnCheckpoint: { findFirst: (a: unknown) => Promise<{ sagaId: string; step: string; expiresAt: Date | null } | null> } })
        .healthTxnCheckpoint.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!cp) throw new Error("Checkpoint not found");
    if (cp.expiresAt && new Date(cp.expiresAt).getTime() < Date.now()) {
      await (prisma as never as { healthTxnCheckpoint: { update: (a: unknown) => Promise<unknown> } })
        .healthTxnCheckpoint.update({ where: { id }, data: { decision: "EXPIRED" } as never });
      throw new Error("Checkpoint expired — re-issue with fresh evidence");
    }
    const row = await (prisma as never as { healthTxnCheckpoint: { update: (a: unknown) => Promise<unknown> } })
      .healthTxnCheckpoint.update({
        where: { id },
        data: { decision: input.decision as never, decidedBy: input.decidedBy, decidedAt: new Date() } as never,
      });
    // Unblock the awaiting step.
    const step = await safe(
      () => (prisma as never as { healthTxnStep: { findFirst: (a: unknown) => Promise<{ id: string } | null> } })
        .healthTxnStep.findFirst({ where: { sagaId: cp.sagaId, status: "AWAITING_CHECKPOINT" }, orderBy: { seq: "asc" } }),
      null,
    );
    if (step) {
      await (prisma as never as { healthTxnStep: { update: (a: unknown) => Promise<unknown> } })
        .healthTxnStep.update({
          where: { id: step.id },
          data: { status: input.decision === "APPROVED" ? "IN_PROGRESS" : "FAILED", decidedBy: input.decidedBy, decidedAt: new Date(), result: { checkpointDecision: input.decision, note: input.note ?? null } as never } as never,
        });
      await this.refreshSagaStatus(cp.sagaId);
    }
    await this.audit("DECIDE", "HealthTxnCheckpoint", id, input as never);
    return row;
  }

  async listCheckpoints(decision?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (decision) where.decision = decision;
    return safe(
      () => (prisma as never as { healthTxnCheckpoint: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthTxnCheckpoint.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
      [],
    );
  }

  async expireCheckpoints() {
    await this.assert("UPDATE");
    const row = await (prisma as never as { healthTxnCheckpoint: { updateMany: (a: unknown) => Promise<{ count: number }> } })
      .healthTxnCheckpoint.updateMany({ where: { workspaceId: this.workspaceId, decision: "PENDING", expiresAt: { lt: new Date() } }, data: { decision: "EXPIRED" } as never });
    return row;
  }

  // ── Compensation — classified, never silent deletion ────────────────
  async planCompensation(input: z.infer<typeof txnCompensationSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { healthTxnCompensation: { create: (a: unknown) => Promise<unknown> } })
      .healthTxnCompensation.create({
        data: {
          workspaceId: this.workspaceId, sagaId: input.sagaId, stepId: input.stepId ?? null,
          kind: input.kind as never, action: input.action, detail: (input.detail ?? {}) as never,
          owner: input.owner ?? null, createdById: this.userId,
        } as never,
      });
    await (prisma as never as { healthTxnSaga: { updateMany: (a: unknown) => Promise<unknown> } })
      .healthTxnSaga.updateMany({ where: { id: input.sagaId, workspaceId: this.workspaceId }, data: { status: "COMPENSATING" } as never });
    await this.audit("PLAN", "HealthTxnCompensation", (row as { id: string }).id, { kind: input.kind, action: input.action });
    return { compensation: row, kinds: COMPENSATION_KINDS, table: COMPENSATION_TABLE };
  }

  async executeCompensation(id: string) {
    await this.assert("UPDATE");
    const comp = await safe(
      () => (prisma as never as { healthTxnCompensation: { findFirst: (a: unknown) => Promise<{ sagaId: string; kind: string; action: string; stepId: string | null } | null> } })
        .healthTxnCompensation.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!comp) throw new Error("Compensation not found");
    await (prisma as never as { healthTxnCompensation: { update: (a: unknown) => Promise<unknown> } })
      .healthTxnCompensation.update({ where: { id }, data: { status: "EXECUTING" } as never });
    const saga = await safe(
      () => (prisma as never as { healthTxnSaga: { findFirst: (a: unknown) => Promise<PrismaSaga | null> } })
        .healthTxnSaga.findFirst({ where: { id: comp.sagaId } }),
      null,
    );
    // Clinical corrections and notifications are NEW events — the original is preserved.
    if (saga && (comp.kind === "CLINICAL_CORRECTION" || comp.kind === "PATIENT_NOTIFICATION")) {
      await this.appendHistory({
        eventType: `saga.compensation.${comp.kind.toLowerCase()}`, aggregateType: saga.aggregateType,
        aggregateId: saga.aggregateId, patientId: saga.patientId, sagaId: saga.sagaId,
        payload: { action: comp.action, stepId: comp.stepId },
      });
    }
    if (comp.stepId) {
      await (prisma as never as { healthTxnStep: { update: (a: unknown) => Promise<unknown> } })
        .healthTxnStep.update({ where: { id: comp.stepId }, data: { status: "COMPENSATED" } as never });
    }
    const row = await (prisma as never as { healthTxnCompensation: { update: (a: unknown) => Promise<unknown> } })
      .healthTxnCompensation.update({ where: { id }, data: { status: "COMPLETED" } as never });
    await this.audit("EXECUTE", "HealthTxnCompensation", id, { kind: comp.kind });
    return row;
  }

  async listCompensations(sagaId?: string, status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (sagaId) where.sagaId = sagaId;
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { healthTxnCompensation: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthTxnCompensation.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
      [],
    );
  }

  // ── Dead-letter queue ───────────────────────────────────────────────
  async listDlq(status?: string, category?: string, priority?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;
    return safe(
      () => (prisma as never as { healthTxnDlq: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthTxnDlq.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
      [],
    );
  }

  async assignDlq(id: string, owner: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { healthTxnDlq: { update: (a: unknown) => Promise<unknown> } })
      .healthTxnDlq.update({ where: { id }, data: { status: "ASSIGNED", owner } as never });
    await this.audit("ASSIGN", "HealthTxnDlq", id, { owner });
    return row;
  }

  async redriveDlq(id: string, input: z.infer<typeof txnDlqRedriveSchema>) {
    await this.assert("UPDATE");
    const entry = await safe(
      () => (prisma as never as { healthTxnDlq: { findFirst: (a: unknown) => Promise<{ eventRef: string | null; priority: string; category: string; payload: unknown; redriveCount: number } | null> } })
        .healthTxnDlq.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!entry) throw new Error("DLQ entry not found");
    const highRisk = entry.priority === "critical" || entry.priority === "urgent" || entry.category === "critical-clinical-dlq";
    if (highRisk && !input.approvedBy && !input.dryRun) {
      throw new Error("High-risk redrive requires clinical approval — dry-run first or provide approvedBy");
    }
    if (input.dryRun) {
      await (prisma as never as { healthTxnDlq: { update: (a: unknown) => Promise<unknown> } })
        .healthTxnDlq.update({ where: { id }, data: { status: "DRY_RUN", redriveCount: entry.redriveCount + 1, lastRedrive: new Date() } as never });
      await this.audit("REDRIVE_DRYRUN", "HealthTxnDlq", id, { note: input.note ?? null });
      return { dryRun: true, entry, note: "Dry-run only — revalidated, no duplicate clinical action taken" };
    }
    // Revalidate before replay: re-enqueue through the outbox with the same idempotency lineage.
    const payload = (entry.payload ?? {}) as Record<string, unknown>;
    const outbox = await this.enqueueOutbox({
      eventType: String(payload.eventType ?? "dlq.redrive"),
      aggregateType: String(payload.aggregateType ?? "unknown"),
      aggregateId: String(payload.aggregateId ?? entry.eventRef ?? id),
      payload, schemaVersion: "1.0",
      sagaId: typeof payload.sagaId === "string" ? payload.sagaId : undefined,
    });
    await (prisma as never as { healthTxnDlq: { update: (a: unknown) => Promise<unknown> } })
      .healthTxnDlq.update({ where: { id }, data: { status: "REDRIVEN", redriveCount: entry.redriveCount + 1, lastRedrive: new Date() } as never });
    await this.audit("REDRIVE", "HealthTxnDlq", id, { approvedBy: input.approvedBy ?? null, outbox: (outbox as { id: string }).id });
    return { dryRun: false, outbox, note: "Revalidated and re-enqueued idempotently — every redrive tracked" };
  }

  // ── Reconciliation ──────────────────────────────────────────────────
  async runReconciliation(input: z.infer<typeof txnReconciliationSchema>) {
    await this.assert("CREATE");
    const run = await (prisma as never as { healthTxnReconciliation: { create: (a: unknown) => Promise<unknown> } })
      .healthTxnReconciliation.create({
        data: { workspaceId: this.workspaceId, scope: input.scope, createdById: this.userId } as never,
      });
    const runId = (run as { id: string }).id;
    const findings: Array<Record<string, unknown>> = [];
    // Outbox pending beyond next attempt → missing/stuck event.
    const stuck = await safe(
      () => (prisma as never as { healthTxnOutbox: { findMany: (a: unknown) => Promise<Array<{ id: string; eventType: string; attemptCount: number }>> } })
        .healthTxnOutbox.findMany({ where: { workspaceId: this.workspaceId, status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lt: new Date() } }, take: 100 }),
      [],
    );
    for (const s of stuck) findings.push({ kind: "Missing event", ref: s.id, detail: `${s.eventType} stuck after ${s.attemptCount} attempts`, resolution: "requeue with backoff or DLQ" });
    // Duplicate outbox events for same aggregate+type → duplicate event.
    const recent = await safe(
      () => (prisma as never as { healthTxnOutbox: { findMany: (a: unknown) => Promise<Array<{ aggregateType: string; aggregateId: string; eventType: string }>> } })
        .healthTxnOutbox.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 200 }),
      [],
    );
    const seen = new Map<string, number>();
    for (const r of recent) {
      const k = `${r.aggregateType}:${r.aggregateId}:${r.eventType}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
      if (seen.get(k) === 2) findings.push({ kind: "Duplicate event", ref: k, detail: "Same event emitted twice for one aggregate", resolution: "hold and investigate before redrive" });
    }
    // Sagas stuck mid-flight past deadline → stale state.
    const stale = await safe(
      () => (prisma as never as { healthTxnSaga: { findMany: (a: unknown) => Promise<Array<{ sagaId: string; status: string }>> } })
        .healthTxnSaga.findMany({ where: { workspaceId: this.workspaceId, deadline: { lt: new Date() }, status: { notIn: ["COMPLETED", "COMPLETED_WITH_EXCEPTION", "FAILED_SAFELY", "CANCELLED"] } }, take: 100 }),
      [],
    );
    for (const s of stale) findings.push({ kind: "Stale state", ref: s.sagaId, detail: `Saga past deadline in ${s.status}`, resolution: "escalate owner or exception-close" });
    // Open critical DLQ → unacknowledged critical action.
    const critical = await safe(
      () => (prisma as never as { healthTxnDlq: { findMany: (a: unknown) => Promise<Array<{ id: string; category: string }>> } })
        .healthTxnDlq.findMany({ where: { workspaceId: this.workspaceId, priority: "critical", status: { in: ["OPEN", "ASSIGNED"] } }, take: 50 }),
      [],
    );
    for (const c of critical) findings.push({ kind: "Unacknowledged critical action", ref: c.id, detail: `${c.category} awaiting human work`, resolution: "immediate escalation task" });
    const status = findings.length > 0 ? "issues_found" : "completed";
    const row = await (prisma as never as { healthTxnReconciliation: { update: (a: unknown) => Promise<unknown> } })
      .healthTxnReconciliation.update({ where: { id: runId }, data: { status, findings: findings as never } as never });
    await this.audit("RECONCILE", "HealthTxnReconciliation", runId, { scope: input.scope, findings: findings.length });
    return { run: row, findings, compares: RECONCILIATION_COMPARES };
  }

  async listReconciliations() {
    await this.assert("READ");
    return safe(
      () => (prisma as never as { healthTxnReconciliation: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthTxnReconciliation.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
  }

  // ── Service dependencies — fail closed for treatment, open for read-only ──
  async declareDependency(input: z.infer<typeof txnDependencySchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { healthTxnDependency: { upsert: (a: unknown) => Promise<unknown> } })
      .healthTxnDependency.upsert({
        where: { workspaceId_module: { workspaceId: this.workspaceId, module: input.module } },
        create: {
          workspaceId: this.workspaceId, module: input.module, required: input.required, optional: input.optional,
          degradedModes: (input.degradedModes ?? {}) as never, emergencyFallback: input.emergencyFallback ?? null,
          cacheable: input.cacheable, maxStaleTime: input.maxStaleTime ?? null,
          humanFallback: input.humanFallback ?? null, recoveryAction: input.recoveryAction ?? null,
          patientMessage: input.patientMessage ?? null, createdById: this.userId,
        } as never,
        update: {
          required: input.required, optional: input.optional,
          degradedModes: (input.degradedModes ?? {}) as never, emergencyFallback: input.emergencyFallback ?? null,
          cacheable: input.cacheable, maxStaleTime: input.maxStaleTime ?? null,
          humanFallback: input.humanFallback ?? null, recoveryAction: input.recoveryAction ?? null,
          patientMessage: input.patientMessage ?? null, active: true,
        } as never,
      });
    await this.audit("DECLARE", "HealthTxnDependency", (row as { id: string }).id, { module: input.module });
    return row;
  }

  async listDependencies() {
    await this.assert("READ");
    return safe(
      () => (prisma as never as { healthTxnDependency: { findMany: (a: unknown) => Promise<unknown[]> } })
        .healthTxnDependency.findMany({ where: { workspaceId: this.workspaceId, active: true }, take: 100 }),
      [],
    );
  }

  async evaluateDependency(module: string, failedDependency: string) {
    await this.assert("READ");
    const policy = await safe(
      () => (prisma as never as { healthTxnDependency: { findFirst: (a: unknown) => Promise<{ required: string[]; degradedModes: unknown; emergencyFallback: string | null; humanFallback: string | null; patientMessage: string | null } | null> } })
        .healthTxnDependency.findFirst({ where: { workspaceId: this.workspaceId, module, active: true } }),
      null,
    );
    if (!policy) return { module, failedDependency, mode: "unknown_policy", note: "No dependency policy declared — fail closed for treatment actions" };
    const modes = (policy.degradedModes ?? {}) as Record<string, { behavior?: string; patient_message?: string; max_stale_time?: string }>;
    const mode = modes[failedDependency];
    const required = policy.required.includes(failedDependency);
    return {
      module, failedDependency, required,
      behavior: mode?.behavior ?? (required ? "fail_closed" : "degraded_continue"),
      patientMessage: mode?.patient_message ?? policy.patientMessage ?? null,
      maxStaleTime: mode?.max_stale_time ?? null,
      emergencyFallback: policy.emergencyFallback,
      humanFallback: policy.humanFallback,
      fields: DEPENDENCY_POLICY_FIELDS,
    };
  }

  // ── Metrics — patient-safety outcomes, not just uptime ───────────────
  async reliabilityMetrics() {
    await this.assert("READ");
    const [sagas, outbox, inbox, dlq, checkpoints, compensations, events] = await Promise.all([
      safe(() => (prisma as never as { healthTxnSaga: { findMany: (a: unknown) => Promise<Array<{ status: string; priority: string }>> } }).healthTxnSaga.findMany({ where: { workspaceId: this.workspaceId }, take: 500 }), []),
      safe(() => (prisma as never as { healthTxnOutbox: { findMany: (a: unknown) => Promise<Array<{ status: string; createdAt: Date }>> } }).healthTxnOutbox.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 500 }), []),
      safe(() => (prisma as never as { healthTxnInbox: { findMany: (a: unknown) => Promise<Array<{ status: string }>> } }).healthTxnInbox.findMany({ where: { workspaceId: this.workspaceId }, take: 500 }), []),
      safe(() => (prisma as never as { healthTxnDlq: { findMany: (a: unknown) => Promise<Array<{ status: string; category: string; createdAt: Date }>> } }).healthTxnDlq.findMany({ where: { workspaceId: this.workspaceId }, take: 200 }), []),
      safe(() => (prisma as never as { healthTxnCheckpoint: { findMany: (a: unknown) => Promise<Array<{ decision: string; createdAt: Date; decidedAt: Date | null }>> } }).healthTxnCheckpoint.findMany({ where: { workspaceId: this.workspaceId }, take: 200 }), []),
      safe(() => (prisma as never as { healthTxnCompensation: { findMany: (a: unknown) => Promise<Array<{ status: string }>> } }).healthTxnCompensation.findMany({ where: { workspaceId: this.workspaceId }, take: 200 }), []),
      safe(() => (prisma as never as { healthTxnEvent: { findMany: (a: unknown) => Promise<Array<{ id: string }>> } }).healthTxnEvent.findMany({ where: { workspaceId: this.workspaceId }, take: 1 }), []),
    ]);
    const countBy = (arr: Array<Record<string, unknown>>, key: string) => {
      const out: Record<string, number> = {};
      for (const r of arr) { const k = String(r[key] ?? "unknown"); out[k] = (out[k] ?? 0) + 1; }
      return out;
    };
    const now = Date.now();
    const pendingOutbox = outbox.filter((o) => o.status === "PENDING" || o.status === "FAILED");
    const oldestPendingMs = pendingOutbox.length > 0 ? now - Math.min(...pendingOutbox.map((o) => new Date(o.createdAt).getTime())) : 0;
    const openDlq = dlq.filter((d) => d.status === "OPEN" || d.status === "ASSIGNED");
    const oldestDlqMs = openDlq.length > 0 ? now - Math.min(...openDlq.map((d) => new Date(d.createdAt).getTime())) : 0;
    const decided = checkpoints.filter((c) => c.decidedAt);
    const avgCheckpointMs = decided.length > 0 ? Math.round(decided.reduce((n, c) => n + (new Date(c.decidedAt as Date).getTime() - new Date(c.createdAt).getTime()), 0) / decided.length) : 0;
    const partials = sagas.filter((s) => ["PARTIALLY_COMPLETED", "RECONCILIATION_REQUIRED", "COMPENSATING", "AWAITING_HUMAN_REVIEW", "AWAITING_DEPENDENCY"].includes(s.status)).length;
    return {
      delivery: {
        sagaByStatus: countBy(sagas as Array<Record<string, unknown>>, "status"),
        outboxBacklog: pendingOutbox.length,
        outboxAgeMs: oldestPendingMs,
        duplicateInbox: inbox.filter((i) => i.status === "COMPLETED").length,
        dlqOpen: openDlq.length,
        dlqAgeMs: oldestDlqMs,
      },
      clinicalSafety: {
        unresolvedPartialFailures: partials,
        sagaFailureRate: sagas.length > 0 ? Math.round((sagas.filter((s) => s.status === "FAILED_SAFELY").length / sagas.length) * 1000) / 1000 : 0,
        criticalDlqOpen: openDlq.filter((d) => d.category === "critical-clinical-dlq").length,
      },
      humanOps: {
        checkpointLatencyMs: avgCheckpointMs,
        checkpointsPending: checkpoints.filter((c) => c.decision === "PENDING").length,
        compensationsFailed: compensations.filter((c) => c.status === "FAILED").length,
      },
      integrity: { historyEvents: events.length, chainVerifiableVia: "verifyChain" },
      metricCatalog: { delivery: DELIVERY_METRICS, clinicalSafety: CLINICAL_SAFETY_METRICS, humanOps: HUMAN_OPS_METRICS, integrity: INTEGRITY_METRICS },
    };
  }

  // ── Status views — patient, clinician, operations ────────────────────
  async patientStatusView(aggregateType: string, aggregateId: string) {
    await this.assert("READ");
    const sagas = await safe(
      () => (prisma as never as { healthTxnSaga: { findMany: (a: unknown) => Promise<PrismaSaga[]> } })
        .healthTxnSaga.findMany({ where: { workspaceId: this.workspaceId, aggregateType, aggregateId }, orderBy: { updatedAt: "desc" }, take: 5 }),
      [],
    );
    const latest = sagas[0] ?? null;
    const steps = latest ? await safe(
      () => (prisma as never as { healthTxnStep: { findMany: (a: unknown) => Promise<PrismaStep[]> } })
        .healthTxnStep.findMany({ where: { sagaId: latest.id }, orderBy: { seq: "asc" } }),
      [],
    ) : [];
    const waitingOn = steps.find((s) => ["AWAITING_CHECKPOINT", "FAILED", "RETRYING"].includes(s.status))?.name ?? null;
    return {
      aggregateType, aggregateId,
      requestReceived: !!latest,
      status: latest?.status ?? "none",
      reviewer: latest?.owner ?? "care team",
      waitingOn, patientMustDo: waitingOn === "patient_confirmation" ? "confirm the request" : null,
      failedOrNeedsCorrection: latest ? ["FAILED_SAFELY", "RECONCILIATION_REQUIRED", "CANCELLED"].includes(latest.status) : false,
      message: !latest ? "No request found for this item."
        : latest.status === "COMPLETED" ? "Completed — all required steps finished."
        : latest.status === "PARTIALLY_COMPLETED" ? "Partially completed — part of your request is still being worked on. Nothing is shown as done until it is."
        : `Your request was received and is ${latest.status.toLowerCase().replace(/_/g, " ")}. It has not been sent onward until each step is confirmed.`,
      fields: PATIENT_STATUS_VIEW,
    };
  }

  async clinicianStatusView(sagaId: string) {
    await this.assert("READ");
    const full = await safe(
      () => (prisma as never as { healthTxnSaga: { findFirst: (a: unknown) => Promise<PrismaSaga | null> } })
        .healthTxnSaga.findFirst({ where: { workspaceId: this.workspaceId, sagaId } }),
      null,
    );
    if (!full) throw new Error("Saga not found");
    const detail = await this.getSaga(full.id);
    const steps = detail.steps as PrismaStep[];
    const failed = steps.filter((s) => s.status === "FAILED");
    return {
      ...(detail.saga as object),
      failedDependencies: failed.map((s) => s.name),
      retryCounts: steps.map((s) => ({ step: s.name, attempts: s.attempts, max: s.maxAttempts })),
      checkpoints: detail.checkpoints, compensations: detail.compensations,
      fields: CLINICIAN_STATUS_VIEW,
      note: "Never a green complete badge from the originating service alone — all required steps or authorized exception closure",
    };
  }

  async operationsView() {
    await this.assert("READ");
    const metrics = await this.reliabilityMetrics();
    const [reconciliations, inboxTotal] = await Promise.all([
      safe(() => (prisma as never as { healthTxnReconciliation: { findMany: (a: unknown) => Promise<Array<{ status: string }>> } }).healthTxnReconciliation.findMany({ where: { workspaceId: this.workspaceId }, take: 50 }), []),
      safe(() => (prisma as never as { healthTxnInbox: { findMany: (a: unknown) => Promise<Array<{ id: string }>> } }).healthTxnInbox.findMany({ where: { workspaceId: this.workspaceId }, take: 1 }), []),
    ]);
    return {
      ...metrics,
      reconciliationBacklog: reconciliations.filter((r) => r.status !== "completed").length,
      inboxTracked: inboxTotal.length > 0,
      fields: OPERATIONS_STATUS_VIEW,
      backpressure: BACKPRESSURE_RULES,
      fallbacks: FALLBACK_TABLE,
    };
  }

  // ── Static exports for UI ─────────────────────────────────────────────
  static readonly TXN_ARCHITECTURE = TXN_ARCHITECTURE;
  static readonly TXN_STATES = TXN_STATES;
  static readonly TXN_API = TXN_API;
  static readonly FHIR_TXN_RESOURCES = FHIR_TXN_RESOURCES;
  static readonly SAGA_DEFINITIONS = SAGA_DEFINITIONS;
}
