/**
 * N0VA VIDEOS — DRM & Forensic Types (Security)
 * Every identity consent-aware, every playback forensic.
 */
export type DrmSystem = "widevine" | "fairplay" | "playready" | "clear_key";
export type WatermarkKind = "visible" | "forensic" | "dual";
export type ForensicPayload = { tenant_id: string; user_id: string; session_id: string; asset_id: string; };

export interface DrmLicense {
  license_id: string;
  tenant_id: string;
  asset_id: string;
  systems: DrmSystem[];
  key_id: string;
  key_server_url: string;
  expires_at?: string;
  domain_lock?: string;
  max_plays?: number;
  c2pa_bound?: boolean;
}

export interface WatermarkJob {
  watermark_id: string;
  tenant_id: string;
  asset_id: string;
  kind: WatermarkKind;
  text?: string;
  forensic_payload?: ForensicPayload;
  content_hash: string;
  traceable: boolean;
  created_at: string;
}

export interface ForensicTrace {
  trace_id: string;
  watermark_id: string;
  leaked_asset_hash: string;
  matched_payload: ForensicPayload;
  confidence: number;
  detected_at: string;
}

export interface PlaybackLease {
  lease_id: string;
  tenant_id: string;
  asset_id: string;
  user_id: string;
  drm_license_id: string;
  watermark_id: string;
  expires_at: string;
  revoked?: boolean;
}
