/**
 * N0VA VIDEOS — Review Intelligence Types
 * Traceable requests with verification, clustering, dependencies, risk
 */

export type ReviewItemStatus =
  | "captured"
  | "time_aligned"
  | "classified"
  | "clustered"
  | "assigned"
  | "converted_to_request"
  | "implemented"
  | "implemented_pending_verification"
  | "verified"
  | "accepted"
  | "rejected"
  | "resolved"
  | "not_started"
  | "suggested"
  | "in_progress"
  | "partially_implemented"
  | "not_implemented"
  | "blocked"
  | "reopened"
  | "verified_by_system"
  | "confirmed_by_reviewer";

export type ReviewItem = {
  review_item_id: string;
  source_comment_ids: string[];
  review_round_id: string;
  status: ReviewItemStatus;
  type: "edit_request" | "question" | "approval" | "observation";
  priority: "low" | "medium" | "high" | "critical";
  urgency: "low" | "normal" | "deadline_sensitive" | "immediate" | "informational";
  owner_id: string;
  affected_region: { start_ms: number; end_ms: number; tracks: string[] };
  requested_change: { normalized_text: string; operation_type: string };
  original_text?: string;
  source_revision: string;
  target_revision: string | null;
  verification: { status: ReviewItemStatus; evidence: { type: string; asset_id: string }[] };
  blocker: boolean;
  cluster_id?: string;
  approval_dependencies?: string[];
  created_at: string;
};

export type ReviewRound = {
  review_round_id: string;
  project_id: string;
  revision_id: string;
  stage: string; // client_approval etc.
  deadline: string;
  participants: { user_id: string; role: string; required: boolean }[];
  items: ReviewItem[];
  risk?: DeadlineRisk;
};

export type Cluster = {
  cluster_id: string;
  review_item_ids: string[];
  time_range: { start_ms: number; end_ms: number };
  source_clip?: string;
  intent: string;
  participants: string[];
  confidence: number;
  reason: string[];
};

export type FeedbackRelationship = {
  type: "semantic_duplicate" | "exact_duplicate" | "contradiction" | "follow_up";
  source_ids: string[];
  canonical_review_item_id: string;
  confidence: number;
  human_confirmed: boolean;
};

export type EditSuggestion = {
  suggestion_id: string;
  review_item_id: string;
  operation: { type: string; target_clip_id: string; candidate_asset_id?: string; source_in_ms?: number; source_out_ms?: number; parameters?: Record<string, unknown> };
  confidence: number;
  estimated_impact: { duration_delta_ms: number; audio_retiming_required: boolean; approval_regions_affected: string[]; consent_legal_impact?: string };
  requires_human_acceptance: boolean;
  suggested_assignee?: string;
};

export type ApprovalDependencyGraph = {
  nodes: { node_id: string; stage: string; scope: string | { regions: { start_ms: number; end_ms: number }[] }; status: "approved" | "pending" | "blocked" | "invalidated" }[];
  edges: { from: string; to: string; condition: string }[];
};

export type Blocker = {
  blocker_id: string;
  review_item_id: string;
  severity: "critical" | "high" | "medium" | "low";
  reason: string;
  category: string;
};

export type Classification = {
  sentiment: { label: "positive" | "neutral" | "concerned" | "frustrated" | "negative" | "appreciative" | "conflicted"; confidence: number };
  urgency: { label: "immediate" | "deadline_sensitive" | "normal" | "low" | "informational"; confidence: number };
  intent: { label: "change_request" | "question" | "approval" | "rejection" | "observation" | "legal_warning"; confidence: number };
  explanation: string[];
};

export type DeadlineRisk = {
  level: "green" | "yellow" | "orange" | "red" | "blocked";
  score: number; // 0-1
  confidence: number;
  drivers: string[];
  recommendations: string[];
  estimated_edit_hours?: number;
  hours_remaining?: number;
};

export type VerificationResult = {
  status: ReviewItemStatus;
  source_clip_removed: boolean;
  candidate_inserted: boolean;
  region: { start_ms: number; end_ms: number };
  audio_preserved: boolean;
  brand_affected: boolean;
  evidence_asset_id?: string;
  confidence: number;
};

export type ReviewEvent = {
  event_type: string;
  review_item_id?: string;
  source_revision?: string;
  target_revision?: string;
  verification_status?: string;
  evidence?: Record<string, unknown>;
};

export type FeedbackCapture = {
  type: "text" | "video_review" | "voice_note";
  source_asset_hash?: string;
  reviewed_version?: string;
  segments: { feedback_start_ms: number; feedback_end_ms: number; timeline_anchor: { start_ms: number; end_ms: number }; transcript: string; annotation_type: string; confidence: number }[];
};
