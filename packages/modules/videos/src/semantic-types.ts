/**
 * N0VA VIDEOS — Semantic Timeline Intelligence Types
 * Unified temporal model: editorial timeline ↔ semantic timeline (transcripts, scenes, objects, speakers, emotions, narrative, review, continuity, provenance)
 */

export type InferenceProvenance = {
  model_version: string;
  confidence: number;
  evidence_type: "transcript" | "visual_embedding" | "audio_embedding" | "object_detection" | "face_recognition" | "scene_detection" | "emotion_multimodal" | "narrative_inference" | "review_annotation";
  time_range: { start_ms: number; end_ms: number };
  human_correction_state: "none" | "corrected" | "verified" | "rejected";
  last_verification_time?: string;
  affects_edit: boolean;
  requires_approval: boolean;
};

export type SemanticSpan = {
  semantic_span_id: string;
  timeline_id: string;
  start_ms: number;
  end_ms: number;
  source: { asset_id: string; source_start_ms: number; source_end_ms: number };
  entities: { type: "person" | "object" | "location"; id?: string; label?: string; confidence: number; bbox?: [number, number, number, number]; track_id?: string; brand?: string; privacy_status?: string }[];
  dialogue?: { speaker_id: string; text: string; language: string; confidence: number };
  scene?: { scene_id: string; shot_type: string; location: string; continuity_group: string };
  narrative?: { role: string; importance: number };
  review_state?: string;
  provenance?: { generator: string; verified: boolean; source?: string; model_version?: string; transformation?: string };
  inference?: InferenceProvenance;
  embedding?: { visual?: number[]; audio?: number[]; multimodal?: number[] };
};

export type TimelineLayer = "media" | "transcript" | "speakers" | "scenes" | "objects" | "emotion" | "narrative" | "review" | "continuity" | "provenance";

export const LAYERS: { id: TimelineLayer; label: string; color: string; desc: string }[] = [
  { id: "media", label: "Media", color: "#818cf8", desc: "Video, audio, graphics, captions, effects" },
  { id: "transcript", label: "Transcript", color: "#10b981", desc: "Word-level dialogue aligned to frames" },
  { id: "speakers", label: "Speakers", color: "#0ea5e9", desc: "Speaker bands, identity labels, confidence" },
  { id: "scenes", label: "Scenes", color: "#f59e0b", desc: "Scene boundaries, titles, shot types" },
  { id: "objects", label: "Objects", color: "#ec4899", desc: "Object appearance spans and regions" },
  { id: "emotion", label: "Emotion", color: "#8b5cf6", desc: "Valence, arousal, sentiment, confidence" },
  { id: "narrative", label: "Narrative", color: "#eab308", desc: "Introduction → Call to Action" },
  { id: "review", label: "Review", color: "#ef4444", desc: "Comments, approvals, unresolved issues" },
  { id: "continuity", label: "Continuity", color: "#f97316", desc: "Mismatches, missing coverage" },
  { id: "provenance", label: "Provenance", color: "#14b8a6", desc: "AI-generated, AI-modified, human-edited, approved" },
];

export type SemanticQueryResult = {
  timeline_id: string;
  range: { start_ms: number; end_ms: number };
  match_reasons: string[];
  source_asset_id: string;
  current_branch: string;
  related_clips: string[];
  confidence: number;
  actions: ("select" | "mark" | "add_to_alt_cut" | "replace_in_current_timeline")[];
  inference?: InferenceProvenance;
  transcript?: string;
  entities?: SemanticSpan["entities"];
  narrative_role?: string;
};

export type SemanticSearchRequest = {
  query: string;
  scope?: { timeline_version?: string; project_id?: string; timeline_id?: string };
  filters?: { speaker_id?: string; shot_type?: string; location?: string; narrative_role?: string; entity_label?: string };
  return_fields?: ("ranges" | "transcript" | "entities" | "confidence" | "narrative_role" | "branch")[];
  limit?: number;
};

