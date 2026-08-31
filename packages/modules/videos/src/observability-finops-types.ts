/**
 * N0VA VIDEOS — Observability and FinOps Types
 * Unified Media Economics and Reliability Plane
 */

export type TelemetryType = "metrics" | "traces" | "logs" | "domain_events";

export type DimensionalContext = {
  tenant_id: string; project_id: string; asset_id?: string; timeline_id?: string; job_id?: string; export_id?: string;
  agent_id?: string; plugin_id?: string; model_id?: string; region: string; environment: string;
  provider?: string; storage_tier?: string; destination?: string; cost_center?: string; billing_period: string;
};

export type GpuMetrics = {
  gpu_utilization_ratio: number; gpu_memory_utilization_ratio: number; gpu_memory_reserved_bytes: number; gpu_memory_used_bytes: number;
  gpu_encoder_utilization_ratio: number; gpu_decoder_utilization_ratio: number; gpu_tensor_core_utilization_ratio: number;
  gpu_power_watts: number; gpu_temperature_celsius: number; gpu_throttle_seconds: number; gpu_idle_seconds: number;
  gpu_error_count: number; gpu_cost_per_gpu_second: number; productive_gpu_ratio: number;
  frames_per_gpu_second?: number; processed_video_seconds_per_gpu_second?: number;
};

export type CpuMetrics = {
  cpu_utilization_ratio: number; cpu_throttling_ratio: number; run_queue_length: number; memory_utilization_ratio: number;
  disk_io_wait: number; network_io_wait: number; container_restart_count: number; worker_idle_seconds: number;
};

export type CostLedgerEntry = {
  tenant_id: string; project_id: string; asset_id: string; asset_version: number; period: string;
  duration_seconds: number; source_size_bytes: number; derived_size_bytes: number;
  compute: { cpu_seconds: number; gpu_seconds: number; inference_seconds: number };
  storage: { hot_gb_days: number; warm_gb_days: number; cool_gb_days: number };
  network: { ingress_bytes: number; egress_bytes: number };
  cost: { compute: number; storage: number; network: number; third_party_ai: number; total: number; currency: string };
};

export type UsageRecord = {
  usage_id: string; tenant_id: string; project_id: string; asset_id: string; job_id: string;
  usage_type: string; quantity: number; unit: string; rate: number; cost: number; currency: string;
  provider: string; region: string; pricing_version: string;
};

export type RenderCost = {
  render_id: string; preset: string; codec: string; resolution: string; duration_seconds: number;
  gpu_seconds: number; cpu_seconds: number; cost_per_render: number; cost_per_output_minute: number; retry_cost_ratio: number; wasted_render_cost?: number;
};

export type QueueMetrics = {
  queue_depth: number; queue_age_seconds: number; p50: number; p95: number; p99: number; sla_breach_rate: number;
};

export type InferenceMetrics = {
  inference_latency_ms: number; time_to_first_token?: number; batch_size: number; model_cache_hit_ratio: number; tokens_per_dollar?: number;
};

export type AgentMetrics = {
  agent_id: string; success_rate: number; human_override_rate: number; suggestion_acceptance_rate: number; quality_adjusted_acceptance: number;
};

export type ExecutiveDashboard = {
  revenue_per_processed_hour: number; gross_margin_per_processed_hour: number; total_media_processing_cost: number;
  cost_per_asset: number; cost_per_render: number; ai_cost_percentage: number; sla_credit_exposure: number; capacity_headroom: number;
  gross_margin: number; cost_trend_30d: number[];
};

export type TenantProfitability = {
  tenant_id: string; subscription_revenue: number; compute_cost: number; storage_cost: number; cdn_cost: number; gross_profit: number; gross_margin: number; segment: string;
};

export type Alert = {
  alert_id: string; type: "economic" | "performance_cost" | "slo_burn"; severity: "warning" | "critical";
  message: string; tenant_id?: string; workflow?: string;
};
