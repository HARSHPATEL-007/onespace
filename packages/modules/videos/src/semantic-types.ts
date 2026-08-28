/**
 * N0VA VIDEOS — Semantic Timeline Intelligence Types
 * Unified temporal model: editorial timeline ↔ semantic timeline (transcripts, scenes, objects, speakers, emotions, narrative, review, continuity, provenance)
 */

export type SemanticSpan = {
  semantic_span_id: string;
  timeline_id: string;
  start_ms: number;
  end_ms: number;
  source: { asset_id: string; source_start_ms: number; source_end_ms: number };
  entities: { type: "person" | "object" | "location"; id?: string; label?: string; confidence: number }[];
  dialogue?: { speaker_id: string; text: string; language: string; confidence: number };
  scene?: { scene_id: string; shot_type: string; location: string; continuity_group: string };
  narrative?: { role: string; importance: number };
  review_state?: string;
  provenance?: { generator: string; verified: boolean };
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
  confidence: number;
  actions: ("select" | "mark" | "add_to_alt_cut" | "replace_in_current_timeline")[];
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
};

export type DialogueCleanupSuggestion = {
  suggestion_id: string;
  type: "remove_filler" | "remove_false_start" | "remove_duplicate" | "remove_stutter" | "remove_pause" | "remove_crosstalk" | "fix_terminology" | "remove_offtopic";
  range: { start_ms: number; end_ms: number };
  original: string;
  proposed: string;
  confidence: number;
  visual_risk: number;
  audio_risk: number;
  requires_review: boolean;
};

export type SemanticCutOp = "remove_filler" | "keep_product_demos" | "shorten_60s" | "replace_answer" | "remove_competitor" | "strongest_emotion" | "evidence_first" | "social_cut";

export type Branch = {
  branch_id: string;
  parent_timeline_version: string;
  selection_rules: { include?: string; exclude?: string; minimum_importance?: number }[];
  constraints: { maximum_duration_ms?: number; aspect_ratio?: string };
  overrides: { type: string; from?: string; to_position?: number }[];
  materialized_render: string | null;
  approval_state: string;
};

export type NarrativeStage = { role: string; start_ms: number; end_ms: number; confidence: number; summary: string; emotional_intensity: number; speakers?: string[]; claims?: string[] };

export type EmotionSpan = {
  start_ms: number; end_ms: number;
  signals: { facial_expression: string; vocal_energy: number; dialogue_sentiment: number; editorial_intensity: number };
  confidence: { facial_expression: number; vocal_energy: number; dialogue_sentiment: number };
  display_label: string;
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
};

export type ReviewCommentSemantic = {
  comment_id: string;
  target: { type: "semantic_span" | "word" | "object" | "scene"; span_id?: string; entity?: string; claim_text?: string };
  range: { start_ms: number; end_ms: number };
  content: string;
  status: "open" | "resolved" | "orphaned";
  reviewer: string;
};

export type SemanticDiff = {
  diff_id: string;
  from_version: string;
  to_version: string;
  duration_delta_ms: number;
  changes: { type: string; range_from?: { start_ms: number; end_ms: number }; semantic_reason?: string; source_event_id?: string; clip_id?: string; from_position?: number; to_position?: number; narrative_effect?: string }[];
  narrative_delta: Record<string, number>;
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
