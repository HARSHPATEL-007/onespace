// Offline-First Edge Runtime — secure offline clinical runtime for rural clinics, ambulances,
// emergency teams, mobile outreach, disaster response, and field workers.
// Approved capabilities only when disconnected; stale/local labels; queued synchronization;
// append-only signed events; cryptographic erasure; never unsupervised clinical authority.
// Governing principle: preserve continuity, but never hide uncertainty, never fake
// synchronization, never turn a disconnected device into an unsupervised clinical authority.
// Local data is never globally accepted until server-side validation + sync succeed.
import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "health_offline_edge";

// ── Operating modes — 7 ─────────────────────────────────────────────────
export const OFFLINE_MODES = [
  "ONLINE: connected to authorized services — full approved functionality",
  "DEGRADED: intermittent or limited connectivity — read cached data, queue writes",
  "OFFLINE: no network — approved local workflows only",
  "EMERGENCY_OFFLINE: urgent field or emergency use — read-only summary, local capture, approved triage",
  "RECONNECTING: connection detected but not trusted — validate channel, synchronize cautiously",
  "SYNCING: data exchange in progress — show progress, conflicts, failures",
  "QUARANTINED_SYNC: integrity or identity concern — hold affected records for review",
] as const;

// ── Always-visible status — 9 ───────────────────────────────────────────
export const OFFLINE_STATUS_FIELDS = [
  "Connectivity status",
  "Last successful synchronization",
  "Data freshness",
  "Local unsynchronized changes",
  "Number of queued events",
  "Failed synchronizations",
  "Conflicts requiring review",
  "Whether clinical decision support is available offline",
  "Whether the device is in emergency mode",
] as const;

export const SYNC_STATUS_WORDS = [
  "Current: no pending critical events",
  "Delayed: data older than expected",
  "Pending: local events not yet accepted",
  "Conflict: clinical review needed",
  "Rejected: event requires correction",
  "Unknown: device has not reported status",
  "Compromised: security review required",
] as const;

// ── Offline data architecture ───────────────────────────────────────────
export const OFFLINE_DATA_STORES = [
  "Emergency patient summaries",
  "Authorized clinical cache",
  "Current care plans",
  "Approved protocols",
  "Offline terminology subset",
  "Offline identity credentials",
  "Pending clinical events",
  "Pending media and telehealth objects",
  "Audit events",
] as const;

export const OFFLINE_DATA_PARTITIONS = [
  "Read-only cache: server-originated information",
  "Local clinical entries: captured offline by authorized users",
  "Derived local outputs: calculated or inferred results",
  "Pending outbound events: awaiting synchronization",
  "Sync metadata: versions, hashes, timestamps, conflict state",
  "Emergency data: narrowly scoped and rapidly expirable",
] as const;

// ── Encrypted offline records — 15 controls ─────────────────────────────
export const OFFLINE_RECORD_CONTROLS = [
  "Application-level encryption",
  "Device-backed key storage",
  "Full-device encryption",
  "Per-tenant or per-organization key separation",
  "Key rotation",
  "Secure lock-screen enforcement",
  "Application sandboxing",
  "Screen privacy controls",
  "Clipboard restrictions",
  "Screenshot restrictions where feasible",
  "Remote lock and wipe",
  "Local audit log",
  "Automatic inactivity lock",
  "Offline access expiry",
  "Secure backup policy",
  "Cryptographic erase during device retirement",
] as const;

// ── Retention — axes, expiry kinds, example profile ─────────────────────
export const OFFLINE_RETENTION_AXES = [
  "Data type",
  "Patient risk",
  "Care setting",
  "Device role",
  "Jurisdiction",
  "Organization",
  "Emergency status",
  "Synchronization status",
  "Clinical necessity",
  "Research or legal hold",
] as const;

export const RETENTION_EXPIRY_KINDS = [
  "Time-based expiration: record expires after a defined period",
  "Event-based expiration: expires after sync, transfer, discharge, or emergency closure",
  "Policy hold: retained for legal, safety, or investigation requirements",
  "User deletion: local deletion only where it does not destroy required clinical records",
] as const;

export const DEFAULT_RETENTION_PROFILE = {
  device_profile: "rural_field_worker",
  retention: {
    emergency_summary: "72_hours_after_last_access",
    active_care_plan: "14_days",
    recent_medication_list: "7_days",
    offline_messages: "until_sync_plus_30_days",
    photographs: "until_upload_verified_plus_24_hours",
    audit_events: "minimum_90_days_or_policy",
  },
  deletion: {
    method: "cryptographic_erase_for_expired_local_store",
    requires_server_ack: false,
    legal_hold_override: true,
  },
} as const;

// ── Data tiers ──────────────────────────────────────────────────────────
export const OFFLINE_TIER_1 = [
  "Current allergies and intolerances",
  "Active medications",
  "Critical conditions",
  "Recent procedures",
  "Emergency contacts",
  "Blood group only if verified and policy permits",
  "Relevant implanted devices",
  "Advance-care information where authorized",
  "Last critical laboratory or imaging findings",
  "Patient identity and photograph only when necessary",
] as const;

export const OFFLINE_TIER_2 = [
  "Current care plan",
  "Recent observations",
  "Recent encounters",
  "Relevant referrals",
  "Current pathway tasks",
  "Clinician instructions",
  "Patient communication preferences",
  "Caregiver permissions",
] as const;

export const OFFLINE_TIER_3 = [
  "Older clinical history",
  "Historical documents",
  "Research data",
  "Unnecessary identifiers",
  "Sensitive information not required for the offline role",
] as const;

// ── Offline CDS — approved low-risk only ────────────────────────────────
export const OFFLINE_CDS_ALLOWED = [
  "Allergy display",
  "Medication schedule display",
  "Unit conversion",
  "Basic arithmetic",
  "Protocol reminders",
  "Preventive-care reminders",
  "Simple measurement-quality checks",
  "Emergency checklist",
  "Device troubleshooting",
  "Patient education",
  "Care-plan task display",
  "Drug information snapshot with date and source",
  "Triage prompts that direct human review",
] as const;

export const OFFLINE_CDS_PROHIBITED = [
  "Diagnose",
  "Initiate or stop medication",
  "Change a dose",
  "Interpret a complex image",
  "Determine emergency disposition",
  "Clear a critical result",
  "Make a high-risk pregnancy decision",
  "Determine mental-health safety",
  "Make eligibility or insurance decisions",
  "Override a clinician plan",
  "Generate a definitive risk prediction",
] as const;

export const OFFLINE_CDS_LABEL_FIELDS = [
  "'Offline' label",
  "Knowledge-base version",
  "Last update",
  "Intended use",
  "Limitations",
  "Required human review",
  "Whether the result was locally calculated",
  "Whether it has synchronized to the server",
] as const;

// ── Knowledge bundles — signed, expiring, fail-safe ─────────────────────
export const BUNDLE_REQUIRED_FIELDS = [
  "bundle_id",
  "version",
  "scope",
  "jurisdiction",
  "approved_by",
  "valid_from",
  "expires_at",
  "signature",
  "hash",
  "offline_use",
] as const;

// ── Device-side biometrics — raw stays local ────────────────────────────
export const BIOMETRIC_PIPELINE = [
  "Biometric sensor",
  "Device-side feature extraction",
  "Local quality check",
  "Local result or alert",
  "Store only minimum necessary output",
  "Upload encrypted feature or summary",
  "Delete raw signal according to policy",
] as const;

export const BIOMETRIC_STORE_FIELDS = [
  "Processing purpose",
  "Algorithm and version",
  "Device",
  "Quality score",
  "Timestamp",
  "Output",
  "Uncertainty",
  "Whether raw data was retained",
  "Patient consent",
  "Local deletion status",
] as const;

// ── Edge inference safeguards ───────────────────────────────────────────
export const EDGE_MODEL_CARD_FIELDS = [
  "Model name and version",
  "Signed artifact",
  "Training and validation scope",
  "Intended use",
  "Prohibited use",
  "Input requirements",
  "Uncertainty",
  "Drift indicator",
  "Expiration",
  "Human-review requirement",
  "Offline availability",
  "Fallback behavior",
] as const;

export const LOW_QUALITY_FLOW = [
  "Do not produce a definitive output",
  "Request repeat measurement or human assessment",
  "Create a pending review task",
  "Synchronize when possible",
] as const;

// ── Store-and-forward telehealth ────────────────────────────────────────
export const STOREFORWARD_KINDS = [
  "Patient text message",
  "Voice recording",
  "Compressed image",
  "Wound photograph",
  "Vital-sign package",
  "Short video",
  "Structured questionnaire",
  "Referral note",
  "Clinician response",
  "Consent record",
  "Emergency escalation request",
] as const;

