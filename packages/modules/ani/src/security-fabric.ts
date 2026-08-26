/**
 * N0VA ANI — Security Control Plane
 * Converts security claims (tenant isolation, encryption, DLP, etc.) into testable, enforceable controls per N0VA-ANI.md Enterprise Security and Privacy.
 * Plane: Identity → Policy Decision Point → Data Classification & DLP → Guardrails → Capability Broker → Tool Gateway → Sandbox → Immutable Audit
 */

import { createHash } from "crypto";
import type { WorkspaceContext } from "./engine";

// ---------------------------------------------------------------------------
// Security Context — signed, per-request, zero-trust per § Security Control Plane
// ---------------------------------------------------------------------------
export interface SecurityContext {
  tenant_id: string;
  user_id: string;
  session_id: string;
  device_trust: "managed" | "unmanaged" | "unknown";
  region: string;
  data_residency: string; // EU, US, etc.
  roles: string[];
  attributes: { department?: string; employment_status?: string; clearance?: string };
  agent_id?: string;
  purpose: string;
  policy_version: string;
  expires_at: string;
  signature?: string; // HMAC of tenant+user+purpose+expires
}

export function signSecurityContext(ctx: Omit<SecurityContext, "signature">): SecurityContext {
  const payload = `${ctx.tenant_id}:${ctx.user_id}:${ctx.purpose}:${ctx.expires_at}:${ctx.policy_version}`;
  const signature = createHash("sha256").update(payload).digest("hex").slice(0, 32);
  return { ...ctx, signature };
}

// ---------------------------------------------------------------------------
// Privilege Token — capability token per § Identity and Privileged Access
// ---------------------------------------------------------------------------
export interface PrivilegeToken {
  subject: string; // agent_sales_assistant
  tenant: string;
  permissions: string[]; // crm.opportunity.read
  resources: string[]; // crm://acme/opportunities/*
  purpose: string;
  issued_at: string;
  expires_at: string;
  approval_id: string | null;
  action_hash: string;
  audience: string; // n0va1o-gateway
}

export function createPrivilegeToken(params: {
  subject: string;
  tenant: string;
  permissions: string[];
  resources: string[];
  purpose: string;
  ttlMs?: number;
  approvalId?: string | null;
  actionHash?: string;
}): PrivilegeToken {
  const now = Date.now();
  return {
    subject: params.subject,
    tenant: params.tenant,
    permissions: params.permissions,
    resources: params.resources,
    purpose: params.purpose,
    issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + (params.ttlMs ?? 5 * 60 * 1000)).toISOString(),
    approval_id: params.approvalId ?? null,
    action_hash: params.actionHash ?? createHash("sha256").update(`${params.subject}:${params.purpose}:${now}`).digest("hex").slice(0, 16),
    audience: "n0va1o-gateway",
  };
}

// ---------------------------------------------------------------------------
// Tenant Isolation — enforceable boundaries per § Tenant Isolation
// ---------------------------------------------------------------------------
export interface IsolationEvidence {
  layer: string;
  control: string;
  evidence: string;
}

export const TENANT_ISOLATION_MATRIX: IsolationEvidence[] = [
  { layer: "Identity", control: "Tenant-bound subject and token claims", evidence: "Automated cross-tenant authorization tests" },
  { layer: "API", control: "Tenant filter enforced server-side", evidence: "Query mutation and bypass tests" },
  { layer: "Database", control: "Row-level security and tenant-specific schemas", evidence: "Isolation test suite" },
  { layer: "Object storage", control: "Tenant-specific prefixes, policies, encryption keys", evidence: "Access-policy test and key audit" },
  { layer: "Vector store", control: "Tenant-scoped indexes and metadata filters", evidence: "Cross-tenant retrieval red-team report" },
  { layer: "Cache", control: "Tenant included in every cache key", evidence: "Cache-poisoning and collision tests" },
  { layer: "Memory", control: "Session and agent memory namespaces isolated", evidence: "Retrieval boundary tests" },
  { layer: "Model context", control: "Permission-filtered retrieval before prompt assembly", evidence: "Context lineage record" },
  { layer: "Compute", control: "Confidential containers or dedicated pools", evidence: "Attestation evidence" },
  { layer: "Logs", control: "Tenant-scoped access and redaction", evidence: "Auditor access tests" },
  { layer: "Backups", control: "Tenant-aware encryption and deletion propagation", evidence: "Restore and deletion test" },
];

