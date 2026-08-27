/**
 * N0VA VIDEOS — Enhanced Agent Governance Architecture
 * Governed Agent Operating System: least privilege, consent, approval, provenance, reversibility, tenant isolation
 * LLM may propose, never authorize. Authorization via external deterministic PDP.
 */

export type GovernanceIntentOperation =
  | "project.read" | "project.metadata.read"
  | "asset.original.read" | "asset.proxy.read" | "asset.approved.read" | "asset.draft.write" | "asset.master.write"
  | "timeline.branch.create" | "timeline.branch.write" | "timeline.master.write"
  | "transcript.create" | "caption.translate" | "color.grade.draft" | "color.grade.approved"
  | "voice.generate" | "face.detect" | "face.match" | "likeness.generate" | "export.derivative.create"
  | "destination.review.upload" | "destination.youtube.upload_private" | "destination.youtube.publish"
  | "asset.soft_delete" | "asset.cryptographic_purge" | "compliance.override" | "legal_hold.release"
  // legacy compat
  | "asset.proxy.generate" | "timeline.marker.create" | "caption.create" | "render.review_derivative"
  | "face.track" | "identity.label" | "face.blur" | "face.replace";

export const ATOMIC_CAPABILITIES: GovernanceIntentOperation[] = [
  "project.read","project.metadata.read","asset.original.read","asset.proxy.read","asset.approved.read",
  "asset.draft.write","asset.master.write","timeline.branch.create","timeline.branch.write","timeline.master.write",
  "transcript.create","caption.translate","color.grade.draft","color.grade.approved","voice.generate","face.detect","face.match","likeness.generate",
  "export.derivative.create","destination.review.upload","destination.youtube.upload_private","destination.youtube.publish",
  "asset.soft_delete","asset.cryptographic_purge","compliance.override","legal_hold.release",
];

export type GovernanceSession = {
  session_id: string;
  tenant_id: string;
  human_principal: string; // user_204, immutable accountability
  agent_id: string; // agent.video.export.v3
  intent_id: string;
  project_id: string;
  environment: "production" | "staging" | "development";
  model_version: string;
  prompt_policy_version: string;
  started_at: string;
  expires_at: string;
  status: "active" | "expired" | "revoked" | "suspended";
  parent_session_id: string | null; // delegation chain
  workflow_trigger?: string;
};

export type IntentScope = {
  intent_id: string;
  requested_operation: GovernanceIntentOperation;
  project_scope: string[]; // ["marketing/q3-launch"]
  asset_scope: string[]; // ["approved_branch:tl_07"]
  destination_scope: string[]; // ["review_portal"] or ["youtube:private"]
  requested_by: string;
  requested_parameters: Record<string, unknown>;
  validation: { valid: boolean; reason_codes?: string[]; required_action?: string };
};

export const AMBIGUOUS_REJECTS = [
  "Publish the video everywhere.",
  "Clean up old assets.",
  "Use the speaker’s voice.",
  "Send this to the client.",
  "Make the compliance issue go away.",
];

export type PDPDecision = {
  decision: "allow" | "deny" | "allow_with_approval";
  reason_codes: string[];
  required_action?: string;
  policy_id: string;
  policy_version: number;
  evaluated_dimensions: {
    project: { allowed: boolean; matched?: string; reason?: string };
    asset: { allowed: boolean; matched?: string; reason?: string };
    operation: { allowed: boolean; matched?: string; reason?: string };
    destination: { allowed: boolean; matched?: string; reason?: string };
  };
};

export type CapabilityToken = {
  token_id: string;
  token_type: "n0va_capability";
  subject: string; // agent
  human_principal: string;
  tenant_id: string;
  project_id: string;
  asset_scope: string[];
  allowed_operations: GovernanceIntentOperation[];
  allowed_destinations: string[];
  constraints: {
    max_exports?: number;
    max_duration_seconds?: number;
    max_gpu_minutes?: number;
    max_file_size_bytes?: number;
    max_batch_assets?: number;
    [k: string]: number | undefined;
  };
  source_hash: string; // sha3-512:timeline_hash
  policy_version: string;
  approval_id?: string;
  issued_at: string;
  expires_at: string;
  revocation_uri: string;
  signature: string; // HMAC / KMS signed
  revoked?: boolean;
};

