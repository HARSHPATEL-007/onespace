/**
 * N0VA VIDEOS — Non-Destructive AI Editing Graph Types
 * DAG render graph: immutable Asset → Node (parameterized) → Edge → GraphVersion → Artifact (cached)
 * Timeline is a projection over graph, not mutable clip storage.
 */

// ── Core object classes ──────────────────────────────────────────────────────
export type Asset = {
  asset_id: string;
  asset_type: "original_media" | "proxy" | "audio_stem" | "transcript" | "caption" | "mask" | "metadata_package";
  immutability: {
    write_once: boolean;
    content_hash: string; // sha3-512:
    decoded_hash: string;
    legal_hold: boolean;
  };
  media: {
    duration_ms: number;
    frame_rate: number;
    resolution: [number, number];
    codec: string;
    container?: string;
  };
  metadata: {
    decoded_hash?: string;
    frame_hashes?: string[];
    audio_hashes?: string[];
    technical?: Record<string, unknown>;
    source_timecode?: string;
    camera_meta?: Record<string, unknown>;
    rights?: { consent_id?: string };
    ingest_at: string;
  };
  provenance_root: string; // merkle:
  storage?: { tier: string; location: string };
};

export type NodeCategory =
  | "structural"
  | "visual_ai"
  | "audio_ai"
  | "semantic"
  | "finishing";

// Controlled taxonomy examples per spec
export const NODE_TAXONOMY: Record<NodeCategory, string[]> = {
  structural: ["trim","split","ripple_delete","reorder","time_remap","multicam_select","speed_change","freeze_frame","nested_sequence"],
  visual_ai: ["denoise","stabilization","super_resolution","frame_interpolation","object_removal","inpainting","background_replace","face_blur","face_replace","relighting","style_transfer","auto_reframe"],
  audio_ai: ["noise_reduction","voice_isolation","dereverberation","dialogue_enhance","stem_separation","voice_conversion","voice_clone","dubbing","lip_sync","loudness_normalize"],
  semantic: ["transcription","speaker_diarization","object_detection","scene_detection","emotion_analysis","claim_extraction","narrative_classification","continuity_analysis"],
  finishing: ["color_grade","lut","hdr_map","captions","lower_thirds","watermark","audio_mix","codec_packaging","c2pa_manifest"],
};

export type NodeType = string; // e.g. ai_video_transform, structural, etc.
export type NodeOperation = string; // background_replace etc.

export type NodeExecution = {
  model_id: string;
  model_version: string;
  model_digest: string; // sha3-512:model...
  runtime_digest: string; // sha256:container...
  hardware_class: string; // gpu-a100 etc.
  seed: number;
  precision: "fp16" | "fp32" | "bf16" | "int8";
  temperature_allowed?: boolean;
};

export type NodeDeterminismPolicy = {
  mode: "strict" | "bounded" | "creative" | "external";
  seed_required: boolean;
  temperature_allowed: boolean;
  provider_replay_supported: boolean;
  maximum_pixel_difference: number;
  maximum_audio_difference: number;
};

export type GraphNode = {
  node_id: string;
  node_type: NodeType;
  operation: NodeOperation;
  schema_version: string; // n0va.node.v1
  category: NodeCategory;
  inputs: { port: string; artifact_id: string }[];
  parameters: Record<string, unknown>; // includes prompt_ref, background_asset_id, blend_mode, strength etc. + scope + consent
  execution: NodeExecution;
  determinism_policy: NodeDeterminismPolicy;
  attribution: { operator_id: string; agent_id: string; request_id: string };
  consent_refs?: string[];
  scope?: {
    time_ranges?: { start_ms: number; end_ms: number }[];
    regions?: { mask_artifact_id: string; semantic_target?: string }[];
    // extended selectors
    object_track?: string;
    face_track?: string;
    speaker_segment?: string;
    audio_band?: string;
    caption_interval?: string;
    frame_range?: [number, number];
  };
  state: "enabled" | "disabled";
  node_hash: string; // sha3-512:node...
  created_at: string;
  supersedes?: string | null; // previous node version id
  explanation?: string;
  confidence?: number;
};

export type GraphEdge = [string, string]; // [fromNodeId, toNodeId]

