/**
 * N0VA VIDEOS — Professional Interchange Types
 * Canonical timeline → format-specific compilers → validated package
 */
export type InterchangeFormat = "AAF" | "XML" | "EDL" | "OMF" | "FCPXML";

export type ExportProfileId =
  | "avid_editorial_aaf"
  | "resolve_color_xml"
  | "resolve_audio_aaf"
  | "protools_omf"
  | "fcp_xml"
  | "premiere_xml"
  | "legacy_picture_edl"
  | "broadcast_imf"
  | "camera_original_conform"
  | "proxy_editorial";

export type Timecode = {
  rate: string; // "23.976", "29.97", "24"
  drop_frame: boolean;
  source_start: string; // "01:02:03;12" or "01:02:03:12"
  record_start: string;
  auxiliary?: { name: string; value: string };
  frame_count?: number;
};

export type ReelIdentity = {
  reel: string; // A003C004
  roll: string;
  camera_card: string;
  clip_name: string; // A003C004_20260828_001
  file_name: string; // A003C004_001.R3D
  source_range: { in_ms: number; out_ms: number };
  timeline_range: { in_ms: number; out_ms: number };
};

export type CameraRawMetadata = {
  asset_id: string;
  format: string; // ARRIRAW, R3D
  camera: string; // ARRI ALEXA 35
  iso: number;
  white_balance_kelvin: number;
  tint: number;
  shutter_angle: number;
  aperture?: number;
  lens?: { manufacturer: string; model: string; focal_length_mm: number; t_stop: number };
  debayer: { method: string; version: string };
  look: { cdl: string; lut: string };
  sidecar_hash: string;
  status: "preserved" | "referenced" | "converted" | "baked" | "unavailable";
};

export type LutReference = {
  lut_id: string;
  name: string;
  format: ".cube" | ".3dl" | string;
  content_hash: string; // sha3-512
  input_color_space: string; // ARRI LogC4
  output_color_space: string; // ACEScct
  intensity: number;
  applied_mode: "referenced" | "baked" | "neutral_plus_lut";
  baked_into_export: boolean;
  scope?: "clip" | "scene" | "timeline";
  color_pipeline_version?: string;
};

export type CanonicalClip = {
  clip_id: string;
  asset_id: string;
  track: string; // video_1, audio_1
  track_order: number;
  source_range: { in_ms: number; out_ms: number; in_tc: string; out_tc: string };
  record_range: { in_ms: number; out_ms: number; in_tc: string; out_tc: string };
  timecode: Timecode;
  reel: ReelIdentity;
  clip_name: string;
  handles: { head_frames: number; tail_frames: number };
  speed?: { factor: number; mode: "constant" | "time_remap" | "freeze" };
  transition?: { type: string; duration_frames: number };
  multicam?: { group_id: string; angle: number };
  audio_channels?: number[];
  effects?: string[]; // node_ids
  lut_ref?: string; // lut_id
  camera_raw_ref?: string; // asset_id
  proxy_original?: { proxy_path: string; original_path: string };
  captions?: string[];
};

export type CanonicalTimeline = {
  timeline_id: string;
  sequence_id: string;
  name: string;
  frame_rate: string;
  timecode: Timecode;
  tracks: { track_id: string; order: number; kind: "video" | "audio" | "graphics"; channels?: number }[];
  clips: CanonicalClip[];
  graph_version?: string;
  provenance?: string;
  approval_state?: string;
};

export type RelinkEntry = {
  n0va_asset_id: string;
  proxy_path: string;
  original_path: string;
  shared_path: string;
  source_timecode: string;
  reel: string;
  duration_frames: number;
  media_fingerprint: string; // sha3-512
  relink_priority: string[]; // ordered keys
};

export type StorageProfile = {
  name: string;
  protocol: "SMB" | "NFS" | "S3" | "FC" | "NVMe" | "NEXIS" | "hybrid";
  mounts: { originals: string; proxies: string; renders: string; audio: string; graphics: string };
  permissions: { originals: "read_only" | "read_write"; proxies: "read_write"; renders: "read_write" };
  path_mapping: { macos: string; windows: string; linux: string };
};

export type AudioLayout = {
  format: string; // 7.1.4, stereo, 5.1
  channels: { index: number; label: string }[];
  sample_rate: number;
  bit_depth: number;
  track_map?: Record<string, number[]>;
};

export type InterchangePackage = {
  package_id: string;
  timeline_id: string;
  graph_version: string;
  profile: ExportProfileId;
  format: InterchangeFormat;
  canonical_timeline: CanonicalTimeline;
  files: {
    canonical: string;
    interchange: Record<InterchangeFormat, string | null>;
    media: { proxies?: string[]; camera_original_refs?: string[]; audio_turnover?: string[]; graphics?: string[] };
    metadata: { camera_raw?: string; lut_registry?: string; reel_map?: string; relink_map?: string; channel_layout?: string };
    validation: { report_html?: string; warnings_json?: string; roundtrip_json?: string };
    provenance: { manifest?: string; c2pa?: string; graph_version_json?: string };
    readme: string;
  };
  preservation: Record<string, "preserved" | "approximated" | "flattened" | "omitted">;
  created_at: string;
  warnings: string[];
};

export type EffectTransfer = {
  effect_id: string;
  source_type: "n0va_ai_node";
  target_format: InterchangeFormat;
  result: "preserved" | "flattened_to_media" | "omitted" | "flattened_range";
  replacement_asset?: string;
  provenance_preserved: boolean;
};

export type InterchangeProfile = {
  format: InterchangeFormat;
  schema_version?: string;
  target_application: string;
  target_version: string;
};

export type LossReport = {
  format: InterchangeFormat;
  target: string;
  preserved: string[];
  rendered: string[];
  not_represented: string[];
  companion_files: string[];
};

export type BroadcastValidation = {
  profile: string;
  result: "passed" | "warning" | "blocked";
  checks: Record<string, "passed" | "warning" | "failed">;
  issues: { type: string; maximum_dbtp?: number; limit_dbtp?: number; range?: string }[];
};

export type RoundtripReport = {
  format: InterchangeFormat;
  target: string;
  result: "passed" | "passed_with_warnings" | "failed";
  timeline: { clip_count_match: boolean; duration_match: boolean; timecode_match: boolean; track_layout_match: boolean };
  losses: { feature: string; handling: string }[];
  relink_success?: number;
};

export type AIGraphInterchange = 
  | { mode: "native_reference"; node_id: string; operation: string; model_digest: string; parameters_hash: string; input_hashes: string[]; output_hash: string; reproducibility: string }
  | { mode: "flattened_media"; original_ref: string; rendered_asset: string; affected_range: string; model_meta: string; manifest: string };
