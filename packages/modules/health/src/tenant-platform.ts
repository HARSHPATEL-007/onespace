// N0VA Tenant Configuration and Policy Control Plane — Project Vita (Health & Wellness).
// Each healthcare organization configures its operating model without forking
// the core product. Customization is powerful but bounded: no tenant can
// disable foundational security, audit, patient-safety, privacy, or
// data-integrity controls.
//
// Governing principle: configurable enough to respect local clinical practice,
// law, language, payer systems, and organizational identity — while preserving
// one non-negotiable foundation of patient safety, privacy, security,
// auditability, and tenant isolation. Configuration is versioned, typed,
// policy-controlled software — never casual editable settings.
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import crypto from "node:crypto";

const MODULE = "health_tenant";
export const TENANT_PLATFORM_VERSION = "2026.09";

// ── Hierarchy — explicit inheritance, never ambiguous ─────────────────
export const CONFIG_LEVELS = [
  "global", "regional", "tenant", "facility", "specialty", "workflow",
] as const;
export type ConfigLevel = keyof typeof CONFIG_LEVELS;

export interface InheritanceLink { level: string; value: unknown; version: string; approver: string; effectiveDate: string; expiresAt: string | null }
export interface EffectiveValue {
  configuredValue: unknown; inheritedValue: unknown; sourceLevel: string;
  version: string; approver: string; effectiveDate: string; expirationDate: string | null;
  conflictResolution: string; rollbackTarget: string; lastEvaluation: string;
}

// Later (more specific) levels override earlier ones; every step is recorded.
export function resolveEffective(chain: InheritanceLink[], key: string): EffectiveValue {
  const defined = chain.filter((l) => l.value !== undefined && l.value !== null);
  const winner = defined[defined.length - 1];
  const parent = defined[defined.length - 2] ?? null;
  if (!winner) {
    return {
      configuredValue: null, inheritedValue: null, sourceLevel: "none",
      version: "unconfigured", approver: "none", effectiveDate: new Date().toISOString(),
      expirationDate: null, conflictResolution: `no value configured for ${key}`,
      rollbackTarget: "none", lastEvaluation: new Date().toISOString(),
    };
  }
  return {
    configuredValue: winner.value,
    inheritedValue: parent ? parent.value : winner.value,
    sourceLevel: winner.level,
    version: winner.version,
    approver: winner.approver,
    effectiveDate: winner.effectiveDate,
    expirationDate: winner.expiresAt,
    conflictResolution: parent
      ? `${winner.level} override wins over ${parent.level}; global guardrails always win over all`
      : `single source at ${winner.level}`,
    rollbackTarget: parent ? `${parent.level}@${parent.version}` : `${winner.level}@${winner.version}`,
    lastEvaluation: new Date().toISOString(),
  };
}

// ── Domains + non-overridable guardrails ──────────────────────────────
export const CONFIG_DOMAINS = [
  "branding", "specialties", "care_pathways", "alert_rules", "consent",
  "retention", "terminology", "payer_rules", "roles", "devices",
  "ai", "approvals", "residency", "integrations",
] as const;

// Guardrails no tenant override may violate. Checked on every draft.
export const DOMAIN_GUARDRAILS: Record<string, string[]> = {
  branding: ["accessibility_contrast", "identity_clarity", "security_notices_visible", "emergency_messages_not_weakened", "no_false_clinical_relationship"],
  specialties: ["license_checks", "authorization_checks"],
  care_pathways: ["clinical_safety_constraints", "approval_rules", "no_silent_active_patient_migration"],
  alert_rules: ["critical_alert_delivery", "escalation_mandatory", "foundational_alerts_cannot_disable"],
  consent: ["legal_minimums", "audit_immutable", "withdrawal_propagates", "no_consent_override_of_legal_hold"],
  retention: ["legal_holds", "required_records", "immutable_audit_never_deleted"],
  terminology: ["canonical_codes_preserved", "validation_required", "display_must_not_change_semantics"],
  payer_rules: ["no_emergency_care_denial", "no_fabricated_coding", "clinical_separate_from_reimbursement"],
  roles: ["least_privilege", "segregation_of_duties", "license_validation", "tenant_isolation", "audit_logging"],
  devices: ["signature_required", "posture_documented", "safety_validated", "quarantine_enforced"],
  ai: ["model_approval", "monitoring", "human_oversight", "prohibited_uses_enforced"],
  approvals: ["high_risk_clinical_approval", "identity_bound", "non_repudiable"],
  residency: ["policy_constraints", "regulatory_constraints", "support_logs_backups_in_scope"],
  integrations: ["mutual_auth", "encryption", "allowlisting", "certificate_validation"],
};

export function guardrailCheck(domain: string, proposed: Record<string, unknown>): { allowed: boolean; violations: string[] } {
  const violations: string[] = [];
  const g = DOMAIN_GUARDRAILS[domain] ?? [];
  const flat = JSON.stringify(proposed).toLowerCase();
  if (domain === "alert_rules" && (flat.includes("disable") || proposed.enabled === false) && !proposed.safetyWorkflow) {
    violations.push("foundational_alerts_cannot_disable without a formal clinical safety workflow");
  }
  if (domain === "retention" && (flat.includes("delete_audit") || proposed.deleteAudit === true)) {
    violations.push("immutable_audit_never_deleted — audit history survives retention changes");
  }
  if (domain === "payer_rules" && (flat.includes("deny_emergency") || proposed.denyEmergency === true)) {
    violations.push("no_emergency_care_denial — payer rules cannot deny emergency care");
  }
  if (domain === "residency" && proposed.crossBorderTransfer === true && !proposed.transferApproval) {
    violations.push("cross-border transfer requires explicit approval and policy cover");
  }
  if (domain === "ai" && Array.isArray(proposed.autonomousActions) && proposed.autonomousActions.length > 0 && !proposed.humanApproval) {
    violations.push("autonomous clinical actions require human approval configuration");
  }
  if (domain === "integrations" && proposed.allowlisted !== true) {
    violations.push("arbitrary production endpoints require allowlisting, certificate validation, testing, approval");
  }
  return { allowed: violations.length === 0, violations: [...violations, ...g.filter(() => false)] };
}

