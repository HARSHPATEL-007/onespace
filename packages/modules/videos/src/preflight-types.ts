/**
 * N0VA VIDEOS — Quality and Safety Intelligence Types 2.0
 * Policy-aware release gate: quality score vs release decision, destination-specific, evidence graph
 */

export type PreflightCategory =
  | "technical_quality" | "audio_loudness" | "caption_accuracy" | "visual_continuity" | "brand_compliance"
  | "copyright_risk" | "face_voice_consent" | "privacy_pii" | "accessibility" | "export_compatibility" | "platform_policy" | "legal_hold";

export type PreflightSeverity = "critical" | "high" | "medium" | "low" | "informational";
export type PreflightStatus = "pass" | "warning" | "blocked" | "open" | "draft" | "analysis_pending" | "preflight_running" | "findings_open" | "remediation_in_progress" | "exception_requested" | "approval_pending" | "approved" | "exportable" | "published";
export type FindingStatus = "open" | "blocked" | "resolved" | "exception_pending" | "approved" | "dismissed" | "detected" | "triaged" | "false_positive" | "accepted_warning" | "remediation_required" | "escalated" | "remediation_submitted" | "rerun_pending" | "verified";
export type CheckVerdict = "PASS" | "WARNING" | "FAILED" | "NOT_VERIFIED" | "STALE" | "UNSUPPORTED";
export type ReleaseDecision = "READY" | "READY_WITH_WARNINGS" | "BLOCKED";
export type EvaluationLevel = "asset_level" | "timeline_level" | "delivery_level";

export const CATEGORY_WEIGHTS: Record<PreflightCategory, number> = {
  technical_quality: 0.15, audio_loudness: 0.10, caption_accuracy: 0.10, visual_continuity: 0.08, brand_compliance: 0.10,
  copyright_risk: 0.12, face_voice_consent: 0.08, privacy_pii: 0.10, accessibility: 0.08, export_compatibility: 0.05, platform_policy: 0.04, legal_hold: 0,
};
export const CATEGORY_DEFAULT_OWNER: Record<PreflightCategory, string> = {
  technical_quality: "post_supervisor", audio_loudness: "sound_lead", caption_accuracy: "captioning", visual_continuity: "editor",
  brand_compliance: "brand_director", copyright_risk: "legal", face_voice_consent: "production_legal", privacy_pii: "privacy_officer",
  accessibility: "accessibility_lead", export_compatibility: "post_operations", platform_policy: "distribution_lead", legal_hold: "legal_operations",
};

export type PreflightScope = {
  project_id: string; asset_id?: string; start_ms?: number; end_ms?: number; export_id?: string; timeline_id?: string; timeline_version?: number; destinations?: string[];
};

export type EvidenceItem = {
  type: string;
  timecode?: string;
  asset_id?: string;
  frame_ms?: number;
  fingerprint_match?: string;
  match_confidence?: number;
  license_id?: string | null;
  text?: string;
  confidence?: number;
  thumbnail_url?: string;
  waveform_url?: string;
  policy_rule?: string;
  document_id?: string;
  checksum?: string;
};

// 2.0 Evidence Graph Node
export type EvidenceNode = {
  evidence_id: string;
  type: string; // pii_detection, frame_thumbnail, transcript_span, audio_measurement, etc.
  asset_id?: string;
  timeline_id?: string;
  render_id?: string;
  time_range?: { start_ms: number; end_ms: number };
  frame_refs?: { frame_ms: number; thumbnail_uri: string; overlay_uri?: string }[];
  detector?: { model: string; confidence: number; model_run_id: string };
  integrity?: { source_hash: string; evidence_hash: string };
  raw?: EvidenceItem;
};

