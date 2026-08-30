/**
 * N0VA VIDEOS — Resilient Live Control Room Types
 * Fault-tolerant broadcast OS: 5 planes, state machine, multi-region, bounded recovery
 */

export type LivePlane = "contribution" | "production" | "distribution" | "recording" | "control";
export type LiveStatus = "configuring" | "armed" | "previewing" | "live" | "degraded" | "failover_active" | "emergency_mode" | "recovery_pending" | "recovered" | "ending" | "finalizing" | "verified";
export type RegionRole = "primary" | "hot_standby" | "cold";
export type FailoverLevel = 0|1|2|3|4|5;
export type HandoffMode = "frame_accurate" | "keyframe" | "emergency_media";
export type HealthLevel = "healthy" | "watch" | "at_risk" | "critical";
export type DestinationStatus = "healthy" | "degraded" | "disconnected" | "reconnecting";
export type CaptionState = "provisional" | "confident" | "corrected" | "human_reviewed" | "published";
export type RecordingIntegrityStatus = "verified" | "degraded" | "missing";
export type AlertSeverity = "p0" | "p1" | "p2" | "p3" | "p4";

export type LiveState = {
  status: LiveStatus;
  reason?: string;
  started_at?: string;
  active_program_path?: string;
  failover_level: FailoverLevel;
  operator_acknowledged: boolean;
  audience_impact: "none" | "minor" | "moderate" | "major";
  recovery_deadline_ms?: number;
};

export type RegionConfig = {
  region: string; // us_east, eu_west, ap_southeast
  role: RegionRole;
  health: HealthLevel;
  encoder_id?: string;
  ingest_endpoint?: string;
};

export type EncoderConfig = {
  encoder_id: string;
  region: string;
  type: "hardware" | "software_gpu";
  status: "warmed" | "active" | "failed";
  profile: string; // youtube_1080p60_v5
  metrics?: { queue_depth?: number; gpu_util?: number; cpu?: number; frame_drop_rate?: number; bitrate_kbps?: number };
  state?: { program_frame?: number; scene?: string; audio_mix?: string; graphics?: string; caption_state?: string; gop_position?: number };
};

export type DestinationHealth = {
  id: string;
  platform: string; // youtube, linkedin, instagram, custom_rtmp
  status: DestinationStatus;
  health_score: number;
  ingest: { connected: boolean; bitrate_kbps: number; packet_loss_percent: number; rtt_ms: number; jitter_ms: number };
  media: { video_fps: number; audio_bitrate_kbps: number; av_sync_ms: number; caption_delay_ms: number };
  cdn?: { response_ms?: number };
  action?: string;
  audience_impact: "none" | "minor" | "moderate" | "major";
  bitrate_ladder?: { profile: string; video_kbps: number; audio_kbps: number }[];
  current_rung?: number;
};

export type HealthPrediction = {
  stream_id: string;
  health_score: number;
  failure_probability_60s: number;
  time_to_degradation_seconds?: number;
  likely_causes: { cause: string; probability: number }[];
  recommended_action: string;
  confidence: number;
  evidence?: string[];
  model_version: string;
  level: HealthLevel;
};

export type FailoverPolicy = {
  max_switch_time_ms: number;
  require_operator_confirmation: boolean;
  allowed_actions: string[];
  preserve_program_clock: boolean;
  preserve_caption_clock: boolean;
  notify_roles: string[];
};

export type HandoffReport = {
  from_encoder: string;
  to_encoder: string;
  switch_time: string;
  last_source_pts: number;
  first_target_pts: number;
  timestamp_continuity: "pass" | "warning" | "fail";
  audio_continuity: "pass" | "warning" | "fail";
  caption_continuity: "pass" | "warning" | "fail";
  frames_repeated: number;
  frames_dropped: number;
  mode: HandoffMode;
};

export type CaptionRevision = {
  segment_id: string;
  version: number;
  original_text: string;
  corrected_text: string;
  start_ms: number;
  end_ms: number;
  reason: string;
  correction_latency_ms: number;
  actor: string;
  human_review_required: boolean;
  state: CaptionState;
};

export type HighlightCandidate = {
  candidate_id: string;
  start_ms: number;
  end_ms: number;
  score: number;
  reasons: string[];
  source_isos: string[];
  suggested_formats: string[];
  status: "awaiting_operator_review" | "approved" | "published" | "rejected";
  pre_roll_ms: number;
  post_roll_ms: number;
};

export type ReplayBuffer = {
  source: string;
  start_offset_seconds: number;
  duration_seconds: number;
  speed: number;
  graphics_template?: string;
  state: "armed" | "playing" | "returning" | "live";
  live_edge_ms: number;
  replay_point_ms: number;
};

export type RecordingSegment = {
  segment_id: string;
  recording_id: string;
  start_timecode: string;
  end_timecode: string;
  duration_ms: number;
  expected_frames: number;
  received_frames: number;
  dropped_frames: number;
  audio_samples_expected: number;
  audio_samples_received: number;
  checksum: string;
  storage_replicas: number;
  verified: boolean;
};

export type FallbackAsset = {
  asset_id: string;
  purpose: string;
  duration_ms: number;
  loopable: boolean;
  captioned: boolean;
  loudness_verified: boolean;
  rights_verified: boolean;
  destinations: string[];
  expires_at?: string;
};

export type ContributorDiagnostics = {
  contributor_id: string;
  status: HealthLevel;
  network: { upload_mbps: number; packet_loss_percent: number; rtt_ms: number; jitter_ms: number };
  device: { cpu_percent: number; camera: string; capture_fps: number; audio_sample_rate: number };
  environment: { echo: boolean; background_noise: string; lighting: string };
  permissions: { camera: boolean; mic: boolean };
  recommended_action: string;
};

export type LiveIncident = {
  incident_id: string;
  severity: AlertSeverity;
  root_cause_hypothesis: string;
  confidence: number;
  affected_components: string[];
  actions_taken: string[];
  operator_status: "unacknowledged" | "acknowledged" | "resolved";
  correlated_signals?: string[];
};

export type LiveSession = {
  tenant_id: string;
  session_id: string;
  event_id: string;
  status: LiveStatus;
  program_clock: { timebase: string; current_pts: number; wall_clock: string };
  regions: RegionConfig[];
  encoders: EncoderConfig[];
  destinations: DestinationHealth[];
  recording: { program: string; clean_feed?: string; iso_count: number; integrity_status: RecordingIntegrityStatus; segments?: RecordingSegment[] };
  health_prediction: HealthPrediction;
  live_state: LiveState;
  fallback_assets?: FallbackAsset[];
  audit_chain_head?: string;
  created_at: string;
  updated_at: string;
};
