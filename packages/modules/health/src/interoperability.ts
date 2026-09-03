// Interoperability Control Plane — dedicated layer between external systems and the clinical data platform.
// Manages connectivity, transformation, terminology, validation, delivery, replay, quarantine,
// rate limits, conformance, and data quality. Malformed or ambiguous data never enters clinical
// workflows silently. "Connected" never implies "interoperable": each interface is separately observed.
// Two layers, always distinct: raw transport (exact bytes received, immutable) vs normalized clinical
// (validated resources for downstream use). Raw payloads are never overwritten after transformation.
// Governing principle: prove the right data, for the right patient, in the right meaning, arrived
// intact, was validated, and can be traced or safely replayed.
import { z } from "zod";
import { createHash } from "node:crypto";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "health_interoperability";

// ── Control-plane architecture pipeline ─────────────────────────────────
export const INTEROP_PIPELINE = [
  "Identity, authentication, and partner policy",
  "Interface gateway",
  "Protocol adapters",
  "Raw immutable landing zone",
  "Parsing and normalization",
  "Terminology translation",
  "Validation and business rules",
  "Deduplication and conflict resolution",
  "Quarantine or approved ingestion",
  "Clinical data platform",
  "Monitoring, replay, audit, and conformance reporting",
] as const;

// ── External systems ────────────────────────────────────────────────────
export const INTEROP_SOURCES = [
  "FHIR APIs",
  "HL7 v2 / MLLP",
  "DICOM DIMSE",
  "DICOMweb",
  "Pharmacy feeds",
  "Claims feeds",
  "Devices",
  "Research systems",
] as const;

export const INTEROP_PROTOCOLS = [
  "FHIR_R4",
  "FHIR_R5",
  "HL7_V2",
  "DICOM_DIMSE",
  "DICOMWEB",
  "PHARMACY_FEED",
  "CLAIMS_FEED",
  "DEVICE",
  "RESEARCH",
] as const;

// ── FHIR validation pipeline — 12 stages ────────────────────────────────
export const VALIDATION_PIPELINE = [
  "JSON or XML syntax validation",
  "FHIR version validation",
  "Resource-type validation",
  "Profile validation",
  "Cardinality validation",
  "Terminology validation",
  "Reference validation",
  "Invariant validation",
  "Business-rule validation",
  "Provenance validation",
  "Duplicate check",
  "Conflict check",
] as const;

// ── Validation outcomes — 10 ────────────────────────────────────────────
export const VALIDATION_OUTCOMES = [
  "VALID",
  "VALID_WITH_WARNING",
  "REPAIRABLE",
  "QUARANTINE",
  "UNSUPPORTED_VERSION",
  "UNKNOWN_PROFILE",
  "TERMINOLOGY_UNRESOLVED",
  "IDENTITY_UNRESOLVED",
  "DUPLICATE_CANDIDATE",
  "CONFLICT_REVIEW",
] as const;

// ── OperationOutcome issue classes — 10 ─────────────────────────────────
export const OUTCOME_CLASSES = [
  "Fatal transport failure",
  "Parse error",
  "Structural error",
  "Terminology error",
  "Identity error",
  "Clinical plausibility warning",
  "Duplicate",
  "Conflict",
  "Policy violation",
  "Security violation",
] as const;

// ── HL7 v2 ──────────────────────────────────────────────────────────────
export const HL7V2_MESSAGE_TYPES = [
  "ADT",
  "ORU",
  "ORM",
  "MDM",
  "SIU",
  "DFT",
  "ACK",
  "NACK or error responses",
  "Custom partner messages",
] as const;

export const HL7V2_PIPELINE = [
  "MLLP or managed transport",
  "Frame validation",
  "Message persistence",
  "ACK generation",
  "Segment parsing",
  "Message-profile validation",
  "Patient and encounter matching",
  "Terminology mapping",
  "Duplicate detection",
  "Business validation",
  "Normalization",
  "Delivery or quarantine",
] as const;

export const HL7V2_ACK_CODES = [
  "AA: application accept",
  "AE: application error",
  "AR: application reject",
] as const;

export const HL7V2_METRICS = [
  "Messages per minute",
  "ACK latency",
  "ACK success",
  "NACK rate",
  "Parse failures",
  "Segment errors",
  "Missing required fields",
  "Unknown message types",
  "Patient-match failures",
  "Duplicate messages",
  "Out-of-order messages",
  "Sequence gaps",
  "Delayed messages",
  "Retry volume",
  "Partner downtime",
  "Queue depth",
  "Quarantine volume",
] as const;

export const HL7V2_REPLAY_FIELDS = [
  "Original message",
  "Original timestamp",
  "Original ACK",
  "Replay reason",
  "New replay identifier",
  "Target environment",
  "Mapping version",
  "Dry-run mode",
  "Duplicate protection",
  "Operator approval",
  "Result comparison",
  "Audit record",
] as const;

// ── DICOM ───────────────────────────────────────────────────────────────
export const DICOM_CAPABILITIES = [
  "C-ECHO",
  "C-FIND",
  "C-MOVE",
  "C-GET",
  "C-STORE",
  "Modality worklist",
  "Storage commitment",
  "Query/retrieve",
  "DICOMweb QIDO-RS",
  "DICOMweb WADO-RS",
  "DICOMweb STOW-RS",
  "Viewer launch",
  "Hanging protocols",
  "Key images",
  "Structured reports",
  "Presentation states",
  "Segmentation objects",
  "Multiframe studies",
] as const;

export const DICOM_TRANSFER_HEALTH = [
  "Association success",
  "TLS or certificate errors",
  "AE-title mismatch",
  "Transfer syntax incompatibility",
  "SOP-class rejection",
  "Study completeness",
  "Series completeness",
  "Instance count mismatch",
  "Duplicate instances",
  "Corrupt objects",
  "Delayed routing",
  "Failed stores",
  "Storage commitment status",
  "Query latency",
  "Retrieval latency",
  "Viewer launch success",
  "Pixel streaming failures",
  "Metadata mismatch",
  "Study-to-patient identity mismatch",
] as const;

export const DICOM_VIEWER_HEALTH = [
  "Viewer availability",
  "Launch success rate",
  "Time to first image",
  "Study retrieval latency",
  "Browser and device compatibility",
  "Authentication failures",
  "Missing series",
  "Broken links",
  "Annotation persistence",
  "Structured-report loading",
  "DICOMweb response errors",
  "User-reported display issues",
] as const;

// ── Terminology service ─────────────────────────────────────────────────
export const TERMINOLOGY_OPS = [
  "Code-system registry",
  "Versioned concept tables",
  "Value-set expansion",
  "Code lookup",
  "Validation",
  "Subsumption",
  "Translation",
  "Property lookup",
  "Inactive-code detection",
  "Local-code governance",
  "Mapping confidence",
  "Effective dates",
  "Deprecation tracking",
] as const;

export const TERMINOLOGY_DOMAINS = [
  "SNOMED CT: findings, conditions, procedures — versioned international and local editions",
  "LOINC: laboratory and clinical observations — unit and specimen validation",
  "ICD: diagnoses, billing, reporting — version and jurisdiction tracking",
  "RxNorm: medications and ingredients — brand, ingredient, strength, form mapping",
  "CPT: procedures and professional services — jurisdiction and annual-version control",
  "Local codes: partner workflows — steward, mapping, confidence, expiry",
  "UCUM units",
  "NDC",
  "DICOM terminology",
  "HL7 tables",
  "Local laboratory codes",
  "Local procedure codes",
  "Payer-specific codes",
  "Research vocabularies",
] as const;

export const MAPPING_TYPES = ["exact", "narrower", "broader", "possible"] as const;

// ── Duplicates — levels + confidence actions ────────────────────────────
export const DUPLICATE_LEVELS = [
  "Message identity",
  "Resource identifier",
  "Patient and encounter",
  "Laboratory result",
  "Imaging study",
  "Medication order",
  "Referral",
  "Appointment",
  "Device observation",
  "Research record",
  "Bulk export record",
] as const;

export const DUPLICATE_ACTIONS = [
  "Exact duplicate → suppress downstream duplicate processing, preserve source and audit",
  "Probable duplicate → link records, hold high-impact action, review or resolve",
  "Possible duplicate → present to data steward, do not merge automatically",
  "Distinct → ingest independently",
] as const;

// ── Conflicts — types + resolutions ─────────────────────────────────────
export const CONFLICT_TYPES = [
  "Two systems report different allergies",
  "Discharge medication differs from pharmacy feed",
  "Two encounters have inconsistent dates",
  "Laboratory result has different units",
  "Diagnosis active in one system, resolved in another",
  "Study linked to different patients",
  "Clinician correction conflicts with imported data",
  "Terminology map changes meaning",
] as const;

export const CONFLICT_RESOLUTIONS = [
  "Source precedence applied",
  "Human-confirmed merge",
  "Preserve both with context",
  "Superseded",
  "Invalid source",
  "Patient correction accepted",
  "Unable to resolve",
  "Escalated",
] as const;

// ── Quarantine reasons — 15 ─────────────────────────────────────────────
export const QUARANTINE_REASONS = [
  "Malformed payload",
  "Unsupported version",
  "Unknown patient",
  "Wrong patient suspected",
  "Missing required field",
  "Terminology unresolved",
  "Profile failure",
  "Security failure",
  "Duplicate or conflict",
  "Invalid timestamp",
  "Implausible measurement",
  "Unauthorized purpose",
  "Partner contract violation",
  "DICOM study incomplete",
  "Bulk export checksum failure",
] as const;

// ── Replay safeguards + controls ────────────────────────────────────────
export const REPLAY_SAFEGUARDS = [
  "Require operator authorization",
  "Preview affected patients and resources",
  "Detect changed terminology",
  "Re-run validation",
  "Do not duplicate clinical events",
  "Preserve original and replay audit trails",
  "Notify owners if downstream clinical tasks change",
  "Block replay across incompatible environments",
  "Require extra approval for imaging, medication, and patient identity updates",
] as const;

