/**
 * N0VA VIDEOS — Controlled Generative Workspace Types
 * Hard separation: Originals → Generated Workspace → Editorial Derivatives → Deliverables
 */

// ── Workspace separation ───────────────────────────────────────────────────
export type AssetDomain = "ORIGINALS" | "GENERATED_WORKSPACE" | "EDITORIAL_DERIVATIVES" | "DELIVERABLES";
export type AssetBadge = "Original" | "Generated" | "GEN" | "ASSIST" | "EXT" | "FILL";

export type DomainAsset = {
  asset_id: string;
  domain: AssetDomain;
  badge: AssetBadge;
  status: "immutable" | "draft" | "generated" | "approved";
  hash: string;
  created_at: string;
  provenance_manifest_id?: string;
};

// ── Generation modes ───────────────────────────────────────────────────────
export type GenerationMode =
  | "text_to_video"
  | "image_to_video"
  | "object_removal"
  | "background_extension"
  | "camera_variation"
  | "shot_continuation"
  | "synthetic_broll"
  | "storyboard_frame"
  | "style_transfer";

export type TextToVideoJob = {
  generation_job: {
    type: "text_to_video";
    prompt: string;
    negative_prompt: string;
    duration_ms: number;
    frame_rate: number;
    resolution: string; // 1920x1080
    aspect_ratio: string; // 16:9
    seed: number;
    model_id: string; // n0va-video-gen-pro
    model_version: string;
    guidance: number;
    policy_profile: string; // commercial_brand_safe
    reference_assets?: string[]; // anchor ids
    brand_constraints?: string[];
  };
  prompt_hash: string;
  output_hash?: string;
  status: "queued" | "rendering" | "generated" | "approved" | "rejected";
};

export type ImageToVideoJob = {
  mode: "start_frame" | "end_frame" | "keyframe" | "motion" | "loop";
  source_image_id: string;
  camera_motion?: string;
  depth_aware?: boolean;
  control_map?: string;
};

export type GenerativeOperation = {
  type: "object_removal";
  source_asset_id: string;
  range: { start_ms: number; end_ms: number };
  mask_id: string;
  target_description: string; // remove microphone stand
  preserve: string[]; // cast shadow, reflection
  model_id: string; // n0va-inpaint-v2
  output_mode: "new_derived_asset";
  mask_details?: { feather: number; tracking_confidence: number; stabilized: boolean };
};

export type BackgroundExtension = {
  type: "horizontal" | "vertical" | "aspect_conversion" | "set_extension" | "sky_replace" | "clean_plate";
  perspective_aware?: boolean;
  depth_parallax?: boolean;
  warnings?: string[]; // repeated textures etc.
};

export type CameraVariation = {
  framing: "wide" | "medium" | "close";
  movement: "dolly" | "truck" | "pan" | "tilt" | "crane" | "orbit";
  position: "low" | "eye" | "high";
  focal_length_sim?: number;
  dof: "shallow" | "deep";
  lighting: "soft" | "hard" | "warm" | "cool" | "directional";
  tod: string; // time-of-day
  generation_method: "camera_simulation" | "image_space" | "depth_aware" | "synthetic_regeneration";
};

// ── Anchors ────────────────────────────────────────────────────────────────
export type CharacterAnchor = {
  anchor_id: string;
  references: { face_embeddings?: string[]; wardrobe?: string[]; hair?: string[] };
  approved_images: string[];
  wardrobe_refs: string[];
  consent: { owner: string; permitted_use: string; territories: string[]; expires_at: string; prohibited: string[] };
  approved_models: string[];
};

export type ProductAnchor = {
  anchor_id: string;
  approved_assets: string[]; // asset_front_hero etc.
  constraints: {
    preserve_logo: boolean;
    preserve_button_count: boolean;
    preserve_color: boolean;
    preserve_screen_ui: boolean;
    allow_camera_variation: boolean;
    allow_background_variation: boolean;
  };
  usage_policy: { commercial: boolean; territories: string[]; expires_at: string };
  erp_metadata?: Record<string, unknown>;
};

export type AnchorCheckResult = {
  anchor_id: string;
  passed: boolean;
  warnings: string[]; // logo deformation etc.
  confidence: number;
};

// ── Storyboard ─────────────────────────────────────────────────────────────
export type StoryboardCard = {
  scene: string;
  shot: string;
  duration_ms: number;
  framing: string;
  camera: string;
  action: string;
  dialogue: string;
  lighting: string;
  reference?: string; // anchor
  generation_status: "exploratory" | "approved";
};