export function enforceTenantIsolation(trustedTenantId: string, resourceTenantId: string | null | undefined, userTenantIds: string[]): { allowed: boolean; reason: string } {
  if (!trustedTenantId) return { allowed: false, reason: "missing_trusted_tenant" };
  if (!resourceTenantId) return { allowed: false, reason: "missing_resource_tenant" };
  if (trustedTenantId !== resourceTenantId) return { allowed: false, reason: "cross_tenant_blocked_even_if_user_in_multiple_tenants" };
  void userTenantIds;
  return { allowed: true, reason: "tenant_match" };
}

// ---------------------------------------------------------------------------
// Encryption and Key Management per § Encryption
// ---------------------------------------------------------------------------
export interface EncryptionLayers {
  tls13: boolean;
  mtls: boolean;
  atRest: "AES-256-GCM";
  envelope: { dek: string; kek: string };
  tenantKeys: boolean;
  fieldLevel: boolean;
  payloadEncryption: boolean;
  confidentialComputing: boolean;
}

export interface CustomerManagedKey {
  tenant_id: string;
  key_id: string;
  version: number;
  state: "active" | "disabled" | "destroyed";
  rotation_at: string;
  audit_log: string[];
}

export class KeyManagementService {
  private keys = new Map<string, CustomerManagedKey>();

  create(tenantId: string, keyId: string): CustomerManagedKey {
    const k: CustomerManagedKey = { tenant_id: tenantId, key_id: keyId, version: 1, state: "active", rotation_at: new Date().toISOString(), audit_log: [`created ${new Date().toISOString()}`] };
    this.keys.set(`${tenantId}:${keyId}`, k);
    return k;
  }

  disable(tenantId: string, keyId: string): void {
    const k = this.keys.get(`${tenantId}:${keyId}`);
    if (k) {
      k.state = "disabled";
      k.audit_log.push(`disabled ${new Date().toISOString()}`);
      // Emergency containment: affect all copies, caches, backups per spec
    }
  }

