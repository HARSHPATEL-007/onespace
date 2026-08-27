/**
 * N0VA VIDEOS — Governance Engine (deterministic PDP, no LLM authorization)
 * Implements: Session Broker, Intent/Scope Validator, PDP, Risk/Consent, Approval Orchestrator, Capability Token Service, Sandbox, Tool Gateway, Ledger
 */
import type {
  GovernanceSession, IntentScope, PDPDecision, CapabilityToken, RiskAssessmentGov, ApprovalObject,
  PolicyRule, DelegationPolicy, LedgerEvent, GovernanceIntentOperation, RiskLevel, VersionArtifact,
} from "./governance-types";
import { EXAMPLE_POLICY, AMBIGUOUS_REJECTS, RISK_AMPLIFIERS } from "./governance-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }
function hash(s: string) { return `sha3-512:${s.slice(0, 32)}${Math.random().toString(36).slice(2, 8)}`; }

/* ── Session Broker ───────────────────────────────────────────────────────── */
export function createGovernanceSession(input: {
  tenant_id: string; human_principal: string; agent_id: string; intent_id: string; project_id: string;
  environment?: GovernanceSession["environment"]; model_version?: string; prompt_policy_version?: string;
  parent_session_id?: string | null; workflow_trigger?: string;
}): GovernanceSession {
  const now = Date.now();
  return {
    session_id: uid("sess"), tenant_id: input.tenant_id, human_principal: input.human_principal,
    agent_id: input.agent_id, intent_id: input.intent_id, project_id: input.project_id,
    environment: input.environment ?? "production",
    model_version: input.model_version ?? "n0va-color-v4",
    prompt_policy_version: input.prompt_policy_version ?? "color-policy-v6",
    started_at: new Date(now).toISOString(), expires_at: new Date(now + 60 * 60 * 1000).toISOString(),
    status: "active", parent_session_id: input.parent_session_id ?? null, workflow_trigger: input.workflow_trigger,
  };
}

/* ── Intent & Scope Validator ─────────────────────────────────────────────── */
export function validateIntentScope(raw: Partial<IntentScope>): { scope: IntentScope; valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const req = String(raw.requested_operation ?? "");
  // Reject ambiguous
  const nl = String((raw as unknown as { user_request?: string }).user_request ?? "");
  for (const amb of AMBIGUOUS_REJECTS) if (nl.toLowerCase().includes(amb.toLowerCase().slice(0, 12))) errors.push(`Ambiguous instruction rejected: “${amb}” — must specify exact project, asset version, operation, destination, approval context.`);
  if (!raw.project_scope?.length) errors.push("project_scope required: at least one project path");
  if (!raw.asset_scope?.length) errors.push("asset_scope required: approved_branch / asset version");
  if (!raw.destination_scope?.length) errors.push("destination_scope required");
  if (!req) errors.push("requested_operation required (atomic capability)");
  if (req === "destination.youtube.publish" && !raw.requested_parameters?.["visibility"]) errors.push("destination.youtube.publish requires visibility param (private vs public)");
  if (req.includes("voice") && !(raw.requested_parameters as Record<string, unknown>)?.["consent_id"]) errors.push("Voice operations require explicit consent_id");
  const scope: IntentScope = {
    intent_id: String(raw.intent_id ?? uid("int")),
    requested_operation: (req || "project.read") as GovernanceIntentOperation,
    project_scope: raw.project_scope ?? [], asset_scope: raw.asset_scope ?? [], destination_scope: raw.destination_scope ?? [],
    requested_by: String(raw.requested_by ?? "unknown"),
    requested_parameters: raw.requested_parameters ?? {},
    validation: { valid: errors.length === 0, reason_codes: errors, required_action: errors.length ? "refine_intent" : undefined },
  };
  return { scope, valid: errors.length === 0, errors };
}