// ── Continuation & B-roll ──────────────────────────────────────────────────
export type ContinuationJob = {
  source_clip_id: string;
  extend_by_ms: number;
  preserve: string[]; // subject_identity, product_geometry
  transition_window_ms: number;
  temporal_consistency_target: number;
  output: string;
};

export type BrollCandidate = {
  purpose: string;
  concept: string;
  duration_ms: number;
  style: string;
  source: "generated";
  product_anchor: string;
  continuity_confidence: number;
  brand_risk: "low" | "medium" | "high";
  suggested_insertion: string; // 00:01:14.200
};

// ── Review grid ────────────────────────────────────────────────────────────
export type GenerativeReviewState =
  | "Draft"
  | "Generated"
  | "Needs review"
  | "Approved for editorial"
  | "Approved for client review"
  | "Approved for delivery"
  | "Restricted"
  | "Rejected"
  | "Archived"
  | "Revoked";

// ── Provenance (machine + visible + segment) ───────────────────────────────
export type MachineProvenance = {
  asset_id: string;
  content_status: "ai_generated" | "ai_assisted" | "original";
  generation_type: GenerationMode;
  source_assets: { asset_id: string; role: string; hash: string }[];
  model: { provider: string; model_id: string; version: string; model_digest: string };
  generation: { prompt_id: string; prompt_hash: string; seed: number; parameters_hash: string; created_at: string };
  operations: { type: string; range: { start_ms: number; end_ms: number } }[];
  human_actions: { actor_id: string; action: string; timestamp: string }[];
  usage_restrictions: { commercial_use: boolean; political_use: boolean; training_use: boolean; territories: string[]; expiry: string };
  integrity: { asset_hash: string; manifest_hash: string; signature: string };
};

export type SegmentProvenance = {
  timeline_id: string;
  segments: { start_ms: number; end_ms: number; status: "original" | "ai_assisted" | "ai_generated"; asset_id: string; operation?: string }[];
};

export type VisibleDisclosure = "corner_label" | "slate" | "end_card" | "timeline_badge" | "review_watermark" | "platform_specific";

// ── Restrictions & consent ─────────────────────────────────────────────────
export type UsageCheck = {
  asset_id: string;
  requested_action: "generate" | "insert" | "review" | "interchange" | "render" | "publish";
  result: "allowed" | "blocked" | "needs_review";
  reasons: string[];
};

export type ConsentRecord = {
  consent_id: string;
  subject: string; // character face/voice
  rights_owner: string;
  permitted_use: string;
  territory: string[];
  duration: string;
  allowed_transforms: string[];
  prohibited_contexts: string[];
  revocation_status: "active" | "revoked";
};

// ── Model registry ─────────────────────────────────────────────────────────
export type ModelRegistryEntry = {
  model_id: string;
  version: string;
  capabilities: GenerationMode[];
  approved_for: string[];
  restricted_for: string[];
  training_policy: { customer_content_training: boolean };
  data_residency: string[];
  retention_days: number;
  license_reference: string;
};

// ── Safety checks ──────────────────────────────────────────────────────────
export type SafetyCheck = {
  check: string;
  passed: boolean;
  details?: string;
};

// ── Compliance report ──────────────────────────────────────────────────────
export type SyntheticComplianceReport = {
  total_segments: number;
  fully_generated: number;
  ai_assisted: number;
  generative_fill: number;
  provenance: { present: number; total: number; output_hashes_verified: number; visible_disclosures: number; needs_decision: number };
  usage: { territory_restriction: number; consent_violations: number; rights_confirmation_needed: number };
  export_status: "blocked" | "ready" | "ready_with_watermark";
  issues: string[];
};

// ── Prompt history ─────────────────────────────────────────────────────────
export type PromptVersion = {
  version: number;
  prompt: string;
  negative_prompt?: string;
  system_constraints?: string;
  reference_assets?: string[];
  seed: number;
  model: string;
  parameters: Record<string, unknown>;
  output_candidates: string[];
  rejection_reason?: string;
  approval_decision?: string;
  user_id: string;
  timestamp: string;
  branch: string;
};

// ── On-prem ────────────────────────────────────────────────────────────────
export type ProcessingRoute = {
  location: string; // Studio GPU Cluster — Mumbai
  cloud_fallback: boolean;
  reference_assets: string;
  prompt_retention: string;
  training_use: string;
};
