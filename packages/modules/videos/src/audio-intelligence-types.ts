/**
 * N0VA VIDEOS — Audio Intelligence Types
 * Versioned, explainable production system: source → stems → repair → mix → delivery
 */

export type StemType = "DX" | "DX_CLEAN" | "DX_DUB" | "MX" | "FX" | "AMB" | "RT" | "VO" | "AUD" | "ME" | "M_E" | "MASTER" | "DIALOGUE_OBJECT" | "MUSIC_BED" | "AUDIENCE_REACTION";
export type ChannelLayout = "mono" | "stereo" | "5.1" | "7.1" | "9.1.6" | "ambisonics";
export type ApprovalState = "draft" | "pending" | "approved" | "rejected" | "frozen";
export type RepairVerdict = "auto_apply_then_review" | "human_approval_required" | "show_alternatives" | "flag_only";

export type Stem = {
  stem_id: string;
  type: StemType;
  source_stems: string[];
  channel_layout: ChannelLayout;
  sample_rate_hz: number;
  bit_depth: number;
  version: number;
  processing_chain: string[];
  confidence: number;
  approval_status: ApprovalState;
  parent_version?: number;
  source_hash?: string;
  output_hash?: string;
  immersive_object?: { object_id: string; position?: string };
};

export type StemVersion = {
  stem_id: string;
  version: number;
  parent_version?: number;
  created_by: { type: string; id: string };
  source_hash: string;
  output_hash: string;
  plugin_chain: { plugin: string; version: string; parameters_hash: string }[];
  quality_report_id?: string;
  approval: { status: ApprovalState; approved_by?: string; approved_at?: string };
};

export type SpeakerProfile = {
  speaker_id: string;
  voiceprint_hash: string;
  reference_assets: string[];
  characteristics: { fundamental_range_hz: [number, number]; speech_rate_wpm: number; sibilance_profile: number; resonance_profile: string; accent: string };
  consent: { voice_processing: string; voice_cloning: string; public_dubbing: string };
};

export type DialogueIsolation = {
  target_speaker_id: string;
  source_range: { start_ms: number; end_ms: number };
  suppression: { music_db: number; audience_db: number; room_noise_db: number };
  voice_preservation: { timbre_similarity: number; prosody_similarity: number; speech_intelligibility_gain: number };
  artifact_risk: number;
  confidence: number;
  review_required: boolean;
};

export type RoomToneReconstruction = {
  location_id: string;
  source_segments: { start_ms: number; end_ms: number; quality: number }[];
  target_range: { start_ms: number; end_ms: number };
  method: string;
  crossfade_ms: number;
  spectral_match: number;
  loop_detected: boolean;
  confidence: number;
};

export type PronunciationEntry = {
  term: string; language: string; spoken_form: string; phonemes: string[]; stress: number[];
  applies_to: string[]; priority: number; approved_by: string;
};

export type DubVersion = {
  language: string; source_language: string; source_transcript_version: string; translation_version: string;
  voice_mode: string; speaker_mappings: { source_speaker_id: string; dub_voice_id: string }[];
  timing_mode: string; lip_sync_mode: string; review_status: string;
};

export type VoiceConsistency = {
  speaker_id: string; segment_id: string; timbre_similarity: number; prosody_similarity: number;
  accent_consistency: number; speech_rate_delta_percent: number; pitch_delta_semitones: number; emotional_continuity: number; overall_score: number; decision: string;
};

export type DestinationAudioProfile = {
  profile_id: string; integrated_loudness_target: number; loudness_tolerance_lu: number; true_peak_max_dbtp: number;
  short_term_limit?: number; dynamic_range_policy: string; channel_layout: string; metadata_required: boolean;
};

export type LoudnessReport = {
  integrated_lufs: number; short_term_lufs?: number; momentary_lufs?: number; true_peak_dbtp: number; loudness_range_lu: number;
  dialogue_gated_lufs?: number; silence_percent?: number; clipping_events?: number; status: "pass" | "fail" | "warning";
};

export type DuckingDecision = {
  range: { start_ms: number; end_ms: number }; speech_importance: number; music_overlap: number; duck_amount_db: number;
  attack_ms: number; release_ms: number; sidechain_source: string; reason: string; confidence: number;
};

export type SfxSuggestion = {
  scene_id: string; event: string; time_ms: number;
  candidates: { asset_id: string; fit_score: number; license_status: string; suggested_gain_db: number; suggested_duration_ms: number }[];
  reason: string; status: string;
};

export type AudioIssue = {
  issue_id: string; type: string; track_id: string; range: { start_ms: number; end_ms: number };
  severity: "low" | "medium" | "high" | "critical"; peak_dbtp?: number;
  repair_options: { method: string; estimated_recovery: number; artifact_risk: number }[];
  recommended_action: string; confidence: number; status: string;
  hum_analysis?: { fundamental_hz: number; harmonics_hz: number[]; stability: number; affected_tracks: string[]; recommended_repair: string; risk_to_voice: number; confidence: number };
  phase_check?: { correlation: number; polarity_status: string; mono_loss_db: number; affected_band: string };
};

export type RepairScore = {
  detection_confidence: number; repair_confidence: number; artifact_risk: number; source_quality: number; overall_recommendation: RepairVerdict;
};

export type SilenceEvent = {
  start_ms: number; end_ms: number; duration_ms: number; rms_dbfs: number; room_tone_present: boolean;
  video_activity: string; classification: string; severity: string; confidence: number; recommended_action: string;
};

export type MixGraph = {
  nodes: { id: string; type: string; inputs?: string[]; sidechain?: string; target?: string; mode?: string }[];
};

export type ImmersiveCheck = {
  format: string; dialogue_object: string; bed_loudness_lufs: number; object_peak_dbtp: number; downmix_mono_loss_db: number; spatial_continuity: number; status: string;
};

export type AudioReport = {
  project_id: string; source_integrity: string[]; dialogue: string[]; noise: string[]; phase: string[]; mix: string[]; dubbing: string[]; approval: string[];
};
