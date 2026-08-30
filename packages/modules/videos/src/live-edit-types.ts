/**
 * N0VA VIDEOS — Live-to-Edit Continuum Types
 * One live moment → many governed derivatives with lineage
 */

export type ContinuumStage =
  | "live_session_ended" | "recordings_verified" | "media_conform" | "transcript_reconciliation"
  | "speaker_scene_indexing" | "moment_detection" | "derivative_plan" | "ai_rough_cuts" | "editorial_review" | "preflight" | "export_distribution";

export type ProcessingLane = "fast" | "editorial" | "finishing";

export type ConformMap = {
  master_clock: { timebase: string; start_timecode: string; wall_clock_start: string };
  sources: { source_id: string; offset_ms: number; drift_ppm: number; confidence: number }[];
  missing_ranges: { source_id: string; start_ms: number; end_ms: number; reason: string }[];
  status: "verified" | "needs_review";
};

export type EventMoment = {
  moment_id: string;
  time_range: { start_ms: number; end_ms: number };
  signals: {
    speaker_id?: string; topic?: string; scene_type?: string;
    audience_reaction?: number; chat_velocity?: number; producer_marker?: boolean;
    transcript_confidence?: number; visual_emphasis?: number; audio_intensity?: number;
  };
  derived_assets: string[]; // chapter_08, highlight_003 etc.
  lineage?: { source_isos: string[]; transcript_segments: string[]; caption_version?: string };
};

export type Chapter = {
  chapter_id: string;
  start_ms: number;
  title: string;
  source: "approved_agenda" | "producer_marker" | "detected_topic" | "generated_fallback";
  confidence: number;
  thumbnail_frame_ms?: number;
  end_condition?: string;
  status: "pending" | "approved" | "rejected";
  children?: Chapter[];
};

export type HighlightScore = {
  engagement: number; editorial_value: number; narrative_completeness: number;
  technical_quality: number; rights_clearance: number; caption_confidence: number;
  final_score: number; decision: "auto_publish" | "review_required" | "blocked" | "suggestion";
};

export type SpeakerMoment = {
  speaker_id: string;
  display_name: string;
  total_ms: number;
  segments: { segment_id: string; start_ms: number; end_ms: number; text: string; topic?: string; confidence: number }[];
  quotable_moments: number;
  unresolved_terms?: number;
};

export type TranscriptSegment = {
  segment_id: string;
  speaker_id: string;
  start_ms: number;
  end_ms: number;
  text: string;
  word_timestamps?: { word: string; start_ms: number; end_ms: number; confidence: number }[];
  source_isos: string[];
  caption_versions: string[];
  confidence: number;
  edit_status: "included" | "excluded" | "pending";
  rights_status: "cleared" | "blocked" | "pending";
};

export type SilenceSegment = {
  start_ms: number; end_ms: number; duration_ms: number;
  classification: "intentional_pause" | "unintended_silence" | "audience_reaction" | "technical_delay" | "session_transition" | "dramatic_pause";
  confidence: number;
  recommended_action: "keep" | "remove_with_ripple" | "review";
  preserve_ambience: boolean;
  review_required: boolean;
};

export type DerivativePlan = {
  source_moment_id: string;
  outputs: {
    type: string; // linkedin_clip, instagram_reel, youtube_highlight etc.
    duration_target_ms: number;
    aspect_ratio: string;
    hook_style: string;
    captions: string;
    cta?: string;
    review_required: boolean;
  }[];
};

export type DerivativeAsset = {
  asset_id: string;
  type: string;
  aspect_ratio?: string;
  source_ranges: { source: string; start_ms: number; end_ms: number }[];
  timeline_version: number;
  caption_version: number;
  rights_status: "cleared" | "blocked" | "pending";
  consent_status: "cleared" | "blocked" | "pending";
  preflight_status: "ready" | "ready_with_warnings" | "blocked" | "pending";
  checksum: string;
  crop_keyframes?: unknown[];
  edit_recipe?: EditRecipe;
  vertical_flags?: string[];
};

export type EditRecipe = {
  source_session: string;
  source_ranges: { asset_id: string; start_ms: number; end_ms: number }[];
  excluded_ranges?: { reason: string; start_ms: number; end_ms: number }[];
  camera_changes?: unknown[];
  audio_changes?: { type: string; amount_db: number }[];
  caption_version: string;
  graphics_template?: string;
  crop_keyframes?: unknown[];
  model_versions: string[];
  editorial_approval?: string | null;
};

export type QuoteCard = {
  quote_id: string;
  source_segment_ids: string[];
  text: string;
  speaker: { id: string; display_name: string; title: string };
  source_time_range: { start_ms: number; end_ms: number };
  context_complete: boolean;
  transcript_confidence: number;
  factual_claim: boolean;
  brand_status: "pending" | "approved" | "rejected";
  design_template: string;
  status: "review_required" | "approved" | "rejected";
  mode: "verbatim" | "compressed" | "paraphrased" | "headline";
};

export type ContentPackage = {
  package_id: string;
  source_session_id: string;
  source_hashes: { program_master: string; clean_feed: string; transcript: string };
  generated_assets: DerivativeAsset[];
  package_status: "review_required" | "verified" | "delivered";
  created_at: string;
  manifest?: Record<string, unknown>;
};

export type PostEventProject = {
  project_id: string;
  project_name: string;
  source_session_id: string;
  source_policy: string;
  stage: ContinuumStage;
  lane: ProcessingLane;
  conform_map?: ConformMap;
  moments: EventMoment[];
  chapters: Chapter[];
  highlights: HighlightScore[]; // simplified, actual HighlightCandidate linked
  highlight_candidates?: string[];
  speaker_index: SpeakerMoment[];
  transcript_segments: TranscriptSegment[];
  derivatives: DerivativeAsset[];
  quote_cards: QuoteCard[];
  content_package?: ContentPackage;
  languages: string[];
  derivative_profiles: string[];
  review_mode: string;
  rights_snapshot?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
