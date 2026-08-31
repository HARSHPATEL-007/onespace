/**
 * N0VA VIDEOS — Observability and FinOps Engine
 * Metrics, cost attribution, quality, forecasting
 */
import type { CostLedgerEntry, UsageRecord, GpuMetrics, CpuMetrics, ExecutiveDashboard, TenantProfitability, Alert, RenderCost } from "./observability-finops-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }

const usageRecords: UsageRecord[] = [
  { usage_id:"usage_00991", tenant_id:"tenant_acme", project_id:"project_001", asset_id:"asset_001", job_id:"render_0077", usage_type:"gpu_compute", quantity:140.25, unit:"gpu_seconds", rate:0.031, cost:4.35, currency:"USD", provider:"n0va_compute", region:"eu-west-1", pricing_version:"2026-08-01" },
  { usage_id:"usage_00992", tenant_id:"tenant_acme", project_id:"project_001", asset_id:"asset_001", job_id:"render_0077", usage_type:"storage", quantity:17.2, unit:"gb_days", rate:0.02, cost:0.34, currency:"USD", provider:"n0va_storage", region:"eu-west-1", pricing_version:"2026-08-01" },
];

const costLedger: CostLedgerEntry[] = [
  {
    tenant_id:"tenant_acme", project_id:"project_001", asset_id:"asset_001", asset_version:4, period:"2026-08", duration_seconds:124.5, source_size_bytes:45234567890, derived_size_bytes:8750000000,
    compute:{ cpu_seconds:820, gpu_seconds:140, inference_seconds:22 }, storage:{ hot_gb_days:17.2, warm_gb_days:41.5, cool_gb_days:0 }, network:{ ingress_bytes:45234567890, egress_bytes:0 },
    cost:{ compute:4.21, storage:0.83, network:0.02, third_party_ai:0.31, total:5.37, currency:"USD" },
  },
];

let gpuMetrics: GpuMetrics = {
  gpu_utilization_ratio:0.72, gpu_memory_utilization_ratio:0.64, gpu_memory_reserved_bytes: 24*1024*1024*1024, gpu_memory_used_bytes: 16*1024*1024*1024,
  gpu_encoder_utilization_ratio:0.45, gpu_decoder_utilization_ratio:0.38, gpu_tensor_core_utilization_ratio:0.52,
  gpu_power_watts:285, gpu_temperature_celsius:72, gpu_throttle_seconds:12, gpu_idle_seconds:420, gpu_error_count:2, gpu_cost_per_gpu_second:0.031, productive_gpu_ratio:0.68,
  frames_per_gpu_second:45, processed_video_seconds_per_gpu_second:2.1,
};

const alerts: Alert[] = [
  { alert_id:"alert_001", type:"economic", severity:"warning", message:"Cost per render above threshold for tenant_acme", tenant_id:"tenant_acme" },
  { alert_id:"alert_002", type:"performance_cost", severity:"critical", message:"Queue time rising while GPU utilization low — orchestration bottleneck", workflow:"transcode" },
];

export function getGpuMetrics(): GpuMetrics { return { ...gpuMetrics }; }
export function getCpuMetrics(): CpuMetrics {
  return { cpu_utilization_ratio:0.58, cpu_throttling_ratio:0.04, run_queue_length:4.2, memory_utilization_ratio:0.62, disk_io_wait:0.08, network_io_wait:0.12, container_restart_count:3, worker_idle_seconds:210 };
}
export function getCostLedger(assetId?: string): CostLedgerEntry[] {
  if (assetId) return costLedger.filter(c=>c.asset_id===assetId);
  return [...costLedger];
}
export function getUsageRecords(): UsageRecord[] { return [...usageRecords]; }
export function getExecutiveDashboard(): ExecutiveDashboard {
  return {
    revenue_per_processed_hour: 42.5, gross_margin_per_processed_hour: 18.2, total_media_processing_cost: 124000,
    cost_per_asset: 5.37, cost_per_render: 4.35, ai_cost_percentage: 0.12, sla_credit_exposure: 2400, capacity_headroom: 0.32,
    gross_margin: 0.42, cost_trend_30d: Array.from({length:30},(_,i)=> 120000 + Math.sin(i/5)*8000),
  };
}
export function getTenantProfitability(): TenantProfitability[] {
  return [
    { tenant_id:"tenant_acme", subscription_revenue:50000, compute_cost:12000, storage_cost:3200, cdn_cost:4800, gross_profit:30000, gross_margin:0.42, segment:"profitable" },
    { tenant_id:"tenant_beta", subscription_revenue:12000, compute_cost:11000, storage_cost:2000, cdn_cost:1500, gross_profit:-2500, gross_margin:-0.12, segment:"negative-margin" },
  ];
}
export function getRenderCost(): RenderCost {
  return { render_id:"render_0077", preset:"youtube_4k", codec:"hevc", resolution:"3840x2160", duration_seconds:124.5, gpu_seconds:140.25, cpu_seconds:820, cost_per_render:4.35, cost_per_output_minute:2.1, retry_cost_ratio:0.12, wasted_render_cost:0.52 };
}
export function getQueueMetrics(): { queue_depth:number; p50:number; p95:number; p99:number; sla_breach_rate:number } {
  return { queue_depth:42, p50:45, p95:180, p99:320, sla_breach_rate:0.03 };
}
export function getInferenceMetrics(): { inference_latency_ms:number; batch_size:number; model_cache_hit_ratio:number } {
  return { inference_latency_ms:4.2, batch_size:8, model_cache_hit_ratio:0.78 };
}
export function getAlerts(): Alert[] { return [...alerts]; }
export function forecastCapacity(horizon: string): { gpu_demand:number; cpu_demand:number; storage_growth_gb:number } {
  const map: Record<string, {gpu_demand:number;cpu_demand:number;storage_growth_gb:number}> = {
    "15m": { gpu_demand:120, cpu_demand:340, storage_growth_gb:45 },
    "24h": { gpu_demand:450, cpu_demand:1200, storage_growth_gb:320 },
    "7d": { gpu_demand:1200, cpu_demand:3400, storage_growth_gb:2100 },
    "30d": { gpu_demand:3400, cpu_demand:9800, storage_growth_gb:8500 },
  };
  return (map[horizon] ?? map["24h"]!) as { gpu_demand:number; cpu_demand:number; storage_growth_gb:number };
}
export function getQualityMetrics(): { search_ndcg:number; caption_wer:number; agent_success:number; human_override:number } {
  return { search_ndcg:0.91, caption_wer:0.015, agent_success:0.94, human_override:0.12 };
}