export type AutonomyProfile = {
  profile_id: string;
  label: string;
  allowed_operations: GovernanceIntentOperation[];
  blocked_operations: GovernanceIntentOperation[];
  max_batch_assets: number;
  max_external_destinations: number;
  approval_ttl_hours: number;
  recertification_interval_days: number;
};

export const AUTONOMY_PROFILES: AutonomyProfile[] = [
  {
    profile_id: "autonomy_marketing_low_risk_v2",
    label: "Marketing — Low Risk (default)",
    allowed_operations: ["asset.proxy.generate","transcript.create","timeline.marker.create","caption.create","render.review_derivative"] as GovernanceIntentOperation[],
    blocked_operations: ["destination.youtube.publish","asset.cryptographic_purge","voice.generate","likeness.generate","compliance.override"] as GovernanceIntentOperation[],
    max_batch_assets: 100, max_external_destinations: 1, approval_ttl_hours: 24, recertification_interval_days: 30,
  },
  {
    profile_id: "autonomy_editor_controlled",
    label: "Editor — Controlled Autonomous",
    allowed_operations: ["timeline.branch.create","timeline.branch.write","color.grade.draft","caption.translate","export.derivative.create"] as GovernanceIntentOperation[],
    blocked_operations: ["timeline.master.write","destination.youtube.publish","asset.soft_delete","likeness.generate"] as GovernanceIntentOperation[],
    max_batch_assets: 50, max_external_destinations: 2, approval_ttl_hours: 48, recertification_interval_days: 14,
  },
  {
    profile_id: "autonomy_publishing_locked",
    label: "Publishing — Fully Governed",
    allowed_operations: ["destination.review.upload"] as GovernanceIntentOperation[],
    blocked_operations: ["destination.youtube.publish","asset.cryptographic_purge","voice.generate","face.match","compliance.override"] as GovernanceIntentOperation[],
    max_batch_assets: 10, max_external_destinations: 1, approval_ttl_hours: 12, recertification_interval_days: 7,
  },
];

export type RiskLevel = "low" | "moderate" | "high" | "critical";

export type RiskAssessmentGov = {
  risk_assessment_id: string;
  operation: GovernanceIntentOperation;
  inherent_risk: RiskLevel;
  risk_factors: string[];
  mitigations: string[];
  residual_risk: RiskLevel;
  required_approval: "none" | "single" | "dual_control" | "dual_control_elevated";
};

export const RISK_TABLE: { level: RiskLevel; examples: string; default_behavior: string }[] = [
  { level: "low", examples: "Search, metadata read, markers, duration analysis", default_behavior: "Automatic" },
  { level: "moderate", examples: "Draft edits, captions, proxy generation, audio normalization", default_behavior: "Automatic within draft scope" },
  { level: "high", examples: "Approved timeline changes, client exports, external notifications, uploads", default_behavior: "Human approval" },
  { level: "critical", examples: "Public publishing, voice cloning, likeness generation, deletion, compliance override", default_behavior: "Mandatory elevated approval" },
];

export const RISK_AMPLIFIERS = [
  "public_distribution","sensitive_or_regulated","approved_or_locked_assets","personal_data","consent_controlled","legal_evidence","cross_tenant_transfer","external_ai_provider","irreversible_deletion","financial_or_contractual","large_batch","multiple_external_destinations",
];

export type ApprovalObject = {
  approval_id: string;
  proposal_id: string;
  proposal_hash: string; // sha3-512
  requested_agent: string;
  operation: GovernanceIntentOperation;
  asset_id: string;
  timeline_hash: string;
  destinations: string[];
  risk_level: RiskLevel;
  required_roles: string[]; // ["creative_director","brand_owner","compliance_officer"]
  approvals: { role: string; principal: string; decision: "approved" | "rejected" | "pending"; approved_at?: string; reason?: string }[];
  decision: "pending" | "approved" | "rejected" | "expired";
  expires_at: string;
  status: "active" | "expired" | "revoked" | "invalidated";
  invalidation_triggers: string[]; // timeline change, asset substitution, etc.
  policy_version: string;
  created_at: string;
};

