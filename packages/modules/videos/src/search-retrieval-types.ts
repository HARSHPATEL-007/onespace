/**
 * N0VA VIDEOS — Search and Retrieval Intelligence Types
 * Hybrid multimodal: exact + vector + visual + graph + policy, explainable with evidence
 */

export type SearchMode = "smart" | "exact_transcript" | "visual" | "similar_shot" | "camera_movement" | "color" | "speaker_topic" | "duplicates" | "compliance_aware";
export type SimilarityMode = "overall" | "composition" | "color" | "subject" | "motion" | "mood";
export type DuplicateLevel = "file" | "media" | "shot" | "semantic";

export type SearchContext = {
  tenant_id: string;
  user_id: string;
  workspace_ids: string[];
  project_ids: string[];
  permissions: string[];
  purpose?: string;
};

export type ParsedQuery = {
  original: string;
  structured: {
    speaker?: string;
    topic?: string;
    object?: string;
    person?: string;
    action?: string;
    location?: string;
    emotion?: string;
    energy?: string;
    palette?: string[];
    shot_size?: string;
    camera_movement?: string;
    time_range?: { start_ms: number; end_ms: number };
    project_scope?: string;
    approval_state?: string;
    usage_rights?: string;
  };
  required_evidence: string[];
  ambiguities?: { term: string; meanings: string[] }[];
  synonyms_expanded?: Record<string, string[]>;
  permission_scope: SearchContext;
};

export type VisualComposition = {
  shot_size: "extreme_wide" | "wide" | "medium" | "close_up" | "extreme_close_up" | "medium_close_up";
  camera_angle: "eye_level" | "high_angle" | "low_angle" | "overhead" | "dutch_angle";
  subject_position: "center" | "left_third" | "right_third" | "foreground" | "background";
  rule_of_thirds?: number;
  negative_space?: string;
  symmetry?: number;
  background_complexity: "clean" | "busy";
  framing_orientation?: string;
  aspect_ratio?: string;
};

export type CameraMotion = {
  type: "static" | "pan" | "tilt" | "push_in" | "pull_out" | "dolly" | "truck" | "crane" | "orbit" | "handheld" | "gimbal" | "whip_pan" | "zoom" | "rack_focus";
  start_ms: number;
  end_ms: number;
  direction?: number[];
  velocity_profile?: string;
  shake_score: number;
  confidence: number;
};

export type ColorPalette = {
  dominant_colors: string[];
  temperature: "warm" | "cool";
  saturation: number;
  brightness: number;
  contrast: number;
  brand_similarity?: number;
};

export type AffectiveProfile = {
  start_ms: number;
  end_ms: number;
  valence: number;
  arousal: number;
  tension: number;
  warmth: number;
  confidence: number;
  evidence: string[];
};

export type TranscriptSpan = {
  asset_id: string;
  start_ms: number;
  end_ms: number;
  text: string;
  speaker_id?: string;
  speaker_label?: string;
  language: string;
  confidence: number;
  match_score?: number;
  is_translated?: boolean;
};

export type EvidenceItem =
  | { type: "transcript"; start_ms: number; end_ms: number; text: string; match_score: number }
  | { type: "object"; label: string; frame_ms: number; confidence: number; bbox?: number[] }
  | { type: "speaker"; label: string; confidence: number; speaker_id?: string }
  | { type: "color_palette"; colors: string[]; score: number }
  | { type: "composition"; descriptor: string; score: number }
  | { type: "camera_motion"; motion: CameraMotion; score: number }
  | { type: "emotion"; profile: AffectiveProfile; score: number }
  | { type: "semantic_similarity"; score: number; model: string };

export type ConfidenceBreakdown = {
  overall: number;
  components: {
    transcript_match?: number;
    speaker_match?: number;
    object_match?: number;
    composition_match?: number;
    color_match?: number;
    emotion_match?: number;
    semantic_similarity?: number;
    graph_constraint?: number;
  };
  penalties: {
    stale_analysis?: number;
    conflicting_metadata?: number;
    low_audio_quality?: number;
    duplicate_penalty?: number;
  };
  calibration: { model_version: string; calibrated: boolean };
  label: "very_strong_match" | "strong_match" | "possible_match" | "weak_match";
};

export type SearchResult = {
  result_id: string;
  asset_id: string;
  project_id: string;
  time_range: { start_ms: number; end_ms: number };
  thumbnail_frame_ms: number;
  ranking: { position: number; overall_score: number; label: ConfidenceBreakdown["label"] };
  evidence: EvidenceItem[];
  explanation: { summary: string; factors: string[] };
  confidence: ConfidenceBreakdown;
  permissions: { can_view: boolean; can_edit: boolean; can_download: boolean };
  duplicate_family_id?: string;
  analysis_state?: { analysis_version: string; embedding_version: string; transcript_version: string; indexed_at: string; stale: boolean };
  graph_path?: string[];
};

export type DuplicateFamily = {
  family_id: string;
  level: DuplicateLevel;
  members: { asset_id: string; variant: string; time_range?: { start_ms: number; end_ms: number } }[];
  similarity: number;
  reasons: string[];
  differences?: string[];
};

export type SearchAudit = {
  audit_id: string;
  query_text: string;
  parsed_intent: ParsedQuery;
  scope: SearchContext;
  mode: SearchMode;
  model_versions: string[];
  index_versions: string[];
  candidate_sources: string[];
  ranking_factors: string[];
  results_displayed: number;
  filtered_counts?: { inaccessible_projects: number; expired_consent: number; legal_hold: number };
  timestamp: string;
};

export type QueryPlan = {
  plan_id: string;
  original: string;
  structured: ParsedQuery["structured"];
  steps: string[];
  candidate_sources: string[];
  ranking_weights: Record<string, number>;
  requires_clarification?: { term: string; meanings: string[] };
};