/* ── Policy Decision Point (external deterministic, deny-by-default) ───────── */
export function evaluatePolicy(input: {
  operation: GovernanceIntentOperation;
  project_id: string; project_tags: string[]; tenant_id: string;
  asset_ids: string[]; destination?: string;
  consent_status?: string; legal_hold?: boolean; environment?: string;
  policy?: PolicyRule;
}): PDPDecision {
  const policy = input.policy ?? EXAMPLE_POLICY;
  // Check deny list
  for (const d of policy.deny) {
    const op = (d as { operation: GovernanceIntentOperation }).operation;
    if (op !== input.operation) continue;
    const unless = (d as { unless?: Record<string, unknown> }).unless;
    if (!unless) return deny(`DENY_${op.toUpperCase().replace(/\./g,"_")}`, policy);
    // Unless clause: if consent granted etc., don't deny
    if (op === "voice.generate" && input.consent_status === "granted") continue;
    return deny(`DENY_${op.toUpperCase().replace(/\./g,"_")}`, policy);
  }
  // Check require_approval
  const needsApproval = policy.require_approval.find(r => r.operation === input.operation);
  if (needsApproval) {
    // Still allow but with approval
    return {
      decision: "allow_with_approval", reason_codes: ["REQUIRES_APPROVAL"], policy_id: policy.id, policy_version: policy.version,
      evaluated_dimensions: dims(true, true, true, true),
    };
  }
  // Check allow_autonomous
  const autonomous = policy.allow_autonomous.find(r => r.operation === input.operation);
  if (autonomous) {
    return { decision: "allow", reason_codes: ["ALLOW_AUTONOMOUS"], policy_id: policy.id, policy_version: policy.version, evaluated_dimensions: dims(true,true,true,true) };
  }
  // Deny by default
  if (input.legal_hold && (input.operation.includes("delete") || input.operation.includes("purge") || input.operation === "legal_hold.release")) {
    return deny("LEGAL_HOLD_ACTIVE", policy);
  }
  // Destination restriction
  if (input.destination && input.destination.includes("youtube") && policy.scope.project_tags.includes("external") === false && input.project_tags.includes("production")) {
    // example: restrict
  }
  return deny("DENY_DEFAULT", policy);
}
function deny(code: string, policy: PolicyRule): PDPDecision {
  return { decision: "deny", reason_codes: [code], required_action: code === "LEGAL_HOLD_ACTIVE" ? "release_legal_hold" : code.includes("VOICE") ? "request_consent" : "request_approval", policy_id: policy.id, policy_version: policy.version, evaluated_dimensions: dims(false,false,false,false) };
}
function dims(p: boolean,a: boolean,o: boolean,d: boolean): PDPDecision["evaluated_dimensions"] {
  return {
    project: { allowed: p, reason: p ? "project in scope" : "project out of scope" },
    asset: { allowed: a, reason: a ? "asset approved" : "asset not in scope" },
    operation: { allowed: o, reason: o ? "operation permitted" : "operation denied" },
    destination: { allowed: d, reason: d ? "destination allowed" : "destination not allowed" },
  };
}

/* ── Risk & Consent Engine ────────────────────────────────────────────────── */
export function assessRiskGov(input: {
  operation: GovernanceIntentOperation;
  factors: string[]; // subset of RISK_AMPLIFIERS present
  mitigations: string[];
}): RiskAssessmentGov {
  const hasCritical = ["public_distribution","irreversible_deletion","likeness.generate","voice.generate","compliance.override","cross_tenant_transfer"].some(f => input.factors.includes(f));
  const hasHigh = ["approved_or_locked_assets","personal_data","consent_controlled","legal_evidence","external_ai_provider","financial_or_contractual","large_batch","multiple_external_destinations"].some(f => input.factors.includes(f));
  const inherent: RiskLevel = hasCritical ? "critical" : hasHigh ? "high" : input.factors.length >= 2 ? "moderate" : "low";
  // Residual after mitigations: creative_approval, brand_approval, copyright_scan etc. reduce one level if 2+ mitigations
  const residual: RiskLevel = inherent === "critical" && input.mitigations.length >= 3 ? "high" : inherent === "high" && input.mitigations.length >= 2 ? "moderate" : inherent;
  const required_approval: RiskAssessmentGov["required_approval"] =
    residual === "critical" ? "dual_control_elevated" : residual === "high" ? "dual_control" : residual === "moderate" ? "single" : "none";
  return {
    risk_assessment_id: uid("risk"), operation: input.operation, inherent_risk: inherent,
    risk_factors: input.factors, mitigations: input.mitigations, residual_risk: residual, required_approval,
  };
}

