/**
 * N0VA VIDEOS — Volumetric & Immersive Types
 * Every immersive asset searchable, every playback policy-validated.
 */
export type VolumetricFormat = "neRF" | "gaussian_splat" | "point_cloud" | "mesh_sequence" | "hologram_8k" | "vr180" | "ar_anchor";
export type ImmersivePlayback = "headset" | "webxr" | "hologram_stage" | "mobile_ar";

export interface VolumetricAsset {
  asset_id: string;
  tenant_id: string;
  format: VolumetricFormat;
  duration_ms?: number;
  bytes: number;
  spatial_hash: string;
  capture_rig?: string;
  provenance: { actor: string; policy_version: string; explainable: boolean };
  created_at: string;
}

export interface ImmersiveSession {
  session_id: string;
  tenant_id: string;
  asset_id: string;
  format: VolumetricFormat;
  playback: ImmersivePlayback;
  drm_license_id?: string;
  watermark_id?: string;
  consent_required?: boolean;
  policy_decision?: string;
  started_at: string;
}

export interface VolumetricMetrics {
  assets: number; sessions: number;
  avg_bytes_gb: number; policy_blocked: number;
}