export type SemanticSearchResponse = {
  query: string;
  results: SemanticQueryResult[];
  total: number;
  model_versions: { transcript: string; visual: string; multimodal: string };
  took_ms: number;
};

export type TranscriptToken = {
  token_id: string;
  text: string;
  start_ms: number;
  end_ms: number;
  speaker_id: string;
  source_asset_id: string;
  timeline_instances: { timeline_id: string; start_ms: number; end_ms: number; state: "active" | "removed" | "moved" | "replaced" }[];
  confidence: number;
  language?: string;
  translation_of?: string | null;
  caption_representation?: string;
  acoustic_features?: { pause_before_ms?: number; energy?: number; pitch_mean?: number };
};

export type TranscriptEditOperation = {
  operation: "remove_selected_transcript" | "replace_sentence" | "reorder_passage" | "convert_to_sequence" | "remove_filler_passage";
  token_ids: string[];
  mode: "preview" | "create_branch" | "apply_to_current";
  preserve_reaction_shots?: boolean;
  run_continuity_check?: boolean;
  replacement_asset_id?: string;
  target_position_ms?: number;
};

export type TranscriptEditPreview = {
  preview_id: string;
  affected_ranges: { kind: "dialogue" | "camera_angle" | "reaction_shot" | "caption_track" | "music_ducking"; range: { start_ms: number; end_ms: number } }[];
  original_text: string;
  proposed_text: string;
  duration_delta_ms: number;
  caption_updates: { track: string; old_ms: number; new_ms: number }[];
  visual_continuity_impact: number;
  audio_impact: number;
  timeline_operation: { type: string; description: string; reversible: boolean; rollback_point: string };
};

export type DialogueCleanupSuggestion = {
  suggestion_id: string;
  type: "remove_filler" | "remove_false_start" | "remove_duplicate" | "remove_stutter" | "remove_pause" | "remove_crosstalk" | "fix_terminology" | "remove_offtopic" | "remove_unfinished" | "remove_interruption" | "remove_low_confidence" | "remove_inconsistent_term" | "remove_contradictory" | "remove_profanity";
  range: { start_ms: number; end_ms: number };
  original: string;
  proposed: string;
  confidence: number;
  visual_risk: number;
  audio_risk: number;
  requires_review: boolean;
  waveform_impact?: string;
  visual_continuity_impact?: string;
  has_replacement_take?: boolean;
  narrative_impact?: string;
  acoustic_features?: { duration_ms: number; pause_ms?: number };
};

export type SemanticCutOp = "remove_filler" | "keep_product_demos" | "shorten_60s" | "replace_answer" | "remove_competitor" | "strongest_emotion" | "evidence_first" | "social_cut";

export type SemanticCutPlan = {
  plan_id: string;
  semantic_command: string;
  intent_interpretation: string;
  selected_spans: string[];
  excluded_spans: string[];
  reasons: Record<string, string>;
  expected_duration_change_ms: number;
  narrative_impact: string;
  continuity_risk: string;
  audio_risk: string;
  caption_impact: string;
  provenance_impact: string;
  confidence: number;
  reversal_method: string;
  timeline_operations: { type: string; description: string; range: { start_ms: number; end_ms: number } }[];
  requires_approval: boolean;
  preview_url?: string;
};

export type Branch = {
  branch_id: string;
  parent_timeline_version: string;
  selection_rules: { include?: string; exclude?: string; minimum_importance?: number }[];
  constraints: { maximum_duration_ms?: number; aspect_ratio?: string; target_platform?: string; narrative_target?: string };
  overrides: { type: string; from?: string; to_position?: number }[];
  materialized_render: string | null;
  approval_state: string;
  branch_specific?: { effects?: string[]; captions?: string[]; narrative_target?: string; duration_constraint?: number; approval_state?: string };
};