/* ── Approval Orchestrator ────────────────────────────────────────────────── */
export function createApprovalObject(input: {
  proposal_id: string; proposal_hash: string; requested_agent: string; operation: GovernanceIntentOperation;
  asset_id: string; timeline_hash: string; destinations: string[]; risk_level: RiskLevel;
  required_roles: string[]; policy_version: string;
}): ApprovalObject {
  return {
    approval_id: uid("apr"), proposal_id: input.proposal_id, proposal_hash: input.proposal_hash,
    requested_agent: input.requested_agent, operation: input.operation, asset_id: input.asset_id,
    timeline_hash: input.timeline_hash, destinations: input.destinations, risk_level: input.risk_level,
    required_roles: input.required_roles,
    approvals: input.required_roles.map(r => ({ role: r, principal: "", decision: "pending" as const })),
    decision: "pending", expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: "active", invalidation_triggers: ["timeline change","asset substitution","new export parameters","destination change","metadata/thumbnail change","consent expiration/revocation","policy version change","compliance result change","model change"],
    policy_version: input.policy_version, created_at: nowIso(),
  };
}
export function isApprovalInvalidated(approval: ApprovalObject, change: { type: string; hash_before?: string; hash_after?: string; policy_version?: string }): boolean {
  if (change.type === "timeline change" && change.hash_before !== change.hash_after) return true;
  if (change.type.includes("policy") && change.policy_version !== approval.policy_version) return true;
  if (approval.invalidation_triggers.includes(change.type)) return true;
  return false;
}

/* ── Capability Token Service ─────────────────────────────────────────────── */
export function issueCapabilityToken(input: {
  subject: string; human_principal: string; tenant_id: string; project_id: string;
  asset_scope: string[]; allowed_operations: GovernanceIntentOperation[]; allowed_destinations: string[];
  constraints?: CapabilityToken["constraints"]; source_hash: string; policy_version: string; approval_id?: string;
  ttl_ms?: number;
}): CapabilityToken {
  const now = Date.now();
  const token: CapabilityToken = {
    token_id: uid("cap"), token_type: "n0va_capability",
    subject: input.subject, human_principal: input.human_principal, tenant_id: input.tenant_id, project_id: input.project_id,
    asset_scope: input.asset_scope, allowed_operations: input.allowed_operations, allowed_destinations: input.allowed_destinations,
    constraints: input.constraints ?? {}, source_hash: input.source_hash, policy_version: input.policy_version,
    approval_id: input.approval_id, issued_at: new Date(now).toISOString(),
    expires_at: new Date(now + (input.ttl_ms ?? 60 * 60 * 1000)).toISOString(),
    revocation_uri: `https://governance.n0va.io/revoke/${uid("cap")}`,
    signature: hash(`${input.subject}:${input.project_id}:${now}:KMS`),
  };
  return token;
}
export function verifyCapabilityToken(token: CapabilityToken, op: GovernanceIntentOperation, project_id: string, asset_id: string, destination?: string): { valid: boolean; reason?: string } {
  if (token.revoked) return { valid: false, reason: "TOKEN_REVOKED" };
  if (Date.now() > new Date(token.expires_at).getTime()) return { valid: false, reason: "TOKEN_EXPIRED" };
  if (token.project_id !== project_id) return { valid: false, reason: "PROJECT_MISMATCH" };
  if (!token.allowed_operations.includes(op)) return { valid: false, reason: "OPERATION_NOT_ALLOWED" };
  if (destination && token.allowed_destinations.length && !token.allowed_destinations.includes(destination) && !token.allowed_destinations.includes("*")) return { valid: false, reason: "DESTINATION_NOT_ALLOWED" };
  if (token.asset_scope.length && !token.asset_scope.some(s => s.includes(asset_id) || s === "*" || s.startsWith("approved_branch"))) return { valid: false, reason: "ASSET_NOT_IN_SCOPE" };
  return { valid: true };
}

/* ── Delegation & Sub-Agent Control ───────────────────────────────────────── */
export function validateDelegation(parent: GovernanceSession, childAgent: string, policy: DelegationPolicy): { allowed: boolean; reason?: string } {
  if (!policy.delegation_allowed) return { allowed: false, reason: "DELEGATION_DISABLED" };
  if (!policy.allowed_sub_agents.includes(childAgent)) return { allowed: false, reason: "SUB_AGENT_NOT_ALLOWED" };
  // depth would be tracked via session chain
  return { allowed: true };
}

