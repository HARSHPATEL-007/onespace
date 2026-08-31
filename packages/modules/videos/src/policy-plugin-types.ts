/**
 * N0VA VIDEOS — Policy and Plugin Platform Types
 * Policy-as-code plane + sandboxed plugin plane
 */

export type PolicyStatus = "draft" | "review" | "simulation" | "approved" | "active" | "deprecated" | "retired";
export type PolicyEffect = "allow" | "allow_with_controls" | "require_approval" | "warn" | "deny" | "defer_until_data_is_available";
export type PluginType = "effect" | "codec" | "demuxer" | "color_transform" | "audio_processor" | "transcription" | "translation" | "ai_model" | "storage" | "review_integration" | "export_destination" | "player_extension" | "metadata_schema" | "compliance_policy" | "custom_agent" | "watermark" | "accessibility_provider";
export type SandboxProfile = "wasm" | "microvm" | "gpu_enclave" | "restricted_container" | "remote_connector";
export type TrustLevel = "platform_signed" | "verified_publisher" | "tenant_approved" | "experimental" | "quarantined" | "revoked";
export type MediaAccessLevel = "metadata_only" | "thumbnail" | "proxy" | "derived_stem" | "original_range" | "original_full_asset";

export type CanonicalPolicy = {
  name: string;
  version: number;
  status: PolicyStatus;
  priority: number;
  scope: { tenants?: string[]; regions?: string[]; project_types?: string[]; destinations?: string[] };
  require: string[];
  prohibit: string[];
  allow: string[];
  retention: Record<string, string>;
  privacy: { unknown_faces: string; license_plates: string; medical_data: string; financial_data: string; voice_anonymization: string };
  approvals: { external_share: { required: string[] }; unwatermarked_export: { required: string[] } };
  enforcement: { on_violation: string; on_uncertainty: string; on_missing_data: string };
  extends?: string[];
};

export type PolicyContext = {
  event: string;
  tenant_id: string;
  project_id: string;
  asset_ids: string[];
  timeline_id?: string;
  principal_id: string;
  region: string;
  destination?: string;
  asset_classification?: string;
  consent?: { likeness?: string; voice?: string; music?: string };
  quality?: { captions?: string; privacy_scan?: string; copyright_scan?: string; brand_review?: string };
  requested_actions: string[];
  plugin_id?: string;
};

export type PolicyDecision = {
  decision_id: string;
  policy_id: string;
  event: string;
  decision: PolicyEffect;
  reason_codes: string[];
  required_actions: string[];
  controls?: string[];
  evaluated_at: string;
  policy_hash: string;
  expires_at?: string;
};

export type PolicyEvidence = {
  decision_id: string;
  policy_hash: string;
  input_manifest_hash: string;
  checks: { check: string; status: string; evidence_id?: string }[];
  model_versions?: string[];
  evaluated_by: string;
  timestamp: string;
};

export type PolicyConflict = {
  policies: string[];
  conflict: string;
  winner: string;
  resolution: string;
};

export type PolicyTest = {
  name: string;
  policy: string;
  event: string;
  input: Record<string, unknown>;
  expect: { decision: PolicyEffect; reason_codes?: string[] };
  result?: { pass: boolean; actual?: PolicyDecision };
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  publisher: { name: string; id: string };
  type: PluginType;
  sdk_version: string;
  api_version: string;
  license: string;
  signature?: { algorithm: string; key_id: string; signature: string };
  compatibility: { n0va_versions: string[]; platforms: string[]; gpu?: string[] };
  permissions: {
    media?: { read?: string[]; write?: string[] };
    metadata?: { read?: string[]; write?: string[] };
    network?: { outbound?: string[] };
    storage?: { temporary_bytes?: number };
    secrets?: string[];
  };
  resources: { cpu_cores: number; memory_mb: number; gpu_memory_mb?: number; max_runtime_seconds: number; max_output_bytes: number };
  security: { isolation: string; attestation_required: boolean; training_on_customer_data: boolean; network_policy: string };
};

export type PluginRecord = {
  manifest: PluginManifest;
  package_uri?: string;
  trust_level: TrustLevel;
  status: "registered" | "review_requested" | "review_completed" | "enabled" | "disabled" | "revoked";
  enabled_scopes?: { projects?: string[]; asset_classes?: string[]; regions?: string[] }[];
  execution_count?: number;
  health?: PluginHealth;
};

export type PluginHealth = {
  plugin_id: string;
  version: string;
  executions_24h: number;
  success_rate: number;
  p95_latency_ms: number;
  policy_denials: number;
  permission_violations: number;
  network_attempts_blocked: number;
  quality_regressions: number;
  status: string;
};

export type PluginMediaGrant = {
  plugin_id: string;
  asset_id: string;
  access: { level: MediaAccessLevel; watermarked?: boolean; time_ranges?: { start_ms: number; end_ms: number }[] };
  expires_at: string;
  purpose: string;
};

export type PluginExecution = {
  plugin_id: string;
  plugin_version: string;
  sdk_version: string;
  runtime_digest: string;
  input_manifest_hash: string;
  output_manifest_hash: string;
  policy_decision_id?: string;
  attestation?: string;
  status: "completed" | "failed" | "blocked";
  output?: unknown;
};