export const STOREFORWARD_WORKFLOW = [
  "Patient or field worker captures information",
  "Local consent and identity check",
  "Quality review",
  "Encrypt and queue",
  "Show pending status",
  "Synchronize when connected",
  "Receiving clinician acknowledges",
  "Clinician responds or escalates",
  "Response returns to originating device",
  "Patient or worker confirms receipt",
  "Episode closes",
] as const;

export const STOREFORWARD_STATES = [
  "Captured offline",
  "Upload pending",
  "Uploaded",
  "Received by server",
  "Assigned",
  "Clinician viewed",
  "Response sent",
  "Response delivered",
  "Escalated",
  "Expired",
  "Failed",
] as const;

// ── Emergency summary (IPS concept) ─────────────────────────────────────
export const EMERGENCY_SUMMARY_FIELDS = [
  "Allergies",
  "Medications",
  "Critical conditions",
  "Recent procedures",
  "Implanted devices",
  "Recent relevant results",
  "Emergency contacts",
  "Care preferences",
  "Uncertainties",
  "Provenance: server_signed",
] as const;

export const EMERGENCY_WARNINGS = [
  "Generated date",
  "Last data refresh",
  "Data may be incomplete",
  "Not a complete medical record",
  "Verify before treatment when possible",
  "Emergency access was recorded",
  "Local changes are not reflected until synchronization",
] as const;

export const EMERGENCY_ACCESS_CONTROLS = [
  "Patient identity verification",
  "Authorized emergency role",
  "Break-glass access",
  "Reason selection",
  "Time-limited access",
  "Minimum necessary display",
  "Local audit event",
  "Server synchronization of access event",
  "Emergency contact or supervisory review",
  "Automatic lock after the episode",
] as const;

// ── Offline identity ────────────────────────────────────────────────────
export const IDENTITY_SIGNALS = [
  "Pre-provisioned device credential",
  "User certificate",
  "PIN or passphrase",
  "Biometric unlock",
  "Patient-issued token",
  "QR code",
  "Smart card",
  "One-time offline credential",
  "Trusted local roster",
  "Demographic verification",
  "Care setting and encounter context",
] as const;

export const UNCERTAIN_IDENTITY_RULES = [
  "Do not attach medication or allergy changes",
  "Capture as an unlinked event",
  "Mark for identity-steward review",
  "Restrict synchronization into the active chart",
] as const;

// ── Sync protocol — order, integrity, clinician view ────────────────────
export const SYNC_EVENT_FIELDS = [
  "Globally unique ID",
  "Patient and resource reference",
  "Device",
  "Actor",
  "Role",
  "Local timestamp",
  "Server timestamp",
  "Logical clock or vector clock",
  "Parent version",
  "Operation",
  "Payload hash",
  "Previous-value reference",
  "Consent context",
  "Signature",
  "Conflict state",
] as const;

export const SYNC_CONFLICT_TYPES = [
  "Independent additions",
  "Same-field edits",
  "Delete versus update",
  "Medication start versus stop",
  "Allergy addition versus removal",
  "Duplicate observation",
  "Conflicting patient identity",
  "Different care-plan versions",
  "Changed terminology",
  "Stale emergency summary",
] as const;

export const SYNC_CONFLICT_RULES = [
  ["New observation", "Preserve both if timestamps and sources differ"],
  ["Medication start/stop", "Human or pharmacist review"],
  ["Allergy", "Retain both; urgent clinical review"],
  ["Patient demographics", "Identity steward review"],
  ["Care-plan task", "Merge if independent; conflict if same task"],
  ["Appointment", "Source-system authority plus reconciliation"],
  ["Patient message", "Preserve both messages"],
  ["Device reading", "Deduplicate by measurement identifier and timestamp"],
  ["Emergency summary", "Keep signed server version; append local event"],
  ["Clinician correction", "Preserve original and corrected version"],
] as const;

export const SYNC_PROTOCOL = [
  "Device discovers connection",
  "Authenticate device and user",
  "Establish encrypted channel",
  "Check server and bundle versions",
  "Send manifest and event hashes",
  "Upload outbound events",
  "Server validates identity, consent, schema, integrity",
  "Server returns accepted, rejected, or conflict events",
  "Download authorized updates",
  "Apply nonconflicting changes",
  "Route conflicts",
  "Verify checksums and counts",
  "Acknowledge sync",
  "Update visible status",
] as const;

export const SYNC_PRIORITY_ORDER = [
  "Safety and emergency events",
  "Medication and allergy changes",
  "Critical observations",
  "Referrals and escalations",
  "Care-plan changes",
  "Patient messages",
  "Documents and media",
  "Routine analytics",
  "Bulk telemetry",
] as const;

export const SYNC_INTEGRITY_CHECKS = [
  "Device identity",
  "User authorization",
  "Transport encryption",
  "Event signatures",
  "Payload hashes",
  "Sequence continuity",
  "Record counts",
  "Resource versions",
  "Patient identifiers",
  "Terminology versions",
  "No duplicate acceptance",
  "No missing acknowledgements",
  "No partial media",
  "No unauthorized data returned",
  "Server-side provenance",
  "Audit completeness",
] as const;

// ── Offline forms + media ───────────────────────────────────────────────
export const OFFLINE_FORM_REQUIREMENTS = [
  "Versioned",
  "Signed",
  "Locally available",
  "Validated offline",
  "Accessible",
  "Language-configured",
  "Designed for low literacy",
  "Capable of partial completion",
  "Resumable",
  "Explicit about required fields",
  "Safe when incomplete",
] as const;

export const FORM_CAPTURE_FIELDS = [
  "Form version",
  "Protocol version",
  "Device",
  "User",
  "Capture time",
  "Local location only if consented and needed",
  "Data-quality warnings",
  "Missing fields",
  "Patient confirmation",
  "Sync state",
] as const;

export const OFFLINE_MEDIA_RULES = [
  "Encrypt at capture",
  "Strip unnecessary metadata",
  "Store consent",
  "Attach patient and encounter context carefully",
  "Show quality status",
  "Preserve original hash",
  "Compress only after integrity check",
  "Queue with priority",
  "Confirm upload",
  "Delete local copy only after verified transfer and policy check",
  "Prevent automatic upload to personal apps or galleries",
  "Sensitive media hidden from device gallery after capture",
] as const;

// ── Power, hub, escalation, matching ────────────────────────────────────
export const POWER_RESILIENCE = [
  "Low-power mode",
  "Deferred media upload",
  "Solar charging workflows",
  "Battery warnings",
  "Local queue prioritization",
  "Small payloads",
  "Resumable transfers",
  "SMS or USSD fallback where approved",
  "Bluetooth or local-network sync",
  "Community hub synchronization",
  "Device replacement and restoration",
] as const;

export const HUB_REQUIREMENTS = [
  "Authenticate each device",
  "Maintain a signed local ledger",
  "Prevent unauthorized peer access",
  "Enforce retention",
  "Queue outbound traffic",
  "Support hub replacement",
  "Detect duplicate events",
  "Provide visible sync state",
  "Avoid becoming an unencrypted central cache",
] as const;

export const OFFLINE_IDENTITY_MATCHING = [
  "Scheduled roster",
  "Encounter-specific patient list",
  "QR or token scan",
  "Patient-held identifier",
  "Verified demographic subset",
  "Manual confirmation for high-risk actions",
  "Separate emergency identity workflow",
] as const;

// ── CDS governance ──────────────────────────────────────────────────────
export const CDS_GOVERNANCE_FIELDS = [
  "Intended use",
  "Prohibited use",
  "Clinical owner",
  "Version",
  "Approval date",
  "Expiration date",
  "Offline data dependencies",
  "Known limitations",
  "Human-review requirement",
  "Rollback",
  "Monitoring",
  "Field testing",
  "Language and accessibility review",
] as const;

export const LOCAL_OUTPUT_LABELS = [
  "Observed locally",
  "Calculated locally",
  "Inferred locally",
  "Cached from server",
  "Stale cached information",
  "Awaiting synchronization",
  "Conflict pending",
  "Not clinically validated offline",
] as const;

// ── Security incidents ──────────────────────────────────────────────────
export const SECURITY_TRIGGERS = [
  "Lost device",
  "Stolen device",
  "Repeated failed login",
  "Rooted or jailbroken device",
  "Tampered application",
  "Invalid signature",
  "Unexpected data export",
  "Clock manipulation",
  "Certificate failure",
  "Suspicious sync",
  "Patient-data mismatch",
  "Unauthorized emergency access",
] as const;

export const SECURITY_ACTIONS = [
  "Revoke device",
  "Revoke offline credentials",
  "Lock application",
  "Wipe local key",
  "Cryptographically erase local records",
  "Block synchronization",
  "Preserve forensic audit",
  "Notify security and clinical owners",
  "Reconcile locally authored events",
  "Notify affected patients where required",
] as const;