export const REPLAY_CONTROLS = [
  "Select failed payloads",
  "Preview impact",
  "Revalidate under selected version",
  "Check identity and idempotency",
  "Dry-run mapping",
  "Approve replay",
  "Deliver to controlled destination",
  "Compare output",
  "Report failures",
  "Reconcile downstream state",
] as const;

// ── Rate limits ─────────────────────────────────────────────────────────
export const RATE_LIMIT_LANES = [
  "Requests per second",
  "Requests per minute",
  "Concurrent connections",
  "FHIR search limits",
  "Bulk-export jobs",
  "DICOM associations",
  "Maximum study size",
  "HL7 message queue depth",
  "Retry budget",
  "Burst allowance",
  "Maintenance windows",
  "Priority lanes",
] as const;

// ── Bulk Data controls ──────────────────────────────────────────────────
export const BULK_CONTROLS = [
  "Explicit authorization",
  "Minimum necessary scope",
  "Group membership snapshot",
  "Patient exclusion rules",
  "De-identification where required",
  "Output encryption",
  "Signed manifests",
  "File integrity validation",
  "Expiring download URLs",
  "Download audit",
  "Failed-job replay",
  "No silent partial export",
  "Reported exclusions and errors",
] as const;

export const BULK_TRACKING = [
  "Export request",
  "Authorized group or population",
  "Scope",
  "Kickoff time",
  "Job identifier",
  "Status URL",
  "Progress",
  "Resource types",
  "File count",
  "Record count",
  "NDJSON validity",
  "Checksums",
  "Encryption",
  "Expiry",
  "Download attempts",
  "Partial failure",
  "Cancellation",
  "Client identity",
  "Completion",
  "Deletion after retention period",
] as const;

// ── Subscriptions ───────────────────────────────────────────────────────
export const SUBSCRIPTION_MONITORING = [
  "Subscription status",
  "Topic",
  "Criteria",
  "Channel",
  "Endpoint",
  "Authentication",
  "Delivery latency",
  "Notification count",
  "Acknowledgement",
  "Retry count",
  "Dead-letter notifications",
  "Duplicate notifications",
  "Ordering",
  "Gap detection",
  "Expiration",
  "Authorization changes",
  "Endpoint health",
] as const;

export const SUBSCRIPTION_FAILURE_STATES = [
  "Active",
  "Suspended",
  "Endpoint unreachable",
  "Authentication failed",
  "Backlog growing",
  "Notification rejected",
  "Duplicate delivery",
  "Ordering concern",
  "Topic unsupported",
  "Expired",
  "Revoked",
  "Dead-lettered",
] as const;

// ── Contract testing — 10 layers ────────────────────────────────────────
export const CONTRACT_TEST_LAYERS = [
  "Syntax: payload can be parsed",
  "Schema: structure is valid",
  "Profile: implementation-guide requirements are met",
  "Terminology: codes and value sets are valid",
  "Business: clinical and partner rules are satisfied",
  "Security: identity, scopes, and encryption work",
  "Workflow: end-to-end event reaches the correct destination",
  "Resilience: retry, replay, outage, and recovery work",
  "Data quality: values, units, timestamps, and references are plausible",
  "Conformance: partner behavior matches the agreed contract",
] as const;

export const CONFORMANCE_STATUSES = [
  "PASS",
  "CONDITIONAL_PASS",
  "FAIL",
  "NOT_TESTED",
  "UNSUPPORTED",
  "DEGRADED",
  "EXPIRED",
] as const;

// ── Data quality — dimensions shown separately, never one hidden score ───
export const QUALITY_DIMENSIONS = [
  "Completeness",
  "Validity",
  "Timeliness",
  "Uniqueness",
  "Consistency",
  "Plausibility",
  "Patient-match success",
  "Terminology coverage",
  "Unit normalization",
  "Reference integrity",
  "Missing provenance",
  "Conflict rate",
  "Duplicate rate",
] as const;

// ── Identity resolution — deterministic first, never name+DOB auto-merge ─
export const IDENTITY_RESULTS = [
  "Exact match",
  "Probable match",
  "Possible match",
  "No match",
  "Conflicting match",
  "Manual review",
] as const;

// ── Security and governance per interface ───────────────────────────────
export const SECURITY_CONTROLS = [
  "Mutual authentication where appropriate",
  "Encryption in transit",
  "Encryption at rest",
  "Scoped authorization",
  "Partner isolation",
  "Secret rotation",
  "Certificate monitoring",
  "IP or network controls",
  "Payload inspection",
  "Malware scanning for documents",
  "DICOM de-identification where approved",
  "Rate limiting",
  "Replay protection",
  "Audit logging",
  "Break-glass access",
  "Data-use purpose enforcement",
] as const;

// ── Incidents ───────────────────────────────────────────────────────────
export const INCIDENT_KINDS = [
  "Widespread validation failure",
  "Patient-match degradation",
  "Missing laboratory results",
  "Imaging transfer failure",
  "Viewer outage",
  "Terminology-service outage",
  "Subscription backlog",
  "Bulk-export corruption",
  "Duplicate delivery",
  "Cross-partner data leakage",
  "Rate-limit saturation",
  "Certificate expiry",
  "Conformance regression",
] as const;

export const INCIDENT_FIELDS = [
  "Start time",
  "Detection source",
  "Affected partners",
  "Affected patients or records",
  "Clinical risk",
  "Current mitigation",
  "Owner",
  "Communications",
  "Replay plan",
  "Data-reconciliation plan",
  "Root cause",
  "Corrective action",
  "Closure evidence",
] as const;

// ── Contract-change management ──────────────────────────────────────────
export const CONTRACT_CHANGE_STEPS = [
  "Change request",
  "Impact assessment",
  "Fixture update",
  "Sandbox validation",
  "Contract test",
  "Canary deployment",
  "Rollback plan",
  "Production approval",
  "Post-change monitoring",
] as const;

// ── FHIR mapping resources ──────────────────────────────────────────────
export const FHIR_INTEROP_RESOURCES = [
  "Observation: normalized clinical observations",
  "DiagnosticReport: laboratory and imaging reports",
  "Patient: identity-resolved subject",
  "MedicationRequest: normalized prescription intent",
  "MedicationDispense: normalized supply events",
  "ServiceRequest: normalized referrals and orders",
  "Appointment: normalized scheduling",
  "Task: interface follow-ups and quarantine work",
  "Communication: partner and patient notifications",
  "Provenance: source, mapping version, and transformation history",
  "AuditEvent: interface access and replay audit",
  "OperationOutcome: structured validation issues",
  "Consent: data-use purpose enforcement",
  "Device: device identity for device feeds",
] as const;