export type GraphVersion = {
  graph_id: string;
  graph_version: string; // gv_42
  root_inputs: string[]; // asset_ids
  active_outputs: string[]; // node_ids (export nodes)
  nodes: string[]; // active node ids ordered
  edges: GraphEdge[];
  graph_hash: string; // sha3-512:graph...
  created_at: string;
  parent_version?: string | null;
  change_reason?: string;
  immutable_after?: "approval" | "publication" | null;
};

export type GraphArtifact = {
  artifact_id: string;
  artifact_hash: string; // sha3-512:output...
  node_id: string;
  graph_version: string;
  input_hashes: string[];
  node_hash: string;
  render_profile_hash: string;
  media_equivalence: "verified" | "pending" | "failed";
  storage: { tier: "hot" | "warm" | "cold"; location: string };
  created_at: string;
  reused_by_graphs?: number;
};

export type CacheKeyComponents = {
  input_hashes: string[];
  node_hash: string;
  graph_version_hash: string;
  render_profile_hash: string;
  color_config_hash: string;
  audio_config_hash: string;
  caption_config_hash: string;
  runtime_digest: string;
  determinism_mode: string;
};

export type CacheEntry = {
  cache_key: string; // cache:sha3-512:...
  node_id: string;
  input_hashes: string[];
  node_hash: string;
  render_profile_hash: string;
  artifact_id: string;
  artifact_hash: string;
  media_equivalence: "verified" | "pending" | "failed";
  storage: { tier: string; location: string };
  reuse_counts: { exact: number; segment: number; cross_branch: number };
  created_at: string;
};

export type ReproducibilityLevel = "bit_exact" | "media_exact" | "process_exact";
export type ReproducibilityDeclaration = {
  target: ReproducibilityLevel;
  status: "verified" | "pending" | "failed" | "not_applicable";
  model_digests_locked: boolean;
  runtime_digest_locked: boolean;
  seeds_locked: boolean;
  fonts_locked?: boolean;
  codec_digest_locked?: boolean;
  verification_runs?: number;
  bounded_variance?: { max_pixel_diff: number; max_audio_diff: number };
};

export type ExecutionMetrics = {
  gpu_seconds: number;
  cpu_seconds: number;
  peak_memory_mb: number;
  provider_cost: { currency: string; amount: number };
  energy_estimate_kwh?: number;
  storage_generated_mb?: number;
  cache: { hit: boolean; reused_by_graphs: number };
};

export type GraphExplainFrame = {
  frame_label: string;
  source: { asset_id: string; frame_range: string; decoded_hash: string };
  active_path: { node_id: string; operation: string; model?: string; seed?: number; prompt_ref?: string; operator: string; agent: string; state: string; cache: string; approval: string }[];
  ai_details?: { model: string; seed: number; prompt_ref: string }[];
  current_state: string;
  output_hash: string;
};

export type NodeCompareMode = "side_by_side" | "overlay" | "difference" | "waveform" | "spectrogram" | "semantic";
export type NodeCompareSpec = {
  a: { label: string; artifact_id: string; node_id?: string };
  b: { label: string; artifact_id: string; node_id?: string };
  mode: NodeCompareMode;
};

export type ExternalCapture = {
  provider: string;
  endpoint: string;
  api_version: string;
  model_identifier: string;
  provider_digest?: string;
  request_payload_hash: string;
  request_redacted: string;
  response_hash: string;
  seed?: number;
  timestamp: string;
  region?: string;
  terms_version: string;
  output_artifact: string;
  reproducibility: "traceable_but_not_reproducible" | "reproducible";
};

export type ApprovalBinding = {
  approval_id: string;
  approved_target: { graph_id: string; graph_version: string; output_node: string; output_hash: string };
  scope: { destination: string; format: string; territories: string[] };
  status: "approved" | "pending" | "revoked" | "expired";
  invalidated_by?: string[];
};

export type NodeManifest = {
  node_id: string;
  node_type: string;
  input_artifacts: string[];
  output_artifact: string;
  operation: { name: string; parameters_hash: string };
  model: { provider: string; name: string; version: string; digest: string };
  prompt: { record_id: string; hash: string };
  consent: { record_id: string; valid_at_execution: boolean };
  actor: { human: string; agent: string };
  reproducibility: { mode: string; seed: number; status: string };
  output_hash: string;
};

export type TimelineProjection = {
  timeline_clip_id: string;
  source_range: { asset_id: string; in_ms: number; out_ms: number };
  graph_root_node: string;
  active_graph_version: string;
  displayed_operations: string[]; // node ids
};

export type GraphValidationError = { code: string; message: string; node_id?: string };