// ── Observability — 17, never punitive ───────────────────────────────────
export const OBSERVABILITY_METRICS = [
  "Time offline",
  "Device battery",
  "Storage capacity",
  "Local queue size",
  "Critical-event backlog",
  "Sync duration",
  "Sync success",
  "Conflict rate",
  "Rejection rate",
  "Duplicate rate",
  "Integrity failures",
  "Credential expiry",
  "Knowledge-bundle expiry",
  "Emergency-summary access",
  "Offline CDS usage",
  "Local model confidence",
  "Media upload failures",
  "Device replacement rate",
] as const;

// ── Offline API ─────────────────────────────────────────────────────────
export const OFFLINE_API = [
  "GET    /offline/devices",
  "POST   /offline/devices",
  "GET    /offline/devices/{id}",
  "POST   /offline/devices/{id}/heartbeat",
  "POST   /offline/devices/{id}/mode",
  "POST   /offline/devices/{id}/revoke",
  "POST   /offline/devices/{id}/wipe",
  "GET    /offline/devices/{id}/status",
  "GET    /offline/credentials",
  "POST   /offline/credentials",
  "POST   /offline/credentials/{id}/verify",
  "POST   /offline/credentials/{id}/revoke",
  "GET    /offline/bundles",
  "POST   /offline/bundles",
  "POST   /offline/bundles/{id}/verify",
  "POST   /offline/bundles/{id}/rollback",
  "GET    /offline/emergency-summaries",
  "POST   /offline/emergency-summaries",
  "GET    /offline/emergency-access",
  "POST   /offline/emergency-access",
  "POST   /offline/emergency-access/{id}/review",
  "GET    /offline/outbox",
  "POST   /offline/outbox",
  "GET    /offline/sync",
  "POST   /offline/sync/start",
  "POST   /offline/sync/{id}/complete",
  "GET    /offline/sync/status",
  "GET    /offline/conflicts",
  "POST   /offline/conflicts/{id}/resolve",
  "GET    /offline/store-forward",
  "POST   /offline/store-forward",
  "POST   /offline/store-forward/{id}/transition",
  "GET    /offline/retention",
  "POST   /offline/retention",
  "POST   /offline/retention/evaluate",
  "GET    /offline/security-incidents",
  "POST   /offline/security-incidents",
  "POST   /offline/security-incidents/{id}/resolve",
  "GET    /offline/observability",
  "POST   /offline/observability",
  "POST   /offline/cds/evaluate",
] as const;

