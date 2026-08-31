/**
 * N0VA VIDEOS — Player Types (Basic Captions, Exports, Player)
 * Every export policy-validated, every playback auditable.
 */
export type PlayerMode = "vod" | "live" | "review" | "embed";
export type CaptionKind = "captions" | "subtitles" | "chapters";
export type ExportContainer = "mp4" | "mov" | "webm" | "mxf" | "hls" | "dash";
export type PlayerTokenScope = "view" | "download" | "embed";

export interface PlayerConfig {
  player_id: string;
  tenant_id: string;
  asset_id: string;
  mode: PlayerMode;
  hls_url?: string;
  dash_url?: string;
  poster?: string;
  captions: { kind: CaptionKind; lang: string; url: string; label: string }[];
  drm?: { widevine: boolean; fairplay: boolean; playready: boolean };
  watermark?: { enabled: boolean; text?: string };
  allowed_domains?: string[];
}

export interface PlaybackToken {
  token_id: string;
  tenant_id: string;
  asset_id: string;
  scope: PlayerTokenScope;
  expires_at: string;
  domain_lock?: string;
  watermark_text?: string;
  signature: string;
}

export interface ExportJob {
  export_id: string;
  tenant_id: string;
  project_id?: string;
  asset_id: string;
  preset: string;
  container: ExportContainer;
  resolution: string;
  status: "queued"|"rendering"|"ready"|"failed"|"blocked_policy";
  policy_decision?: string;
  output_url?: string;
  c2pa_manifest?: string;
  rights_manifest_id?: string;
  created_at: string;
}
