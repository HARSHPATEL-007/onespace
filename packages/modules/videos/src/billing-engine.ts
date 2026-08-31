/**
 * N0VA VIDEOS — Billing Engine (Usage-Based Billing)
 * Pipeline: usage event → meter → rate card → estimate → ledger → invoice → dashboard
 * Immutable ledger — corrections via adjustments. Versioned pricing. Prepaid/postpaid, hard/soft caps.
 */
import type {
  MeterKey, BillingUnit, Currency, Region, PricingVersion, Rate, RateCard,
  UsageEvent, EstimateRequest, EstimateResponse, EstimateLineItem, EstimateOperation,
  BudgetPolicy, BudgetState, BudgetReservation, Invoice, InvoiceLineItem, CreditRecord,
  JobCostView, UsageDashboard, BillingEvent, BillingEventType, ReconciliationRecord, ReconciliationState,
  BillingMode, BillingAccount,
} from "./billing-types";
import { getEntitlement } from "./entitlement-engine";
import type { VideoTier } from "./entitlement-types";

function uid(p:string){ return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso(){ return new Date().toISOString(); }
function periodNow(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }

// ── Rate Card Store (versioned) ────────────────────────────────────────────
const DEFAULT_VERSION: PricingVersion = "2026-08-01";
const rateCardStore = new Map<string, RateCard>(); // key: version|region|plan
function rateKey(version:PricingVersion, region:Region, plan:string){ return `${version}|${region}|${plan}`; }

function defaultRates(currency:Currency): Partial<Record<MeterKey, Rate>> {
  const c=currency;
  return {
    stored_hot_gb_days: { meter:"stored_hot_gb_days", unit:"GB-days", rate_cents: 8, currency:c }, // ~$0.08/GB-day = $2.4/GB-month
    stored_warm_gb_days: { meter:"stored_warm_gb_days", unit:"GB-days", rate_cents: 5, currency:c },
    stored_cool_gb_days: { meter:"stored_cool_gb_days", unit:"GB-days", rate_cents: 3, currency:c },
    stored_cold_gb_days: { meter:"stored_cold_gb_days", unit:"GB-days", rate_cents: 1, currency:c },
    stored_frozen_gb_days: { meter:"stored_frozen_gb_days", unit:"GB-days", rate_cents: 0.5, currency:c },
    egress_cdn_gb: { meter:"egress_cdn_gb", unit:"GB", rate_cents: 3, currency:c },
    egress_origin_gb: { meter:"egress_origin_gb", unit:"GB", rate_cents: 5, currency:c },
    egress_inter_region_gb: { meter:"egress_inter_region_gb", unit:"GB", rate_cents: 2, currency:c },
    egress_internet_gb: { meter:"egress_internet_gb", unit:"GB", rate_cents: 8, currency:c },
    gpu_render_seconds: { meter:"gpu_render_seconds", unit:"GPU-seconds", rate_cents: 0.0833, currency:c }, // 5c/min = 0.0833c/sec
    gpu_render_minutes: { meter:"gpu_render_minutes", unit:"GPU-minutes", rate_cents: 5, currency:c },
    gpu_render_hours: { meter:"gpu_render_hours", unit:"GPU-hours", rate_cents: 300, currency:c },
    ai_inference_minutes: { meter:"ai_inference_minutes", unit:"inference-minutes", rate_cents: 10, currency:c },
    ai_premium_minutes: { meter:"ai_premium_minutes", unit:"inference-minutes", rate_cents: 30, currency:c },
    transcription_minutes: { meter:"transcription_minutes", unit:"minutes", rate_cents: 2, currency:c },
    transcription_premium_minutes: { meter:"transcription_premium_minutes", unit:"minutes", rate_cents: 6, currency:c },
    generated_video_seconds: { meter:"generated_video_seconds", unit:"seconds", rate_cents: 15, currency:c }, // $0.15/sec base
    generated_video_weighted_seconds: { meter:"generated_video_weighted_seconds", unit:"seconds", rate_cents: 15, currency:c },
    live_production_hour: { meter:"live_production_hour", unit:"hours", rate_cents: 5000, currency:c }, // $50/hr
    live_input_feed_hours: { meter:"live_input_feed_hours", unit:"hours", rate_cents: 1000, currency:c },
    live_destination_hours: { meter:"live_destination_hours", unit:"hours", rate_cents: 800, currency:c },
    live_caption_minutes: { meter:"live_caption_minutes", unit:"minutes", rate_cents: 5, currency:c },
    premium_model_requests: { meter:"premium_model_requests", unit:"requests", rate_cents: 50, currency:c },
    archive_retrieval_requests: { meter:"archive_retrieval_requests", unit:"requests", rate_cents: 100, currency:c },
    archive_restored_gb: { meter:"archive_restored_gb", unit:"GB", rate_cents: 3, currency:c },
    archive_staging_gb_days: { meter:"archive_staging_gb_days", unit:"GB-days", rate_cents: 2, currency:c },
    drm_packaging_ops: { meter:"drm_packaging_ops", unit:"operations", rate_cents: 46, currency:c },
    watermark_embed_ops: { meter:"watermark_embed_ops", unit:"operations", rate_cents: 46, currency:c },
    drm_license_issuance: { meter:"drm_license_issuance", unit:"licenses", rate_cents: 1, currency:c },
  };
}

function ensureDefaultCards(){
  if(rateCardStore.size) return;
  for(const region of ["us-east-1","eu-west-1","ap-south-1"]){
    for(const plan of ["all","creator","team","business","studio","regulated"]){
      const id = rateKey(DEFAULT_VERSION, region, plan);
      rateCardStore.set(id, {
        rate_card_id: id,
        pricing_version: DEFAULT_VERSION,
        currency:"USD",
        region,
        plan: plan as RateCard["plan"],
        effective_from: "2026-08-01T00:00:00Z",
        rates: defaultRates("USD"),
        description: `Default ${plan} ${region} ${DEFAULT_VERSION}`,
      });
    }
  }
}
ensureDefaultCards();

export function getRateCard(version: PricingVersion = DEFAULT_VERSION, region: Region = "us-east-1", plan: string = "all"): RateCard {
  ensureDefaultCards();
  return rateCardStore.get(rateKey(version, region, plan)) ?? rateCardStore.get(rateKey(version, region, "all")) ?? rateCardStore.get(rateKey(DEFAULT_VERSION, "us-east-1", "all"))!;
}
export function createRateCard(card: RateCard){ rateCardStore.set(rateKey(card.pricing_version, card.region, card.plan), card); return card; }
export function listRateCards(){ return Array.from(rateCardStore.values()); }
export function getPricingVersion(){ return DEFAULT_VERSION; }

// ── Usage Ledger (immutable) ───────────────────────────────────────────────
const usageLedger: UsageEvent[] = [];
const idempotencyIndex = new Map<string, UsageEvent>(); // idempotency_key → original
const usageByTenant = new Map<string, UsageEvent[]>();

function currencyFor(tenant_id:string){ return "USD" as Currency; }

export function recordUsageEvent(input: Omit<UsageEvent, "usage_id"|"recorded_at"|"period"|"cost_cents"|"rate_cents"> & { quantity:number; meter:MeterKey; pricing_version?:PricingVersion; currency?:Currency; region?:Region }): UsageEvent {
  // Duplicate prevention via idempotency_key
  if(idempotencyIndex.has(input.idempotency_key)){
    const existing = idempotencyIndex.get(input.idempotency_key)!;
    // Mark duplicate but don't double-charge — return existing
    return existing;
  }
  const region = input.region ?? "us-east-1";
  const pricing_version = input.pricing_version ?? DEFAULT_VERSION;
  const currency = input.currency ?? currencyFor(input.tenant_id);
  const card = getRateCard(pricing_version, region, "all");
  const rate = card.rates[input.meter]?.rate_cents ?? 1;
  const cost_cents = Math.round(input.quantity * rate);
  // Resolve tenant plan for invoice grouping
  const period = periodNow();
  const evt: UsageEvent = {
    usage_id: uid("usage"),
    idempotency_key: input.idempotency_key,
    tenant_id: input.tenant_id,
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    asset_id: input.asset_id,
    job_id: input.job_id,
    meter: input.meter,
    quantity: input.quantity,
    unit: (card.rates[input.meter]?.unit ?? "operations") as BillingUnit,
    rate_cents: rate,
    cost_cents,
    currency,
    pricing_version,
    region,
    provider: input.provider,
    period,
    causation_id: input.causation_id,
    correlation_id: input.correlation_id,
    schema_version: input.schema_version ?? "1.0.0",
    recorded_at: nowIso(),
    kind: input.kind ?? "actual",
    adjustment_for: input.adjustment_for,
    metadata: input.metadata,
  };
  usageLedger.push(evt);
  idempotencyIndex.set(evt.idempotency_key, evt);
  const arr = usageByTenant.get(evt.tenant_id) ?? [];
  arr.push(evt);
  usageByTenant.set(evt.tenant_id, arr);
  emitBillingEvent("billing.usage.recorded", evt as unknown as Record<string, unknown>);
  return evt;
}

export function createAdjustment(original_usage_id:string, correction_quantity:number, reason:string, actor?:string): UsageEvent {
  const original = usageLedger.find(u=>u.usage_id===original_usage_id);
  if(!original) throw new Error("Original usage not found");
  // Immutable — new adjustment record, never mutate original
  const adj = recordUsageEvent({
    tenant_id: original.tenant_id,
    project_id: original.project_id,
    asset_id: original.asset_id,
    job_id: original.job_id,
    meter: original.meter,
    quantity: correction_quantity,
    pricing_version: original.pricing_version,
    currency: original.currency,
    region: original.region,
    provider: original.provider,
    causation_id: `adj_${original_usage_id}`,
    correlation_id: original.correlation_id,
    schema_version:"1.0.0",
    idempotency_key: `adj:${original_usage_id}:${Date.now()}`,
    kind:"adjustment",
    adjustment_for: original_usage_id,
    metadata:{ reason, actor, original_cost_cents: original.cost_cents },
  } as unknown as Parameters<typeof recordUsageEvent>[0]);
  emitBillingEvent("billing.usage.adjusted", adj as unknown as Record<string, unknown>);
  return adj;
}

export function getUsageLedger(tenant_id?:string, limit=100): UsageEvent[] {
  if(tenant_id) return (usageByTenant.get(tenant_id) ?? []).slice(-limit).reverse();
  return usageLedger.slice(-limit).reverse();
}
export function getUsageByPeriod(tenant_id:string, period:string): UsageEvent[] {
  return (usageByTenant.get(tenant_id) ?? []).filter(u=>u.period===period);
}
export function listUsageByMeter(tenant_id:string, meter:MeterKey): UsageEvent[] {
  return (usageByTenant.get(tenant_id) ?? []).filter(u=>u.meter===meter);
}

// ── Usage Normalizer ───────────────────────────────────────────────────────
export function normalizeUsage(quantity:number, from:BillingUnit, to:BillingUnit): number {
  // GPU ms→s→min→hours, GB-hours→GB-days→GB-months
  const toSeconds: Record<string, number> = { "GPU-ms":0.001, "GPU-seconds":1, "GPU-minutes":60, "GPU-hours":3600 };
  if(toSeconds[from] && toSeconds[to]) return quantity * (toSeconds[from]/toSeconds[to]);
  const gb: Record<string, number> = { "GB-hours":1, "GB-days":24, "GB-months":720 };
  if(gb[from] && gb[to]) return quantity / gb[from] * gb[to]; // GB-hours internally → GB-days = /24, → GB-months = /720
  if(from===to) return quantity;
  return quantity;
}

// ── Included Usage (from entitlements) ─────────────────────────────────────
function includedForTenant(tenant_id:string, meter:MeterKey): number {
  try{
    const ent = getEntitlement(tenant_id);
    const lim = ent.limits as Record<string,number>;
    // Map meter → included from entitlement limits
    if(meter.startsWith("stored_")) return lim.storage_gb ?? 100; // GB-months
    if(meter.startsWith("gpu_")) return (lim.render_gpu_hours ?? 10) * 3600; // seconds
    if(meter==="gpu_render_minutes") return (lim.render_gpu_hours ?? 10)*60;
    if(meter==="gpu_render_hours") return lim.render_gpu_hours ?? 10;
    if(meter.startsWith("ai_") ) return lim.ai_credits ?? 1000; // map credits → minutes approximation: 1 credit ≈1 inference minute
    if(meter.startsWith("transcription")) return 1000; // example included 1000 min for business
    if(meter.startsWith("live_")) return lim.live_hours_monthly ?? 5;
    if(meter.startsWith("egress")) return lim.cdn_delivery_gb ?? 100;
    return 0;
  }catch{ return 0; }
}

// ── Estimate Engine ────────────────────────────────────────────────────────
const estimateStore = new Map<string, EstimateResponse & { tenant_id:string; request: EstimateRequest; status:"created"|"approved"|"expired"|"reserved"; reserved_cents?:number }>();

export function estimateCost(req: EstimateRequest): EstimateResponse {
  const region = req.region ?? "us-east-1";
  const pricing_version = req.pricing_version ?? DEFAULT_VERSION;
  const currency = req.currency ?? "USD";
  const card = getRateCard(pricing_version, region, "all");
  const estimate_id = uid("estimate");
  const expires_at = new Date(Date.now()+30*60*1000).toISOString();
  const line_items: EstimateLineItem[] = [];
  let includedMap: Partial<Record<string, number>> = {};
  let usageMap: Partial<Record<string, number>> = {};
  let confidence = 0.95;

  // Helper to add line item
  const add = (name:string, meter:MeterKey, quantity:number, unit:BillingUnit, includedQ?:number) => {
    const rate = card.rates[meter]?.rate_cents ?? 1;
    const cost_cents = Math.round(quantity * rate);
    line_items.push({ name, meter, quantity, unit, rate_cents: rate, cost_cents, included_quantity: includedQ });
    (usageMap as Record<string,number>)[meter] = quantity;
    if(includedQ!==undefined) (includedMap as Record<string,number>)[meter]=includedQ;
  };

  const duration = req.input_duration_seconds ?? 60;
  const sizeGb = (req.input_size_bytes ?? 1_000_000_000)/ (1024*1024*1024);
  const isPremium = !!req.premium;
  const is4K = req.resolution==="4K" || req.resolution==="8K";
  const destCount = req.destinations?.length ?? 1;

  switch(req.operation){
    case "high_resolution_export":
    case "gpu_render": {
      const gpuMinutes = Math.max(1, Math.round(duration * (is4K? 2.5:1) * (isPremium?1.5:1) * (destCount>1? 1+0.2*(destCount-1):1)));
      const egressGb = Math.round(sizeGb * 0.8 * destCount);
      const drmOps = destCount;
      add("GPU rendering", isPremium?"gpu_render_minutes":"gpu_render_minutes", gpuMinutes, "GPU-minutes", includedForTenant(req.tenant_id,"gpu_render_minutes"));
      add("CDN egress", "egress_cdn_gb", egressGb, "GB", includedForTenant(req.tenant_id,"egress_cdn_gb"));
      add("Forensic watermark", "watermark_embed_ops", drmOps, "operations");
      confidence = is4K?0.75:0.90;
      break;
    }
    case "ai_inference": {
      const inferenceMins = Math.round(duration/60 * (isPremium?1.5:1));
      add("AI inference", isPremium?"ai_premium_minutes":"ai_inference_minutes", inferenceMins, "inference-minutes", includedForTenant(req.tenant_id,"ai_inference_minutes"));
      confidence=0.70;
      break;
    }
    case "transcription": {
      // Spec example: base 60, diarization 60, translation 180 → 240 billable
      const baseMins = Math.ceil(duration/60);
      const diarized = baseMins; // same duration
      const translated = req.model_id?.includes("translate")? baseMins*3:0;
      const billable = baseMins + (isPremium? diarized:0) + translated;
      add("Transcription (base)", "transcription_minutes", baseMins, "minutes", 1000);
      if(isPremium) add("Diarization premium", "transcription_premium_minutes", diarized, "minutes");
      if(translated) add("Translation", "transcription_minutes", translated, "minutes");
      confidence=0.85;
      break;
    }
    case "generated_media": {
      // 10 generated seconds × 4K mult × premium mult × 4 variations
      const variations = 4;
      const premiumMult = isPremium?2.5:1;
      const resMult = is4K?2.5:1;
      const weighted = duration * resMult * premiumMult * variations;
      add("Generated media (weighted)", "generated_video_weighted_seconds", weighted, "seconds");
      add("Generated media (actual)", "generated_video_seconds", duration, "seconds");
      confidence=0.55; // generative widest range
      break;
    }
    case "live_production": {
      const hours = duration/3600;
      const inputs = 2, outputs = destCount;
      add("Live production", "live_production_hour", hours, "hours", includedForTenant(req.tenant_id,"live_production_hour"));
      add("Additional inputs", "live_input_feed_hours", hours*(inputs-1), "hours");
      add("Additional destinations", "live_destination_hours", hours*(outputs-1), "hours");
      add("Live captions", "live_caption_minutes", hours*60, "minutes");
      confidence=0.80;
      break;
    }
    case "archive_retrieval": {
      const restoredGb = sizeGb*10;
      add("Retrieval request", "archive_retrieval_requests", 1, "requests");
      add("Restored data", "archive_restored_gb", restoredGb, "GB");
      add("Staging", "archive_staging_gb_days", restoredGb*3, "GB-days");
      add("Egress", "archive_egress_gb", restoredGb, "GB");
      confidence=0.70;
      break;
    }
    case "drm_package":
    case "egress_delivery":
    case "bulk_download": {
      add("DRM packaging", "drm_packaging_ops", 1, "operations");
      add("Watermark", "watermark_embed_ops", 1, "operations");
      add("Egress", "egress_cdn_gb", sizeGb*destCount, "GB");
      confidence=0.90;
      break;
    }
    default: {
      add("Operation", "gpu_render_minutes", 1, "GPU-minutes");
      confidence=0.85;
    }
  }

  const expected = line_items.reduce((s,li)=>s+li.cost_cents,0);
  // Confidence range: deterministic narrow, generative wide
  const lowFactor = confidence>0.85?0.85: confidence>0.70?0.65:0.55;
  const highFactor = confidence>0.85?1.15: confidence>0.70?1.40:1.80;
  const low = Math.round(expected*lowFactor);
  const high = Math.round(expected*highFactor);
  // Requires confirmation when: exceeds included, premium selected, exceeds budget, etc.
  const totalIncludedCents = line_items.reduce((s,li)=> s + (li.included_quantity? li.included_quantity*(card.rates[li.meter]?.rate_cents ??0):0) ,0);
  const exceedsIncluded = expected > totalIncludedCents && totalIncludedCents>0;
  const requires_confirmation = isPremium || exceedsIncluded || high>5000 || destCount>3 || req.operation==="archive_retrieval" || req.operation==="generated_media";

  const resp: EstimateResponse = {
    estimate_id, operation: req.operation, expires_at, currency, pricing_version, region,
    included: includedMap,
    estimated_usage: usageMap,
    estimated_cost: { low_cents: low, expected_cents: expected, high_cents: high, confidence },
    line_items,
    requires_confirmation,
    budget_reserved_cents: requires_confirmation? expected: undefined,
    variance_notes: confidence<0.7? ["High variance: generative AI / multi-pass / complex timeline — retries, provider fallback, output size uncertainty may shift cost."] : undefined,
  };
  estimateStore.set(estimate_id, { ...resp, tenant_id: req.tenant_id, request: req, status:"created" });
  emitBillingEvent("billing.estimate.created", { estimate_id, operation:req.operation, expected_cents: expected });
  return resp;
}

export function getEstimate(estimate_id:string){ return estimateStore.get(estimate_id); }
export function approveEstimate(estimate_id:string){
  const e=estimateStore.get(estimate_id);
  if(!e) throw new Error("Estimate not found");
  if(new Date(e.expires_at).getTime()<Date.now()) throw new Error("Estimate expired");
  e.status="approved";
  emitBillingEvent("billing.estimate.approved", { estimate_id });
  return e;
}
export function expireEstimate(estimate_id:string){
  const e=estimateStore.get(estimate_id);
  if(e) { e.status="expired"; emitBillingEvent("billing.estimate.expired", { estimate_id }); }
  return e;
}

// ── Budget & Quota Service ────────────────────────────────────────────────
const budgetStore = new Map<string, BudgetPolicy>(); // budget_id → policy
const reservationStore = new Map<string, BudgetReservation>();

export function createBudgetPolicy(policy: Omit<BudgetPolicy,"budget_id"|"created_at"|"updated_at">): BudgetPolicy {
  const bp: BudgetPolicy = { ...policy, budget_id: uid("budget"), created_at: nowIso(), updated_at: nowIso() };
  budgetStore.set(bp.budget_id, bp);
  return bp;
}
export function getBudget(budget_id:string){ return budgetStore.get(budget_id); }
export function listBudgets(tenant_id?:string){
  if(!tenant_id) return Array.from(budgetStore.values());
  return Array.from(budgetStore.values()).filter(b=>b.tenant_id===tenant_id);
}
export function deleteBudget(budget_id:string){ return budgetStore.delete(budget_id); }

export function getBudgetState(budget_id:string): BudgetState | null {
  const bp = budgetStore.get(budget_id);
  if(!bp) return null;
  const events = (usageByTenant.get(bp.tenant_id) ?? []).filter(u=> u.period===periodNow());
  // Filter by scope: for project scope, only that project's usage
  const relevant = bp.scope==="project" ? events.filter(e=> e.project_id===bp.scope_id) : bp.scope==="tenant"||bp.scope==="organization" ? events : events;
  const consumed = relevant.filter(e=> e.kind==="actual" || e.kind==="adjustment").reduce((s,e)=> s + e.cost_cents, 0);
  const reserved = Array.from(reservationStore.values()).filter(r=> r.budget_id===budget_id && r.status==="reserved").reduce((s,r)=> s + r.amount_cents, 0);
  const remaining = Math.max(0, bp.limit_cents - consumed - reserved);
  const projected = consumed + reserved;
  const pct = bp.limit_cents? projected / bp.limit_cents *100 : 0;
  let breached: typeof bp.thresholds[0] | undefined;
  for(const th of [...bp.thresholds].sort((a,b)=>b.percentage-a.percentage)){
    if(pct>=th.percentage){ breached=th; break; }
  }
  const blocked = bp.enforcement==="hard" && pct>=100;
  // Emit threshold event if breached
  if(breached && pct>=breached.percentage){
    emitBillingEvent("billing.budget.threshold.reached", { budget_id, percentage: breached.percentage, action: breached.action });
    if(blocked) emitBillingEvent("billing.budget.exceeded", { budget_id, consumed, limit: bp.limit_cents });
  }
  return { budget_id, consumed_cents: consumed, reserved_cents: reserved, remaining_cents: remaining, projected_cents: projected, utilization_pct: pct, threshold_breached: breached, blocked };
}

export function checkBudgetForEstimate(tenant_id:string, estimate:EstimateResponse): { allowed:boolean; blocking_budget?: BudgetPolicy; reservation?: BudgetReservation; fallback?: string } {
  const budgets = listBudgets(tenant_id).filter(b=> b.scope==="tenant" || b.scope==="project");
  for(const bp of budgets){
    const state = getBudgetState(bp.budget_id);
    if(!state) continue;
    // Hard cap: block if would exceed
    if(state.blocked) return { allowed:false, blocking_budget: bp };
    if(state.projected_cents + estimate.estimated_cost.expected_cents > bp.limit_cents){
      if(bp.enforcement==="hard") return { allowed:false, blocking_budget: bp };
      // Soft: require approval if exceeds 80% etc.
      const needsApproval = bp.thresholds.some(t=> t.action==="require_project_admin_approval" && state.utilization_pct >= t.percentage);
      if(needsApproval) return { allowed:false, blocking_budget: bp, fallback: bp.allowed_fallbacks?.[0] };
    }
  }
  return { allowed:true };
}

export function reserveBudget(estimate_id:string, budget_id:string, amount_cents?:number, expires_minutes=30): BudgetReservation {
  const est = estimateStore.get(estimate_id);
  if(!est) throw new Error("Estimate not found");
  const amt = amount_cents ?? est.estimated_cost.expected_cents;
  const r: BudgetReservation = {
    reservation_id: uid("resv"),
    estimate_id, budget_id, tenant_id: est.tenant_id,
    amount_cents: amt,
    expires_at: new Date(Date.now()+expires_minutes*60*1000).toISOString(),
    status:"reserved",
    created_at: nowIso(),
  };
  reservationStore.set(r.reservation_id, r);
  // Update estimate
  est.reserved_cents = amt;
  est.status="reserved";
  emitBillingEvent("billing.usage.reserved", { reservation_id: r.reservation_id, estimate_id, budget_id, amount_cents: amt });
  return r;
}
export function releaseReservation(reservation_id:string, status: BudgetReservation["status"]="released"){
  const r = reservationStore.get(reservation_id);
  if(!r) throw new Error("Reservation not found");
  r.status=status;
  emitBillingEvent("billing.usage.released", { reservation_id, status });
  return r;
}
export function chargeReservation(reservation_id:string, actual_cost_cents:number){
  const r = reservationStore.get(reservation_id);
  if(!r) throw new Error("Reservation not found");
  r.status="charged";
  // Release unused portion as adjustment? but we just mark charged
  // Record actual usage via recordUsageEvent elsewhere; reservation amount vs actual variance handled
  emitBillingEvent("billing.usage.recorded", { reservation_id, actual_cost_cents });
  return r;
}

// ── Invoice Engine ─────────────────────────────────────────────────────────
const invoiceStore = new Map<string, Invoice>();

export function aggregateInvoice(tenant_id:string, period:string = periodNow(), currency:Currency="USD"): Invoice {
  const events = getUsageByPeriod(tenant_id, period).filter(e=> e.kind==="actual" || e.kind==="adjustment");
  // Group by meter
  const byMeter = new Map<MeterKey, { quantity:number; cost:number; unit:string; rate:number }>();
  for(const e of events){
    const cur = byMeter.get(e.meter) ?? { quantity:0, cost:0, unit:e.unit, rate:e.rate_cents };
    cur.quantity += e.quantity;
    cur.cost += e.cost_cents;
    byMeter.set(e.meter, cur);
  }
  // Build line items, apply included usage from entitlements
  const line_items: InvoiceLineItem[] = [];
  let subtotal=0;
  for(const [meter, agg] of byMeter){
    const included = includedForTenant(tenant_id, meter);
    const overage = Math.max(0, agg.quantity - included);
    const billableQty = meter.startsWith("stored_")? overage : agg.quantity; // storage overage only beyond included
    // For storage, bill only overage; for others, bill all but show included
    const billableCost = meter.startsWith("stored_")? Math.round(overage * agg.rate) : agg.cost;
    subtotal += billableCost;
    line_items.push({
      meter, description: meter.replace(/_/g," "),
      quantity: agg.quantity, unit: agg.unit as BillingUnit, rate_cents: agg.rate, cost_cents: billableCost,
      included_quantity: included>0? included: undefined,
      overage_quantity: overage>0? overage: undefined,
    });
  }
  // Ensure even zero-usage included items show? Add empty line for included but unused? Not needed.
  const pricing_version = events[0]?.pricing_version ?? DEFAULT_VERSION;
  const invoice: Invoice = {
    invoice_id: uid("inv"),
    tenant_id, period, currency, pricing_version,
    line_items,
    subtotal_cents: subtotal,
    discount_cents:0,
    credit_cents: creditStore.filter(c=>c.tenant_id===tenant_id).reduce((s,c)=>s+c.amount_cents,0),
    total_cents: Math.max(0, subtotal - creditStore.filter(c=>c.tenant_id===tenant_id).reduce((s,c)=>s+c.amount_cents,0)),
    status:"draft",
  };
  invoiceStore.set(invoice.invoice_id, invoice);
  return invoice;
}
export function finalizeInvoice(invoice_id:string){
  const inv = invoiceStore.get(invoice_id);
  if(!inv) throw new Error("Invoice not found");
  inv.status="finalized";
  inv.finalized_at=nowIso();
  emitBillingEvent("billing.invoice.finalized", { invoice_id, tenant_id: inv.tenant_id, total_cents: inv.total_cents });
  return inv;
}
export function getInvoice(invoice_id:string){ return invoiceStore.get(invoice_id); }
export function listInvoices(tenant_id?:string){
  if(!tenant_id) return Array.from(invoiceStore.values());
  return Array.from(invoiceStore.values()).filter(i=>i.tenant_id===tenant_id);
}

// ── Credit & Discount ──────────────────────────────────────────────────────
const creditStore: CreditRecord[] = [];
export function createCredit(input: Omit<CreditRecord,"credit_id"|"created_at">): CreditRecord {
  const c: CreditRecord = { ...input, credit_id: uid("credit"), created_at: nowIso() };
  creditStore.push(c);
  emitBillingEvent("billing.credit.issued", { credit_id: c.credit_id, amount_cents: c.amount_cents, reason: c.reason });
  return c;
}
export function listCredits(tenant_id?:string){
  if(!tenant_id) return creditStore;
  return creditStore.filter(c=>c.tenant_id===tenant_id);
}

// ── Customer Billing Dashboard (aggregation) ────────────────────────────────
export function getUsageDashboard(tenant_id:string, period:string = periodNow()): UsageDashboard {
  const events = getUsageByPeriod(tenant_id, period);
  const total = events.filter(e=> e.kind==="actual").reduce((s,e)=> s+e.cost_cents, 0);
  // Projected: current + average daily * remaining days
  const daysInMonth = 30;
  const day = new Date().getDate();
  const projected = day? Math.round(total/day*daysInMonth): total;
  // By meter
  const byMeterMap = new Map<MeterKey, number>();
  const byProjectMap = new Map<string, number>();
  const byModelMap = new Map<string, number>();
  const byRegionMap = new Map<string, number>();
  for(const e of events){
    if(e.kind!=="actual") continue;
    byMeterMap.set(e.meter, (byMeterMap.get(e.meter)??0)+e.cost_cents);
    if(e.project_id) byProjectMap.set(e.project_id, (byProjectMap.get(e.project_id)??0)+e.cost_cents);
    const model = e.metadata?.["model_id"] as string | undefined;
    if(model) byModelMap.set(model, (byModelMap.get(model)??0)+e.cost_cents);
    byRegionMap.set(e.region, (byRegionMap.get(e.region)??0)+e.cost_cents);
  }
  const topDrivers = Array.from(byMeterMap.entries()).map(([meter,cost])=> ({ meter, cost_cents:cost, pct: total? cost/total*100:0 })).sort((a,b)=>b.cost_cents-a.cost_cents).slice(0,5);
  // Included view: map for spec table (Stored media, GPU rendering, AI inference, Transcription, Egress)
  const included: UsageDashboard["included"] = {};
  const metersToShow: MeterKey[] = ["stored_hot_gb_days","gpu_render_hours","ai_inference_minutes","transcription_minutes","egress_cdn_gb"];
  for(const m of metersToShow){
    const cons = events.filter(e=>e.meter===m && e.kind==="actual").reduce((s,e)=>s+e.quantity,0);
    const inc = includedForTenant(tenant_id,m);
    const resv = Array.from(reservationStore.values()).filter(r=> r.tenant_id===tenant_id && r.status==="reserved").reduce((s,r)=>s+r.amount_cents,0);
    const overRate = getRateCard(DEFAULT_VERSION,"us-east-1","all").rates[m]?.rate_cents ?? 0;
    included[m] = { included: inc, consumed: cons, reserved: resv?1:0, remaining: Math.max(0, inc-cons), overage_rate_cents: overRate };
  }
  return {
    period, tenant_id,
    current_cost_cents: total,
    projected_cost_cents: projected,
    included,
    top_drivers: topDrivers,
    by_project: Array.from(byProjectMap.entries()).map(([project_id,cost_cents])=>({project_id,cost_cents})),
    by_meter: Array.from(byMeterMap.entries()).map(([meter,cost_cents])=>({meter,cost_cents})),
    by_model: byModelMap.size? Array.from(byModelMap.entries()).map(([model_id,cost_cents])=>({model_id,cost_cents})): undefined,
    by_region: Array.from(byRegionMap.entries()).map(([region,cost_cents])=>({region,cost_cents})),
  };
}

export function getJobCostView(job_id:string): JobCostView | null {
  const events = usageLedger.filter(e=> e.job_id===job_id && e.kind==="actual");
  if(!events.length) return null;
  const first = events[0]!;
  const estimate = Array.from(estimateStore.values()).find(e=> e.request.asset_ids?.includes(first.asset_id ?? "") || e.tenant_id===first.tenant_id); // approximate
  const actual = events.reduce((s,e)=>s+e.cost_cents,0);
  const expected = estimate? estimate.estimated_cost.expected_cents: actual;
  const variance = actual - expected;
  const retryCost = events.filter(e=> e.metadata?.["retry"]).reduce((s,e)=>s+e.cost_cents,0);
  const breakdown: InvoiceLineItem[] = events.map(e=> ({ meter:e.meter, description: e.meter, quantity:e.quantity, unit:e.unit, rate_cents:e.rate_cents, cost_cents:e.cost_cents }));
  // Included consumed: how much of plan included was used by this job
  const includedConsumed: Partial<Record<string,number>> = {};
  for(const e of events){
    const inc = includedForTenant(e.tenant_id, e.meter);
    if(inc>0) (includedConsumed as Record<string,number>)[e.meter] = Math.min(e.quantity, inc);
  }
  return {
    job_id, operation: first.meter,
    estimated_cost_cents: expected,
    reserved_cents: estimate?.budget_reserved_cents,
    actual_cost_cents: actual,
    variance_cents: variance,
    variance_pct: expected? variance/expected*100:0,
    breakdown,
    retry_cost_cents: retryCost,
    included_consumed: includedConsumed,
    budget_impact: estimate? getBudgetState(budgetStore.keys().next().value as string) ?? undefined : undefined,
  };
}

// ── Billing Events (internal) ──────────────────────────────────────────────
const billingEvents: BillingEvent[] = [];
function emitBillingEvent(type:BillingEventType, data:Record<string,unknown>, tenant_id?:string){
  const ev: BillingEvent = {
    type,
    tenant: { id: (data.tenant_id as string) ?? tenant_id ?? "tenant_acme" },
    causation_id: `evt_${Date.now()}`,
    correlation_id: `corr_${Date.now()}`,
    idempotency_key: `${type}:${Date.now()}:${Math.random().toString(36).slice(2,6)}`,
    schema_version:"1.0.0",
    data,
    timestamp: nowIso(),
  };
  billingEvents.push(ev);
}
export function listBillingEvents(tenant_id?:string, limit=50){
  if(!tenant_id) return billingEvents.slice(-limit).reverse();
  return billingEvents.filter(e=> e.tenant.id===tenant_id).slice(-limit).reverse();
}

// ── Reconciliation (mock) ──────────────────────────────────────────────────
const recoStore: ReconciliationRecord[] = [];
export function reconcileUsage(internal_usage_id:string, provider: ReconciliationRecord["provider"], provider_record_id?:string, variance_cents?:number): ReconciliationRecord {
  const rec: ReconciliationRecord = { internal_usage_id, provider, provider_record_id, state: variance_cents? "rate_mismatch":"matched", variance_cents };
  recoStore.push(rec);
  return rec;
}
export function listReconciliations(){ return recoStore; }

// ── Cost Notifications helper ──────────────────────────────────────────────
export function costNotificationTriggers(){
  return ["Estimate generated","Estimate changed materially","Budget reservation created","Budget threshold reached","Premium model selected","Job paused at cost cap","Actual cost exceeds estimate","Monthly projection changes","Archive retrieval initiated","Egress threshold reached"];
}

// ── Pricing Optimization suggestions (policy-aware) ────────────────────────
export function pricingOptimizations(){
  return [
    "Proxy-first workflows (review proxy before 8K master)",
    "Preview-before-final export",
    "Smart model routing (standard unless premium required)",
    "Batch inference + model caching + deduplicated analysis",
    "Content-aware transcoding (per-content ladder)",
    "Regional scheduling (cheapest compliant region)",
    "Tier-aware storage (auto hot→warm→cool)",
    "CDN cache optimization + partial archive restore",
    "Render-result reuse (cache key = input_hash + params)",
  ];
}

// ── Prepaid / Postpaid helpers ─────────────────────────────────────────────
const billingAccounts = new Map<string, BillingAccount>();
export function getBillingAccount(tenant_id:string): BillingAccount {
  return billingAccounts.get(tenant_id) ?? { tenant_id, mode:"monthly_subscription", prepaid_balance_cents:0, currency:"USD" };
}
export function setBillingAccount(acct:BillingAccount){ billingAccounts.set(acct.tenant_id, acct); return acct; }

// ── Helpers for invoice aggregation by GB-hours → GB-months ────────────────
export function gbHoursToGbMonths(gbHours:number){ return gbHours/720; }
export function gbHoursToGbDays(gbHours:number){ return gbHours/24; }
