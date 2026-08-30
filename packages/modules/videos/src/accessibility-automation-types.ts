/**
 * N0VA VIDEOS — Accessibility Automation Types
 * Parallel editorial layer: captions, audio description, sign language, graphics, keyboard, screen-reader
 */

export type AccessibilityLayer = "captions" | "audio_description" | "sign_language" | "accessible_graphics" | "keyboard_metadata" | "screen_reader_metadata" | "motion_safety";
export type CaptionType = "dialogue" | "sound" | "music" | "off_screen";
export type CaptionStateAD = "provisional" | "confident" | "corrected" | "human_reviewed" | "published";
export type A11yStatus = "pass" | "pass_with_warnings" | "review_required" | "blocked" | "exception_approved";
export type DestinationProfileId = "web_player_wcag_aa" | "broadcast" | "social_vertical" | "internal_training" | "cinema_dcp";

export type AccessibilityEvent = {
  event_id: string;
  time_range: { start_ms: number; end_ms: number };
  visual_priority: { type: string; id: string; importance: number }[];
  caption_safe_regions: { x: number; y: number; width: number; height: number; confidence: number }[];
  audio_description_required: boolean;
  sign_window_safe_region?: { x: number; y: number; width: number; height: number };
  source_timeline_version?: number;
  language?: string;
  generator?: string;
  model_version?: string;
  confidence?: number;
  human_review_state?: string;
  validation?: string;
};

export type CaptionCue = {
  cue_id: string;
  start_ms: number;
  end_ms: number;
  speaker_id?: string;
  speaker_label?: string;
  text: string;
  caption_type: CaptionType;
  confidence: number;
  display_style: string;
};

export type CaptionPosition = {
  cue_id: string;
  candidate_positions: { region: string; occlusion_score: number; reading_score: number; brand_conflict: number }[];
  selected_region: string;
  reason: string;
  confidence: number;
  review_required: boolean;
};

export type CaptionQuality = {
  language: string;
  word_accuracy_estimate: number;
  speaker_attribution: number;
  timing_alignment: number;
  terminology_accuracy: number;
  reading_speed_score: number;
  position_safety: number;
  sound_description_coverage: number;
  overall_score: number;
  decision: string;
};

export type CaptionDensityWarning = {
  cue_id: string;
  duration_ms: number;
  characters: number;
  characters_per_second: number;
  recommended_max_cps: number;
  density: "ok" | "warning" | "critical";
  suggested_actions: string[];
  review_required: boolean;
  profile?: string;
};

export type AudioDescriptionEvent = {
  event_id: string;
  time_range: { start_ms: number; end_ms: number };
  description: string;
  source_visuals: string[];
  importance: number;
  narration_space_ms: number;
  confidence: number;
  status: "review_required" | "approved" | "rejected";
  mode?: "standard" | "extended" | "chart" | "text" | "speaker" | "scene";
};

export type AudioDescriptionScript = {
  version: number;
  language: string;
  narrator: string;
  segments: { start_ms: number; end_ms: number; text: string; source_events: string[]; approved: boolean }[];
  style: string;
  speech_rate_wpm: number;
};

export type SignWindow = {
  window_id: string;
  source_asset_id: string;
  time_range: { start_ms: number; end_ms: number };
  position: { x: number; y: number; width: number; height: number };
  minimum_face_height_percent: number;
  minimum_hand_visibility: number;
  background_contrast_score: number;
  occlusion_score: number;
  status: "pass" | "warning" | "fail";
};

export type AccessibleGraphic = {
  graphic_id: string;
  role: string;
  text_content: string[];
  reading_order: string[];
  description: string;
  decorative: boolean;
  screen_reader_label: string;
};

export type ColorAccessibility = {
  graphic_id: string;
  contrast_score: number;
  color_only_encoding: boolean;
  simulations: Record<string, { distinguishable_categories: number; status: "pass" | "fail" }>;
  suggested_actions: string[];
  status: string;
};

export type FlashRisk = {
  range: { start_ms: number; end_ms: number };
  flash_events: number;
  affected_frame_area_percent: number;
  peak_frequency_hz: number;
  red_flash_component: number;
  risk_level: "low" | "medium" | "high" | "critical";
  suggested_actions: string[];
  confidence: number;
};

export type TimelineA11yNode = {
  node_id: string;
  start_ms: number;
  end_ms: number;
  role: string;
  label: string;
  description: string;
  tracks: { type: string; label: string }[];
  warnings: string[];
  actions: string[];
};

export type AccessibilityProfile = {
  profile_id: DestinationProfileId;
  destination: string;
  required: string[];
  recommended: string[];
  validation: string[];
};

export type DestinationA11yReport = {
  output: string;
  version: string;
  status: A11yStatus;
  captions: { present: boolean; speaker_identification: boolean; reading_speed: string; safe_area: string; terminology: string };
  visual_accessibility: { color_blind: string; contrast: string; flash_risk: string; reduced_motion: string };
  audio_description: { included: boolean; visual_events_lack?: number };
  sign_language: { included: boolean; source_cropped?: boolean };
  keyboard_and_metadata: { applicable: boolean };
  required_actions: string[];
};

export type AccessibilityManifest = {
  asset_id: string;
  timeline_version: number;
  destination_profile: DestinationProfileId;
  tracks: {
    captions: { language: string; format: string; version: number; status: string }[];
    audio_description: { language: string; format: string; version: number; status: string }[];
    sign_language: { language: string; layout: string; version: number; status: string }[];
    transcript: { language: string; speaker_identified: boolean; status: string }[];
  };
  visual_checks: { caption_positioning: string; color_blind: string; flash_risk: string; contrast: string };
  interaction_checks: { keyboard_navigation: string; screen_reader_metadata: string };
  overall_status: A11yStatus;
};