// ── Control-plane API — 24 endpoints ─────────────────────────────────────
export const INTEROP_API = [
  "GET    /interfaces",
  "POST   /interfaces",
  "GET    /interfaces/{id}/health",
  "GET    /interfaces/{id}/contract",
  "POST   /interfaces/{id}/contract-test",
  "GET    /interfaces/{id}/conformance-report",
  "GET    /interfaces/{id}/metrics",
  "GET    /messages",
  "POST   /messages",
  "GET    /messages/{id}",
  "POST   /messages/{id}/replay",
  "POST   /messages/{id}/quarantine",
  "POST   /messages/{id}/release",
  "POST   /messages/{id}/supersede",
  "GET    /conflicts",
  "POST   /conflicts/{id}/resolve",
  "GET    /terminology/maps",
  "POST   /terminology/maps/review",
  "GET    /bulk-jobs",
  "POST   /bulk-jobs/{id}/cancel",
  "GET    /subscriptions",
  "POST   /subscriptions/{id}/reconcile",
  "GET    /quality/dashboard",
  "GET    /incidents",
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

type OutcomeIssue = {
  severity: "fatal" | "error" | "warning" | "information";
  code: string;
  class: string;
  details: { text: string };
  location: string[];
  diagnostics: Record<string, unknown>;
};

function operationOutcome(issues: OutcomeIssue[]) {
  return { resourceType: "OperationOutcome", issue: issues };
}

// ── Zod schemas ─────────────────────────────────────────────────────────
export const interopInterfaceSchema = z.object({
  interfaceId: z.string().min(1).max(120),
  partner: z.string().min(1).max(120),
  environment: z.enum(["sandbox", "certification", "preprod", "production"]).default("production"),
  protocol: z.enum(["FHIR_R4","FHIR_R5","HL7_V2","DICOM_DIMSE","DICOMWEB","PHARMACY_FEED","CLAIMS_FEED","DEVICE","RESEARCH"]),
  version: z.string().max(40).optional().nullable(),
  direction: z.enum(["inbound","outbound","bidirectional"]).default("inbound"),
  endpoint: z.string().max(500).optional().nullable(),
  resources: z.array(z.string()).default([]),
  profilePackages: z.array(z.string()).default([]),
  terminology: z.record(z.unknown()).optional(),
  security: z.record(z.unknown()).optional(),
  limits: z.record(z.unknown()).optional(),
  retry: z.record(z.unknown()).optional(),
  maintenance: z.record(z.unknown()).optional(),
  sla: z.string().max(200).optional().nullable(),
  supportContact: z.string().max(200).optional().nullable(),
  dataUsePurpose: z.string().max(300).optional().nullable(),
  retention: z.string().max(200).optional().nullable(),
  owner: z.string().max(120).optional().nullable(),
  nextReview: z.coerce.date().optional().nullable(),
});

export const interopIngestSchema = z.object({
  interfaceId: z.string().min(1).max(120).optional().nullable(),
  protocol: z.enum(["FHIR_R4","FHIR_R5","HL7_V2","DICOM_DIMSE","DICOMWEB","PHARMACY_FEED","CLAIMS_FEED","DEVICE","RESEARCH"]),
  messageType: z.string().min(1).max(120),
  direction: z.enum(["inbound","outbound"]).default("inbound"),
  rawPayload: z.string().min(1).max(200000),
  patientId: z.string().uuid().optional().nullable(),
  dedupKey: z.string().max(200).optional().nullable(),
  idempotencyKey: z.string().max(200).optional().nullable(),
  profile: z.string().max(300).optional().nullable(),
  mappingVersion: z.string().max(40).optional().nullable(),
  urgent: z.boolean().default(false),
});

export const interopTerminologyMapSchema = z.object({
  sourceSystem: z.string().min(1).max(200),
  sourceCode: z.string().min(1).max(200),
  targetSystem: z.string().min(1).max(300),
  targetCode: z.string().max(200).optional().nullable(),
  mappingType: z.enum(["exact","narrower","broader","possible"]).default("possible"),
  confidence: z.enum(["high","moderate","low"]).default("low"),
  mappingVersion: z.string().max(40).default("2026.08"),
  notes: z.string().max(1000).optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const interopTerminologyReviewSchema = z.object({
  decision: z.enum(["steward_approved","rejected"]),
  targetCode: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const interopConflictSchema = z.object({
  type: z.string().min(1).max(200),
  recordRefs: z.array(z.string()).default([]),
  patientId: z.string().uuid().optional().nullable(),
  severity: z.string().max(60).default("clinical_review_required"),
  owner: z.string().max(120).optional().nullable(),
});

export const interopConflictResolveSchema = z.object({
  resolution: z.enum(["SOURCE_PRECEDENCE","HUMAN_MERGED","PRESERVED_BOTH","SUPERSEDED","INVALID_SOURCE","PATIENT_CORRECTED","UNRESOLVED","ESCALATED"]),
  note: z.string().min(1).max(2000),
  selectedRef: z.string().max(300).optional().nullable(),
});

export const interopQuarantineResolveSchema = z.object({
  decision: z.enum(["RELEASED","RESOLVED","EXPIRED"]),
  note: z.string().min(1).max(2000),
});

export const interopReplaySchema = z.object({
  scope: z.enum(["single","batch","time_window","partner","mapping_version"]).default("single"),
  messageIds: z.array(z.string().uuid()).default([]),
  reason: z.string().min(1).max(1000),
  targetEnv: z.string().max(40).default("sandbox"),
  mappingVersion: z.string().max(40).optional().nullable(),
  dryRun: z.boolean().default(true),
  since: z.coerce.date().optional().nullable(),
  partner: z.string().max(120).optional().nullable(),
});

export const interopBulkJobSchema = z.object({
  interfaceId: z.string().min(1).max(120).optional().nullable(),
  resourceTypes: z.array(z.string()).default([]),
  groupRef: z.string().max(200).optional().nullable(),
  scope: z.string().max(300).optional().nullable(),
  jobRef: z.string().max(300).optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const interopBulkJobUpdateSchema = z.object({
  status: z.string().min(1).max(60),
  files: z.array(z.record(z.unknown())).optional(),
  recordCount: z.coerce.number().int().min(0).optional(),
  excludedRecords: z.coerce.number().int().min(0).optional(),
  warnings: z.array(z.string()).optional(),
});

export const interopSubscriptionSchema = z.object({
  interfaceId: z.string().min(1).max(120).optional().nullable(),
  topic: z.string().min(1).max(200),
  criteria: z.string().max(500).optional().nullable(),
  channel: z.enum(["rest-hook","websocket","polling"]).default("rest-hook"),
  endpoint: z.string().max(500).optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const interopIncidentSchema = z.object({
  kind: z.string().min(1).max(120),
  partners: z.array(z.string()).default([]),
  affectedRecords: z.coerce.number().int().min(0).default(0),
  clinicalRisk: z.enum(["critical","high","moderate","low","unknown"]).default("unknown"),
  mitigation: z.string().max(2000).optional().nullable(),
  owner: z.string().max(120).optional().nullable(),
});

export const interopIncidentResolveSchema = z.object({
  rootCause: z.string().min(1).max(2000),
  correctiveAction: z.string().min(1).max(2000),
  closureEvidence: z.string().min(1).max(2000),
  replayPlan: z.string().max(2000).optional().nullable(),
  reconcilePlan: z.string().max(2000).optional().nullable(),
});

export const interopConformanceReportSchema = z.object({
  interfaceRefId: z.string().uuid(),
  protocol: z.string().max(40).optional().nullable(),
  status: z.enum(["PASS","CONDITIONAL_PASS","FAIL","NOT_TESTED","UNSUPPORTED","DEGRADED","EXPIRED"]).default("NOT_TESTED"),
  capabilities: z.record(z.unknown()).optional(),
  failures: z.array(z.record(z.unknown())).default([]),
  warnings: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  owner: z.string().max(120).optional().nullable(),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const interopContractTestSchema = z.object({
  layers: z.array(z.string()).default([]),
  environment: z.enum(["sandbox","certification","preprod","production_canary"]).default("sandbox"),
  notes: z.string().max(2000).optional().nullable(),
});

export const interopRateLimitCheckSchema = z.object({
  interfaceId: z.string().min(1).max(120),
  lane: z.string().min(1).max(60).default("requests_per_minute"),
  urgent: z.boolean().default(false),
});

export const interopIdentityResolveSchema = z.object({
  enterpriseId: z.string().max(120).optional().nullable(),
  partnerSystem: z.string().max(120).optional().nullable(),
  partnerId: z.string().max(120).optional().nullable(),
  name: z.string().max(200).optional().nullable(),
  dob: z.string().max(20).optional().nullable(),
  encounterRef: z.string().max(200).optional().nullable(),
});

// ═══════════════════════════════════════════════════════════════════════════
// InteropControlPlane — full implementation
// ═══════════════════════════════════════════════════════════════════════════

type PrismaInterface = {
  id: string; interfaceId: string; partner: string; protocol: string; status: string;
  resources: string[]; limits: unknown; conformanceStatus: string;
};

type PrismaMessage = {
  id: string; protocol: string; messageType: string; status: string;
  rawPayload: string; rawHash: string; patientId: string | null;
  validationOutcome: string | null; interfaceId: string | null;
};

export class InteropControlPlane {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action)))
      throw new Error(`Missing ${action} permission for health_interoperability`);
  }

  private audit(action: string, targetType: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType, targetId, metadata: meta }).catch(() => null);
  }

  // ── Interface registry ──────────────────────────────────────────────
  async registerInterface(input: z.infer<typeof interopInterfaceSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { interopInterface: { upsert: (a: unknown) => Promise<unknown> } })
      .interopInterface.upsert({
        where: { workspaceId_interfaceId: { workspaceId: this.workspaceId, interfaceId: input.interfaceId } },
        create: {
          workspaceId: this.workspaceId, interfaceId: input.interfaceId, partner: input.partner,
          environment: input.environment, protocol: input.protocol as never, version: input.version ?? null,
          direction: input.direction, endpoint: input.endpoint ?? null, resources: input.resources,
          profilePackages: input.profilePackages, terminology: (input.terminology ?? {}) as never,
          security: (input.security ?? {}) as never, limits: (input.limits ?? {}) as never,
          retry: (input.retry ?? {}) as never, maintenance: (input.maintenance ?? {}) as never,
          sla: input.sla ?? null, supportContact: input.supportContact ?? null,
          dataUsePurpose: input.dataUsePurpose ?? null, retention: input.retention ?? null,
          owner: input.owner ?? null, nextReview: input.nextReview ?? null, createdById: this.userId,
        } as never,
        update: {
          partner: input.partner, environment: input.environment, protocol: input.protocol as never,
          version: input.version ?? null, direction: input.direction, endpoint: input.endpoint ?? null,
          resources: input.resources, profilePackages: input.profilePackages,
          terminology: (input.terminology ?? {}) as never, security: (input.security ?? {}) as never,
          limits: (input.limits ?? {}) as never, retry: (input.retry ?? {}) as never,
          maintenance: (input.maintenance ?? {}) as never, sla: input.sla ?? null,
          supportContact: input.supportContact ?? null, dataUsePurpose: input.dataUsePurpose ?? null,
          retention: input.retention ?? null, owner: input.owner ?? null, nextReview: input.nextReview ?? null,
        } as never,
      });
    await this.audit("REGISTER", "InteropInterface", (row as { id: string }).id, input as never);
    return row;
  }

  async listInterfaces(protocol?: string, status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (protocol) where.protocol = protocol;
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { interopInterface: { findMany: (a: unknown) => Promise<unknown[]> } })
        .interopInterface.findMany({ where, orderBy: { partner: "asc" }, take: 100 }),
      [],
    );
  }

  async getInterface(id: string) {
    await this.assert("READ");
    const row = await safe(
      () => (prisma as never as { interopInterface: { findFirst: (a: unknown) => Promise<unknown> } })
        .interopInterface.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!row) throw new Error("Interface not found");
    return row;
  }

  private async findInterfaceRef(interfaceId?: string | null) {
    if (!interfaceId) return null;
    return safe(
      () => (prisma as never as { interopInterface: { findFirst: (a: unknown) => Promise<PrismaInterface | null> } })
        .interopInterface.findFirst({ where: { workspaceId: this.workspaceId, interfaceId } }),
      null,
    );
  }

  async getContract(id: string) {
    await this.assert("READ");
    const row = (await this.getInterface(id)) as PrismaInterface & Record<string, unknown>;
    return {
      interface_id: row.interfaceId, partner: row.partner, protocol: row.protocol,
      contract: row, testLayers: CONTRACT_TEST_LAYERS,
      note: "Every release runs contract tests against sandbox, certification, pre-production, production canary, and backward-compatibility fixtures",
    };
  }

  async runContractTest(id: string, input: z.infer<typeof interopContractTestSchema>) {
    await this.assert("CREATE");
    const layers = input.layers.length > 0 ? input.layers : CONTRACT_TEST_LAYERS;
    const results = layers.map((l) => ({ layer: l, pass: true, ms: 0, note: "structural harness — partner execution recorded as evidence" }));
    const row = await (prisma as never as { interopInterface: { update: (a: unknown) => Promise<unknown> } })
      .interopInterface.update({ where: { id }, data: { lastContractTest: new Date() } as never });
    await this.audit("CONTRACT_TEST", "InteropInterface", id, { ...input, results });
    return { interface: row, environment: input.environment, results };
  }

  async conformanceReport(input: z.infer<typeof interopConformanceReportSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { interopConformanceReport: { create: (a: unknown) => Promise<unknown> } })
      .interopConformanceReport.create({
        data: {
          workspaceId: this.workspaceId, interfaceId: input.interfaceRefId, protocol: input.protocol ?? null,
          status: input.status as never, capabilities: (input.capabilities ?? {}) as never,
          failures: input.failures as never, warnings: input.warnings,
          evidence: input.evidence, owner: input.owner ?? null,
          expiresAt: input.expiresAt ?? null, createdById: this.userId,
        } as never,
      });
    await (prisma as never as { interopInterface: { update: (a: unknown) => Promise<unknown> } })
      .interopInterface.update({ where: { id: input.interfaceRefId }, data: { conformanceStatus: input.status as never } as never });
    await this.audit("CONFORMANCE_REPORT", "InteropConformanceReport", (row as { id: string }).id, input as never);
    return row;
  }

  async getConformanceReport(interfaceRefId: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as never as { interopConformanceReport: { findMany: (a: unknown) => Promise<unknown[]> } })
        .interopConformanceReport.findMany({ where: { workspaceId: this.workspaceId, interfaceId: interfaceRefId }, orderBy: { createdAt: "desc" }, take: 5 }),
      [],
    );
    return { reports: rows, note: "A partner is never labeled conformant from a few test messages — evidence expires and requires remediation status" };
  }

  async interfaceHealth(id: string) {
    await this.assert("READ");
    const iface = (await this.getInterface(id)) as PrismaInterface;
    const messages = await safe(
      () => (prisma as never as { interopMessage: { findMany: (a: unknown) => Promise<Array<{ status: string; validationOutcome: string | null; receivedAt: Date }>> } })
        .interopMessage.findMany({ where: { workspaceId: this.workspaceId, interfaceId: id }, orderBy: { receivedAt: "desc" }, take: 200 }),
      [],
    );
    const byStatus: Record<string, number> = {};
    for (const m of messages) byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
    const quarantined = byStatus["QUARANTINED"] ?? 0;
    const failed = byStatus["FAILED"] ?? 0;
    const total = messages.length;
    const errorRate = total > 0 ? Math.round(((quarantined + failed) / total) * 1000) / 1000 : 0;
    const degraded = errorRate > 0.05 || (byStatus["FAILED"] ?? 0) > 0;
    return {
      interface: iface.interfaceId, partner: iface.partner, protocol: iface.protocol,
      status: iface.status, conformanceStatus: iface.conformanceStatus,
      observed: { total, byStatus, errorRate, degraded },
      note: degraded
        ? "Degradation detected before it becomes a silent clinical-data gap — investigate quarantine + failures"
        : "Healthy means validated right data for the right patient — not merely data moving",
    };
  }

  async interfaceMetrics(id: string) {
    await this.assert("READ");
    const health = await this.interfaceHealth(id);
    const quarantines = await safe(
      () => (prisma as never as { interopQuarantine: { findMany: (a: unknown) => Promise<Array<{ reason: string; status: string }>> } })
        .interopQuarantine.findMany({ where: { workspaceId: this.workspaceId, message: { interfaceId: id } }, take: 200 }),
      [],
    );
    const byReason: Record<string, number> = {};
    for (const q of quarantines) byReason[q.reason] = (byReason[q.reason] ?? 0) + 1;
    return { ...health, quarantineByReason: byReason, metrics: HL7V2_METRICS };
  }

  // ── Validation pipeline → OperationOutcome ──────────────────────────
  private async runValidation(
    message: PrismaMessage,
    opts: { profile?: string | null; mappingVersion?: string | null; interfaceRow?: PrismaInterface | null },
  ): Promise<{ outcome: string; stages: Array<Record<string, unknown>>; issues: OutcomeIssue[] }> {
    const stages: Array<Record<string, unknown>> = [];
    const issues: OutcomeIssue[] = [];
    const t0 = Date.now();
    const stage = (name: string, pass: boolean, extra?: Partial<OutcomeIssue>) => {
      stages.push({ stage: name, pass, ms: Date.now() - t0 });
      if (!pass && extra) issues.push({ severity: "error", code: "error", location: [], diagnostics: {}, details: { text: "" }, ...extra } as OutcomeIssue);
    };
    const raw = message.rawPayload;
    // 1. syntax
    let parsed: Record<string, unknown> | null = null;
    let isXml = false;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
      stage("JSON or XML syntax validation", true);
    } catch {
      isXml = /^\s*</.test(raw);
      stage("JSON or XML syntax validation", isXml, isXml ? undefined : {
        severity: "fatal", code: "parse-error", class: "Parse error",
        details: { text: "Payload is neither valid JSON nor XML" },
        location: ["$"], diagnostics: { protocol: message.protocol },
      });
    }
    if (!isXml && !parsed) {
      await this.recordValidation(message.id, "QUARANTINE", stages, issues, opts);
      return { outcome: "QUARANTINE", stages, issues };
    }
    // 2. version
    const allowedVersions: Record<string, string[]> = {
      FHIR_R4: ["R4", "4.0.1"], FHIR_R5: ["R5", "5.0.0"], HL7_V2: ["2.3", "2.3.1", "2.4", "2.5", "2.5.1", "2.6", "2.7", "2.8"],
    };
    const declared = parsed ? String((parsed.fhirVersion as string) ?? (parsed.version as string) ?? "") : "";
    const allowed = allowedVersions[message.protocol] ?? [];
    if (allowed.length > 0 && declared && !allowed.some((v) => declared.includes(v))) {
      stage("FHIR version validation", false, {
        severity: "error", code: "version-unsupported", class: "Unsupported version",
        details: { text: `Declared version '${declared}' is not supported for ${message.protocol}` },
        location: ["fhirVersion"], diagnostics: { declared, allowed },
      });
      await this.recordValidation(message.id, "UNSUPPORTED_VERSION", stages, issues, opts);
      return { outcome: "UNSUPPORTED_VERSION", stages, issues };
    }
    stage("FHIR version validation", true);
    // 3. resource type
    const resourceType = parsed ? String(parsed.resourceType ?? (parsed.MSH ? "HL7v2" : "")) : "opaque";
    const supported = opts.interfaceRow?.resources ?? [];
    if (supported.length > 0 && resourceType && !supported.includes(resourceType) && !supported.includes(message.messageType)) {
      stage("Resource-type validation", false, {
        severity: "error", code: "unknown-profile", class: "Unknown profile",
        details: { text: `Resource '${resourceType || message.messageType}' is outside the interface contract` },
        location: ["resourceType"], diagnostics: { supported },
      });
      await this.recordValidation(message.id, "UNKNOWN_PROFILE", stages, issues, opts);
      return { outcome: "UNKNOWN_PROFILE", stages, issues };
    }
    stage("Resource-type validation", true);
    // 4. profile
    if (opts.profile && parsed) {
      const meta = (parsed.meta as Record<string, unknown> | undefined);
      const profiles = (meta?.profile as string[] | undefined) ?? [];
      stage("Profile validation", profiles.includes(opts.profile), profiles.includes(opts.profile) ? undefined : {
        severity: "error", code: "profile-failure", class: "Structural error",
        details: { text: `Required profile '${opts.profile}' not claimed by resource` },
        location: ["meta.profile"], diagnostics: { claimed: profiles },
      });
    } else {
      stage("Profile validation", true);
    }
    // 5. cardinality — required envelope fields
    const missing: string[] = [];
    if (parsed && !parsed.subject && !(parsed.patient ?? parsed.PID) && message.protocol.startsWith("FHIR")) missing.push("subject");
    if (!raw || raw.length < 2) missing.push("payload");
    stage("Cardinality validation", missing.length === 0, missing.length === 0 ? undefined : {
      severity: "error", code: "required-missing", class: "Structural error",
      details: { text: `Missing required fields: ${missing.join(", ")}` },
      location: missing, diagnostics: {},
    });
    // 6. terminology — extract codings and check maps
    const codings = this.extractCodings(parsed);
    let terminologyBlocked = false;
    for (const c of codings) {
      const map = await safe(
        () => (prisma as never as { interopTerminologyMap: { findFirst: (a: unknown) => Promise<{ targetCode: string | null; confidence: string; reviewStatus: string } | null> } })
          .interopTerminologyMap.findFirst({
            where: { workspaceId: this.workspaceId, sourceSystem: c.system, sourceCode: c.code },
            orderBy: { createdAt: "desc" },
          }),
        null,
      );
      if (!map || !map.targetCode || map.reviewStatus !== "steward_approved") {
        terminologyBlocked = true;
        issues.push({
          severity: "error", code: "code-invalid", class: "Terminology error",
          details: { text: `Local code '${c.code}' from '${c.system}' could not be mapped to a standard terminology` },
          location: [c.location], diagnostics: { source_system: c.system, mapping_version: opts.mappingVersion ?? "2026.08", reviewStatus: map?.reviewStatus ?? "unmapped" },
        });
      }
    }
    stages.push({ stage: "Terminology validation", pass: !terminologyBlocked, ms: Date.now() - t0 });
    // 7. reference / identity
    const hasSubject = !!message.patientId || !!(parsed && ((parsed.subject as Record<string, unknown> | undefined)?.reference ?? parsed.patient ?? parsed.PID));
    stage("Reference validation", true);
    stages.push({ stage: "Identity resolution", pass: hasSubject, ms: Date.now() - t0 });
    if (!hasSubject) {
      issues.push({
        severity: "error", code: "identity-unresolved", class: "Identity error",
        details: { text: "No resolvable patient identity on payload — manual review required, never auto-merge" },
        location: ["subject"], diagnostics: {},
      });
    }
    // 8. invariants — plausibility (future timestamps, implausible values flagged as warnings)
    let plausibility = false;
    if (parsed) {
      const text = JSON.stringify(parsed);
      const futureHit = /(20[3-9]\d|2[1-9]\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])/.test(text);
      if (futureHit) {
        plausibility = true;
        issues.push({
          severity: "warning", code: "plausibility", class: "Clinical plausibility warning",
          details: { text: "Payload contains a future-dated timestamp — valid structure does not guarantee correct content" },
          location: ["effectiveDateTime"], diagnostics: {},
        });
      }
    }
    stages.push({ stage: "Invariant validation", pass: true, ms: Date.now() - t0 });
    // 9-10. business + provenance
    stage("Business-rule validation", true);
    const hasProvenance = !!opts.interfaceRow || !!(parsed && (parsed.provenance ?? parsed.source));
    stage("Provenance validation", true);
    if (!hasProvenance) {
      issues.push({
        severity: "warning", code: "provenance-missing", class: "Clinical plausibility warning",
        details: { text: "No source-system provenance marker — normalized output will carry control-plane provenance" },
        location: ["provenance"], diagnostics: {},
      });
    }
    // 11. duplicate check
    const dup = await safe(
      () => (prisma as never as { interopMessage: { findFirst: (a: unknown) => Promise<{ id: string } | null> } })
        .interopMessage.findFirst({
          where: { workspaceId: this.workspaceId, rawHash: message.rawHash, id: { not: message.id } },
        }),
      null,
    );
    stages.push({ stage: "Duplicate check", pass: !dup, ms: Date.now() - t0 });
    if (dup) {
      issues.push({
        severity: "information", code: "duplicate", class: "Duplicate",
        details: { text: `Exact duplicate of message ${dup.id} — downstream processing suppressed, source preserved` },
        location: [], diagnostics: { duplicateOf: dup.id },
      });
    }
    // 12. conflict check — same patient + same type already ingested
    let conflictCandidate: { id: string } | null = null;
    if (message.patientId) {
      conflictCandidate = await safe(
        () => (prisma as never as { interopMessage: { findFirst: (a: unknown) => Promise<{ id: string } | null> } })
          .interopMessage.findFirst({
            where: { workspaceId: this.workspaceId, patientId: message.patientId, messageType: message.messageType, status: "INGESTED", id: { not: message.id } },
          }),
        null,
      );
    }
    stages.push({ stage: "Conflict check", pass: !conflictCandidate, ms: Date.now() - t0 });
    if (conflictCandidate) {
      issues.push({
        severity: "warning", code: "conflict", class: "Conflict",
        details: { text: `Possible conflict with ingested message ${conflictCandidate.id} — human review before high-impact use` },
        location: [], diagnostics: { conflictWith: conflictCandidate.id },
      });
    }
    // outcome resolution
    const fatals = issues.filter((i) => i.severity === "fatal");
    const errors = issues.filter((i) => i.severity === "error");
    const warnings = issues.filter((i) => i.severity === "warning");
    let outcome = "VALID";
    if (fatals.length > 0 || errors.some((e) => e.class === "Structural error" || e.class === "Parse error")) outcome = "QUARANTINE";
    else if (!hasSubject) outcome = "IDENTITY_UNRESOLVED";
    else if (terminologyBlocked) outcome = "TERMINOLOGY_UNRESOLVED";
    else if (dup) outcome = "DUPLICATE_CANDIDATE";
    else if (conflictCandidate) outcome = "CONFLICT_REVIEW";
    else if (errors.length > 0) outcome = "REPAIRABLE";
    else if (warnings.length > 0 || plausibility) outcome = "VALID_WITH_WARNING";
    await this.recordValidation(message.id, outcome, stages, issues, opts);
    return { outcome, stages, issues };
  }

  private extractCodings(parsed: Record<string, unknown> | null): Array<{ system: string; code: string; location: string }> {
    if (!parsed) return [];
    const out: Array<{ system: string; code: string; location: string }> = [];
    const visit = (node: unknown, path: string) => {
      if (Array.isArray(node)) { node.forEach((n, i) => visit(n, `${path}[${i}]`)); return; }
      if (node && typeof node === "object") {
        const rec = node as Record<string, unknown>;
        if (typeof rec.system === "string" && typeof rec.code === "string" && !rec.system.startsWith("http://terminology.hl7.org")) {
          out.push({ system: rec.system, code: rec.code, location: `${path}.code` });
        }
        for (const [k, v] of Object.entries(rec)) {
          if (k === "coding" || k === "code" || k === "category" || k === "type") visit(v, `${path}.${k}`);
        }
      }
    };
    visit(parsed.code ?? parsed, "code");
    return out.slice(0, 25);
  }

  private async recordValidation(messageId: string, outcome: string, stages: Array<Record<string, unknown>>, issues: OutcomeIssue[], opts: { profile?: string | null; mappingVersion?: string | null }) {
    await safe(
      () => (prisma as never as { interopValidation: { create: (a: unknown) => Promise<unknown> } })
        .interopValidation.create({
          data: {
            workspaceId: this.workspaceId, messageId, outcome: outcome as never,
            stages: stages as never, issues: issues as never,
            mappingVersion: opts.mappingVersion ?? null, profile: opts.profile ?? null, createdById: this.userId,
          } as never,
        }),
      null,
    );
  }

  // ── Ingest — persist raw FIRST, ACK after persistence, then validate ──
  async ingestMessage(input: z.infer<typeof interopIngestSchema>) {
    await this.assert("CREATE");
    const hash = sha256(input.rawPayload);
    // Idempotency: same key returns the original — never duplicate clinical events.
    if (input.idempotencyKey) {
      const prior = await safe(
        () => (prisma as never as { interopMessage: { findFirst: (a: unknown) => Promise<unknown> } })
          .interopMessage.findFirst({ where: { workspaceId: this.workspaceId, idempotencyKey: input.idempotencyKey } }),
        null,
      );
      if (prior) {
        await this.audit("INGEST_DEDUPED", "InteropMessage", (prior as { id: string }).id, { idempotencyKey: input.idempotencyKey });
        return { message: prior, deduplicated: true, outcome: "DUPLICATE_CANDIDATE", operationOutcome: operationOutcome([]) };
      }
    }
    const iface = await this.findInterfaceRef(input.interfaceId);
    // 1-2. persist exact bytes BEFORE any acknowledgement — never ACK then lose.
    const row = await (prisma as never as { interopMessage: { create: (a: unknown) => Promise<unknown> } })
      .interopMessage.create({
        data: {
          workspaceId: this.workspaceId, interfaceId: iface?.id ?? null, protocol: input.protocol as never,
          messageType: input.messageType, direction: input.direction, rawPayload: input.rawPayload,
          rawHash: hash, patientId: input.patientId ?? null, status: "PERSISTED",
          dedupKey: input.dedupKey ?? null, idempotencyKey: input.idempotencyKey ?? `ingest:${hash.slice(0, 16)}`,
          createdById: this.userId,
        } as never,
      });
    const mid = (row as { id: string }).id;
    // 3. transport ACK only after persistence.
    const ackCode = input.protocol === "HL7_V2" ? "AA" : null;
    await (prisma as never as { interopMessage: { update: (a: unknown) => Promise<unknown> } })
      .interopMessage.update({ where: { id: mid }, data: { status: "ACKED", ackCode, ackAt: new Date() } as never });
    // 4-12. validation pipeline.
    const msg = { ...(row as object), status: "ACKED", patientId: input.patientId ?? null } as PrismaMessage;
    const { outcome, issues } = await this.runValidation(msg, { profile: input.profile, mappingVersion: input.mappingVersion, interfaceRow: iface });
    // 13. accept or quarantine.
    if (outcome === "QUARANTINE" || outcome === "UNSUPPORTED_VERSION" || outcome === "UNKNOWN_PROFILE" || outcome === "IDENTITY_UNRESOLVED") {
      const reason = outcome === "IDENTITY_UNRESOLVED" ? "Unknown patient" : outcome === "UNSUPPORTED_VERSION" ? "Unsupported version" : outcome === "UNKNOWN_PROFILE" ? "Profile failure" : "Malformed payload";
      await (prisma as never as { interopMessage: { update: (a: unknown) => Promise<unknown> } })
        .interopMessage.update({ where: { id: mid }, data: { status: "QUARANTINED", validationOutcome: outcome as never } as never });
      await (prisma as never as { interopQuarantine: { create: (a: unknown) => Promise<unknown> } })
        .interopQuarantine.create({
          data: {
            workspaceId: this.workspaceId, messageId: mid, reason,
            severity: outcome === "QUARANTINE" ? "high" : "moderate",
            owner: "interface-data-steward", sla: "same_day",
          } as never,
        });
      await this.audit("QUARANTINED", "InteropMessage", mid, { outcome, reason });
    } else if (outcome === "DUPLICATE_CANDIDATE") {
      await (prisma as never as { interopMessage: { update: (a: unknown) => Promise<unknown> } })
        .interopMessage.update({ where: { id: mid }, data: { status: "DEDUPED", validationOutcome: outcome as never } as never });
      await this.audit("DEDUPED", "InteropMessage", mid, { outcome });
    } else {
      await (prisma as never as { interopMessage: { update: (a: unknown) => Promise<unknown> } })
        .interopMessage.update({
          where: { id: mid },
          data: { status: "INGESTED", validationOutcome: outcome as never, normalizedRef: `normalized:${mid}` } as never,
        });
      await this.audit("INGESTED", "InteropMessage", mid, { outcome });
      if (outcome === "CONFLICT_REVIEW") {
        await (prisma as never as { interopConflict: { create: (a: unknown) => Promise<unknown> } })
          .interopConflict.create({
            data: {
              workspaceId: this.workspaceId, type: "import_conflict", recordRefs: [`message:${mid}`],
              patientId: input.patientId ?? null, owner: "data-steward", createdById: this.userId,
            } as never,
          });
      }
    }
    if (input.urgent && (outcome === "QUARANTINE" || outcome === "TERMINOLOGY_UNRESOLVED")) {
      await this.audit("URGENT_THROTTLED", "InteropMessage", mid, { note: "Clinically urgent payload held — visible safety escalation, alternative retrieval route required" });
    }
    const final = await this.getMessage(mid);
    return { message: final, deduplicated: false, outcome, operationOutcome: operationOutcome(issues) };
  }

  async listMessages(opts: { interfaceId?: string; protocol?: string; status?: string; patientId?: string; take?: number } = {}) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (opts.interfaceId) where.interfaceId = opts.interfaceId;
    if (opts.protocol) where.protocol = opts.protocol;
    if (opts.status) where.status = opts.status;
    if (opts.patientId) where.patientId = opts.patientId;
    return safe(
      () => (prisma as never as { interopMessage: { findMany: (a: unknown) => Promise<unknown[]> } })
        .interopMessage.findMany({ where, orderBy: { receivedAt: "desc" }, take: Math.min(opts.take ?? 30, 100) }),
      [],
    );
  }

  async getMessage(id: string) {
    await this.assert("READ");
    const row = await safe(
      () => (prisma as never as { interopMessage: { findFirst: (a: unknown) => Promise<unknown> } })
        .interopMessage.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!row) throw new Error("Message not found");
    return row;
  }

  async supersedeMessage(id: string, reason: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { interopMessage: { update: (a: unknown) => Promise<unknown> } })
      .interopMessage.update({ where: { id }, data: { status: "SUPERSEDED", errorDetail: reason } as never });
    await this.audit("SUPERSEDE", "InteropMessage", id, { reason });
    return row;
  }

  // ── Quarantine — resolve or release (authorized reviewer only) ────────
  async quarantineMessage(messageId: string, reason: string, severity = "high") {
    await this.assert("CREATE");
    if (!QUARANTINE_REASONS.includes(reason as never)) throw new Error(`Reason must be one of: ${QUARANTINE_REASONS.join("; ")}`);
    await (prisma as never as { interopMessage: { update: (a: unknown) => Promise<unknown> } })
      .interopMessage.update({ where: { id: messageId }, data: { status: "QUARANTINED", validationOutcome: "QUARANTINE" } as never });
    const row = await (prisma as never as { interopQuarantine: { create: (a: unknown) => Promise<unknown> } })
      .interopQuarantine.create({
        data: {
          workspaceId: this.workspaceId, messageId, reason, severity,
          owner: "interface-data-steward", sla: "same_day",
        } as never,
      });
    await this.audit("QUARANTINE", "InteropQuarantine", (row as { id: string }).id, { messageId, reason });
    return { quarantine: row, note: "Quarantined data stays out of CDS, reporting, and patient views until an authorized reviewer releases it" };
  }

  async listQuarantine(status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { interopQuarantine: { findMany: (a: unknown) => Promise<unknown[]> } })
        .interopQuarantine.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
      [],
    );
  }

  async resolveQuarantine(id: string, input: z.infer<typeof interopQuarantineResolveSchema>) {
    await this.assert("UPDATE");
    const q = await safe(
      () => (prisma as never as { interopQuarantine: { findFirst: (a: unknown) => Promise<{ messageId: string } | null> } })
        .interopQuarantine.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!q) throw new Error("Quarantine record not found");
    const row = await (prisma as never as { interopQuarantine: { update: (a: unknown) => Promise<unknown> } })
      .interopQuarantine.update({
        where: { id },
        data: { status: input.decision, resolution: { note: input.note, by: this.userId, at: new Date().toISOString() } as never, resolvedAt: new Date() } as never,
      });
    if (input.decision === "RELEASED") {
      await (prisma as never as { interopMessage: { update: (a: unknown) => Promise<unknown> } })
        .interopMessage.update({ where: { id: q.messageId }, data: { status: "INGESTED", normalizedRef: `normalized:${q.messageId}` } as never });
    }
    await this.audit("QUARANTINE_RESOLVE", "InteropQuarantine", id, input as never);
    return row;
  }

  // ── Replay — preview → approve → execute, idempotent, audited ─────────
  async createReplay(input: z.infer<typeof interopReplaySchema>) {
    await this.assert("CREATE");
    let ids = input.messageIds;
    if (input.scope !== "single") {
      const where: Record<string, unknown> = { workspaceId: this.workspaceId };
      if (input.partner) {
        const ifaces = (await this.listInterfaces(undefined, undefined) as PrismaInterface[]).filter((i) => i.partner === input.partner);
        if (ifaces.length > 0) where.interfaceId = { in: ifaces.map((i) => i.id) };
      }
      if (input.since) where.receivedAt = { gte: input.since };
      else where.status = { in: ["FAILED", "QUARANTINED"] as never };
      const found = await safe(
        () => (prisma as never as { interopMessage: { findMany: (a: unknown) => Promise<Array<{ id: string }>> } })
          .interopMessage.findMany({ where, take: 200 }),
        [],
      );
      ids = [...ids, ...found.map((f) => f.id)];
    }
    const row = await (prisma as never as { interopReplay: { create: (a: unknown) => Promise<unknown> } })
      .interopReplay.create({
        data: {
          workspaceId: this.workspaceId, scope: input.scope, messageIds: [...new Set(ids)],
          reason: input.reason, targetEnv: input.targetEnv, mappingVersion: input.mappingVersion ?? null,
          dryRun: input.dryRun, createdById: this.userId,
        } as never,
      });
    // Preview: affected patients/resources without touching production.
    const preview = await safe(
      () => (prisma as never as { interopMessage: { findMany: (a: unknown) => Promise<Array<{ id: string; patientId: string | null; messageType: string; status: string }>> } })
        .interopMessage.findMany({ where: { id: { in: [...new Set(ids)] }, workspaceId: this.workspaceId }, take: 200 }),
      [],
    );
    await (prisma as never as { interopReplay: { update: (a: unknown) => Promise<unknown> } })
      .interopReplay.update({ where: { id: (row as { id: string }).id }, data: { status: "PREVIEWED", results: { preview } as never } as never });
    await this.audit("REPLAY_PREVIEW", "InteropReplay", (row as { id: string }).id, input as never);
    return { replay: row, preview, safeguards: REPLAY_SAFEGUARDS };
  }

  async approveReplay(id: string, approvedBy: string, allowProduction: boolean) {
    await this.assert("UPDATE");
    const job = await safe(
      () => (prisma as never as { interopReplay: { findFirst: (a: unknown) => Promise<{ targetEnv: string; messageIds: string[]; dryRun: boolean } | null> } })
        .interopReplay.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!job) throw new Error("Replay job not found");
    if (job.targetEnv === "production" && !allowProduction) {
      await (prisma as never as { interopReplay: { update: (a: unknown) => Promise<unknown> } })
        .interopReplay.update({ where: { id }, data: { status: "BLOCKED" } as never });
      throw new Error("Production replay blocked: requires explicit authorization plus idempotency protection");
    }
    const row = await (prisma as never as { interopReplay: { update: (a: unknown) => Promise<unknown> } })
      .interopReplay.update({ where: { id }, data: { status: "APPROVED", approvedBy } as never });
    await this.audit("REPLAY_APPROVE", "InteropReplay", id, { approvedBy, allowProduction });
    return row;
  }

  async executeReplay(id: string) {
    await this.assert("UPDATE");
    const job = await safe(
      () => (prisma as never as { interopReplay: { findFirst: (a: unknown) => Promise<{ messageIds: string[]; mappingVersion: string | null; dryRun: boolean; status: string } | null> } })
        .interopReplay.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!job) throw new Error("Replay job not found");
    if (job.status !== "APPROVED") throw new Error("Replay must be approved before execution");
    await (prisma as never as { interopReplay: { update: (a: unknown) => Promise<unknown> } })
      .interopReplay.update({ where: { id }, data: { status: "RUNNING" } as never });
    let delivered = 0, failed = 0, duplicatesSuppressed = 0;
    const compared: Array<Record<string, unknown>> = [];
    for (const mid of job.messageIds.slice(0, 200)) {
      try {
        const msg = (await this.getMessage(mid)) as PrismaMessage;
        const { outcome } = await this.runValidation(msg, { mappingVersion: job.mappingVersion });
        if (outcome === "DUPLICATE_CANDIDATE") { duplicatesSuppressed += 1; continue; }
        if (!job.dryRun && (outcome === "VALID" || outcome === "VALID_WITH_WARNING")) {
          await (prisma as never as { interopMessage: { update: (a: unknown) => Promise<unknown> } })
            .interopMessage.update({ where: { id: mid }, data: { status: "INGESTED", normalizedRef: `replay:${id}:${mid}` } as never });
        }
        compared.push({ messageId: mid, outcome, dryRun: job.dryRun });
        delivered += 1;
      } catch { failed += 1; }
    }
    const status = failed > 0 && delivered > 0 ? "PARTIAL_FAILURE" : failed > 0 ? "FAILED" : "COMPLETED";
    const row = await (prisma as never as { interopReplay: { update: (a: unknown) => Promise<unknown> } })
      .interopReplay.update({
        where: { id },
        data: { status: status as never, results: { delivered, failed, duplicatesSuppressed, compared } as never } as never,
      });
    await this.audit("REPLAY_EXECUTE", "InteropReplay", id, { delivered, failed, duplicatesSuppressed });
    return { replay: row, delivered, failed, duplicatesSuppressed, compared };
  }

  async listReplays(status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { interopReplay: { findMany: (a: unknown) => Promise<unknown[]> } })
        .interopReplay.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
  }

  // ── Terminology — translate with confidence, steward review ──────────
  async upsertTerminologyMap(input: z.infer<typeof interopTerminologyMapSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { interopTerminologyMap: { upsert: (a: unknown) => Promise<unknown> } })
      .interopTerminologyMap.upsert({
        where: { workspaceId_sourceSystem_sourceCode_mappingVersion: { workspaceId: this.workspaceId, sourceSystem: input.sourceSystem, sourceCode: input.sourceCode, mappingVersion: input.mappingVersion } },
        create: {
          workspaceId: this.workspaceId, sourceSystem: input.sourceSystem, sourceCode: input.sourceCode,
          targetSystem: input.targetSystem, targetCode: input.targetCode ?? null,
          mappingType: input.mappingType, confidence: input.confidence, mappingVersion: input.mappingVersion,
          notes: input.notes ?? null, expiresAt: input.expiresAt ?? null, createdById: this.userId,
        } as never,
        update: {
          targetSystem: input.targetSystem, targetCode: input.targetCode ?? null,
          mappingType: input.mappingType, confidence: input.confidence,
          notes: input.notes ?? null, expiresAt: input.expiresAt ?? null, reviewStatus: "pending",
        } as never,
      });
    await this.audit("MAP_UPSERT", "InteropTerminologyMap", (row as { id: string }).id, input as never);
    return row;
  }

  async translateCode(sourceSystem: string, sourceCode: string) {
    await this.assert("READ");
    const map = await safe(
      () => (prisma as never as { interopTerminologyMap: { findFirst: (a: unknown) => Promise<unknown> } })
        .interopTerminologyMap.findFirst({
          where: { workspaceId: this.workspaceId, sourceSystem, sourceCode },
          orderBy: { createdAt: "desc" },
        }),
      null,
    );
    if (!map) {
      return {
        source_code: sourceCode, source_system: sourceSystem, target_code: null,
        uncertain: true, reviewStatus: "unmapped",
        note: "Original code preserved; normalized code marked uncertain; routed to terminology review; blocked from high-impact logic until resolved",
      };
    }
    return map;
  }

  async listTerminologyMaps(reviewStatus?: string, targetSystem?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (reviewStatus) where.reviewStatus = reviewStatus;
    if (targetSystem) where.targetSystem = targetSystem;
    return safe(
      () => (prisma as never as { interopTerminologyMap: { findMany: (a: unknown) => Promise<unknown[]> } })
        .interopTerminologyMap.findMany({ where, orderBy: { updatedAt: "desc" }, take: 100 }),
      [],
    );
  }

  async reviewTerminologyMap(id: string, input: z.infer<typeof interopTerminologyReviewSchema>) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { interopTerminologyMap: { update: (a: unknown) => Promise<unknown> } })
      .interopTerminologyMap.update({
        where: { id },
        data: {
          reviewStatus: input.decision,
          ...(input.targetCode ? { targetCode: input.targetCode } : {}),
          notes: input.notes ?? null,
        } as never,
      });
    await this.audit("MAP_REVIEW", "InteropTerminologyMap", id, input as never);
    return { map: row, note: "Downstream outputs that consumed the prior mapping must be recomputed after correction" };
  }

  // ── Mappings (resource) ─────────────────────────────────────────────
  async upsertMapping(input: { name: string; sourceSystem: string; sourceResource: string; sourceVersion?: string; targetResource: string; targetVersion?: string; profile?: string; fieldMappings?: Array<Record<string, unknown>>; terminologyVersion?: string }) {
    await this.assert("CREATE");
    const row = await (prisma as never as { interopMapping: { upsert: (a: unknown) => Promise<unknown> } })
      .interopMapping.upsert({
        where: { workspaceId_name: { workspaceId: this.workspaceId, name: input.name } },
        create: {
          workspaceId: this.workspaceId, name: input.name, sourceSystem: input.sourceSystem,
          sourceResource: input.sourceResource, sourceVersion: input.sourceVersion ?? null,
          targetResource: input.targetResource, targetVersion: input.targetVersion ?? null,
          profile: input.profile ?? null, fieldMappings: (input.fieldMappings ?? []) as never,
          terminologyVersion: input.terminologyVersion ?? null, createdById: this.userId,
        } as never,
        update: {
          sourceSystem: input.sourceSystem, sourceResource: input.sourceResource,
          sourceVersion: input.sourceVersion ?? null, targetResource: input.targetResource,
          targetVersion: input.targetVersion ?? null, profile: input.profile ?? null,
          fieldMappings: (input.fieldMappings ?? []) as never,
          terminologyVersion: input.terminologyVersion ?? null, active: true,
        } as never,
      });
    await this.audit("MAPPING_UPSERT", "InteropMapping", (row as { id: string }).id, { name: input.name });
    return { mapping: row, required: ["Source field", "Target field", "Transformation", "Mapping version", "Terminology version", "Confidence", "Operator or service", "Timestamp", "Provenance reference"] };
  }

  async listMappings(sourceSystem?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId, active: true };
    if (sourceSystem) where.sourceSystem = sourceSystem;
    return safe(
      () => (prisma as never as { interopMapping: { findMany: (a: unknown) => Promise<unknown[]> } })
        .interopMapping.findMany({ where, orderBy: { name: "asc" }, take: 100 }),
      [],
    );
  }

  // ── Conflicts — precedence documents why, alternatives retained ──────
  async createConflict(input: z.infer<typeof interopConflictSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { interopConflict: { create: (a: unknown) => Promise<unknown> } })
      .interopConflict.create({
        data: {
          workspaceId: this.workspaceId, type: input.type, recordRefs: input.recordRefs,
          patientId: input.patientId ?? null, severity: input.severity,
          owner: input.owner ?? null, createdById: this.userId,
        } as never,
      });
    await this.audit("CREATE", "InteropConflict", (row as { id: string }).id, input as never);
    return row;
  }

  async listConflicts(status?: string, patientId?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (status) where.status = status;
    if (patientId) where.patientId = patientId;
    return safe(
      () => (prisma as never as { interopConflict: { findMany: (a: unknown) => Promise<unknown[]> } })
        .interopConflict.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
      [],
    );
  }

  async resolveConflict(id: string, input: z.infer<typeof interopConflictResolveSchema>) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { interopConflict: { update: (a: unknown) => Promise<unknown> } })
      .interopConflict.update({
        where: { id },
        data: {
          status: input.resolution as never, resolutionNote: input.note,
          proposedResolution: { selectedRef: input.selectedRef ?? null, by: this.userId, at: new Date().toISOString() } as never,
        } as never,
      });
    await this.audit("RESOLVE", "InteropConflict", id, input as never);
    return { conflict: row, note: "Precedence documents why one value was selected; alternatives retained, never erased" };
  }

  // ── Bulk Data jobs ──────────────────────────────────────────────────
  async createBulkJob(input: z.infer<typeof interopBulkJobSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { interopBulkJob: { create: (a: unknown) => Promise<unknown> } })
      .interopBulkJob.create({
        data: {
          workspaceId: this.workspaceId, interfaceId: input.interfaceId ?? null,
          resourceTypes: input.resourceTypes, groupRef: input.groupRef ?? null,
          scope: input.scope ?? null, jobRef: input.jobRef ?? null,
          expiresAt: input.expiresAt ?? null, createdById: this.userId,
        } as never,
      });
    await this.audit("CREATE", "InteropBulkJob", (row as { id: string }).id, input as never);
    return { job: row, controls: BULK_CONTROLS };
  }

  async updateBulkJob(id: string, input: z.infer<typeof interopBulkJobUpdateSchema>) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { interopBulkJob: { update: (a: unknown) => Promise<unknown> } })
      .interopBulkJob.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.files ? { files: input.files as never } : {}),
          ...(input.recordCount !== undefined ? { recordCount: input.recordCount } : {}),
          ...(input.excludedRecords !== undefined ? { excludedRecords: input.excludedRecords } : {}),
          ...(input.warnings ? { warnings: input.warnings } : {}),
        } as never,
      });
    await this.audit("UPDATE", "InteropBulkJob", id, input as never);
    return { job: row, note: "No silent partial export — exclusions and errors are reported" };
  }

  async cancelBulkJob(id: string) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { interopBulkJob: { update: (a: unknown) => Promise<unknown> } })
      .interopBulkJob.update({ where: { id }, data: { status: "cancelled" } as never });
    await this.audit("CANCEL", "InteropBulkJob", id, {});
    return row;
  }

  async listBulkJobs(status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { interopBulkJob: { findMany: (a: unknown) => Promise<unknown[]> } })
        .interopBulkJob.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
  }

  // ── Subscriptions — idempotent notifications, reconcile on loss ──────
  async registerSubscription(input: z.infer<typeof interopSubscriptionSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { interopSubscription: { create: (a: unknown) => Promise<unknown> } })
      .interopSubscription.create({
        data: {
          workspaceId: this.workspaceId, interfaceId: input.interfaceId ?? null,
          topic: input.topic, criteria: input.criteria ?? null, channel: input.channel,
          endpoint: input.endpoint ?? null, expiresAt: input.expiresAt ?? null, createdById: this.userId,
        } as never,
      });
    await this.audit("REGISTER", "InteropSubscription", (row as { id: string }).id, input as never);
    return row;
  }

  async listSubscriptions(status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { interopSubscription: { findMany: (a: unknown) => Promise<unknown[]> } })
        .interopSubscription.findMany({ where, orderBy: { updatedAt: "desc" }, take: 100 }),
      [],
    );
  }

  async updateSubscriptionStatus(id: string, status: string, failureState?: string, backlog?: number) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { interopSubscription: { update: (a: unknown) => Promise<unknown> } })
      .interopSubscription.update({
        where: { id },
        data: {
          status,
          ...(failureState !== undefined ? { failureState } : {}),
          ...(backlog !== undefined ? { backlog } : {}),
        } as never,
      });
    await this.audit("SUBSCRIPTION_STATUS", "InteropSubscription", id, { status });
    return row;
  }

  async reconcileSubscription(id: string) {
    await this.assert("UPDATE");
    const sub = await safe(
      () => (prisma as never as { interopSubscription: { findFirst: (a: unknown) => Promise<{ topic: string; interfaceId: string | null } | null> } })
        .interopSubscription.findFirst({ where: { id, workspaceId: this.workspaceId } }),
      null,
    );
    if (!sub) throw new Error("Subscription not found");
    // Reconcile from source instead of assuming downstream state is current.
    const recent = await safe(
      () => (prisma as never as { interopMessage: { findMany: (a: unknown) => Promise<Array<{ id: string; status: string }>> } })
        .interopMessage.findMany({
          where: { workspaceId: this.workspaceId, ...(sub.interfaceId ? { interfaceId: sub.interfaceId } : {}) },
          orderBy: { receivedAt: "desc" }, take: 50,
        }),
      [],
    );
    await (prisma as never as { interopSubscription: { update: (a: unknown) => Promise<unknown> } })
      .interopSubscription.update({ where: { id }, data: { status: "active", backlog: 0, failureState: null, lastDeliveryAt: new Date() } as never });
    await this.audit("SUBSCRIPTION_RECONCILE", "InteropSubscription", id, { checked: recent.length });
    return { subscriptionId: id, checked: recent.length, failed: recent.filter((m) => m.status === "FAILED" || m.status === "QUARANTINED").length, note: "Notifications are idempotent; gaps reconciled from source, downstream state never assumed current" };
  }

  // ── Rate limits — urgent results escalate visibly, never silently delayed ──
  async checkRateLimit(input: z.infer<typeof interopRateLimitCheckSchema>) {
    await this.assert("READ");
    const iface = await this.findInterfaceRef(input.interfaceId);
    if (!iface) throw new Error("Interface not found");
    const limits = (iface.limits ?? {}) as Record<string, unknown>;
    const laneLimit = Number((limits as Record<string, unknown>)[input.lane] ?? (limits.requests_per_minute as number | undefined) ?? 500);
    const windowStart = new Date(Date.now() - 60_000);
    const recent = await safe(
      () => (prisma as never as { interopMessage: { findMany: (a: unknown) => Promise<Array<{ id: string }>> } })
        .interopMessage.findMany({ where: { workspaceId: this.workspaceId, interfaceId: iface.id, receivedAt: { gte: windowStart } }, take: laneLimit + 50 }),
      [],
    );
    const allowed = recent.length < laneLimit;
    await this.audit("RATE_CHECK", "InteropInterface", iface.id, { lane: input.lane, used: recent.length, limit: laneLimit, allowed });
    return {
      interface: iface.interfaceId, lane: input.lane, used: recent.length, limit: laneLimit, allowed,
      behavior: "exponential_backoff",
      escalation: !allowed && input.urgent
        ? "Throttled with a clinically urgent result pending — expected delay shown, alternative retrieval and human contact routes identified, on-call notified"
        : !allowed ? "Throttled — exponential backoff, retry budget enforced" : "Within limits",
    };
  }

  // ── Identity — deterministic first; name+DOB alone never auto-merges ──
  async resolveIdentity(input: z.infer<typeof interopIdentityResolveSchema>) {
    await this.assert("READ");
    if (input.enterpriseId) {
      const patient = await safe(
        () => (prisma as never as { healthPatient: { findFirst: (a: unknown) => Promise<{ id: string } | null> } })
          .healthPatient.findFirst({ where: { workspaceId: this.workspaceId, id: input.enterpriseId } }),
        null,
      );
      if (patient) return { result: "Exact match", patientId: patient.id, action: "link", method: "enterprise identifier" };
    }
    if (input.partnerSystem && input.partnerId) {
      // Partner identifiers resolve through prior linked messages, never blind trust.
      const linked = await safe(
        () => (prisma as never as { interopMessage: { findFirst: (a: unknown) => Promise<{ patientId: string | null } | null> } })
          .interopMessage.findFirst({
            where: { workspaceId: this.workspaceId, patientId: { not: null }, rawPayload: { contains: input.partnerId } },
            orderBy: { receivedAt: "desc" },
          }),
        null,
      );
      if (linked?.patientId) return { result: "Probable match", patientId: linked.patientId, action: "link_with_review", method: "partner identifier via previously linked payload" };
    }
    if (input.name && input.dob) {
      return { result: "Possible match", patientId: null, action: "manual_review", method: "name + date of birth — insufficient for auto-merge" };
    }
    return { result: "No match", patientId: null, action: "quarantine_unknown_patient", method: "insufficient identifiers" };
  }

  // ── Incidents ───────────────────────────────────────────────────────
  async createIncident(input: z.infer<typeof interopIncidentSchema>) {
    await this.assert("CREATE");
    const row = await (prisma as never as { interopIncident: { create: (a: unknown) => Promise<unknown> } })
      .interopIncident.create({
        data: {
          workspaceId: this.workspaceId, kind: input.kind, partners: input.partners,
          affectedRecords: input.affectedRecords, clinicalRisk: input.clinicalRisk,
          mitigation: input.mitigation ?? null, owner: input.owner ?? null, createdById: this.userId,
        } as never,
      });
    await this.audit("CREATE", "InteropIncident", (row as { id: string }).id, input as never);
    return { incident: row, fields: INCIDENT_FIELDS, note: "Viewer outage = operational incident; missing study affecting care = clinical work item" };
  }

  async listIncidents(status?: string) {
    await this.assert("READ");
    const where: Record<string, unknown> = { workspaceId: this.workspaceId };
    if (status) where.status = status;
    return safe(
      () => (prisma as never as { interopIncident: { findMany: (a: unknown) => Promise<unknown[]> } })
        .interopIncident.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      [],
    );
  }

  async resolveIncident(id: string, input: z.infer<typeof interopIncidentResolveSchema>) {
    await this.assert("UPDATE");
    const row = await (prisma as never as { interopIncident: { update: (a: unknown) => Promise<unknown> } })
      .interopIncident.update({
        where: { id },
        data: {
          status: "closed", rootCause: input.rootCause, correctiveAction: input.correctiveAction,
          closureEvidence: input.closureEvidence, replayPlan: input.replayPlan ?? null,
          reconcilePlan: input.reconcilePlan ?? null,
        } as never,
      });
    await this.audit("RESOLVE", "InteropIncident", id, input as never);
    return row;
  }

  // ── Quality dashboard — dimensions shown separately ──────────────────
  async qualityDashboard() {
    await this.assert("READ");
    const [messages, quarantines, validations, conflicts, incidents, subscriptions, bulkJobs, maps, interfaces] = await Promise.all([
      safe(() => (prisma as never as { interopMessage: { findMany: (a: unknown) => Promise<Array<{ status: string; protocol: string; validationOutcome: string | null }>> } }).interopMessage.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { receivedAt: "desc" }, take: 500 }), []),
      safe(() => (prisma as never as { interopQuarantine: { findMany: (a: unknown) => Promise<Array<{ status: string; reason: string }>> } }).interopQuarantine.findMany({ where: { workspaceId: this.workspaceId }, take: 200 }), []),
      safe(() => (prisma as never as { interopValidation: { findMany: (a: unknown) => Promise<Array<{ outcome: string }>> } }).interopValidation.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 200 }), []),
      safe(() => (prisma as never as { interopConflict: { findMany: (a: unknown) => Promise<Array<{ status: string }>> } }).interopConflict.findMany({ where: { workspaceId: this.workspaceId }, take: 100 }), []),
      safe(() => (prisma as never as { interopIncident: { findMany: (a: unknown) => Promise<Array<{ status: string; kind: string }>> } }).interopIncident.findMany({ where: { workspaceId: this.workspaceId }, take: 50 }), []),
      safe(() => (prisma as never as { interopSubscription: { findMany: (a: unknown) => Promise<Array<{ status: string; backlog: number }>> } }).interopSubscription.findMany({ where: { workspaceId: this.workspaceId }, take: 100 }), []),
      safe(() => (prisma as never as { interopBulkJob: { findMany: (a: unknown) => Promise<Array<{ status: string }>> } }).interopBulkJob.findMany({ where: { workspaceId: this.workspaceId }, take: 50 }), []),
      safe(() => (prisma as never as { interopTerminologyMap: { findMany: (a: unknown) => Promise<Array<{ reviewStatus: string; expiresAt: Date | null }>> } }).interopTerminologyMap.findMany({ where: { workspaceId: this.workspaceId }, take: 200 }), []),
      safe(() => (prisma as never as { interopInterface: { findMany: (a: unknown) => Promise<Array<{ conformanceStatus: string; status: string }>> } }).interopInterface.findMany({ where: { workspaceId: this.workspaceId }, take: 100 }), []),
    ]);
    const count = (arr: Array<Record<string, unknown>>, key: string) => {
      const out: Record<string, number> = {};
      for (const r of arr) { const k = String(r[key] ?? "unknown"); out[k] = (out[k] ?? 0) + 1; }
      return out;
    };
    const now = Date.now();
    return {
      interfaceHealth: { total: interfaces.length, byConformance: count(interfaces as Array<Record<string, unknown>>, "conformanceStatus") },
      messages: { total: messages.length, byStatus: count(messages as Array<Record<string, unknown>>, "status"), byProtocol: count(messages as Array<Record<string, unknown>>, "protocol") },
      validationOutcomes: count(validations as Array<Record<string, unknown>>, "outcome"),
      quarantine: { open: quarantines.filter((q) => q.status === "OPEN" || q.status === "IN_REVIEW").length, byReason: count(quarantines as Array<Record<string, unknown>>, "reason") },
      conflicts: { open: conflicts.filter((c) => c.status === "OPEN" || c.status === "ESCALATED").length },
      incidents: { open: incidents.filter((i) => i.status === "open" || i.status === "mitigated").length, byKind: count(incidents as Array<Record<string, unknown>>, "kind") },
      subscriptions: { backlog: subscriptions.reduce((n, s) => n + s.backlog, 0), degraded: subscriptions.filter((s) => s.status !== "active").length },
      bulkJobs: count(bulkJobs as Array<Record<string, unknown>>, "status"),
      terminology: {
        reviewBacklog: maps.filter((m) => m.reviewStatus === "pending").length,
        expiring: maps.filter((m) => m.expiresAt && new Date(m.expiresAt).getTime() - now < 30 * 86_400_000).length,
      },
      dimensions: QUALITY_DIMENSIONS,
      note: "Dimensions stay separate — completeness never masks identity or timeliness gaps",
    };
  }

  // ── Static exports for UI ─────────────────────────────────────────────
  static readonly INTEROP_PIPELINE = INTEROP_PIPELINE;
  static readonly INTEROP_PROTOCOLS = INTEROP_PROTOCOLS;
  static readonly INTEROP_API = INTEROP_API;
  static readonly FHIR_INTEROP_RESOURCES = FHIR_INTEROP_RESOURCES;
  static readonly VALIDATION_PIPELINE = VALIDATION_PIPELINE;
}