export type NarrativeStage = {
  role: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
  summary: string;
  emotional_intensity: number;
  speakers?: string[];
  claims?: string[];
  dominant_speakers?: string[];
  key_claims?: string[];
  supporting_shots?: string[];
  missing_coverage?: string[];
  suggested_alternatives?: string[];
};

export type NarrativeArcDiagnosis = {
  stage: string;
  issue: string;
  severity: "low" | "medium" | "high";
  explanation: string;
  suggestion: string;
};

export type EmotionSpan = {
  start_ms: number; end_ms: number;
  signals: { facial_expression: string; vocal_energy: number; dialogue_sentiment: number; editorial_intensity: number };
  confidence: { facial_expression: number; vocal_energy: number; dialogue_sentiment: number };
  display_label: string;
};

export type EntityAppearance = {
  label: string;
  confidence: number;
  bbox?: [number, number, number, number];
  appearance_range: { start_ms: number; end_ms: number };
  track_identity?: string;
  brand_or_model?: string;
  continuity_group?: string;
  source_asset_id: string;
  privacy_status?: string;
  shot_type?: string;
};

export type ContinuityIssue = {
  continuity_issue_id: string;
  type: string;
  ranges: { start_ms: number; end_ms: number }[];
  entity: string;
  explanation: string;
  confidence: number;
  severity: "low" | "medium" | "high";
  suggested_actions: string[];
  detected_by?: string;
  requires_approval_before_fix?: boolean;
};

export type ReviewCommentSemantic = {
  comment_id: string;
  target: { type: "semantic_span" | "word" | "sentence" | "speaker" | "object" | "face" | "scene" | "narrative_stage" | "claim" | "version_diff" | "suggestion"; span_id?: string; entity?: string; claim_text?: string };
  range: { start_ms: number; end_ms: number };
  content: string;
  status: "open" | "resolved" | "orphaned";
  reviewer: string;
  moves_with_semantic_object?: boolean;
  orphan_reason?: string;
};

export type SemanticDiff = {
  diff_id: string;
  from_version: string;
  to_version: string;
  duration_delta_ms: number;
  changes: {
    type: string;
    category: "editorial" | "semantic" | "visual" | "narrative" | "audio" | "review";
    range_from?: { start_ms: number; end_ms: number };
    range_to?: { start_ms: number; end_ms: number };
    semantic_reason?: string;
    source_event_id?: string;
    clip_id?: string;
    from_position?: number;
    to_position?: number;
    narrative_effect?: string;
    linked_event_ids?: string[];
  }[];
  narrative_delta: Record<string, number>;
  visual_summary?: { clips_trimmed: number; closeups_inserted: number; color_grade_changed: boolean };
  audio_summary?: { music_shift_ms: number; loudness_normalized: boolean };
  review_summary?: { resolved: string[]; new_unresolved: string[] };
};

export type SemanticSpanIndexKey = {
  tenant_id: string;
  project_id: string;
  timeline_id: string;
  start_ms: number;
  end_ms: number;
  entity_ids: string[];
  scene_id: string;
  narrative_role: string;
};

export type IndexType = "fulltext_transcript" | "vector_visual" | "vector_audio" | "vector_multimodal" | "temporal_interval" | "entity" | "geospatial" | "graph_relationship" | "version_branch" | "review" | "narrative" | "provenance" | "semantic_span";

export type SemanticIndexStats = {
  index: IndexType;
  entries: number;
  latency_p50_ms: number;
  latency_p99_ms: number;
  model_version?: string;
  dimension?: number;
};

export type AgentSemanticPlan = {
  plan_id: string;
  intent_interpretation: string;
  query: string;
  candidate_spans: string[];
  excluded_spans: string[];
  reason_for_each: Record<string, string>;
  expected_duration_change_ms: number;
  narrative_impact: string;
  continuity_risk: string;
  audio_risk: string;
  caption_impact: string;
  provenance_impact: string;
  confidence: number;
  reversal_method: string;
  preview_url?: string;
  requires_approval: boolean;
  risk_checks: { continuity: string; audio: string; caption: string; provenance: string };
};
