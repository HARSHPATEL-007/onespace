/**
 * N0VA VIDEOS — Render Orchestration Types (Multi-Region)
 * Every render explainable, every retry auditable.
 */
export type RenderRegion = "us-east-1" | "eu-west-1" | "ap-south-1";
export type RenderPriority = "low" | "normal" | "high" | "critical";
export type RenderStatus = "queued" | "dispatching" | "rendering" | "merging" | "ready" | "failed" | "cancelled" | "policy_blocked";
export type GpuClass = "T4" | "A10G" | "L4" | "H100";

export interface RenderJob {
  job_id: string;
  tenant_id: string;
  project_id: string;
  graph_version: string;
  preset: string;
  region: RenderRegion;
  priority: RenderPriority;
  gpu_class: GpuClass;
  shards: RenderShard[];
  status: RenderStatus;
  policy_decision?: string;
  cost_estimate_cents?: number;
  actual_cost_cents?: number;
  created_at: string;
  provenance: { actor: string; correlation_id: string; explainable_params: Record<string,unknown> };
}

export interface RenderShard {
  shard_id: string;
  job_id: string;
  region: RenderRegion;
  status: RenderStatus;
  attempt: number;
  worker_id?: string;
  output_hash?: string;
}

export interface RenderPolicy {
  allowed_regions: RenderRegion[];
  data_residency: "standard"|"regional"|"enforced";
  max_parallel: number;
  allow_spot: boolean;
  require_approval_for: ("cross_region"|"premium_gpu")[];
}

export interface RenderMetrics {
  queued: number; rendering: number; ready: number; failed: number;
  p50_sec: number; p95_sec: number; retry_rate: number; region_utilization: Record<RenderRegion, number>;
}
