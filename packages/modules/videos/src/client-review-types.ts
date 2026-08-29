/**
 * N0VA VIDEOS — Client Review Portal Types
 * External reviewers get minimum access to make traceable, legally meaningful decisions
 */

export type ReviewMode =
  | "open_guest"
  | "identified_guest"
  | "domain_restricted"
  | "named_reviewer"
  | "confidential_review"
  | "legal_review"
  | "public_preview";

export type PortalPermissions = {
  view: boolean;
  comment: boolean;
  approve: boolean;
  reject: boolean;
  approve_with_changes: boolean;
  download: boolean | "preview" | "restricted" | "approved_master";
  version_history: boolean;
  audit_trail: boolean;
};

export type PortalAuthentication = {
  login_required: boolean;
  email_verification_for_decision: boolean;
  password_required: boolean;
  otp_required: boolean;
};

export type PortalRestrictions = {
  allowed_domains?: string[];
  allowed_ip_ranges?: string[];
  allowed_countries?: string[];
  max_sessions?: number;
  allowed_emails?: string[];
};

export type WatermarkPolicy = {
  enabled: boolean;
  visible_text?: string; // CONFIDENTIAL · {viewer_identity} · {timestamp}
  forensic_id: boolean;
  position: "static" | "moving_diagonal" | "corner";
  visible_required?: boolean;
  forensic_required?: boolean;
};

export type ReviewLink = {
  link_id: string;
  project_id: string;
  snapshot_id: string;
  mode: ReviewMode;
  permissions: PortalPermissions;
  authentication: PortalAuthentication;
  restrictions: PortalRestrictions;
  watermark: WatermarkPolicy;
  expires_at: string; // ISO
  revoked_at: string | null;
  created_at: string;
  token: string; // opaque high-entropy https://review.n0va.video/r/...
};

export type ClientReviewPortal = {
  portal_id: string;
  project_id: string;
  review_round_id: string;
  snapshot_id: string;
  branding: { logo_asset_id: string; accent_color: string; display_name: string };
  localization: { default_language: string; available_languages: string[] };
  access_policy: {
    guest_access: boolean;
    approval_requires_verification: boolean;
    comment_requires_identity: boolean;
    download: PortalPermissions["download"];
    allowed_domains?: string[];
    allowed_ip_ranges?: string[];
    allowed_countries?: string[];
    expires_at: string;
    max_sessions?: number;
  };
  review_policy: {
    allow_comments: boolean;
    allow_drawings: boolean;
    allow_rejection: boolean;
    allow_approval: boolean;
    allow_approval_with_changes: boolean;
    show_version_history: boolean;
    show_audit_trail_to: string[];
  };
  watermark_policy: WatermarkPolicy;
  created_at: string;
};

export type ExternalComment = {
  comment_id: string;
  review_link_id: string;
  snapshot_id: string;
  anchor: { time_ms: number; frame: number; region?: { x: number; y: number; width: number; height: number } };
  author: { identity: "verified_email" | "guest" | "anonymous"; value: string; masked?: string };
  text: string;
  status: "open" | "resolved" | "decision_critical";
  created_at: string;
  annotation_type?: string;
};

export type PortalVersion = {
  version_id: string;
  label: string; // v0.4
  review_stage: string;
  created_at: string;
  snapshot_id: string;
  duration_ms?: number;
  resolution?: string;
  caption_available?: boolean;
  decision_status?: "pending" | "approved" | "rejected" | "approved_with_changes";
  unresolved_comments?: number;
  watermark_policy?: WatermarkPolicy;
  change_summary?: string[];
  hidden?: boolean;
};

export type DecisionType = "approved" | "rejected" | "approved_with_changes";

export type PortalDecision = {
  decision_id: string;
  portal_id: string;
  snapshot_id: string;
  stage: string;
  decision: DecisionType;
  actor: { type: "verified_guest" | "named_reviewer"; email: string; organization?: string };
  scope: string; // full_timeline
  linked_review_items: string[];
  conditions?: { requires_rework?: boolean; requires_resubmission?: boolean };
  text?: string; // reason for reject
  timestamp: string;
  audit_hash: string;
  confirmation?: { verified_identity: boolean; reviewed_scope: string; language: string; displayed_text: string; canonical_decision: string };
};

export type ApprovalEvent = {
  event_id: string;
  project_id: string;
  snapshot_id: string;
  stage: string;
  decision: DecisionType;
  actor: { type: string; email: string; organization?: string };
  scope: string;
  linked_review_items: string[];
  conditions?: Record<string, boolean>;
  timestamp: string;
  audit_hash: string;
};

export type AuditEntry = {
  audit_id: string;
  portal_id: string;
  snapshot_id: string;
  actor: string; // reviewer@client.example or Guest viewer
  action: string; // verified by OTP, comment added, approval submitted, etc.
  timestamp: string;
  ip_hash?: string;
  device_fingerprint?: string;
  review_link_id?: string;
  hash: string;
};

export type DownloadPolicy = "disabled" | "preview" | "restricted" | "approved_master" | "source_never";

export type LocalizedDecision = {
  interface_language: string;
  decision: DecisionType;
  displayed_text: string;
  canonical_decision: DecisionType;
  translation_source: string;
};

export type PortalSession = {
  session_id: string;
  portal_id: string;
  link_id: string;
  viewer_identity: string; // reviewer@client.example or Guest
  token: string;
  created_at: string;
  expires_at: string;
  revoked: boolean;
  playback_telemetry?: { started_at?: string; watched_ms?: number };
};