export type RemediationAction = { action: string; label: string; automatable: boolean; category?: "automated" | "assisted" | "manual_approval"; mode?: "automated" | "assisted" | "manual"; requires_approval?: boolean; replacement_candidates?: string[] };
export type ApprovalRef = { required: boolean; status: "pending" | "approved" | "rejected" | "none"; approver_role?: string; approver_roles?: string[]; approved_by?: string; approved_at?: string; expires_at?: string; second_approval_required?: boolean };
export type ApprovalBinding = {
  project_version: number; timeline_hash: string; render_hash: string; export_profile: string; destination: string; territories: string[];
  policy_hash: string; rights_snapshot_hash: string; consent_snapshot_hash: string; evidence_snapshot_hash: string;
};
export type Freshness = { analysis_at: string; stale_after: string; status: "current" | "stale" | "not_verified"; verdict: CheckVerdict };
export type FindingClassification = { status: "blocked" | "warning" | "pass"; severity: PreflightSeverity; impact: number; likelihood: number; destination_sensitivity: number; legal_obligation: number; confidence: number };

export type PreflightFinding = {
  finding_id: string;
  check_id: string;
  category: PreflightCategory;
  title: string;
  status: FindingStatus;
  verdict?: CheckVerdict;
  severity: PreflightSeverity;
  score: number;
  confidence: number;
  scope: PreflightScope;
  evidence: EvidenceItem[];
  evidence_ids?: string[];
  evaluation_level?: EvaluationLevel;
  classification?: FindingClassification;
  owner: { team: string; user_id?: string | null; backup_team?: string; sla_hours?: number };
  remediation: RemediationAction[];
  remediations?: RemediationAction[];
  approval: ApprovalRef;
  policy?: { policy_id: string; policy_version: string; effective_at?: string };
  freshness?: Freshness;
  audit?: { created_by: string; created_at: string; chain_event_id: string };
  created_at: string;
  model_versions: string[];
};

export type CategoryResult = {
  category: PreflightCategory;
  score: number;
  severity: PreflightSeverity | "pass";
  status: FindingStatus | "approved" | "pending" | "open";
  finding_count: number;
  findings: PreflightFinding[];
  evidence_coverage?: number; // 0-100
  confidence?: number;
};

export type PreflightGate = {
  rights_clear: boolean;
  consent_clear: boolean;
  privacy_clear: boolean;
  legal_hold_clear: boolean;
  export_verified: boolean;
  required_approvals_complete: boolean;
  policy_scan_current: boolean;
  evidence_complete: boolean;
  critical_findings: number;
};

export type DestinationProfile = {
  destination: string;
  territory?: string;
  profile?: string;
  status: string;
  profile_version: string;
  required_dimensions?: string;
  codec?: string;
  loudness_standard?: string;
  caption_requirement?: string;
};

export type PreflightRun = {
  preflight_id: string;
  project_id: string;
  project_version: number;
  timeline_id: string;
  status: "blocked" | "warning" | "ready" | "ready_with_warnings";
  release_decision: ReleaseDecision;
  controlling_reason?: string;
  secondary_findings?: string[];
  readiness_score: number; // quality score S_quality
  quality_score: number;
  score_confidence: number;
  evidence_coverage: number;
  analysis_freshness: "current" | "stale";
  scoring_model: string;
  generated_at: string;
  stale: boolean;
  gates: PreflightGate;
  categories: Record<PreflightCategory, CategoryResult>;
  destination_results: Record<string, { status: "blocked" | "warning" | "ready"; score: number; profile_version: string }>;
  destination_profiles: DestinationProfile[];
  findings: PreflightFinding[];
  evidence_graph: EvidenceNode[];
  summary: { critical: number; high: number; medium: number; low: number; passed: number; not_verified?: number; stale?: number };
  approval_state: string;
  approval_binding?: ApprovalBinding;
  timeline_hash: string;
  render_hash?: string;
  evidence_hash: string;
  destination_scores?: Record<string, number>;
  audit_chain: { action: string; actor: string; timestamp: string; timeline_hash: string; evidence_hash: string }[];
};