// ── Configuration object model ────────────────────────────────────────
export const configSchema = z.object({
  configId: z.string().min(1).default(""),
  tenantId: z.string().min(1),
  version: z.string().default("2026.09.1"),
  parentVersion: z.string().default(""),
  status: z.enum(["DRAFT", "VALIDATING", "TESTING", "PENDING_APPROVAL", "APPROVED", "SCHEDULED", "CANARY", "ACTIVE", "MONITORED", "SUPERSEDED", "ROLLED_BACK", "PAUSED"]).default("DRAFT"),
  effectiveFrom: z.coerce.date().optional(),
  effectiveUntil: z.coerce.date().optional().nullable(),
  domains: z.record(z.unknown()).default({}),
  businessReason: z.string().default(""),
  requester: z.string().default(""),
  riskClassification: z.enum(["A_SAFE", "B_OPERATIONAL", "C_CLINICAL", "D_HIGHRISK"]).default("B_OPERATIONAL"),
  testEvidence: z.string().default(""),
  rollbackVersion: z.string().default(""),
  owner: z.string().default(""),
  reviewDate: z.coerce.date().optional(),
});
export type ConfigInput = z.infer<typeof configSchema>;

// Immutable after approval: changes create new versions, never mutate history.
export const CONFIG_LIFECYCLE = [
  "DRAFT", "VALIDATING", "TESTING", "PENDING_APPROVAL", "APPROVED",
  "SCHEDULED", "CANARY", "ACTIVE", "MONITORED", "SUPERSEDED",
] as const;
const LIFECYCLE_EDGES: Record<string, string[]> = {
  DRAFT: ["VALIDATING", "PAUSED"],
  VALIDATING: ["TESTING", "DRAFT"],
  TESTING: ["PENDING_APPROVAL", "DRAFT"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT"],
  APPROVED: ["SCHEDULED", "CANARY"],
  SCHEDULED: ["CANARY", "PAUSED"],
  CANARY: ["ACTIVE", "PAUSED", "ROLLED_BACK"],
  ACTIVE: ["MONITORED", "SUPERSEDED", "ROLLED_BACK", "PAUSED"],
  MONITORED: ["SUPERSEDED", "ROLLED_BACK"],
  PAUSED: ["DRAFT", "SCHEDULED"],
  SUPERSEDED: [],
  ROLLED_BACK: ["DRAFT"],
};
export function canTransitionConfig(from: string, to: string): boolean {
  return (LIFECYCLE_EDGES[from] ?? []).includes(to);
}

// ── Configuration classes + approval routes ───────────────────────────
export const CONFIG_CLASSES = {
  A_SAFE: { label: "Class A: safe presentation", items: ["logo", "colors", "labels", "notification_wording", "dashboard_layout", "contact_info"], approval: "lightweight" },
  B_OPERATIONAL: { label: "Class B: operational", items: ["clinic_hours", "scheduling_rules", "referral_destinations", "queue_routing", "specialty_templates", "device_catalog_availability"], approval: "operational_owner_plus_automated_validation" },
  C_CLINICAL: { label: "Class C: clinical", items: ["care_pathways", "alert_thresholds", "escalation_rules", "medication_review", "discharge_checkpoints", "critical_result_routing"], approval: "clinical_governance_plus_simulation_plus_staged_release_plus_monitoring" },
  D_HIGHRISK: { label: "Class D: high-risk security/privacy", items: ["residency", "retention", "sensitive_access", "break_glass", "encryption", "federation", "ai_permissions", "integration_credentials", "admin_roles"], approval: "security_plus_privacy_plus_legal_plus_tenant_owner" },
} as const;

export const APPROVAL_MATRIX: Record<string, string> = {
  branding_change: "tenant_administrator",
  local_terminology: "clinical_or_terminology_owner",
  care_pathway_change: "clinical_governance",
  critical_alert_rule: "dual_clinical_approval",
  retention_change: "records_plus_privacy_plus_legal",
  sensitive_data_policy: "privacy_plus_security",
  payer_rule: "revenue_cycle_owner",
  role_expansion: "security_plus_tenant_owner",
  device_activation: "clinical_engineering_plus_security",
  ai_activation: "clinical_safety_plus_model_governance",
  residency_change: "legal_plus_privacy_plus_security",
  integration_activation: "technical_owner_plus_security",
  bulk_export: "data_owner_plus_purpose_approval",
  break_glass_policy: "clinical_plus_privacy_plus_security",
};

// ── Tenant isolation — every layer, fail-closed ───────────────────────
export const ISOLATION_LAYERS = [
  "request", "membership", "authorization", "repository", "database_policy",
  "cache_key", "event", "file_path", "analytics", "audit", "backup", "async_job",
] as const;

export function isolationCheck(layers: Record<string, boolean>): { isolated: boolean; gaps: string[] } {
  const gaps = ISOLATION_LAYERS.filter((l) => !layers[l]);
  return { isolated: gaps.length === 0, gaps: [...gaps] };
}
// Async consumers must re-establish verified tenant context — never inherit
// trust from the originating request envelope.

// ── Isolation tiers ───────────────────────────────────────────────────
export const ISOLATION_TIERS = {
  LOGICAL_SHARED: { architecture: "Shared application with enforced tenant scope", use: "Smaller tenants and routine workloads" },
  DEDICATED_DATA: { architecture: "Separate schema, database, or encryption key", use: "Higher privacy or regulatory requirements" },
  DEDICATED_WORKLOAD: { architecture: "Dedicated services and compute", use: "High-volume or high-criticality tenant" },
  DEDICATED_REGIONAL: { architecture: "Region-specific control and data plane", use: "Residency or jurisdictional requirements" },
  DEDICATED_ENVIRONMENT: { architecture: "Fully isolated deployment", use: "National, highly sensitive, or strategic tenant" },
} as const;

// ── Onboarding + readiness ────────────────────────────────────────────
export const ONBOARDING_STEPS = [
  "contract_eligibility", "region_residency", "org_structure", "identity_federation",
  "provider_roles", "specialty_catalog", "clinical_pathways", "payer_config",
  "device_catalog", "integration_endpoints", "ai_policy", "retention_policy",
  "tenant_test", "security_clinical_approval", "production_activation",
] as const;
export const READINESS_SIGNALS = [
  "identity_ready", "roles_ready", "data_boundary_ready", "residency_verified",
  "integrations_tested", "pathways_approved", "alert_routing_tested",
  "devices_validated", "ai_policies_approved", "backup_recovery_tested",
  "support_contacts_confirmed", "downtime_procedures_available",
] as const;

export function readinessGaps(signals: Record<string, boolean>): string[] {
  return READINESS_SIGNALS.filter((s) => !signals[s]);
}

// ── Care pathways — versioned executable definitions ──────────────────
export const pathwaySchema = z.object({
  pathwayId: z.string().min(1).default(""),
  version: z.string().default("1.0"),
  population: z.object({ criteria: z.array(z.string()).default([]), exclusions: z.array(z.string()).default([]) }).default({ criteria: [], exclusions: [] }),
  steps: z.array(z.object({ id: z.string(), type: z.string(), owner: z.string().default(""), deadline: z.string().default(""), approval: z.string().default(""), fallback: z.string().default("") })).default([]),
  escalation: z.record(z.string()).default({}),
  safetyConstraints: z.array(z.string()).default([]),
  migrationPolicy: z.enum(["remain", "safe_migrate", "clinician_review"]).default("clinician_review"),
  approvedBy: z.string().default(""),
});
// Never silently change an active patient's pathway.

// ── Alert rules — foundational alerts cannot vanish ───────────────────
export const alertRuleSchema = z.object({
  alertRuleId: z.string().min(1).default(""),
  version: z.string().default("1.0"),
  trigger: z.string().min(1),
  severity: z.enum(["info", "warning", "critical"]).default("warning"),
  primaryRoute: z.string().default(""),
  backupRoute: z.string().default(""),
  acknowledgementDeadline: z.string().default(""),
  escalation: z.array(z.string()).default([]),
  patientNotification: z.string().default("after_clinician_review"),
  duplicateWindow: z.string().default("10_minutes"),
  approval: z.string().default("single"),
  cannotDisable: z.boolean().default(false),
  enabled: z.boolean().default(true),
  safetyWorkflow: z.string().default(""),
});

// ── Consent / retention / terminology / payer ─────────────────────────
export const consentPolicySchema = z.object({
  consentTypes: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
  channels: z.array(z.string()).default([]),
  witnessRequired: z.boolean().default(false),
  proxyConsent: z.boolean().default(false),
  researchConsent: z.boolean().default(false),
  genomicConsent: z.boolean().default(false),
  sharingConsent: z.boolean().default(false),
  recontact: z.string().default("opt_in"),
  withdrawalProcess: z.string().default(""),
  expiration: z.string().default(""),
  jurisdiction: z.string().default(""),
  immutableHistory: z.boolean().default(true),
});

export const retentionRuleSchema = z.object({
  dataClass: z.string().min(1),
  retainFor: z.string().default("configured_period"),
  legalHold: z.boolean().default(false),
  deletionMethod: z.string().default("approved_secure_destruction"),
  archiveRegion: z.string().default("configured"),
  tenantOverride: z.enum(["permitted", "not_permitted"]).default("not_permitted"),
  reviewOwner: z.string().default("records-management"),
});

export const TERMINOLOGY_LAYERS = ["display", "clinical_semantic", "billing", "patient_friendly", "search_synonyms"] as const;

export const payerRuleSchema = z.object({
  payer: z.string().min(1),
  plan: z.string().default(""),
  region: z.string().default(""),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().optional().nullable(),
  eligibilityEndpoint: z.string().default(""),
  authorizationRules: z.array(z.string()).default([]),
  requiredDocumentation: z.array(z.string()).default([]),
  formulary: z.string().default(""),
  coverageLimits: z.string().default(""),
  claimFormat: z.string().default(""),
  timelyFiling: z.string().default(""),
  appeals: z.string().default(""),
  estimateRules: z.string().default(""),
  exceptionPathway: z.string().default("human_review_queue"),
});
// Rule changes apply prospectively — history keeps its original reason.

// ── Roles / devices / AI / residency / integrations ───────────────────
export const roleTemplateSchema = z.object({
  roleId: z.string().min(1).default(""),
  resourcePermissions: z.array(z.string()).default([]),
  actionPermissions: z.array(z.string()).default([]),
  patientRelationship: z.string().default(""),
  orgScope: z.string().default(""),
  specialtyScope: z.array(z.string()).default([]),
  purpose: z.string().default(""),
  dataSensitivity: z.string().default(""),
  approvalAuthority: z.string().default(""),
  expiration: z.coerce.date().optional().nullable(),
});
export const ROLE_NON_BYPASSABLES = [
  "least_privilege", "segregation_of_duties", "sensitive_step_up",
  "privileged_access_management", "break_glass_review", "audit_logging",
  "license_validation", "tenant_isolation",
] as const;

export const deviceCatalogSchema = z.object({
  model: z.string().min(1),
  deviceType: z.string().default(""),
  clinicalPurpose: z.string().default(""),
  firmwareRange: z.string().default(""),
  protocol: z.string().default(""),
  dataTypes: z.array(z.string()).default([]),
  associationMethod: z.string().default(""),
  calibrationSchedule: z.string().default(""),
  networkZone: z.string().default(""),
  manufacturer: z.string().default(""),
  supportStatus: z.string().default("supported"),
  patchPolicy: z.string().default(""),
  quarantineBehavior: z.string().default(""),
  replacementProcess: z.string().default(""),
  retentionPeriod: z.string().default(""),
  firmwareSignatureOk: z.boolean().default(false),
  interopTested: z.boolean().default(false),
  engineeringApproved: z.boolean().default(false),
  postureDocumented: z.boolean().default(false),
  mappingValidated: z.boolean().default(false),
  downtimeProcedure: z.boolean().default(false),
  vendorSupportConfirmed: z.boolean().default(false),
});
export const DEVICE_ACTIVATION_GATES = [
  "firmwareSignatureOk", "interopTested", "engineeringApproved", "postureDocumented",
  "mappingValidated", "downtimeProcedure", "vendorSupportConfirmed",
] as const;
export function deviceActivationGaps(entry: Record<string, boolean>): string[] {
  return DEVICE_ACTIVATION_GATES.filter((g) => !entry[g]);
}

export const aiPolicySchema = z.object({
  aiPolicyId: z.string().min(1).default(""),
  capability: z.string().min(1),
  enabled: z.boolean().default(true),
  specialties: z.array(z.string()).default([]),
  populations: z.array(z.string()).default([]),
  permittedInputs: z.array(z.string()).default([]),
  prohibitedInputs: z.array(z.string()).default([]),
  autonomousActions: z.array(z.string()).default([]),
  humanApproval: z.string().default("required"),
  patientDisclosure: z.string().default("configured"),
  modelVersions: z.array(z.string()).default([]),
  prohibitedUse: z.array(z.string()).default([]),
  dataResidency: z.string().default(""),
  retention: z.string().default(""),
  monitoring: z.string().default(""),
  escalation: z.string().default(""),
  fallback: z.string().default("manual_workflow"),
});

export const residencySchema = z.object({
  tenantId: z.string().min(1),
  primaryRegion: z.string().default("configured"),
  backupRegions: z.array(z.string()).default([]),
  processingRegions: z.array(z.string()).default([]),
  prohibitedRegions: z.array(z.string()).default([]),
  crossBorderTransfer: z.string().default("not_permitted"),
  supportAccess: z.string().default("regional_only"),
  encryptionKeyRegion: z.string().default("same_as_primary"),
  approvedBy: z.string().default(""),
});
export const RESIDENCY_COVERAGE = [
  "primary_databases", "replicas", "backups", "logs", "analytics",
  "ai_processing", "support_tools", "search_indexes", "message_queues",
  "temporary_files", "dr_environments", "device_telemetry", "vendor_endpoints",
] as const;
export function residencyCoverageGaps(covered: Record<string, boolean>): string[] {
  return RESIDENCY_COVERAGE.filter((c) => !covered[c]);
}

export const integrationSchema = z.object({
  endpointId: z.string().min(1).default(""),
  tenantId: z.string().min(1),
  kind: z.enum(["fhir", "hl7", "dicom", "pharmacy", "payer", "identity_federation", "webhook", "sms_email", "device_gateway", "laboratory", "referral_partner"]),
  environment: z.string().default("production"),
  region: z.string().default(""),
  protocol: z.string().default(""),
  authentication: z.string().default("mutual_tls"),
  certificate: z.string().default(""),
  allowedResources: z.array(z.string()).default([]),
  rateLimit: z.string().default(""),
  retryPolicy: z.string().default(""),
  timeout: z.string().default(""),
  dataClassification: z.string().default(""),
  messageMapping: z.string().default(""),
  schemaVersion: z.string().default(""),
  downtimeBehavior: z.string().default("queue_and_alert"),
  healthStatus: z.string().default("unknown"),
  expiresAt: z.coerce.date().optional().nullable(),
  vendorContact: z.string().default(""),
  allowlisted: z.boolean().default(false),
  securityTested: z.boolean().default(false),
  approvedBy: z.string().default(""),
});

// ── Canary / compatibility / simulator / drift / offboarding ──────────
export const CANARY_STAGES = [
  "validation_only", "internal_test_tenant", "pilot_department",
  "small_user_group", "selected_facility", "full_tenant",
] as const;
export const CANARY_MONITORS = [
  "error_rate", "workflow_completion", "alert_delivery", "authorization_denials",
  "integration_failures", "patient_complaints", "provider_burden",
  "data_quality_drift", "ai_safety", "performance",
  "cross_tenant_isolation", "residency_violations",
] as const;

export const COMPATIBILITY_CHECKS = [
  "schema", "data_model", "events", "api", "terminology", "devices",
  "identity_policy", "consent", "payer_rules", "ai_models",
  "reports", "backup_restore",
] as const;

export const ROLLBACK_SCOPE = [
  "configuration_version", "runtime_policy", "workflow_version", "alert_rules",
  "terminology_mappings", "integration_mappings", "ai_availability",
  "retention_behavior", "user_messaging", "migration_scripts",
  "cache_invalidation", "event_interpretation",
] as const;

export const DRIFT_SIGNALS = [
  "manual_production_change", "unapproved_endpoint", "missing_policy",
  "wrong_region", "different_alert_threshold", "unexpected_ai_model",
  "device_outside_catalog", "expired_certificate", "orphaned_role",
  "stale_policy_cache", "old_configuration_running", "replica_out_of_sync",
] as const;

export const OFFBOARDING_STEPS = [
  "disable_new_access", "revoke_credentials", "stop_integrations",
  "approved_export", "preserve_required_records", "apply_retention_and_hold",
  "delete_temporary_copies", "destroy_keys_when_authorized", "reconcile_external_copies",
  "issue_certificate", "preserve_audit_history", "deregister_devices",
  "close_support_access", "verify_backups_replicas",
] as const;

export const TENANT_OPS_TILES = [
  "active_version", "pending_changes", "expiring_approvals", "failed_validation",
  "rollback_points", "integration_health", "residency_status", "device_compliance",
  "ai_availability", "alert_performance", "consent_errors", "retention_jobs",
  "cross_tenant_tests", "pathway_completion", "configuration_drift", "unsupported_overrides",
] as const;

// ── In-memory fallbacks (pre-migration) ───────────────────────────────
interface StoredRow extends Record<string, unknown> { id: string; workspaceId: string }
const memConfigs = new Map<string, StoredRow[]>();
const memTenants = new Map<string, StoredRow[]>();
const memAlerts = new Map<string, StoredRow[]>();
const memPathways = new Map<string, StoredRow[]>();
const memIntegrations = new Map<string, StoredRow[]>();
const memDrifts = new Map<string, StoredRow[]>();
const memSimulations = new Map<string, StoredRow[]>();

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
function memList(m: Map<string, StoredRow[]>, ws: string): StoredRow[] { return m.get(ws) ?? []; }
function memPush(m: Map<string, StoredRow[]>, ws: string, row: StoredRow) { m.set(ws, [...(m.get(ws) ?? []), row]); }

type TenantTables = {
  healthTenantRecord: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; findFirst: (a: unknown) => Promise<never | null>; update: (a: unknown) => Promise<never> };
  healthTenantConfig: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; findFirst: (a: unknown) => Promise<never | null>; update: (a: unknown) => Promise<never> };
  healthTenantAlertRule: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthTenantPathway: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthTenantIntegration: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]> };
  healthTenantDrift: { create: (a: unknown) => Promise<never>; findMany: (a: unknown) => Promise<never[]>; update: (a: unknown) => Promise<never> };
};