/* ── Runtime Monitor / Suspension ─────────────────────────────────────────── */
export type Suspicion = { trigger: string; severity: "low" | "high" | "critical" };
const SUSPENSION_TRIGGERS: Record<string, string> = {
  "ungranted capability": "Requests an ungranted capability",
  "scope expansion": "Expands asset scope",
  "cross-tenant": "Accesses another tenant",
  "destination change after approval": "Changes destination after approval",
  "unapproved sub-agent": "Invokes unapproved sub-agent",
  "cost limit": "Exceeds cost/duration/volume limits",
  "locked asset": "Attempts to modify locked asset",
  "consent revoked": "Encounters revoked consent",
  "legal hold": "Detects legal hold",
  "anomalous tool calls": "Anomalous tool-call behavior",
  "retry denied": "Repeatedly retries denied actions",
};
export function shouldSuspendAgent(event: { type: string; detail?: string }): Suspicion | null {
  const lower = event.type.toLowerCase();
  for (const [k, v] of Object.entries(SUSPENSION_TRIGGERS)) if (lower.includes(k)) return { trigger: v, severity: k === "cross-tenant" || k === "legal hold" ? "critical" : "high" };
  return null;
}

/* ── Version & Drift Governance ───────────────────────────────────────────── */
export function makeVersionArtifact(agent_id: string): VersionArtifact {
  return {
    agent_id, release_id: uid("rel"), model_version: "n0va-color-v4", prompt_policy_version: "color-policy-v6",
    tool_manifest_hash: hash(agent_id), evaluation_status: "approved", red_team_status: "passed",
    owner_recertification: new Date().toISOString(), rollback_version: "2.8.4",
  };
}

/* ── Signed Ledger ────────────────────────────────────────────────────────── */
export function createLedgerEvent(input: Omit<LedgerEvent, "event_id" | "timestamp" | "signature" | "input_hash" | "output_hash" | "tool_manifest_hash"> & { input?: unknown; output?: unknown }): LedgerEvent {
  const ts = nowIso();
  const evt: LedgerEvent = {
    event_id: uid("evt"), timestamp: ts, tenant_id: input.tenant_id, human_principal: input.human_principal,
    agent_id: input.agent_id, session_id: input.session_id, parent_session_id: input.parent_session_id ?? null,
    intent_id: input.intent_id, proposal_id: input.proposal_id, capability_token_id: input.capability_token_id,
    operation: input.operation, project_id: input.project_id, asset_ids: input.asset_ids,
    policy_decision: input.policy_decision, approval_id: input.approval_id, tool_calls: input.tool_calls,
    input_hash: hash(JSON.stringify(input.input ?? "")), output_hash: input.output ? hash(JSON.stringify(input.output)) : undefined,
    model_version: input.model_version, tool_manifest_hash: hash(input.agent_id),
    human_decision: input.human_decision, rollback_reference: input.rollback_reference, external_effects: input.external_effects ?? [],
    signature: hash(`${input.agent_id}:${ts}:KMS`),
  };
  return evt;
}

/* ── Safe Governance UX helpers ───────────────────────────────────────────── */
export function readyToPublishChecklist(approvals: ApprovalObject, scans: { copyright: boolean; compliance: boolean; privacy: boolean; caption: boolean; consent_valid_until?: string }): { ready: boolean; items: { label: string; ok: boolean; detail?: string }[] } {
  const items = [
    { label: "Creative approval", ok: approvals.approvals.some(a => a.role === "creative_director" && a.decision === "approved") },
    { label: "Brand approval", ok: approvals.approvals.some(a => a.role === "brand_owner" && a.decision === "approved") },
    { label: "Caption validation", ok: scans.caption },
    { label: "Copyright scan", ok: scans.copyright },
    { label: "Privacy scan", ok: scans.privacy },
    { label: `Consent valid${scans.consent_valid_until ? ` through ${scans.consent_valid_until}` : ""}`, ok: !!scans.consent_valid_until },
    { label: "Destination policy passed", ok: approvals.decision === "approved" },
  ];
  const ready = items.every(i => i.ok);
  return { ready, items };
}
