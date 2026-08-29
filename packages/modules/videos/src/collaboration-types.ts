/**
 * N0VA VIDEOS — Collaborative Editing Fabric Types
 * Role-aware, branch-native, CRDT/OT metadata + immutable content-addressed media
 */

export type CollaboratorRole = "editor" | "reviewer" | "producer" | "client" | "legal" | "viewer" | "director" | "administrator";

export type RolePermission = {
  permission: string; // timeline.region.edit
  subject: string; // role:editor
  scope: {
    project_id: string;
    branch_id?: string;
    tracks?: string[];
    time_ranges?: { start_ms: number; end_ms: number }[];
  };
  conditions?: {
    review_stage?: string;
    requires_lock?: boolean;
    region_locked?: boolean;
  };
};

export type ReviewStage = "editor_self_review" | "creative_director_review" | "legal_compliance" | "client_approval" | "final_delivery";

export type StagePermissions = Record<ReviewStage, Partial<Record<CollaboratorRole, string>>>;

export type PresenceUser = {
  user_id: string;
  display_name: string;
  role: CollaboratorRole;
  avatar?: string;
  branch_id: string;
  timeline_position_ms: number;
  selected_clip?: string;
  active_tool?: string;
  editing_status: "editing" | "reviewing" | "watching" | "idle";
  last_activity: string;
  voice_chat: boolean;
  screen_sharing: boolean;
  lock_owned?: string;
  cursor?: { track: string; x: number; y: number };
};

export type TimelineLockType = "exclusive_edit" | "soft_claim" | "review_lock" | "legal_lock" | "approval_lock" | "export_lock" | "read_only" | "consent_lock" | "temporary_generation_lock";

export type TimelineLock = {
  lock_id: string;
  owner_id: string;
  branch_id: string;
  scope: { tracks: string[]; start_ms: number; end_ms: number; scenes?: string[]; clip_group?: string };
  lock_type: TimelineLockType;
  reason: string;
  expires_at: string;
  created_at: string;
  allow_comments: boolean;
  allow_review: boolean;
  allow_override_roles: CollaboratorRole[];
  heartbeat_at?: string;
};

export type TimelineOperation = {
  op_id: string;
  actor_id: string;
  branch_id: string;
  lamport_clock: number;
  vector_clock: Record<string, number>;
  type: string; // trim_clip, move_clip, reorder_tracks, delete_clip, edit_title, lock_claim, approve_region
  target: Record<string, string>;
  payload: Record<string, unknown>;
  base_revision: string;
  created_at: string;
  causal_parent?: string;
  signature: string;
  branch_aware: boolean;
};

export type Branch = {
  branch_id: string;
  name: string;
  parent_branch_id: string;
  parent_revision: string;
  owner_id: string;
  purpose: string;
  scope?: { time_ranges: { start_ms: number; end_ms: number }[] };
  review_stage: ReviewStage;
  inherit_approvals: boolean;
  status: "active" | "merged" | "archived" | "expired";
  created_at: string;
  approvals_inherited?: string[];
  approvals_invalidated?: string[];
  required_reviewers?: string[];
  access_policy?: string;
  expires_at?: string;
};

export type ConflictCategory = "structural" | "temporal" | "media_reference" | "parameter" | "text" | "audio" | "graphics" | "legal" | "brand" | "consent" | "review_state" | "permission" | "approval_invalidation";

export type ConflictPreview = {
  range: { start_ms: number; end_ms: number };
  main: string;
  branch: string;
  conflict_type: string;
  category: ConflictCategory;
};

export type MergePreview = {
  source_branch: string;
  target_branch: string;
  conflicts: ConflictPreview[];
  warnings: ConflictPreview[];
  auto_mergeable: number;
  total_ops: number;
};

export type ApprovalRecord = {
  approval_id: string;
  branch_id: string;
  range: { start_ms: number; end_ms: number };
  stage: ReviewStage;
  status: "approved" | "pending" | "invalidated" | "changes_requested";
  revision: string;
  approver_id?: string;
  created_at: string;
};

export type CommentThread = {
  thread_id: string;
  anchor: {
    branch_id: string;
    timeline_ms: number;
    frame: number;
    region?: { x: number; y: number; width: number; height: number };
    clip_id?: string;
    transcript_word?: string;
  };
  stage: string;
  status: "open" | "resolved" | "archived";
  participants: string[];
  messages: { message_id: string; author_id: string; text: string; created_at: string }[];
  decision?: string | null;
  branch_inherited?: boolean;
};

export type MarkerSet = {
  marker_set_id: string;
  name: string;
  color: string;
  visibility: "project_members" | "private" | "public";
  editable_by: CollaboratorRole[];
  approval_required_for_delete: boolean;
  markers: { marker_id: string; time_ms: number; label: string; type: string }[];
};

export type UserViewLayout = {
  user_id: string;
  project_id: string;
  layout_name: string;
  panels: Record<string, boolean>;
  timeline: { zoom: number; track_heights: Record<string, number> };
  filters?: Record<string, string>;
};

export type OfflineOperation = TimelineOperation & {
  device_id: string;
  local_branch: string;
  local_revision: string;
  operation_hash: string;
  parent_vector_clock: Record<string, number>;
};

export type ReconciliationReport = {
  applied_automatically: number;
  needs_review: number;
  rejected: number;
  rejected_details?: string[];
  conflicts: string[];
  approvals_invalidated: string[];
};

export type CollaborationEvent = {
  event_type: string; // video.timeline.operation.applied etc.
  timeline_id: string;
  branch_id: string;
  revision: string;
  operation_ids?: string[];
  affected_regions?: { start_ms: number; end_ms: number; tracks: string[] }[];
  approval_effect?: { invalidated: string[] };
  user_id?: string;
};

export type PerformanceTarget = { operation: string; target_ms: number };
