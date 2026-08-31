"use client";
import { useMemo } from "react";
import { Badge, Card } from "@n0va/ui";
import { getGpuMetrics, getCpuMetrics, getCostLedger, getExecutiveDashboard, getTenantProfitability, getRenderCost, getQueueMetrics, getInferenceMetrics, getQualityMetrics, getAlerts, forecastCapacity } from "./observability-finops-engine";

export function ObservabilityFinOpsPanel({ projectId }: { projectId: string }) {
  const gpu = useMemo(()=>getGpuMetrics(),[]);
  const cpu = useMemo(()=>getCpuMetrics(),[]);
  const ledger = useMemo(()=>getCostLedger("asset_001"),[]);
  const exec = useMemo(()=>getExecutiveDashboard(),[]);
  const tenants = useMemo(()=>getTenantProfitability(),[]);
  const renderCost = useMemo(()=>getRenderCost(),[]);
  const queue = useMemo(()=>getQueueMetrics(),[]);
  const infer = useMemo(()=>getInferenceMetrics(),[]);
  const quality = useMemo(()=>getQualityMetrics(),[]);
  const alerts = useMemo(()=>getAlerts(),[]);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ background:"linear-gradient(135deg,#0f0f12 0%,#1a243a 100%)", color:"#fff", borderRadius:12, padding:16, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ fontSize:11, letterSpacing:"0.08em", opacity:0.7, fontWeight:800 }}>OBSERVABILITY & FINOPS — IS N0VA MEETING COMMITMENTS? IS EACH WORK ECONOMICALLY SUSTAINABLE?</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginTop:8, fontSize:11 }}>
          <div style={{ background:"rgba(255,255,255,0.06)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>Gross margin</div><div style={{ fontWeight:800 }}>{(exec.gross_margin*100).toFixed(1)}%</div><div>Cost per hour ${exec.cost_per_asset.toFixed(2)}</div></div>
          <div style={{ background:"rgba(255,255,255,0.06)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>Revenue / hour</div><div style={{ fontWeight:800 }}>${exec.revenue_per_processed_hour}</div></div>
          <div style={{ background:"rgba(255,255,255,0.06)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>SLA compliance</div><div style={{ fontWeight:800 }}>99.99%</div></div>
          <div style={{ background:"rgba(255,255,255,0.06)", padding:8, borderRadius:8 }}><div style={{ opacity:0.7 }}>Capacity headroom</div><div style={{ fontWeight:800 }}>{(exec.capacity_headroom*100).toFixed(0)}%</div></div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>Infrastructure — GPU productive vs busy</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>GPU util {Math.round(gpu.gpu_utilization_ratio*100)}% productive {Math.round(gpu.productive_gpu_ratio*100)}% — busy ≠ productive (waiting on storage/retries)</div>
            <div>Memory {Math.round(gpu.gpu_memory_used_bytes/1e9)}GB / {Math.round(gpu.gpu_memory_reserved_bytes/1e9)}GB encoder {Math.round(gpu.gpu_encoder_utilization_ratio*100)}% tensor {Math.round(gpu.gpu_tensor_core_utilization_ratio*100)}%</div>
            <div>Frames/gpu/sec {gpu.frames_per_gpu_second} video sec/gpu sec {gpu.processed_video_seconds_per_gpu_second}</div>
            <div style={{ marginTop:6 }}>CPU util {Math.round(cpu.cpu_utilization_ratio*100)}% idle {cpu.worker_idle_seconds}s — low GPU + high CPU = orchestration bottleneck</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Media Pipeline — cost per asset full lifecycle</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            {ledger.map(l=>(
              <div key={l.asset_id} style={{ background:"var(--nv-color-surface-2)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
                <div>Asset {l.asset_id} v{l.asset_version} duration {l.duration_seconds}s</div>
                <div>Compute CPU {l.compute.cpu_seconds}s GPU {l.compute.gpu_seconds}s storage hot {l.storage.hot_gb_days} GB-days</div>
                <div>Total ${l.cost.total.toFixed(2)} compute ${l.cost.compute} storage ${l.cost.storage} network ${l.cost.network} AI ${l.cost.third_party_ai}</div>
              </div>
            ))}
            <div style={{ marginTop:6 }}>Render cost ${renderCost.cost_per_render} per output min ${renderCost.cost_per_output_minute} retry {Math.round(renderCost.retry_cost_ratio*100)}% wasted ${renderCost.wasted_render_cost}</div>
            <div>Queue p50 {queue.p50}s p95 {queue.p95}s p99 {queue.p99}s breach {(queue.sla_breach_rate*100).toFixed(1)}% vs 5m target — distinguish queue vs render 1000x 1080p</div>
          </div>
        </Card>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <Card padded>
          <div style={{ fontWeight:800 }}>AI & Agent Economics — latency 5ms class-specific</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Inference {infer.inference_latency_ms}ms batch {infer.batch_size} cache {(infer.model_cache_hit_ratio*100).toFixed(0)}% — scene/transcription/clone/search/8K have different profiles</div>
            <div>Agent success {(quality.agent_success*100).toFixed(0)}% human override {(quality.human_override*100).toFixed(0)}% — safe failure blocked by policy vs technical failure</div>
            <div>Suggestion acceptance quality-adjusted = accepted + 0.5×modified / actionable</div>
          </div>
        </Card>
        <Card padded>
          <div style={{ fontWeight:800 }}>Quality — search & caption</div>
          <div style={{ marginTop:8, fontSize:11 }}>
            <div>Search NDCG {quality.search_ndcg} vs 50ms target — relevance vs latency separate</div>
            <div>Caption WER {quality.caption_wer} per language/acoustic/speaker/accent — sampled, not global 98.5%</div>
            <div>Storage: hot/warm/cool/cold/frozen/cryogenic cost per tier + migration backlog + CDN egress cache hit vs cost per watch hour</div>
          </div>
        </Card>
      </div>

      <Card padded>
        <div style={{ fontWeight:800 }}>Tenant Profitability — unit economics</div>
        <div style={{ marginTop:8, fontSize:11, display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {tenants.map(t=>(
            <div key={t.tenant_id} style={{ background: t.segment==="negative-margin"?"rgba(239,68,68,0.08)":"rgba(16,185,129,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:8 }}>
              <div style={{ fontWeight:700 }}>{t.tenant_id} — {t.segment}</div>
              <div>Revenue ${t.subscription_revenue} compute ${t.compute_cost} storage ${t.storage_cost} cdn ${t.cdn_cost} profit ${t.gross_profit} margin {(t.gross_margin*100).toFixed(0)}%</div>
            </div>
          ))}
        </div>
      </Card>

      <Card padded>
        <div style={{ fontWeight:800 }}>Forecast & Alerts — 15m/24h/7d/30d/90d workload classes</div>
        <div style={{ marginTop:8, fontSize:11, display:"flex", gap:6, flexWrap:"wrap" }}>
          {["15m","24h","7d","30d"].map(h=>{
            const f = forecastCapacity(h);
            return <Badge key={h} tone="neutral">{h}: GPU {f.gpu_demand} CPU {f.cpu_demand} storage {f.storage_growth_gb}GB</Badge>;
          })}
        </div>
        <div style={{ marginTop:8, fontSize:11 }}>
          {alerts.map(a=>(
            <div key={a.alert_id} style={{ background: a.severity==="critical"?"rgba(239,68,68,0.08)":"rgba(251,191,36,0.08)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:6, marginBottom:4 }}>
              <Badge tone={a.severity==="critical"?"warning":"neutral"}>{a.type}</Badge> {a.message}
            </div>
          ))}
        </div>
        <div style={{ fontSize:10, color:"var(--nv-color-text-faint)", marginTop:4 }}>Closed-loop: observe → estimate cost → predict SLA → check policy/quality → controlled change → measure → rollback if quality declines — quality_adjusted_margin = revenue - direct - allocated - quality_failure - SLA - rework - human_override</div>
      </Card>
    </div>
  );
}
