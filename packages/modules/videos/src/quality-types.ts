/**
 * N0VA VIDEOS — Continuity and Quality Intelligence Types
 * Structured timeline warnings with evidence, severity, proposals, gates — never silently alters edit.
 */
export type Severity = "informational" | "low" | "medium" | "high" | "critical";
export type WarningStatus = "open" | "intentional" | "dismissed" | "resolved";
export type Category =
  | "continuity"
  | "audio_sync"
  | "graphics_text"
  | "color_finishing"
  | "delivery_cropping"
  | "duplicate_content"
  | "ai_transformation";

export const CATEGORY_META: Record<Category, { label: string; color: string; icon: string }> = {
  continuity: { label: "Continuity", color: "#f59e0b", icon: "◆" },
  audio_sync: { label: "Audio and sync", color: "#3b82f6", icon: "♪" },
  graphics_text: { label: "Graphics and text", color: "#a855f7", icon: "T" },
  color_finishing: { label: "Color and finishing", color: "#f97316", icon: "◐" },
  delivery_cropping: { label: "Delivery and cropping", color: "#ef4444", icon: "▣" },
  duplicate_content: { label: "Duplicate content", color: "#6b7280", icon: "≡" },
  ai_transformation: { label: "AI transformation", color: "#14b8a6", icon: "✦" },
};

export type QualityPassId =
  | "editorial_continuity"
  | "technical"
  | "visual_consistency"
  | "graphics_text"
  | "distribution";

export type QualityWarning = {
  warning_id: string;
  timeline_id: string;
  graph_version: string;
  type: string; // e.g. eyeline_break, jump_cut, object_position_mismatch, audio_drift, lip_sync_mismatch, screen_replacement_drift, duplicate_dialogue, lower_third_identity_mismatch, color_temperature_mismatch, unsafe_title_area, background_continuity, audio_drift etc.
  category: Category;
  severity: Severity;
  status: WarningStatus;
  range: { start_ms: number; end_ms: number };
  evidence: Record<string, unknown> & { confidence: number; model_version?: string; threshold?: number; evidence_sources?: string[] };
  explanation: string;
  suggested_fixes: { type: string; confidence: number; candidate_clip_id?: string; candidate_asset_id?: string; parameters?: Record<string, unknown> }[];
  requires_approval: boolean;
  // linkage
  related_nodes?: string[];
  source_assets?: string[];
  semantic_span_ids?: string[];
  export_blocking?: boolean;
  // review
  human_resolution?: { resolution: string; note?: string; by?: string; at?: string } | null;
  false_positive_risk?: "low" | "moderate" | "high";
  style_dependent?: boolean;
};

export type QualityProposal = {
  proposal_id: string;
  warning_id: string;
  operation: { type: string; parameters: Record<string, unknown> };
  expected_effect: {
    warning_resolution: "likely" | "possible" | "unlikely";
    duration_delta_ms: number;
    continuity_risk: number;
    new_warnings?: string[];
  };
  mode: "preview_only" | "branch" | "current_timeline";
  requires_approval: boolean;
  graph_node_id?: string; // created graph node for fix
};

export type QualityFinding = {
  quality_finding_id: string;
  tenant_id: string;
  project_id: string;
  timeline_id: string;
  graph_version: string;
  finding_type: string;
  category: Category;
  severity: Severity;
  confidence: number;
  source_ranges: { asset_id: string; start_ms: number; end_ms: number }[];
  timeline_ranges: { start_ms: number; end_ms: number }[];
  related_nodes: string[];
  evidence_artifacts: string[];
  suggestions: string[]; // proposal ids
  status: WarningStatus;
  human_resolution: { resolution: string; note?: string } | null;
  model: { name: string; version: string; digest: string };
  export_blocking?: boolean;
};

export type QualityGate = {
  quality_gate_id: string;
  graph_version: string;
  export_profile: string;
  blocking_rules: {
    critical_warnings: "zero" | number;
    high_warnings: "zero" | number;
    lower_third_identity_mismatch: "zero" | number;
    audio_sync_max_ms: number;
    unsafe_title_overflow_percent: number;
  };
  result: "ready" | "blocked" | "ready_with_warnings";
  blocking_warnings: string[]; // finding ids
  evaluated_at: string;
};

export type EditorialIntentFeedback = {
  feedback_id: string;
  scope: { project?: string; series?: string; brand?: string; editor?: string; export_profile?: string; warning_type?: string };
  statement: string; // e.g. "Jump cuts are intentional"
  version: number;
  created_at: string;
};

export type QualityDashboard = {
  open: number;
  by_severity: Record<Severity, number>;
  by_category: Record<Category, number>;
  export_readiness: Record<string, { ready: boolean; blocking?: string[]; warnings: number }>;
  findings: QualityWarning[];
};