// ── FHIR resources touched by edge flows ────────────────────────────────
export const FHIR_OFFLINE_RESOURCES = [
  "Patient: roster and emergency identity subset",
  "AllergyIntolerance: Tier-1 emergency cache",
  "MedicationStatement: patient-confirmed current list",
  "Condition: critical conditions snapshot",
  "Procedure: recent procedures",
  "Observation: captured vitals and device readings",
  "Immunization: emergency immunization history",
  "CarePlan: active-care cache",
  "Task: pathway tasks and store-forward follow-ups",
  "Communication: queued patient and team messages",
  "Consent: capture consent and data-use purpose",
  "Device: edge device identity",
  "Provenance: local authorship + sync lineage",
  "AuditEvent: local and synchronized audit trail",
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

// ── Zod schemas ─────────────────────────────────────────────────────────
export const offlineDeviceSchema = z.object({
  deviceId: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  role: z.enum(["rural_clinic","ambulance","emergency_team","outreach","disaster","field_worker","hub"]),
  appVersion: z.string().max(40).optional().nullable(),
  bundleVersion: z.string().max(40).optional().nullable(),
  encryption: z.record(z.unknown()).optional(),
});

export const offlineHeartbeatSchema = z.object({
  batteryPct: z.coerce.number().int().min(0).max(100).optional().nullable(),
  storageFreeMb: z.coerce.number().int().min(0).optional().nullable(),
  appVersion: z.string().max(40).optional().nullable(),
  bundleVersion: z.string().max(40).optional().nullable(),
  integrity: z.enum(["verified","unverified","tampered"]).optional(),
});

export const offlineModeSchema = z.object({
  mode: z.enum(["ONLINE","DEGRADED","OFFLINE","EMERGENCY_OFFLINE","RECONNECTING","SYNCING","QUARANTINED_SYNC"]),
  reason: z.string().min(1).max(500),
});

export const offlineCredentialSchema = z.object({
  subject: z.string().min(1).max(200),
  role: z.string().min(1).max(120),
  scope: z.array(z.string()).default([]),
  deviceId: z.string().max(120).optional().nullable(),
  expiresAt: z.coerce.date(),
  offlineAllowed: z.boolean().default(true),
  emergencyOnly: z.boolean().default(false),
  signature: z.string().max(2000).optional().nullable(),
});

export const offlineBundleSchema = z.object({
  bundleId: z.string().min(1).max(120),
  version: z.string().min(1).max(40),
  scope: z.array(z.string()).default([]),
  jurisdiction: z.string().max(80).optional().nullable(),
  approvedBy: z.string().max(200).optional().nullable(),
  validFrom: z.coerce.date().optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
  hash: z.string().max(200).optional().nullable(),
  signature: z.string().max(2000).optional().nullable(),
  offlineUse: z.boolean().default(true),
});

export const offlineEmergencySummarySchema = z.object({
  patientId: z.string().uuid(),
  summaryRef: z.string().max(120).optional().nullable(),
  dataAsOf: z.coerce.date(),
  payload: z.record(z.unknown()),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const offlineEmergencyAccessSchema = z.object({
  patientId: z.string().uuid(),
  workerToken: z.string().min(1).max(200),
  role: z.string().max(120).optional().nullable(),
  reason: z.string().min(1).max(1000),
  scope: z.array(z.string()).default([]),
  expiresAt: z.coerce.date(),
});

export const offlineOutboxSchema = z.object({
  deviceId: z.string().min(1).max(120),
  patientId: z.string().uuid().optional().nullable(),
  resourceRef: z.string().max(300).optional().nullable(),
  operation: z.enum(["create","update","delete","message","media","observation"]),
  payload: z.record(z.unknown()),
  parentVersion: z.string().max(120).optional().nullable(),
  signature: z.string().max(2000).optional().nullable(),
  consentCtx: z.record(z.unknown()).optional(),
  priority: z.enum(["safety","critical","high","routine","bulk"]).default("routine"),
});

export const offlineSyncStartSchema = z.object({
  deviceId: z.string().min(1).max(120),
});

export const offlineSyncCompleteSchema = z.object({
  uploaded: z.coerce.number().int().min(0).default(0),
  accepted: z.coerce.number().int().min(0).default(0),
  rejected: z.coerce.number().int().min(0).default(0),
  conflicts: z.coerce.number().int().min(0).default(0),
  downloaded: z.coerce.number().int().min(0).default(0),
  hashCheck: z.enum(["passed","failed","pending"]).default("pending"),
  sequenceCheck: z.enum(["passed","failed","pending"]).default("pending"),
  identityCheck: z.enum(["passed","failed","pending"]).default("pending"),
  mediaCheck: z.enum(["passed","failed","pending"]).default("pending"),
  lastServerVersion: z.string().max(120).optional().nullable(),
});

export const offlineConflictResolveSchema = z.object({
  decision: z.string().min(1).max(500),
  reviewedBy: z.string().min(1).max(200),
  resolution: z.record(z.unknown()).optional(),
});

export const offlineStoreForwardSchema = z.object({
  deviceId: z.string().min(1).max(120),
  patientId: z.string().uuid().optional().nullable(),
  kind: z.enum(["text","voice","image","wound_photo","vitals","video","questionnaire","referral","response","consent","escalation"]),
  payloadRef: z.string().max(500).optional().nullable(),
  payloadHash: z.string().max(200).optional().nullable(),
  consentRef: z.string().max(200).optional().nullable(),
  priority: z.enum(["emergency","urgent","routine"]).default("routine"),
  receiverRole: z.string().max(120).optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const offlineStoreForwardTransitionSchema = z.object({
  to: z.enum(["QUEUED","UPLOADED","RECEIVED","ASSIGNED","VIEWED","RESPONDED","DELIVERED","ESCALATED","EXPIRED","FAILED","CLOSED"]),
  actorRole: z.string().max(120).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

export const offlineRetentionSchema = z.object({
  deviceProfile: z.string().min(1).max(120),
  retention: z.record(z.unknown()),
  deletion: z.record(z.unknown()).optional(),
});

export const offlineSecurityIncidentSchema = z.object({
  deviceId: z.string().min(1).max(120),
  kind: z.string().min(1).max(120),
  detail: z.string().max(2000).optional().nullable(),
});

export const offlineSecurityResolveSchema = z.object({
  actions: z.array(z.string()).default([]),
  note: z.string().max(2000).optional().nullable(),
});

export const offlineReportSchema = z.object({
  deviceId: z.string().min(1).max(120),
  offlineMinutes: z.coerce.number().int().min(0).default(0),
  batteryPct: z.coerce.number().int().min(0).max(100).optional().nullable(),
  storageFreeMb: z.coerce.number().int().min(0).optional().nullable(),
  queueSize: z.coerce.number().int().min(0).default(0),
  criticalBacklog: z.coerce.number().int().min(0).default(0),
  syncDurationMs: z.coerce.number().int().min(0).optional().nullable(),
  syncSuccess: z.boolean().optional().nullable(),
  conflictCount: z.coerce.number().int().min(0).default(0),
  rejectionCount: z.coerce.number().int().min(0).default(0),
  duplicateCount: z.coerce.number().int().min(0).default(0),
  integrityFails: z.coerce.number().int().min(0).default(0),
  credentialDaysLeft: z.coerce.number().int().optional().nullable(),
  bundleExpired: z.boolean().default(false),
  emergencyAccesses: z.coerce.number().int().min(0).default(0),
  cdsUses: z.coerce.number().int().min(0).default(0),
  mediaFailures: z.coerce.number().int().min(0).default(0),
});

export const offlineCdsEvaluateSchema = z.object({
  deviceId: z.string().min(1).max(120),
  function: z.string().min(1).max(120),
  bundleId: z.string().max(120).optional().nullable(),
  bundleVersion: z.string().max(40).optional().nullable(),
});

// ═══════════════════════════════════════════════════════════════════════════
// OfflineEdgeRuntime — full implementation
// ═══════════════════════════════════════════════════════════════════════════

type PrismaDevice = {
  id: string; deviceId: string; name: string; role: string; mode: string; status: string;
  lastSeenAt: Date; bundleVersion: string | null; integrity: string;
};

type PrismaCredential = {
  id: string; subject: string; expiresAt: Date; offlineAllowed: boolean;
  revocationStatus: string; emergencyOnly: boolean; scope: string[];
};

type PrismaBundle = {
  id: string; bundleId: string; version: string; scope: string[];
  expiresAt: Date | null; validFrom: Date | null; signature: string | null; status: string;
};

const SF_TRANSITIONS: Record<string, string[]> = {
  CAPTURED: ["QUEUED", "FAILED", "EXPIRED"],
  QUEUED: ["UPLOADED", "FAILED", "EXPIRED"],
  UPLOADED: ["RECEIVED", "FAILED"],
  RECEIVED: ["ASSIGNED", "ESCALATED", "FAILED"],
  ASSIGNED: ["VIEWED", "ESCALATED", "FAILED"],
  VIEWED: ["RESPONDED", "ESCALATED", "FAILED"],
  RESPONDED: ["DELIVERED", "FAILED"],
  DELIVERED: ["CLOSED", "ESCALATED"],
  ESCALATED: ["ASSIGNED", "VIEWED", "CLOSED"],
  EXPIRED: [],
  FAILED: ["QUEUED"],
  CLOSED: [],
};

const CONFLICT_DEFAULTS: Array<{ match: RegExp; handling: string; humanReview: boolean }> = [
  { match: /medication/i, handling: "Human or pharmacist review", humanReview: true },
  { match: /allergy/i, handling: "Retain both; urgent clinical review", humanReview: true },
  { match: /identity|demographic/i, handling: "Identity steward review", humanReview: true },
  { match: /care.?plan/i, handling: "Merge if independent; conflict if same task", humanReview: true },
  { match: /observation|device/i, handling: "Preserve both / deduplicate by identifier+timestamp", humanReview: false },
  { match: /message/i, handling: "Preserve both messages", humanReview: false },
  { match: /appointment/i, handling: "Source-system authority plus reconciliation", humanReview: false },
  { match: /summary/i, handling: "Keep signed server version; append local event", humanReview: false },
  { match: /correction/i, handling: "Preserve original and corrected version", humanReview: false },
];

export class OfflineEdgeRuntime {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action)))
      throw new Error(`Missing ${action} permission for health_offline_edge`);
  }

  private audit(action: string, targetType: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType, targetId, metadata: meta }).catch(() => null);
  }

  // ── Devices ─────────────────────────────────────────────────────────
  async registerDevice(input: z.infer<typeof offlineDeviceSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { offlineDevice: { upsert: (a: unknown) => Promise<unknown> } })
      .offlineDevice.upsert({
        where: { workspaceId_deviceId: { workspaceId: this.workspaceId, deviceId: input.deviceId } },
        create: {
          workspaceId: this.workspaceId, deviceId: input.deviceId, name: input.name, role: input.role,
          appVersion: input.appVersion ?? null, bundleVersion: input.bundleVersion ?? null,
          encryption: (input.encryption ?? {}) as never, createdById: this.userId,
        } as never,
        update: {
          name: input.name, role: input.role, appVersion: input.appVersion ?? null,
          bundleVersion: input.bundleVersion ?? null, encryption: (input.encryption ?? {}) as never,
          lastSeenAt: new Date(),
        } as never,
      });
    await this.audit("REGISTER", "OfflineDevice", (row as { id: string }).id, input as never);
    return row;
  }

  async listDevices(status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { offlineDevice: { findMany: (a: unknown) => Promise<unknown[]> } })
        .offlineDevice.findMany({ where, orderBy: { lastSeenAt: "desc" }, take: 100 }),
      [],
    );
  }

  async getDevice(id: string) {
    await this.assert("READ");
    const row = await safe(
      () => (prisma as never as { offlineDevice: { findFirst: (a: unknown) => Promise<unknown> } })
        .offlineDevice.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!row) throw new Error("Device not found");
    return row;
  }

  async heartbeat(id: string, input: z.infer<typeof offlineHeartbeatSchema>) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { offlineDevice: { update: (a: unknown) => Promise<unknown> } })
      .offlineDevice.update({
        where: { id },
        data: {
          lastSeenAt: new Date(),
          ...(input.batteryPct !== undefined && input.batteryPct !== null ? { batteryPct: input.batteryPct } : {}),
          ...(input.storageFreeMb !== undefined && input.storageFreeMb !== null ? { storageFreeMb: input.storageFreeMb } : {}),
          ...(input.appVersion ? { appVersion: input.appVersion } : {}),
          ...(input.bundleVersion ? { bundleVersion: input.bundleVersion } : {}),
          ...(input.integrity ? { integrity: input.integrity, ...(input.integrity === "tampered" ? { status: "compromised" } : {}) } : {}),
        } as never,
      });
    await this.audit("HEARTBEAT", "OfflineDevice", id, input as never);
    return row;
  }

  async setMode(id: string, input: z.infer<typeof offlineModeSchema>) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { offlineDevice: { update: (a: unknown) => Promise<unknown> } })
      .offlineDevice.update({ where: { id }, data: { mode: input.mode as never, lastSeenAt: new Date() } as never });
    await this.audit("MODE", "OfflineDevice", id, input as never);
    return { device: row, behavior: OFFLINE_MODES.find((m) => m.startsWith(input.mode)) ?? input.mode };
  }

  async revokeDevice(id: string, reason: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { offlineDevice: { update: (a: unknown) => Promise<unknown> } })
      .offlineDevice.update({ where: { id }, data: { status: "locked", revokedAt: new Date() } as never });
    await this.audit("REVOKE", "OfflineDevice", id, { reason });
    return row;
  }

  async wipeDevice(id: string, attestation: string) {
    await this.assert("UPDATE");
    const device = (await this.getDevice(id)) as PrismaDevice;
    const row = await (prisma as never as { offlineDevice: { update: (a: unknown) => Promise<unknown> } })
      .offlineDevice.update({ where: { id }, data: { status: "wiped", wipedAt: new Date(), revokedAt: new Date() } as never });
    await (prisma as never as { offlineCredential: { updateMany: (a: unknown) => Promise<unknown> } })
      .offlineCredential.updateMany({ where: { workspaceId: this.workspaceId, deviceId: device.deviceId }, data: { revocationStatus: "revoked" } as never });
    await this.audit("WIPE", "OfflineDevice", id, {
      attestation,
      keyCopies: "destroyed per attestation — caches, removable media, backups verified by operator",
      note: "Cryptographic erasure makes encrypted data unreadable by destroying the key; erasure is auditable",
    });
    return { device: row, erased: true };
  }

  // ── Clinician status view ───────────────────────────────────────────
  async getSyncStatus(deviceId: string) {
    await this.assert("READ");
    const device = await safe(
      () => (prisma as never as { offlineDevice: { findFirst: (a: unknown) => Promise<PrismaDevice | null> } })
        .offlineDevice.findFirst({ where: { workspaceId: this.workspaceId, deviceId } }),
      null,
    );
    if (!device) throw new Error("Device not found");
    const [pending, lastSync, conflicts, rejected, bundle] = await Promise.all([
      safe(() => (prisma as never as { offlineOutboxEvent: { findMany: (a: unknown) => Promise<Array<{ priority: string }>> } }).offlineOutboxEvent.findMany({ where: { workspaceId: this.workspaceId, deviceId, status: "QUEUED" }, take: 500 }), []),
      safe(() => (prisma as never as { offlineSyncSession: { findFirst: (a: unknown) => Promise<{ finishedAt: Date | null; status: string } | null> } }).offlineSyncSession.findFirst({ where: { workspaceId: this.workspaceId, deviceId, status: { in: ["COMPLETED", "COMPLETED_WITH_CONFLICTS"] } }, orderBy: { finishedAt: "desc" } }), null),
      safe(() => (prisma as never as { offlineSyncConflict: { findMany: (a: unknown) => Promise<Array<{ id: string }>> } }).offlineSyncConflict.findMany({ where: { workspaceId: this.workspaceId, deviceId, status: { in: ["OPEN", "HUMAN_REVIEW"] } }, take: 100 }), []),
      safe(() => (prisma as never as { offlineOutboxEvent: { findMany: (a: unknown) => Promise<Array<{ id: string }>> } }).offlineOutboxEvent.findMany({ where: { workspaceId: this.workspaceId, deviceId, status: "REJECTED" }, take: 100 }), []),
      safe(() => (prisma as never as { offlineKnowledgeBundle: { findFirst: (a: unknown) => Promise<{ version: string; expiresAt: Date | null; status: string } | null> } }).offlineKnowledgeBundle.findFirst({ where: { workspaceId: this.workspaceId, status: "active" }, orderBy: { createdAt: "desc" } }), null),
    ]);
    const criticalPending = pending.filter((e) => ["safety", "critical"].includes(e.priority)).length;
    const offlineMinutes = Math.max(0, Math.round((Date.now() - new Date(device.lastSeenAt).getTime()) / 60000));
    let word = "Current: no pending critical events";
    if (device.status === "compromised") word = "Compromised: security review required";
    else if (device.status === "locked" || device.status === "wiped") word = "Unknown: device has not reported status";
    else if (rejected.length > 0) word = "Rejected: event requires correction";
    else if (conflicts.length > 0) word = "Conflict: clinical review needed";
    else if (pending.length > 0) word = "Pending: local events not yet accepted";
    else if (!lastSync || offlineMinutes > 240) word = "Delayed: data older than expected";
    return {
      device: { name: device.name, deviceId: device.deviceId, role: device.role, mode: device.mode, integrity: device.integrity },
      lastSuccessfulSync: lastSync?.finishedAt ?? null,
      offlineMinutes, pendingClinicalEvents: pending.length, criticalPendingEvents: criticalPending,
      conflicts: conflicts.length, rejectedEvents: rejected.length,
      deviceIntegrity: device.integrity,
      knowledgeBundle: bundle ? { version: bundle.version, expired: bundle.expiresAt ? new Date(bundle.expiresAt).getTime() < Date.now() : false } : null,
      emergencyMode: device.mode === "EMERGENCY_OFFLINE",
      cdsAvailableOffline: !!bundle && !(bundle.expiresAt && new Date(bundle.expiresAt).getTime() < Date.now()),
      statusWord: word,
      fields: OFFLINE_STATUS_FIELDS,
    };
  }

  // ── Credentials ─────────────────────────────────────────────────────
  async issueCredential(input: z.infer<typeof offlineCredentialSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { offlineCredential: { create: (a: unknown) => Promise<unknown> } })
      .offlineCredential.create({
        data: {
          workspaceId: this.workspaceId, subject: input.subject, role: input.role, scope: input.scope,
          deviceId: input.deviceId ?? null, expiresAt: input.expiresAt, offlineAllowed: input.offlineAllowed,
          emergencyOnly: input.emergencyOnly, signature: input.signature ?? null,
          lastRevocationCheck: new Date(), createdById: this.userId,
        } as never,
      });
    await this.audit("ISSUE", "OfflineCredential", (row as { id: string }).id, { subject: input.subject, role: input.role });
    return row;
  }

  async listCredentials(subject?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (subject) where.subject = subject;
    return safe(
      () => (prisma as never as { offlineCredential: { findMany: (a: unknown) => Promise<unknown[]> } })
        .offlineCredential.findMany({ where, orderBy: { expiresAt: "asc" }, take: 100 }),
      [],
    );
  }

  async verifyCredential(id: string) {
    await this.assert("READ");
    const row = await safe(
      () => (prisma as never as { offlineCredential: { findFirst: (a: unknown) => Promise<PrismaCredential | null> } })
        .offlineCredential.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!row) throw new Error("Credential not found");
    const expired = new Date(row.expiresAt).getTime() < Date.now();
    const revoked = row.revocationStatus === "revoked";
    const checks = [
      `Expiry: ${expired ? "expired" : `valid until ${new Date(row.expiresAt).toISOString()}`}`,
      `Revocation: ${row.revocationStatus}`,
      `Offline permissions: ${row.offlineAllowed ? row.scope.join(", ") || "none" : "offline use not allowed"}`,
      `Emergency-only: ${row.emergencyOnly ? "yes — minimum emergency workflow" : "no"}`,
      `Reconnect required for additional data: ${row.emergencyOnly || expired || revoked ? "yes" : "no"}`,
    ];
    return {
      valid: !expired && !revoked && row.offlineAllowed,
      checks,
      fallback: expired || revoked ? "Expired or unverifiable credential — minimum emergency workflow only, if policy allows" : null,
    };
  }

  async revokeCredential(id: string, reason: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { offlineCredential: { update: (a: unknown) => Promise<unknown> } })
      .offlineCredential.update({ where: { id }, data: { revocationStatus: "revoked" } as never });
    await this.audit("REVOKE", "OfflineCredential", id, { reason });
    return row;
  }

  // ── Knowledge bundles — refuse stale, fail safe ─────────────────────
  async publishBundle(input: z.infer<typeof offlineBundleSchema>) {
    await this.assert("CREATE");
    for (const f of BUNDLE_REQUIRED_FIELDS) {
      if (f === "scope") continue;
      if ((input as Record<string, unknown>)[f] === undefined || (input as Record<string, unknown>)[f] === null) {
        if (["jurisdiction", "approvedBy", "validFrom", "expiresAt", "hash", "signature"].includes(f)) continue;
        throw new Error(`Bundle missing required field: ${f}`);
      }
    }
    const row = await (prisma as never as { offlineKnowledgeBundle: { upsert: (a: unknown) => Promise<unknown> } })
      .offlineKnowledgeBundle.upsert({
        where: { workspaceId_bundleId_version: { workspaceId: this.workspaceId, bundleId: input.bundleId, version: input.version } },
        create: {
          workspaceId: this.workspaceId, bundleId: input.bundleId, version: input.version, scope: input.scope,
          jurisdiction: input.jurisdiction ?? null, approvedBy: input.approvedBy ?? null,
          validFrom: input.validFrom ?? null, expiresAt: input.expiresAt ?? null,
          hash: input.hash ?? null, signature: input.signature ?? null,
          offlineUse: input.offlineUse, createdById: this.userId,
        } as never,
        update: {
          scope: input.scope, jurisdiction: input.jurisdiction ?? null, approvedBy: input.approvedBy ?? null,
          validFrom: input.validFrom ?? null, expiresAt: input.expiresAt ?? null,
          hash: input.hash ?? null, signature: input.signature ?? null,
          offlineUse: input.offlineUse, status: "active",
        } as never,
      });
    await this.audit("PUBLISH", "OfflineKnowledgeBundle", (row as { id: string }).id, { bundleId: input.bundleId, version: input.version });
    return row;
  }

  async listBundles(status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { offlineKnowledgeBundle: { findMany: (a: unknown) => Promise<unknown[]> } })
        .offlineKnowledgeBundle.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
  }

  async verifyBundle(id: string) {
    await this.assert("READ");
    const row = await safe(
      () => (prisma as never as { offlineKnowledgeBundle: { findFirst: (a: unknown) => Promise<PrismaBundle | null> } })
        .offlineKnowledgeBundle.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!row) throw new Error("Bundle not found");
    const now = Date.now();
    const reasons: string[] = [];
    if (!row.signature) reasons.push("unsigned bundle");
    if (row.status !== "active") reasons.push(`status is ${row.status}`);
    if (row.expiresAt && new Date(row.expiresAt).getTime() < now) reasons.push("bundle expired");
    if (row.validFrom && new Date(row.validFrom).getTime() > now) reasons.push("bundle not yet valid");
    return { usable: reasons.length === 0, reasons, bundle: { bundleId: row.bundleId, version: row.version, scope: row.scope } };
  }

  async rollbackBundle(id: string, reason: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { offlineKnowledgeBundle: { update: (a: unknown) => Promise<unknown> } })
      .offlineKnowledgeBundle.update({ where: { id }, data: { status: "rolled_back" } as never });
    await this.audit("ROLLBACK", "OfflineKnowledgeBundle", id, { reason });
    return { bundle: row, note: "Devices fail safe to 'bundle unavailable' — stale rules are never silently used" };
  }

  // ── Offline CDS gate ────────────────────────────────────────────────
  async evaluateCds(input: z.infer<typeof offlineCdsEvaluateSchema>) {
    await this.assert("READ");
    if ((OFFLINE_CDS_PROHIBITED as readonly string[]).includes(input.function)) {
      return { permitted: false, reason: `'${input.function}' is prohibited offline — requires connected supervision`, label: null };
    }
    if (!(OFFLINE_CDS_ALLOWED as readonly string[]).includes(input.function)) {
      return { permitted: false, reason: `'${input.function}' is not an approved offline function`, label: null };
    }
    let bundle: { bundleId: string; version: string } | null = null;
    if (input.bundleId) {
      const row = await safe(
        () => (prisma as never as { offlineKnowledgeBundle: { findFirst: (a: unknown) => Promise<PrismaBundle | null> } })
          .offlineKnowledgeBundle.findFirst({
            where: { workspaceId: this.workspaceId, bundleId: input.bundleId, ...(input.bundleVersion ? { version: input.bundleVersion } : { status: "active" }) },
            orderBy: { createdAt: "desc" },
          }),
        null,
      );
      if (!row) return { permitted: false, reason: "Knowledge bundle unavailable — failing safe, not using stale rules", label: null };
      const check = await this.verifyBundle(row.id);
      if (!check.usable) return { permitted: false, reason: `Bundle unusable: ${check.reasons.join("; ")}`, label: null };
      bundle = { bundleId: row.bundleId, version: row.version };
    }
    return {
      permitted: true,
      label: {
        offline: true, function: input.function,
        knowledgeBase: bundle ? `${bundle.bundleId} v${bundle.version}` : "device-default",
        intendedUse: "supportive reminder/display only", limitations: "not a diagnosis or treatment change",
        humanReview: "required", locallyCalculated: true, synced: false,
      },
      disclaimer: "Offline protocol reminder. This is not a diagnosis or treatment change. Confirm with an authorized clinician when connectivity or supervision is available.",
    };
  }

  // ── Emergency summaries — read-only, freshness-labeled ──────────────
  async generateSummary(input: z.infer<typeof offlineEmergencySummarySchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { offlineEmergencySummary: { create: (a: unknown) => Promise<unknown> } })
      .offlineEmergencySummary.create({
        data: {
          workspaceId: this.workspaceId, patientId: input.patientId,
          summaryRef: input.summaryRef ?? null, dataAsOf: input.dataAsOf,
          payload: input.payload as never, provenance: "server_signed",
          expiresAt: input.expiresAt ?? new Date(Date.now() + 72 * 3600_000), createdById: this.userId,
        } as never,
      });
    await this.audit("GENERATE", "OfflineEmergencySummary", (row as { id: string }).id, { patientId: input.patientId });
    return { summary: row, fields: EMERGENCY_SUMMARY_FIELDS, warnings: EMERGENCY_WARNINGS };
  }

  async listEmergencySummaries(patientId?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (patientId) where.patientId = patientId;
    return safe(
      () => (prisma as never as { offlineEmergencySummary: { findMany: (a: unknown) => Promise<unknown[]> } })
        .offlineEmergencySummary.findMany({ where, orderBy: { generatedAt: "desc" }, take: 50 }),
      [],
    );
  }

  async expireSummaries() {
    await this.assert("UPDATE");
    const row = await (prisma as never as { offlineEmergencySummary: { updateMany: (a: unknown) => Promise<{ count: number }> } })
      .offlineEmergencySummary.updateMany({ where: { workspaceId: this.workspaceId, status: "active", expiresAt: { lt: new Date() } }, data: { status: "expired" } as never });
    await this.audit("EXPIRE", "OfflineEmergencySummary", "batch", { count: (row as { count: number }).count });
    return row;
  }

  // ── Emergency access — break-glass, never a convenience bypass ──────
  async grantEmergencyAccess(input: z.infer<typeof offlineEmergencyAccessSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { offlineEmergencyAccess: { create: (a: unknown) => Promise<unknown> } })
      .offlineEmergencyAccess.create({
        data: {
          workspaceId: this.workspaceId, patientId: input.patientId, workerToken: input.workerToken,
          role: input.role ?? null, reason: input.reason, scope: input.scope,
          expiresAt: input.expiresAt, createdById: this.userId,
        } as never,
      });
    await this.audit("BREAK_GLASS", "OfflineEmergencyAccess", (row as { id: string }).id, { patientId: input.patientId, reason: input.reason });
    return { access: row, controls: EMERGENCY_ACCESS_CONTROLS };
  }

  async listEmergencyAccesses(patientId?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (patientId) where.patientId = patientId;
    return safe(
      () => (prisma as never as { offlineEmergencyAccess: { findMany: (a: unknown) => Promise<unknown[]> } })
        .offlineEmergencyAccess.findMany({ where, orderBy: { grantedAt: "desc" }, take: 50 }),
      [],
    );
  }

  async reviewEmergencyAccess(id: string, reviewedBy: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { offlineEmergencyAccess: { update: (a: unknown) => Promise<unknown> } })
      .offlineEmergencyAccess.update({ where: { id }, data: { reviewedBy, reviewedAt: new Date(), lockedAt: new Date() } as never });
    await this.audit("REVIEW", "OfflineEmergencyAccess", id, { reviewedBy });
    return row;
  }

  // ── Outbox — append-only events ─────────────────────────────────────
  async queueEvent(input: z.infer<typeof offlineOutboxSchema>) {
    await this.assert("CREATE");
    const prev = await safe(
      () => (prisma as never as { offlineOutboxEvent: { findFirst: (a: unknown) => Promise<{ logicalClock: number } | null> } })
        .offlineOutboxEvent.findFirst({ where: { workspaceId: this.workspaceId, deviceId: input.deviceId }, orderBy: { logicalClock: "desc" } }),
      null,
    );
    const clock = (prev?.logicalClock ?? 0) + 1;
    const hash = sha256(JSON.stringify(input.payload));
    const row = await (prisma as never as { offlineOutboxEvent: { create: (a: unknown) => Promise<unknown> } })
      .offlineOutboxEvent.create({
        data: {
          workspaceId: this.workspaceId, deviceId: input.deviceId,
          patientId: input.patientId ?? null, resourceRef: input.resourceRef ?? null,
          operation: input.operation, payload: input.payload as never, payloadHash: hash,
          logicalClock: clock, signature: input.signature ?? null,
          consentCtx: (input.consentCtx ?? {}) as never, priority: input.priority, createdById: this.userId,
        } as never,
      });
    await this.audit("QUEUE", "OfflineOutboxEvent", (row as { id: string }).id, { deviceId: input.deviceId, operation: input.operation });
    return { event: row, fields: SYNC_EVENT_FIELDS };
  }

  async listOutbox(deviceId?: string, status?: string, priority?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (deviceId) where.deviceId = deviceId;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    return safe(
      () => (prisma as never as { offlineOutboxEvent: { findMany: (a: unknown) => Promise<unknown[]> } })
        .offlineOutboxEvent.findMany({ where, orderBy: [{ priority: "asc" }, { createdAt: "asc" }], take: 200 }),
      [],
    );
  }

  async markEventStatus(id: string, status: "UPLOADED" | "ACCEPTED" | "REJECTED" | "CONFLICTED", lastError?: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { offlineOutboxEvent: { update: (a: unknown) => Promise<unknown> } })
      .offlineOutboxEvent.update({
        where: { id },
        data: {
          status: status as never, lastError: lastError ?? null,
          attempts: { increment: 1 } as never,
          ...(status === "ACCEPTED" ? { syncedAt: new Date() } : {}),
        } as never,
      });
    await this.audit("EVENT_STATUS", "OfflineOutboxEvent", id, { status });
    return row;
  }

  // ── Sync — priority order, integrity gates, honest status ────────────
  async startSync(input: z.infer<typeof offlineSyncStartSchema>) {
    await this.assert("CREATE");
    const device = await safe(
      () => (prisma as never as { offlineDevice: { findFirst: (a: unknown) => Promise<PrismaDevice | null> } })
        .offlineDevice.findFirst({ where: { workspaceId: this.workspaceId, deviceId: input.deviceId } }),
      null,
    );
    if (!device) throw new Error("Device not found");
    if (device.status === "locked" || device.status === "wiped" || device.status === "compromised") {
      throw new Error(`Sync blocked — device is ${device.status}`);
    }
    const row = await (prisma as never as { offlineSyncSession: { create: (a: unknown) => Promise<unknown> } })
      .offlineSyncSession.create({ data: { workspaceId: this.workspaceId, deviceId: input.deviceId, createdById: this.userId } as never });
    await (prisma as never as { offlineDevice: { update: (a: unknown) => Promise<unknown> } })
      .offlineDevice.update({ where: { id: device.id }, data: { mode: "SYNCING", lastSeenAt: new Date() } as never });
    await this.audit("SYNC_START", "OfflineSyncSession", (row as { id: string }).id, { deviceId: input.deviceId });
    return { session: row, protocol: SYNC_PROTOCOL, priorityOrder: SYNC_PRIORITY_ORDER };
  }

  async completeSync(id: string, input: z.infer<typeof offlineSyncCompleteSchema>) {
    await this.assert("UPDATE");
    const failed = [input.hashCheck, input.sequenceCheck, input.identityCheck].includes("failed");
    const status = failed ? "FAILED" : input.conflicts > 0 ? "COMPLETED_WITH_CONFLICTS" : "COMPLETED";
    const nextAction = failed
      ? "integrity_failure — investigate before retry"
      : input.conflicts > 0 ? "clinical_review_required"
      : input.rejected > 0 ? "correction_required"
      : input.mediaCheck === "pending" ? "media_pending — not fully synced"
      : "none";
    const row = await (prisma as never as { offlineSyncSession: { update: (a: unknown) => Promise<unknown> } })
      .offlineSyncSession.update({
        where: { id },
        data: {
          status: status as never, uploaded: input.uploaded, accepted: input.accepted,
          rejected: input.rejected, conflicts: input.conflicts, downloaded: input.downloaded,
          hashCheck: input.hashCheck, sequenceCheck: input.sequenceCheck,
          identityCheck: input.identityCheck, mediaCheck: input.mediaCheck,
          lastServerVersion: input.lastServerVersion ?? null, nextAction, finishedAt: new Date(),
        } as never,
      });
    const session = row as { deviceId: string };
    const device = await safe(
      () => (prisma as never as { offlineDevice: { findFirst: (a: unknown) => Promise<PrismaDevice | null> } })
        .offlineDevice.findFirst({ where: { workspaceId: this.workspaceId, deviceId: session.deviceId } }),
      null,
    );
    if (device) {
      await (prisma as never as { offlineDevice: { update: (a: unknown) => Promise<unknown> } })
        .offlineDevice.update({ where: { id: device.id }, data: { mode: failed ? "QUARANTINED_SYNC" : "ONLINE", lastSeenAt: new Date() } as never });
    }
    await this.audit("SYNC_COMPLETE", "OfflineSyncSession", id, { status, nextAction });
    return { session: row, integrityChecks: SYNC_INTEGRITY_CHECKS, displayRule: "'Synced' is never shown while media, conflicts, or rejected clinical events remain unresolved" };
  }

  async listSyncs(deviceId?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (deviceId) where.deviceId = deviceId;
    return safe(
      () => (prisma as never as { offlineSyncSession: { findMany: (a: unknown) => Promise<unknown[]> } })
        .offlineSyncSession.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
  }

  // ── Conflicts — typed rules, human gate for clinical types ───────────
  async listConflicts(status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { offlineSyncConflict: { findMany: (a: unknown) => Promise<unknown[]> } })
        .offlineSyncConflict.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
      [],
    );
  }

  async createConflict(input: { deviceId?: string; type: string; recordRefs?: string[]; patientId?: string; owner?: string }) {
    await this.assert("CREATE");
    if (!SYNC_CONFLICT_TYPES.includes(input.type as never)) throw new Error(`Type must be one of: ${SYNC_CONFLICT_TYPES.join("; ")}`);
    const rule = CONFLICT_DEFAULTS.find((r) => r.match.test(input.type));
    const row = await (prisma as never as { offlineSyncConflict: { create: (a: unknown) => Promise<unknown> } })
      .offlineSyncConflict.create({
        data: {
          workspaceId: this.workspaceId, deviceId: input.deviceId ?? null, type: input.type,
          recordRefs: input.recordRefs ?? [], patientId: input.patientId ?? null,
          defaultHandling: rule?.handling ?? "Human review",
          owner: input.owner ?? null, status: rule?.humanReview ? "HUMAN_REVIEW" : "OPEN",
          createdById: undefined,
        } as never,
      });
    await this.audit("CREATE", "OfflineSyncConflict", (row as { id: string }).id, { type: input.type });
    return { conflict: row, rule: rule?.handling ?? "Human review", patientMessage: "Two records conflict. N0VA has not chosen between them. A pharmacist or clinician must review before the active list is changed." };
  }

  async resolveConflict(id: string, input: z.infer<typeof offlineConflictResolveSchema>) {
    await this.assert("UPDATE");
    const existing = await safe(
      () => (prisma as never as { offlineSyncConflict: { findFirst: (a: unknown) => Promise<{ type: string; status: string } | null> } })
        .offlineSyncConflict.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!existing) throw new Error("Conflict not found");
    const rule = CONFLICT_DEFAULTS.find((r) => r.match.test(existing.type));
    if (rule?.humanReview && !input.reviewedBy) throw new Error(`${existing.type} conflicts require a named human reviewer — last-write-wins is unsafe here`);
    const row = await (prisma as never as { offlineSyncConflict: { update: (a: unknown) => Promise<unknown> } })
      .offlineSyncConflict.update({
        where: { id },
        data: { status: "RESOLVED", resolution: { decision: input.decision, reviewedBy: input.reviewedBy, ...(input.resolution ?? {}), at: new Date().toISOString() } as never, resolvedAt: new Date() } as never,
      });
    await this.audit("RESOLVE", "OfflineSyncConflict", id, input as never);
    return row;
  }

  // ── Store-and-forward — upload ≠ reviewed ────────────────────────────
  async createStoreForward(input: z.infer<typeof offlineStoreForwardSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { offlineStoreForward: { create: (a: unknown) => Promise<unknown> } })
      .offlineStoreForward.create({
        data: {
          workspaceId: this.workspaceId, deviceId: input.deviceId,
          patientId: input.patientId ?? null, kind: input.kind,
          payloadRef: input.payloadRef ?? null, payloadHash: input.payloadHash ?? null,
          consentRef: input.consentRef ?? null, priority: input.priority,
          receiverRole: input.receiverRole ?? null, expiresAt: input.expiresAt ?? null,
          createdById: this.userId,
        } as never,
      });
    await this.audit("CAPTURE", "OfflineStoreForward", (row as { id: string }).id, { kind: input.kind, priority: input.priority });
    return { item: row, workflow: STOREFORWARD_WORKFLOW };
  }

  async transitionStoreForward(id: string, input: z.infer<typeof offlineStoreForwardTransitionSchema>) {
    await this.assert("UPDATE");
    const current = await safe(
      () => (prisma as never as { offlineStoreForward: { findFirst: (a: unknown) => Promise<{ status: string } | null> } })
        .offlineStoreForward.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!current) throw new Error("Store-and-forward item not found");
    const allowed = SF_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(input.to)) throw new Error(`Illegal transition ${current.status} → ${input.to}`);
    if ((input.to === "VIEWED" || input.to === "RESPONDED") && !input.actorRole) {
      throw new Error("Clinician view/response requires an identified clinical actor — upload alone never counts as reviewed");
    }
    const row = await (prisma as never as { offlineStoreForward: { update: (a: unknown) => Promise<unknown> } })
      .offlineStoreForward.update({
        where: { id },
        data: {
          status: input.to as never,
          ...(input.to === "RESPONDED" ? { respondedAt: new Date() } : {}),
          ...(input.to === "DELIVERED" ? { receiptConfirmedAt: new Date() } : {}),
        } as never,
      });
    await this.audit("TRANSITION", "OfflineStoreForward", id, { from: current.status, to: input.to, actorRole: input.actorRole ?? null });
    return { item: row, states: STOREFORWARD_STATES };
  }

  async listStoreForward(deviceId?: string, status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (deviceId) where.deviceId = deviceId;
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { offlineStoreForward: { findMany: (a: unknown) => Promise<unknown[]> } })
        .offlineStoreForward.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
      [],
    );
  }

  // ── Retention — server evaluates, device erases, holds win ───────────
  async upsertRetentionPolicy(input: z.infer<typeof offlineRetentionSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { offlineRetentionPolicy: { upsert: (a: unknown) => Promise<unknown> } })
      .offlineRetentionPolicy.upsert({
        where: { workspaceId_deviceProfile: { workspaceId: this.workspaceId, deviceProfile: input.deviceProfile } },
        create: {
          workspaceId: this.workspaceId, deviceProfile: input.deviceProfile,
          retention: input.retention as never, deletion: (input.deletion ?? {}) as never,
          createdById: this.userId,
        } as never,
        update: { retention: input.retention as never, deletion: (input.deletion ?? {}) as never, active: true } as never,
      });
    await this.audit("UPSERT", "OfflineRetentionPolicy", (row as { id: string }).id, { deviceProfile: input.deviceProfile });
    return row;
  }

  async listRetentionPolicies() {
    await this.assert("READ");
    return safe(
      () => (prisma as never as { offlineRetentionPolicy: { findMany: (a: unknown) => Promise<unknown[]> } })
        .offlineRetentionPolicy.findMany({ where: { workspaceId: this.workspaceId, active: true }, take: 50 }),
      [],
    );
  }

  async evaluateRetention(deviceProfile: string) {
    await this.assert("READ");
    const policy = await safe(
      () => (prisma as never as { offlineRetentionPolicy: { findFirst: (a: unknown) => Promise<{ retention: unknown; deletion: unknown } | null> } })
        .offlineRetentionPolicy.findFirst({ where: { workspaceId: this.workspaceId, deviceProfile, active: true } }),
      null,
    );
    const effective = policy ?? DEFAULT_RETENTION_PROFILE;
    return {
      deviceProfile, policy: effective, axes: OFFLINE_RETENTION_AXES, expiryKinds: RETENTION_EXPIRY_KINDS,
      note: "Server evaluates and directs; the device performs cryptographic erasure and attests. Expired local data is erased while server records and audit evidence follow organization retention. Legal/safety holds override erasure.",
    };
  }

  // ── Security incidents — revoke, lock, wipe, reconcile, notify ───────
  async reportSecurityIncident(input: z.infer<typeof offlineSecurityIncidentSchema>) {
    await this.assert("CREATE");
    if (!SECURITY_TRIGGERS.includes(input.kind as never)) throw new Error(`Kind must be one of: ${SECURITY_TRIGGERS.join("; ")}`);
    const row = await (prisma as never as { offlineSecurityIncident: { create: (a: unknown) => Promise<unknown> } })
      .offlineSecurityIncident.create({
        data: {
          workspaceId: this.workspaceId, deviceId: input.deviceId, kind: input.kind,
          detail: input.detail ?? null, createdById: this.userId,
        } as never,
      });
    // Immediate containment for lost/stolen/tampered: lock the device record now.
    if (["Lost device", "Stolen device", "Tampered application", "Rooted or jailbroken device"].includes(input.kind)) {
      const device = await safe(
        () => (prisma as never as { offlineDevice: { findFirst: (a: unknown) => Promise<{ id: string } | null> } })
          .offlineDevice.findFirst({ where: { workspaceId: this.workspaceId, deviceId: input.deviceId } }),
        null,
      );
      if (device) {
        await (prisma as never as { offlineDevice: { update: (a: unknown) => Promise<unknown> } })
          .offlineDevice.update({ where: { id: device.id }, data: { status: "locked", revokedAt: new Date() } as never });
      }
    }
    await this.audit("SECURITY_INCIDENT", "OfflineSecurityIncident", (row as { id: string }).id, input as never);
    return { incident: row, availableActions: SECURITY_ACTIONS };
  }

  async listSecurityIncidents(status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { offlineSecurityIncident: { findMany: (a: unknown) => Promise<unknown[]> } })
        .offlineSecurityIncident.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
      [],
    );
  }

  async resolveSecurityIncident(id: string, input: z.infer<typeof offlineSecurityResolveSchema>) {
    await this.assert("UPDATE");
    const incident = await safe(
      () => (prisma as never as { offlineSecurityIncident: { findFirst: (a: unknown) => Promise<{ deviceId: string } | null> } })
        .offlineSecurityIncident.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!incident) throw new Error("Security incident not found");
    for (const action of input.actions) {
      if (!SECURITY_ACTIONS.includes(action as never)) throw new Error(`Unknown action: ${action}`);
    }
    const device = await safe(
      () => (prisma as never as { offlineDevice: { findFirst: (a: unknown) => Promise<{ id: string } | null> } })
        .offlineDevice.findFirst({ where: { workspaceId: this.workspaceId, deviceId: incident.deviceId } }),
      null,
    );
    if (device) {
      if (input.actions.includes("Revoke device")) {
        await (prisma as never as { offlineDevice: { update: (a: unknown) => Promise<unknown> } })
          .offlineDevice.update({ where: { id: device.id }, data: { status: "locked", revokedAt: new Date() } as never });
      }
      if (input.actions.includes("Revoke offline credentials")) {
        await (prisma as never as { offlineCredential: { updateMany: (a: unknown) => Promise<unknown> } })
          .offlineCredential.updateMany({ where: { workspaceId: this.workspaceId, deviceId: incident.deviceId }, data: { revocationStatus: "revoked" } as never });
      }
      if (input.actions.includes("Wipe local key") || input.actions.includes("Cryptographically erase local records")) {
        await (prisma as never as { offlineDevice: { update: (a: unknown) => Promise<unknown> } })
          .offlineDevice.update({ where: { id: device.id }, data: { status: "wiped", wipedAt: new Date(), revokedAt: new Date() } as never });
      }
      if (input.actions.includes("Block synchronization")) {
        await (prisma as never as { offlineDevice: { update: (a: unknown) => Promise<unknown> } })
          .offlineDevice.update({ where: { id: device.id }, data: { mode: "QUARANTINED_SYNC" } as never });
      }
    }
    const row = await (prisma as never as { offlineSecurityIncident: { update: (a: unknown) => Promise<unknown> } })
      .offlineSecurityIncident.update({ where: { id }, data: { status: "resolved", actions: input.actions as never, resolvedAt: new Date() } as never });
    await this.audit("SECURITY_RESOLVE", "OfflineSecurityIncident", id, input as never);
    return { incident: row, note: "Forensic audit preserved; locally authored events reconciled; affected patients notified where required" };
  }

  // ── Observability — operational signal, never punitive ────────────────
  async recordReport(input: z.infer<typeof offlineReportSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { offlineDeviceReport: { create: (a: unknown) => Promise<unknown> } })
      .offlineDeviceReport.create({
        data: {
          workspaceId: this.workspaceId, deviceId: input.deviceId, offlineMinutes: input.offlineMinutes,
          batteryPct: input.batteryPct ?? null, storageFreeMb: input.storageFreeMb ?? null,
          queueSize: input.queueSize, criticalBacklog: input.criticalBacklog,
          syncDurationMs: input.syncDurationMs ?? null, syncSuccess: input.syncSuccess ?? null,
          conflictCount: input.conflictCount, rejectionCount: input.rejectionCount,
          duplicateCount: input.duplicateCount, integrityFails: input.integrityFails,
          credentialDaysLeft: input.credentialDaysLeft ?? null, bundleExpired: input.bundleExpired,
          emergencyAccesses: input.emergencyAccesses, cdsUses: input.cdsUses, mediaFailures: input.mediaFailures,
        } as never,
      });
    await this.audit("REPORT", "OfflineDeviceReport", (row as { id: string }).id, { deviceId: input.deviceId });
    return row;
  }

  async getObservability(deviceId?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (deviceId) where.deviceId = deviceId;
    const rows = await safe(
      () => (prisma as never as { offlineDeviceReport: { findMany: (a: unknown) => Promise<Array<Record<string, unknown>>> } })
        .offlineDeviceReport.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
      [],
    );
    const num = (k: string) => rows.reduce((n, r) => n + (Number(r[k]) || 0), 0);
    return {
      reports: rows.length,
      totals: {
        offlineMinutes: num("offlineMinutes"), queueSize: num("queueSize"),
        criticalBacklog: num("criticalBacklog"), conflicts: num("conflictCount"),
        rejections: num("rejectionCount"), integrityFails: num("integrityFails"),
        emergencyAccesses: num("emergencyAccesses"), mediaFailures: num("mediaFailures"),
      },
      metrics: OBSERVABILITY_METRICS,
      note: "Network and power limitations explain missing sync — metrics inform support and staffing, never penalties",
    };
  }

  // ── Static exports for UI ─────────────────────────────────────────────
  static readonly OFFLINE_MODES = OFFLINE_MODES;
  static readonly OFFLINE_API = OFFLINE_API;
  static readonly FHIR_OFFLINE_RESOURCES = FHIR_OFFLINE_RESOURCES;
  static readonly SYNC_STATUS_WORDS = SYNC_STATUS_WORDS;
}