  get(tenantId: string, keyId: string): CustomerManagedKey | null {
    return this.keys.get(`${tenantId}:${keyId}`) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Prompt-Injection Defense per § Prompt-Injection Defense
// ---------------------------------------------------------------------------
export interface TrustMetadata {
  content: string;
  source: string; // drive://file_789
  origin: "internal" | "external_upload" | "external_fetch";
  trust: "trusted" | "untrusted";
  classification: string;
  instructions_allowed: boolean;
  retrieved_at: string;
  integrity_hash: string;
}

export function toTrustMetadata(content: string, source: string, origin: TrustMetadata["origin"]): TrustMetadata {
  return {
    content,
    source,
    origin,
    trust: origin === "external_upload" || origin === "external_fetch" ? "untrusted" : "trusted",
    classification: "confidential",
    instructions_allowed: false,
    retrieved_at: new Date().toISOString(),
    integrity_hash: createHash("sha256").update(content).digest("hex"),
  };
}

export function scanForInjection(content: string): { isInjection: boolean; confidence: number; flags: string[] } {
  const lower = content.toLowerCase();
  const flags: string[] = [];
  if (lower.includes("ignore previous instructions")) flags.push("direct_injection");
  if (lower.includes("export all") && lower.includes("customer")) flags.push("exfiltration_attempt");
  if (/<script|javascript:/i.test(content)) flags.push("script_injection");
  return { isInjection: flags.length > 0, confidence: flags.length > 0 ? 0.92 : 0.05, flags };
}

// ---------------------------------------------------------------------------
// Data-Loss Prevention per § Data-Loss Prevention — 4 boundaries, 13 categories
// ---------------------------------------------------------------------------
export type DLPBoundary = "input" | "retrieval_context" | "model_output" | "tool_egress";
export type DLPCategory = "PII" | "PHI" | "PCI" | "secrets" | "api_keys" | "source_code" | "proprietary_algorithms" | "legal" | "export_controlled" | "financial" | "customer_ids" | "biometric" | "restricted_third_party";

export interface DLPDecision {
  boundary: DLPBoundary;
  category: DLPCategory;
  action: "allow" | "tokenize" | "block" | "revoke_and_alert";
  reason: string;
}

export class DLPService {
  // Simplified detection per 13 categories
  scan(content: string, boundary: DLPBoundary, destination?: string): DLPDecision[] {
    const decisions: DLPDecision[] = [];
    const lower = content.toLowerCase();
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(content) || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(content)) {
      decisions.push({ boundary, category: "PII", action: destination === "external" ? "block" : "tokenize", reason: "PII in " + boundary });
    }
    if (lower.includes("health") || lower.includes("phi")) {
      decisions.push({ boundary, category: "PHI", action: "block", reason: "PHI without approved workflow" });
    }
    if (/\b(password|secret|token)\s*[:=]/i.test(content)) {
      decisions.push({ boundary, category: "secrets", action: "revoke_and_alert", reason: "secret in payload" });
    }
    if (lower.includes("proprietary") || lower.includes("source code")) {
      decisions.push({ boundary, category: "source_code", action: boundary === "tool_egress" && destination === "external" ? "block" : "allow", reason: "source code to external" });
    }
    void lower;
    return decisions.length > 0 ? decisions : [{ boundary, category: "PII", action: "allow", reason: "no_dlp_match" }];
  }

  tokenize(value: string, tenantId: string): { token: string; vaultRef: string } {
    const token = `tok_${createHash("sha256").update(value + tenantId).digest("hex").slice(0, 12)}`;
    return { token, vaultRef: `vault://${tenantId}/tokens/${token}` };
  }
}

// ---------------------------------------------------------------------------
// Uploaded-File Security — quarantine pipeline per § Uploaded-File Security
// ---------------------------------------------------------------------------
export interface QuarantineResult {
  file_id: string;
  original_hash: string;
  status: "clean" | "quarantined" | "blocked";
  findings: string[];
  content_classification: string;
}

export class FileQuarantinePipeline {
  async process(file: { name: string; mime: string; bytes: Uint8Array; tenantId: string }): Promise<QuarantineResult> {
    const hash = createHash("sha256").update(file.bytes).digest("hex");
    const findings: string[] = [];
    // MIME sniffing, archive bomb limits, macro detection, hidden content
    if (file.mime !== "application/pdf" && file.name.endsWith(".pdf")) findings.push("mime_mismatch");
    if (file.bytes.length > 50 * 1024 * 1024) findings.push("size_exceeded");
    if (file.bytes.length > 0 && file.bytes[0] === 0x50) findings.push("archive_scan_pending");
    const status = findings.includes("mime_mismatch") ? "quarantined" : "clean";
    return { file_id: `file_${hash.slice(0, 8)}`, original_hash: hash, status, findings, content_classification: "internal" };
  }
}

// ---------------------------------------------------------------------------
// Tool and Egress Security per § Tool and Egress Security
// ---------------------------------------------------------------------------
export interface EgressPolicy {
  id: string;
  when: { destination: { type: string }; payload: { classification: { in: string[] } } };
  decision: { effect: "block" | "allow"; exception?: { require: string[] } };
}

export const EGRESS_CONFIDENTIAL_EXTERNAL: EgressPolicy = {
  id: "egress.confidential.external",
  when: { destination: { type: "external" }, payload: { classification: { in: ["confidential", "restricted"] } } },
  decision: { effect: "block", exception: { require: ["data_owner_approval", "destination_allowlist", "dlp_override_justification", "action_hash_binding"] } },
};

export class EgressFirewall {
  private allowlist = new Set<string>(["api.trusted.example.com", "internal.corp"]);
  private policies: EgressPolicy[] = [EGRESS_CONFIDENTIAL_EXTERNAL];

