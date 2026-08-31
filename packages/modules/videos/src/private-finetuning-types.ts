/**
 * N0VA VIDEOS — Private Fine-Tuning Types (Per-Tenant)
 * Every model tenant-isolated, every training consent-aware.
 */
export type FinetuneStatus = "queued" | "preparing" | "training" | "evaluating" | "ready" | "failed" | "revoked_consent" | "blocked_policy";
export type FinetuneScope = "caption" | "brand_style" | "voice_style" | "detection";

export interface FinetuneJob {
  job_id: string;
  tenant_id: string;
  base_model_id: string;
  base_version: string;
  scope: FinetuneScope;
  dataset_hashes: string[]; // content hashes of training assets
  consent_chain: string[]; // consent ids
  status: FinetuneStatus;
  policy_decision?: string;
  explainable: { data_lineage: string[]; model_version: string };
  tenant_isolated: boolean; // never cross-tenant
  created_at: string;
}

export interface PrivateModel {
  model_id: string;
  tenant_id: string;
  finetune_job_id: string;
  version: string;
  scope: FinetuneScope;
  weights_hash: string;
  c2pa_manifest?: string;
  spdx_bom?: string;
  status: "active"|"deprecated"|"revoked";
  created_at: string;
}

export interface FinetunePolicy {
  require_consent_for: FinetuneScope[];
  allow_cross_region: boolean;
  max_dataset_gb: number;
  retention_days: number;
  audit_every_training: boolean;
}
