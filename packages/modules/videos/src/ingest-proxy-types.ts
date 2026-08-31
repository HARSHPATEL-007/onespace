/**
 * N0VA VIDEOS — Ingest & Proxy Types (Reliable Media Ingest)
 * Every asset searchable, every write auditable, every proxy reversible.
 */
export type IngestSource = "upload" | "watch_folder" | "cloud_import" | "live_capture" | "mobile" | "api";
export type IngestStatus = "queued" | "hashing" | "validating" | "proxy_queued" | "proxy_rendering" | "ready" | "failed" | "quarantined";
export type ProxyTier = "thumb" | "preview_480" | "edit_1080" | "mezzanine_prores" | "original";
export type ChecksumAlgo = "sha256" | "xxhash64" | "md5";

export interface IngestJob {
  job_id: string;
  tenant_id: string;
  project_id?: string;
  source: IngestSource;
  original_name: string;
  mime: string;
  bytes: number;
  checksum: { algo: ChecksumAlgo; value: string };
  status: IngestStatus;
  attempts: number;
  idempotency_key: string; // content_hash + tenant → duplicate prevention
  proxy_jobs: ProxyJob[];
  validation: { container_valid: boolean; codec_supported: boolean; malware_passed: boolean; policy_passed: boolean };
  created_at: string;
  updated_at: string;
  audit: { actor: string; correlation_id: string };
}

export interface ProxyJob {
  proxy_id: string;
  parent_job_id: string;
  tier: ProxyTier;
  status: "queued"|"rendering"|"ready"|"failed";
  width?: number; height?: number;
  codec?: string;
  bytes?: number;
  c2pa_manifest?: string;
  content_hash?: string;
}

export interface IngestPolicy {
  max_bytes_gb: number;
  allowed_containers: string[];
  allowed_codecs: string[];
  scan_malware: boolean;
  require_checksum: boolean;
  proxy_tiers: ProxyTier[];
}

export interface IngestMetrics {
  queued: number; hashing: number; proxy_rendering: number; ready: number; failed: number;
  avg_ingest_sec: number; p95_proxy_sec: number; duplicate_hit_rate: number;
}