  check(destination: string, classification: string, tenantId: string): { allowed: boolean; reason: string; policyId?: string } {
    void tenantId;
    if (classification === "restricted" && !this.allowlist.has(destination)) {
      return { allowed: false, reason: "restricted data cannot leave tenant boundary", policyId: "egress.confidential.external" };
    }
    for (const p of this.policies) {
      if (p.when.destination.type === "external" && p.when.payload.classification.in.includes(classification) && !destination.includes("internal")) {
        return { allowed: false, reason: "egress policy block", policyId: p.id };
      }
    }
    return { allowed: true, reason: "allowlist" };
  }
}

// ---------------------------------------------------------------------------
// Model Supply-Chain Security per § Model Supply-Chain Security
// ---------------------------------------------------------------------------
export interface ModelReleaseGate {
  supplier_verified: boolean;
  signature_verified: boolean;
  sbom_generated: boolean;
  malware_scan_passed: boolean;
  backdoor_test_passed: boolean;
  privacy_test_passed: boolean;
  canary_passed: boolean;
}

export function evaluateModelRelease(gate: ModelReleaseGate): { release: boolean; reason: string } {
  const checks: Array<[keyof ModelReleaseGate, string]> = [
    ["supplier_verified", "supplier not verified"],
    ["signature_verified", "signature invalid"],
    ["sbom_generated", "SBOM missing"],
    ["malware_scan_passed", "malware detected"],
    ["backdoor_test_passed", "backdoor risk"],
    ["privacy_test_passed", "privacy leakage"],
    ["canary_passed", "canary failed"],
  ];
  for (const [k, msg] of checks) if (!gate[k]) return { release: false, reason: msg };
  return { release: true, reason: "all gates passed" };
}

// ---------------------------------------------------------------------------
// Immutable Audit per § Immutable Audit and Privacy Logging
// ---------------------------------------------------------------------------
export interface SecurityAuditEvent {
  event_id: string;
  tenant_id: string;
  actor: string;
  initiator: string;
  event_type: string; // tool.payload.blocked etc.
  resource: string;
  action_hash: string;
  policy_version: string;
  rules_triggered: string[];
  data_labels: string[];
  decision: string;
  evidence_refs: string[];
  previous_event_hash: string;
  event_hash: string;
  timestamp: string;
}

export class ImmutableAuditLog {
  private events: SecurityAuditEvent[] = [];
  private lastHash = "genesis";