export type PolicyRule = {
  id: string;
  version: number;
  default: "deny" | "allow";
  scope: { tenant: string; project_tags: string[] };
  deny: ({ operation: GovernanceIntentOperation } | { operation: GovernanceIntentOperation; unless: Record<string, unknown> })[];
  require_approval: { operation: GovernanceIntentOperation; approvers: string[] }[];
  allow_autonomous: { operation: GovernanceIntentOperation }[];
  constraints: { max_batch_assets: number; max_external_destinations: number; approval_ttl_hours: number };
};

export const EXAMPLE_POLICY: PolicyRule = {
  id: "video-publish-production-v4", version: 4, default: "deny",
  scope: { tenant: "tenant_001", project_tags: ["production","external"] },
  deny: [
    { operation: "asset.cryptographic_purge" },
    { operation: "compliance.override" },
    { operation: "legal_hold.release" },
    { operation: "voice.generate", unless: { "consent.status": "granted", "consent.purpose": "approved" } },
  ],
  require_approval: [
    { operation: "destination.youtube.publish", approvers: ["creative_director","compliance_officer"] },
    { operation: "voice.generate", approvers: ["talent_owner","legal"] },
    { operation: "timeline.master.write", approvers: ["editor","creative_director"] },
  ],
  allow_autonomous: [
    { operation: "asset.proxy.generate" },{ operation: "transcript.create" },{ operation: "timeline.marker.create" },{ operation: "caption.create" },
  ],
  constraints: { max_batch_assets: 100, max_external_destinations: 3, approval_ttl_hours: 24 },
};

export type DelegationPolicy = {
  delegation_allowed: boolean;
  allowed_sub_agents: string[];
  max_depth: number;
  max_cumulative_risk: RiskLevel;
  credential_forwarding: boolean;
  separate_approval_required: boolean;
  human_accountability: string; // user_204 always
};

export type RuntimeSignal = "tool_calls" | "asset_read" | "asset_write" | "prompt_change" | "delegation" | "destination_change" | "batch_size" | "execution_rate" | "cost_gpu" | "model_change" | "retry" | "policy_denied" | "cross_tenant_attempt";

export type LedgerEvent = {
  event_id: string;
  timestamp: string;
  tenant_id: string;
  human_principal: string;
  agent_id: string;
  session_id: string;
  parent_session_id: string | null;
  intent_id: string;
  proposal_id?: string;
  capability_token_id?: string;
  operation: GovernanceIntentOperation;
  project_id: string;
  asset_ids: string[];
  policy_decision: PDPDecision["decision"];
  approval_id?: string;
  tool_calls: string[];
  input_hash: string;
  output_hash?: string;
  model_version: string;
  tool_manifest_hash: string;
  human_decision?: string;
  rollback_reference?: string;
  external_effects: string[];
  signature: string; // signed, append-only
};

export type GovernanceMetrics = {
  authorized_completion_rate: number;
  policy_denial_rate: number;
  unauthorized_attempt_rate: number;
  approval_latency_p50_ms: number;
  approval_expiry_rejection_rate: number;
  consent_block_rate: number;
  rollback_rate: number;
  human_modification_distance: number;
  human_correction_rate: number;
  external_side_effect_failure_rate: number;
  autonomous_success_within_scope: number;
  mean_time_to_suspend_ms: number;
  mean_time_to_revoke_ms: number;
  provenance_completeness: number;
  permission_utilization: number;
  overprivileged_findings: number;
  model_drift_incidents: number;
  delegation_violations: number;
  cross_tenant_attempts: number;
};

export type VersionArtifact = {
  agent_id: string;
  release_id: string;
  model_version: string;
  prompt_policy_version: string;
  tool_manifest_hash: string;
  evaluation_status: "approved" | "pending" | "failed";
  red_team_status: "passed" | "failed" | "pending";
  owner_recertification: string;
  rollback_version: string;
};
