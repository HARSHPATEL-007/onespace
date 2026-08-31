#!/usr/bin/env node
import { getGpuMetrics, getCostLedger, getExecutiveDashboard, getTenantProfitability, getRenderCost, getQueueMetrics, getAlerts, forecastCapacity } from "./src/observability-finops-engine.ts";
function assert(c,m){ if(!c){ console.error("FAIL",m); process.exit(1);} else console.log("PASS",m); }
console.log("=== Observability & FinOps Smoke ===");
let gpu = getGpuMetrics();
assert(gpu.gpu_utilization_ratio===0.72 && gpu.productive_gpu_ratio===0.68, "gpu 72% productive 68% busy≠productive");
assert(gpu.frames_per_gpu_second===45, "frames per gpu 45");
console.log(`GPU util ${gpu.gpu_utilization_ratio} productive ${gpu.productive_gpu_ratio}`);

let ledger = getCostLedger("asset_001");
assert(ledger[0].cost.total===5.37 && ledger[0].cost.compute===4.21, "cost total 5.37 compute 4.21");
assert(ledger[0].compute.gpu_seconds===140 && ledger[0].storage.hot_gb_days===17.2, "ledger dims");
console.log(`Ledger asset ${ledger[0].asset_id} total $${ledger[0].cost.total}`);

let exec = getExecutiveDashboard();
assert(exec.revenue_per_processed_hour===42.5 && exec.gross_margin===0.42, "exec revenue 42.5 margin 42%");
console.log(`Exec margin ${(exec.gross_margin*100).toFixed(1)}% cost per asset ${exec.cost_per_asset}`);

let tenants = getTenantProfitability();
assert(tenants.some(t=>t.segment==="negative-margin" && t.gross_profit===-2500), "negative-margin tenant");
console.log(`Tenants ${tenants.map(t=>t.tenant_id+":"+t.segment).join(",")}`);

let render = getRenderCost();
assert(render.cost_per_render===4.35 && render.retry_cost_ratio===0.12, "render cost 4.35 retry 12%");
console.log(`Render ${render.render_id} cost ${render.cost_per_render} wasted ${render.wasted_render_cost}`);

let queue = getQueueMetrics();
assert(queue.p50===45 && queue.p99===320 && queue.sla_breach_rate===0.03, "queue p50 45 p99 320 breach 3%");
console.log(`Queue p50 ${queue.p50}s p95 ${queue.p95}s vs 5m target`);

let alerts = getAlerts();
assert(alerts.length===2 && alerts.some(a=>a.type==="economic"), "alerts economic");
console.log(`Alerts ${alerts.map(a=>a.type).join(",")}`);

let forecast = forecastCapacity("7d");
assert(forecast.gpu_demand===1200 && forecast.storage_growth_gb===2100, "forecast 7d 1200 gpu");
console.log(`Forecast 7d gpu ${forecast.gpu_demand} storage ${forecast.storage_growth_gb}GB`);

console.log("\nAll observability smoke checks passed.");