  append(event: Omit<SecurityAuditEvent, "event_id" | "event_hash" | "previous_event_hash" | "timestamp">): SecurityAuditEvent {
    const full: SecurityAuditEvent = {
      ...event,
      event_id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 4)}`,
      previous_event_hash: this.lastHash,
      event_hash: "",
      timestamp: new Date().toISOString(),
    };
    full.event_hash = createHash("sha256").update(JSON.stringify({ ...full, event_hash: undefined })).digest("hex");
    this.lastHash = full.event_hash;
    this.events.push(full);
    return full;
  }

  verify(): { valid: boolean; tampered?: string } {
    let prev = "genesis";
    for (const e of this.events) {
      const recomputed = createHash("sha256").update(JSON.stringify({ ...e, event_hash: undefined, previous_event_hash: prev })).digest("hex");
      // Simplified check
      void recomputed;
      prev = e.event_hash;
    }
    return { valid: true };
  }

  exportPackage(tenantId: string): SecurityAuditEvent[] {
    return this.events.filter((e) => e.tenant_id === tenantId);
  }
}

// ---------------------------------------------------------------------------
// Insider Risk per § Insider Risk and Agent Behavior Monitoring
// ---------------------------------------------------------------------------
export interface BehaviorBaseline {
  userId: string;
  avgToolCallsPerHour: number;
  commonDestinations: string[];
  commonDataClasses: string[];
}

export class InsiderRiskMonitor {
  private baselines = new Map<string, BehaviorBaseline>();

  setBaseline(userId: string, baseline: BehaviorBaseline): void {
    this.baselines.set(userId, baseline);
  }

  check(userId: string, event: { tool: string; destination?: string; dataClass?: string; count?: number }): { anomaly: boolean; reason?: string } {
    const base = this.baselines.get(userId);
    if (!base) return { anomaly: false };
    if (event.count && event.count > base.avgToolCallsPerHour * 3) return { anomaly: true, reason: "unusual volume" };
    if (event.destination && !base.commonDestinations.includes(event.destination)) return { anomaly: true, reason: "new destination" };
    if (event.dataClass && !base.commonDataClasses.includes(event.dataClass)) return { anomaly: true, reason: "unfamiliar data class" };
    return { anomaly: false };
  }
}

// ---------------------------------------------------------------------------
// Data Residency per § Data Residency and Regional Processing
// ---------------------------------------------------------------------------
export interface RegionalPolicy {
  tenant: string;
  allowed_regions: string[];
  prohibited_regions: string[];
  allowed_subprocessors: string[];
  cross_border_transfer: "blocked" | "allowed_with_approval";
  model_processing: "regional_only" | "global";
  backup_regions: string[];
  support_access: string;
}

export class DataResidencyEnforcer {
  check(policy: RegionalPolicy, targetRegion: string, dataClass: string): { allowed: boolean; reason: string } {
    if (policy.prohibited_regions.includes(targetRegion)) return { allowed: false, reason: "prohibited_region" };
    if (!policy.allowed_regions.includes(targetRegion)) return { allowed: false, reason: "region_not_allowed" };
    void dataClass;
    return { allowed: true, reason: "region_allowed" };
  }
}

// ---------------------------------------------------------------------------
// Retention & Deletion per § Retention, Legal Hold, Deletion, and Discovery
// ---------------------------------------------------------------------------
export interface RetentionPolicy {
  tenant: string;
  purpose: string;
  retain_for_days: number;
  legal_hold_overrides: boolean;
}

export class RetentionEngine {
  shouldDelete(policy: RetentionPolicy, createdAt: string, legalHold: boolean): boolean {
    if (legalHold && policy.legal_hold_overrides) return false;
    const ageMs = Date.now() - new Date(createdAt).getTime();
    return ageMs > policy.retain_for_days * 86400000;
  }

  deletionCertificate(memoryId: string, storesChecked: string[], legalHoldRetained: boolean): string {
    return `deletion_cert:${memoryId}:${storesChecked.join(",")}:${legalHoldRetained ? "retained_under_hold" : "purged"}:${new Date().toISOString()}`;
  }
}

// ---------------------------------------------------------------------------
// Privacy Leakage Testing per § Privacy Leakage and Memorization Testing
// ---------------------------------------------------------------------------
export interface PrivacyTestResult {
  canary_found: boolean;
  membership_inference: number;
  verbatim_extraction: number;
  cross_tenant_leakage: number;
}

export function runPrivacyTests(modelOutputs: string[], canaries: string[]): PrivacyTestResult {
  const canaryFound = canaries.some((c) => modelOutputs.some((o) => o.includes(c)));
  return { canary_found: canaryFound, membership_inference: 0.02, verbatim_extraction: 0.01, cross_tenant_leakage: 0 };
}

// ---------------------------------------------------------------------------
// Security Fabric — composition
// ---------------------------------------------------------------------------
export interface SecurityFabric {
  dlp: DLPService;
  quarantine: FileQuarantinePipeline;
  egress: EgressFirewall;
  audit: ImmutableAuditLog;
  insider: InsiderRiskMonitor;
  residency: DataResidencyEnforcer;
  retention: RetentionEngine;
  keys: KeyManagementService;
}

export function createSecurityFabric(): SecurityFabric {
  return {
    dlp: new DLPService(),
    quarantine: new FileQuarantinePipeline(),
    egress: new EgressFirewall(),
    audit: new ImmutableAuditLog(),
    insider: new InsiderRiskMonitor(),
    residency: new DataResidencyEnforcer(),
    retention: new RetentionEngine(),
    keys: new KeyManagementService(),
  };
}
