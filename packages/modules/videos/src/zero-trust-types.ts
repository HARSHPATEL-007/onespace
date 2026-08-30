/**
 * N0VA VIDEOS — Zero-Trust Media Security Types
 * Continuous verification: identity → device → session → policy → scoped capability
 */

export type TenantKeyHierarchy = {
  tenant_id: string;
  key_namespace: string;
  master_key_id: string;
  domains: { originals: string; proxies: string; exports: string; watermarks: string; drm?: string; audit?: string };
  rotation_policy: { automatic: boolean; maximum_age_days: number; rotate_on_incident: boolean };
  kms_region?: string;
};

export type AccessGrant = {
  grant_id: string;
  tenant_id: string;
  principal_id: string;
  asset_ids: string[];
  actions: string[]; // preview, comment, export, download
  purpose: string; // editorial_review, client_review, broadcast_delivery
  issued_at: string;
  expires_at: string;
  device_id: string;
  session_id: string;
  approval_chain: string[];
  risk_limit: number;
};

export type DeviceTrust = {
  device_id: string;
  principal_id: string;
  score: number; // 0-100
  posture: {
    managed: boolean;
    disk_encrypted: boolean;
    secure_boot: boolean;
    patch_age_days: number;
    endpoint_status: string;
    hardware_key: boolean;
    screen_capture_controls: boolean;
  };
  decision: string; // allow_review_only, deny, allow
  restrictions: string[];
};

export type SessionTrust = {
  session_id: string;
  principal_id: string;
  score: number;
  factors: { identity_assurance: number; device_posture: number; network_reputation: number; behavior_consistency: number; geographic_consistency: number };
  current_policy: string;
  step_up_required_for: string[];
};

export type PrivilegedRequest = {
  request_id: string;
  action: string;
  asset_id: string;
  requester: string;
  purpose: string;
  risk: string;
  required_approvals: number;
  approvals: { approver: string; status: string; approved_at?: string }[];
  expires_at: string;
  status: "pending" | "approved" | "denied" | "executed";
};

export type MediaCapability = {
  token_id: string;
  asset_id: string;
  action: string;
  principal_id: string;
  device_id: string;
  session_id: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  ip_binding?: string;
  watermark_profile: string;
  download: boolean;
  revoked?: boolean;
};

export type PlaybackPolicy = {
  asset_classification: string;
  allowed_actions: string[];
  max_resolution: string;
  visible_watermark: boolean;
  forensic_watermark: boolean;
  download: boolean;
  screen_capture_response: string;
  concurrent_sessions: number;
  reauthorize_every_minutes: number;
};

export type ExportPolicyDecision = {
  asset_id: string;
  destination: string;
  requested_format: string;
  decision: "allow" | "allow_with_controls" | "deny";
  controls?: string[];
  blocked_components?: string[];
  policy_version: string;
  reason_codes?: string[];
};

export type WorkloadIdentity = {
  workload_id: string;
  service: string;
  tenant_id: string;
  allowed_assets: string[];
  allowed_outputs: string[];
  expires_at: string;
  network_policy: string;
  attestation_required: boolean;
  job_id?: string;
};

export type GpuAttestation = {
  worker_id: string;
  gpu_id: string;
  firmware_measurement: string;
  driver_measurement: string;
  container_digest: string;
  model_version: string;
  tenant_scope: string;
  attestation_status: "verified" | "failed" | "expired";
  issued_at: string;
  expires_at: string;
};

export type PolicyDecision = {
  decision_id: string;
  principal: string;
  action: string;
  asset: string;
  tenant: string;
  context: { device_trust: number; session_trust: number; network_risk: number; asset_classification: string; destination: string };
  decision: "allow" | "deny";
  reason_codes: string[];
  policy_version: string;
  expires_at: string;
};

export type SecurityEvent = {
  event_id: string;
  type: string;
  tenant_id: string;
  principal_id: string;
  device_id?: string;
  session_id?: string;
  asset_id?: string;
  action: string;
  decision: string;
  reason_codes: string[];
  risk_score: number;
  timestamp: string;
  chain_hash: string;
};

export type InsiderRisk = {
  principal_id: string;
  score: number;
  signals: { type: string; weight: number }[];
  action: string;
  human_review_required: boolean;
};

export type DownloadAnomaly = {
  principal_id: string;
  window_minutes: number;
  objects_accessed: number;
  bytes_transferred: number;
  role_baseline_bytes: number;
  deviation_factor: number;
  risk: string;
  action: string[];
};

export type WatermarkPayload = {
  viewer_identity: string;
  tenant: string;
  session_id: string;
  asset_id: string;
  timestamp: string;
  capability_id: string;
  destination?: string;
};

export type SecurityDashboard = {
  tenant: string;
  active_sessions: number;
  high_risk_sessions: number;
  pending_privileged_approvals: number;
  unattested_workers: number;
  key_rotations_due: number;
  blocked_exports_today: number;
  bulk_anomalies: number;
  watermark_failures: number;
  expired_capabilities: number;
};