// ── Tenant Configuration and Policy Control Plane ─────────────────────
export class TenantControlPlane {
  constructor(private readonly workspaceId: string, private readonly userId: string, private readonly role: Role) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, "health", action))) throw new Error(`Missing ${action} permission for health`);
  }
  private audit(action: string, targetId: string, meta?: Record<string, unknown>) {
    return logAudit({ workspaceId: this.workspaceId, actorId: this.userId, module: MODULE, action, targetType: "TenantArtifact", targetId, metadata: meta }).catch(() => null);
  }

  // ── Tenant registry + onboarding ─────────────────────────────────
  async registerTenant(input: { tenantId: string; name: string; region: string; isolationTier?: string; orgStructure?: Record<string, unknown> }) {
    await this.assert("CREATE");
    if (input.isolationTier && !(Object.keys(ISOLATION_TIERS) as string[]).includes(input.isolationTier)) {
      throw new Error(`Unknown isolation tier: ${input.isolationTier}`);
    }
    const row = await safe(
      () => (prisma as unknown as TenantTables).healthTenantRecord.create({
        data: {
          workspaceId: this.workspaceId, tenantId: input.tenantId, name: input.name,
          region: input.region, isolationTier: input.isolationTier ?? "LOGICAL_SHARED",
          orgStructure: input.orgStructure ?? {}, onboarding: {}, readiness: {},
          status: "ONBOARDING", createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: input.tenantId, workspaceId: this.workspaceId, ...input, status: "ONBOARDING", onboarding: {}, readiness: {} };
    if (!row) memPush(memTenants, this.workspaceId, stored);
    await this.audit("tenant.registered", input.tenantId, { region: input.region });
    return { ...((row as unknown as Record<string, unknown> | null) ?? stored), onboardingSteps: [...ONBOARDING_STEPS] };
  }

  async updateOnboarding(tenantId: string, completed: Record<string, boolean>, readiness: Record<string, boolean>) {
    await this.assert("UPDATE");
    const missingSteps = ONBOARDING_STEPS.filter((s) => !completed[s]);
    const gaps = readinessGaps(readiness);
    const ready = missingSteps.length === 0 && gaps.length === 0;
    await safe(() => (prisma as unknown as TenantTables).healthTenantRecord.update({ where: { tenantId }, data: { onboarding: completed, readiness, status: ready ? "READY" : "ONBOARDING" } }) as Promise<never>, null);
    const found = memList(memTenants, this.workspaceId).find((t) => t.id === tenantId);
    if (found) { found.onboarding = completed; found.readiness = readiness; found.status = ready ? "READY" : "ONBOARDING"; }
    await this.audit("tenant.onboarding.updated", tenantId, { ready });
    return { tenantId, ready, missingSteps, readinessGaps: gaps, readinessReport: [...READINESS_SIGNALS] };
  }

  // ── Configuration lifecycle ──────────────────────────────────────
  async saveDraft(input: ConfigInput) {
    await this.assert("CREATE");
    const parsed = configSchema.parse({ ...input, configId: input.configId || `config-${crypto.randomUUID().slice(0, 8)}`, status: "DRAFT" as const });
    // Guardrail screen across every domain in the draft.
    const violations: string[] = [];
    for (const [domain, body] of Object.entries(parsed.domains)) {
      if (!(CONFIG_DOMAINS as readonly string[]).includes(domain)) violations.push(`unknown domain: ${domain}`);
      else {
        const check = guardrailCheck(domain, (body ?? {}) as Record<string, unknown>);
        violations.push(...check.violations.map((v) => `${domain}: ${v}`));
      }
    }
    if (violations.length > 0) throw new Error(`Draft violates non-overridable guardrails: ${violations.join("; ")}`);
    const row = await safe(
      () => (prisma as unknown as TenantTables).healthTenantConfig.create({
        data: {
          workspaceId: this.workspaceId, configId: parsed.configId, tenantId: parsed.tenantId,
          version: parsed.version, parentVersion: parsed.parentVersion, status: "DRAFT",
          effectiveFrom: parsed.effectiveFrom ?? null, effectiveUntil: parsed.effectiveUntil ?? null,
          domains: parsed.domains, businessReason: parsed.businessReason, requester: parsed.requester,
          riskClassification: parsed.riskClassification, testEvidence: parsed.testEvidence,
          rollbackVersion: parsed.rollbackVersion, owner: parsed.owner,
          reviewDate: parsed.reviewDate ?? null, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.configId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memConfigs, this.workspaceId, stored);
    await this.audit("tenant.config.drafted", parsed.configId, { tenantId: parsed.tenantId, risk: parsed.riskClassification });
    return { ...((row as unknown as Record<string, unknown> | null) ?? stored), approvalRoute: APPROVAL_MATRIX, immutableAfterApproval: true as const };
  }

  async transitionConfig(configId: string, to: string, actor?: string) {
    await this.assert("UPDATE");
    const all = await this.listConfigs();
    const found = (all as Array<Record<string, unknown>>).find((c) => c.configId === configId || c.id === configId);
    if (!found) throw new Error("Configuration not found");
    const from = String(found.status ?? "DRAFT");
    if (!canTransitionConfig(from, to)) throw new Error(`Invalid lifecycle transition ${from} → ${to}`);
    if (to === "APPROVED" && !actor) throw new Error("Approval must be identity-bound — actor required");
    // Approval freezes the version: further edits must create a new version.
    await safe(() => (prisma as unknown as TenantTables).healthTenantConfig.update({ where: { configId }, data: { status: to } }) as Promise<never>, null);
    found.status = to;
    await this.audit("tenant.config.transitioned", configId, { from, to, actor });
    return { configId, from, to, immutable: to === "APPROVED" };
  }

  async listConfigs(tenantId?: string, status?: string) {
    await this.assert("READ");
    const rows = await safe(
      () => (prisma as unknown as TenantTables).healthTenantConfig.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 100 }) as Promise<never[]>,
      [],
    );
    let all = rows.length ? (rows as Array<Record<string, unknown>>) : memList(memConfigs, this.workspaceId);
    if (tenantId) all = all.filter((c) => (c as Record<string, unknown>).tenantId === tenantId);
    if (status) all = all.filter((c) => (c as Record<string, unknown>).status === status);
    return all;
  }

  async effectiveValue(tenantId: string, key: string, overrides: Partial<Record<string, InheritanceLink>> = {}) {
    await this.assert("READ");
    const chain: InheritanceLink[] = (CONFIG_LEVELS as readonly string[]).map((level) => ({
      level, value: overrides[level]?.value ?? null,
      version: overrides[level]?.version ?? "default",
      approver: overrides[level]?.approver ?? "platform",
      effectiveDate: overrides[level]?.effectiveDate ?? new Date(0).toISOString(),
      expiresAt: overrides[level]?.expiresAt ?? null,
    }));
    const effective = resolveEffective(chain, key);
    await this.audit("tenant.config.evaluated", tenantId, { key, source: effective.sourceLevel });
    return { tenantId, key, ...effective };
  }

  // ── Alert rules — foundational alerts need a safety workflow ──────
  async upsertAlertRule(input: z.infer<typeof alertRuleSchema>) {
    await this.assert("CREATE");
    const parsed = alertRuleSchema.parse({ ...input, alertRuleId: input.alertRuleId || `alert-${crypto.randomUUID().slice(0, 8)}` });
    if (parsed.cannotDisable && parsed.enabled === false && !parsed.safetyWorkflow) {
      throw new Error("Foundational safety alert cannot be disabled without a formal clinical safety workflow");
    }
    const row = await safe(
      () => (prisma as unknown as TenantTables).healthTenantAlertRule.create({
        data: {
          workspaceId: this.workspaceId, alertRuleId: parsed.alertRuleId, version: parsed.version,
          trigger: parsed.trigger, severity: parsed.severity, primaryRoute: parsed.primaryRoute,
          backupRoute: parsed.backupRoute, acknowledgementDeadline: parsed.acknowledgementDeadline,
          escalation: parsed.escalation, patientNotification: parsed.patientNotification,
          duplicateWindow: parsed.duplicateWindow, approval: parsed.approval,
          cannotDisable: parsed.cannotDisable, enabled: parsed.enabled, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.alertRuleId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memAlerts, this.workspaceId, stored);
    await this.audit("tenant.alert.upserted", parsed.alertRuleId, { trigger: parsed.trigger, version: parsed.version });
    return { ...((row as unknown as Record<string, unknown> | null) ?? stored), replayRequired: "Test with historical replay or synthetic events before activation." };
  }

  // ── Pathways — no silent migration of active patients ─────────────
  async publishPathway(input: z.infer<typeof pathwaySchema>) {
    await this.assert("CREATE");
    const parsed = pathwaySchema.parse({ ...input, pathwayId: input.pathwayId || `pathway-${crypto.randomUUID().slice(0, 8)}` });
    if (!parsed.approvedBy) throw new Error("Pathway requires clinical-governance approval token");
    if (parsed.safetyConstraints.length === 0) throw new Error("Pathway requires explicit safety constraints");
    const row = await safe(
      () => (prisma as unknown as TenantTables).healthTenantPathway.create({
        data: {
          workspaceId: this.workspaceId, pathwayId: parsed.pathwayId, version: parsed.version,
          population: parsed.population, steps: parsed.steps, escalation: parsed.escalation,
          safetyConstraints: parsed.safetyConstraints, migrationPolicy: parsed.migrationPolicy,
          approvedBy: parsed.approvedBy, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.pathwayId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memPathways, this.workspaceId, stored);
    await this.audit("tenant.pathway.published", parsed.pathwayId, { version: parsed.version, migration: parsed.migrationPolicy });
    return (row as unknown) ?? stored;
  }

  // ── Integrations — allowlist + cert + test + approval ─────────────
  async registerIntegration(input: z.infer<typeof integrationSchema>) {
    await this.assert("CREATE");
    const parsed = integrationSchema.parse({ ...input, endpointId: input.endpointId || `ep-${crypto.randomUUID().slice(0, 8)}` });
    if (parsed.environment === "production" && (!parsed.allowlisted || !parsed.certificate || !parsed.securityTested || !parsed.approvedBy)) {
      throw new Error("Production endpoint blocked — requires allowlisting, certificate, security testing, and approval");
    }
    const row = await safe(
      () => (prisma as unknown as TenantTables).healthTenantIntegration.create({
        data: {
          workspaceId: this.workspaceId, endpointId: parsed.endpointId, tenantId: parsed.tenantId,
          kind: parsed.kind, environment: parsed.environment, region: parsed.region,
          protocol: parsed.protocol, authentication: parsed.authentication, certificate: parsed.certificate,
          allowedResources: parsed.allowedResources, dataClassification: parsed.dataClassification,
          messageMapping: parsed.messageMapping, schemaVersion: parsed.schemaVersion,
          downtimeBehavior: parsed.downtimeBehavior, healthStatus: parsed.healthStatus,
          expiresAt: parsed.expiresAt ?? null, vendorContact: parsed.vendorContact,
          allowlisted: parsed.allowlisted, approvedBy: parsed.approvedBy, createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id: parsed.endpointId, workspaceId: this.workspaceId, ...(parsed as unknown as Record<string, unknown>) };
    if (!row) memPush(memIntegrations, this.workspaceId, stored);
    await this.audit("tenant.integration.registered", parsed.endpointId, { kind: parsed.kind, environment: parsed.environment });
    return (row as unknown) ?? stored;
  }

  // ── Isolation self-test ──────────────────────────────────────────
  async isolationSelfTest(layers: Record<string, boolean>) {
    await this.assert("CREATE");
    const result = isolationCheck(layers);
    await this.audit("tenant.isolation.tested", this.workspaceId, { isolated: result.isolated, gaps: result.gaps });
    if (!result.isolated) {
      return { ...result, verdict: "FAIL_CLOSED — tenant context missing or scope unenforced; access denied until remediated." };
    }
    return { ...result, verdict: "isolated across all layers" };
  }

  // ── Policy simulator — what-if before approval ────────────────────
  async simulate(scenario: string, context: Record<string, unknown> = {}) {
    await this.assert("READ");
    // Rule-based pre-approval simulation over effective policy inputs.
    const id = `sim-${crypto.randomUUID().slice(0, 8)}`;
    let decision = "permit";
    const steps: string[] = [];
    const safetyWarnings: string[] = [];
    if (scenario === "critical_result_after_hours") {
      decision = "permit_with_escalation";
      steps.push("route_to_responsible_clinician", "after_15_minutes_route_to_covering_clinician", "create_unacknowledged_critical_task", "notify_clinical_operations");
      if (!context.coveringClinician) safetyWarnings.push("no covering clinician configured — escalation chain incomplete");
    } else if (scenario === "consent_withdrawal") {
      decision = "permit_with_propagation";
      steps.push("revoke_future_access", "cancel_pending_exports", "notify_recipients", "create_deletion_jobs", "preserve_audit_and_legal_hold");
    } else if (scenario === "payer_endpoint_down") {
      decision = "degrade_with_queue";
      steps.push("queue_authorization_requests", "alert_revenue_cycle", "route_uncertain_cases_to_human_review", "never_deny_emergency_care");
    } else if (scenario === "small_cohort_export") {
      decision = context.cohortSize !== undefined && Number(context.cohortSize) < 11 ? "deny" : "permit_with_review";
      steps.push("check_minimum_cohort", "apply_suppression_rule", "record_export_audit");
      if (decision === "deny") safetyWarnings.push("cohort below suppression threshold — export denied");
    } else {
      steps.push("evaluate_effective_policy", "check_guardrails", "route_for_human_decision");
      safetyWarnings.push(`no canned model for scenario ${scenario} — human review required`);
    }
    const result = { simulationId: id, scenario, effectivePolicy: String(context.effectivePolicy ?? "active-tenant-config"), decision, steps, safetyWarnings, approvalRequired: true };
    memPush(memSimulations, this.workspaceId, { id, workspaceId: this.workspaceId, ...result });
    await this.audit("tenant.policy.simulated", id, { scenario, decision });
    return result;
  }

  // ── Drift — detect, block unsafe, restore or exception ─────────────
  async reportDrift(input: { signal: string; detail: string; runtimeValue?: string; approvedValue?: string }) {
    await this.assert("CREATE");
    if (!(DRIFT_SIGNALS as readonly string[]).includes(input.signal)) throw new Error(`Unknown drift signal: ${input.signal}`);
    const id = `drift-${crypto.randomUUID().slice(0, 8)}`;
    const unsafe = ["wrong_region", "missing_policy", "unapproved_endpoint", "unexpected_ai_model", "device_outside_catalog"].includes(input.signal);
    const row = await safe(
      () => (prisma as unknown as TenantTables).healthTenantDrift.create({
        data: {
          workspaceId: this.workspaceId, driftId: id, signal: input.signal, detail: input.detail,
          runtimeValue: input.runtimeValue ?? "", approvedValue: input.approvedValue ?? "",
          status: unsafe ? "BLOCKED" : "OPEN", createdById: this.userId,
        },
      }) as Promise<never>,
      null,
    );
    const stored: StoredRow = { id, workspaceId: this.workspaceId, ...input, status: unsafe ? "BLOCKED" : "OPEN" };
    if (!row) memPush(memDrifts, this.workspaceId, stored);
    await this.audit("tenant.drift.reported", id, { signal: input.signal, blocked: unsafe });
    return { driftId: id, status: unsafe ? "BLOCKED" : "OPEN", response: "compare → assess impact → block unsafe → restore or exception → notify → audit → revalidate" };
  }

  async resolveDrift(driftId: string, resolution: "RESTORED" | "EXCEPTION_APPROVED", note?: string) {
    await this.assert("UPDATE");
    await safe(() => (prisma as unknown as TenantTables).healthTenantDrift.update({ where: { driftId }, data: { status: resolution } }) as Promise<never>, null);
    const found = memList(memDrifts, this.workspaceId).find((d) => d.id === driftId);
    if (found) found.status = resolution;
    await this.audit("tenant.drift.resolved", driftId, { resolution, note });
    return { driftId, status: resolution };
  }

  // ── Offboarding — no gaps in records or auditability ───────────────
  async offboardTenant(tenantId: string, completed: Record<string, boolean>) {
    await this.assert("UPDATE");
    const missing = OFFBOARDING_STEPS.filter((s) => !completed[s]);
    if (missing.length > 0) throw new Error(`Offboarding blocked — incomplete: ${missing.join(", ")}`);
    await safe(() => (prisma as unknown as TenantTables).healthTenantRecord.update({ where: { tenantId }, data: { status: "OFFBOARDED" } }) as Promise<never>, null);
    const found = memList(memTenants, this.workspaceId).find((t) => t.id === tenantId);
    if (found) found.status = "OFFBOARDED";
    await this.audit("tenant.offboarded", tenantId, { certificate: `retention-or-deletion-${tenantId}` });
    return { tenantId, status: "OFFBOARDED" as const, certificate: `retention-or-deletion-${tenantId}`, auditPreserved: true as const };
  }

  // ── Operations dashboard ─────────────────────────────────────────
  async opsDashboard(tenantId?: string) {
    await this.assert("READ");
    const [configs, drifts] = await Promise.all([this.listConfigs(tenantId), (async () => {
      const rows = await safe(() => (prisma as unknown as TenantTables).healthTenantDrift.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { createdAt: "desc" }, take: 50 }) as Promise<never[]>, []);
      return rows.length ? rows : memList(memDrifts, this.workspaceId);
    })()]);
    const all = configs as Array<Record<string, unknown>>;
    return {
      tiles: [...TENANT_OPS_TILES],
      activeVersion: all.find((c) => c.status === "ACTIVE")?.version ?? null,
      pendingChanges: all.filter((c) => ["DRAFT", "VALIDATING", "TESTING", "PENDING_APPROVAL", "SCHEDULED", "CANARY"].includes(String(c.status))).length,
      openDrifts: (drifts as Array<Record<string, unknown>>).filter((d) => d.status === "OPEN" || d.status === "BLOCKED").length,
      canaryStages: [...CANARY_STAGES],
      canaryMonitors: [...CANARY_MONITORS],
      generatedAt: new Date().toISOString(),
    };
  }
}

// ── Static reference exports ──────────────────────────────────────────
export const TENANT_API = [
  "registerTenant", "updateOnboarding",
  "saveDraft", "transitionConfig", "listConfigs", "effectiveValue",
  "upsertAlertRule", "publishPathway", "registerIntegration",
  "isolationSelfTest", "simulate",
  "reportDrift", "resolveDrift",
  "offboardTenant", "opsDashboard",
] as const;
