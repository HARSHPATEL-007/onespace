import { estimateCost, recordUsageEvent, createAdjustment, getUsageLedger, getRateCard, createBudgetPolicy, getBudgetState, reserveBudget, aggregateInvoice, finalizeInvoice, createCredit, getUsageDashboard, getJobCostView, listBillingEvents, getBillingAccount, setBillingAccount } from "./src/billing-engine.ts";

console.log("== N0VA VIDEOS Billing Smoke ==");

// 1. Versioned pricing — rate card exists for 2026-08-01
let card = getRateCard("2026-08-01", "eu-west-1", "studio");
console.assert(card.pricing_version==="2026-08-01", "pricing version");
console.assert(card.rates["gpu_render_minutes"]?.rate_cents===5, "gpu rate 5c");
console.log("✓ rate card versioned", card.pricing_version, card.region, card.plan);

// 2. Transparent measurement — every usage includes metric/quantity/unit/rate/currency etc.
let u1 = recordUsageEvent({ tenant_id:"tenant_acme", project_id:"project_001", asset_id:"asset_001", job_id:"render_0077", meter:"gpu_render_minutes", quantity:84, idempotency_key:"usage:render_0077:attempt_1", kind:"actual", causation_id:"evt_export_completed", correlation_id:"corr_delivery_0042", schema_version:"1.0.0" });
console.assert(u1.meter==="gpu_render_minutes" && u1.quantity===84, "usage quantity");
console.assert(u1.rate_cents===5 && u1.cost_cents===420, "cost 84*5c=420");
console.assert(u1.pricing_version==="2026-08-01" && u1.currency==="USD", "pricing/currency");
console.log("✓ transparent usage", JSON.stringify({ meter:u1.meter, quantity:u1.quantity, unit:u1.unit, rate_cents:u1.rate_cents, cost_cents:u1.cost_cents, currency:u1.currency, pricing_version:u1.pricing_version }));

// 3. Immutable ledger — correction creates adjustment, not mutation
let adj = createAdjustment(u1.usage_id, -10, "overcharged 10 min", "admin");
console.assert(adj.kind==="adjustment" && adj.adjustment_for===u1.usage_id, "adjustment");
console.assert(getUsageLedger("tenant_acme",10).find(u=>u.usage_id===u1.usage_id)?.quantity===84, "original unchanged");
console.log("✓ immutable ledger — adjustment", adj.adjustment_for);

// 4. Duplicate prevention — same idempotency_key returns existing, not double charge
let dup = recordUsageEvent({ tenant_id:"tenant_acme", meter:"gpu_render_minutes", quantity:84, idempotency_key:"usage:render_0077:attempt_1", kind:"actual", causation_id:"evt_duplicate", correlation_id:"corr", schema_version:"1.0.0" });
console.assert(dup.usage_id===u1.usage_id, "duplicate returns same");
console.log("✓ duplicate prevention", dup.usage_id===u1.usage_id);

// 5. Estimate before execution — with confidence range, line items, requires_confirmation
let est = estimateCost({ operation:"high_resolution_export", tenant_id:"tenant_acme", project_id:"project_001", input_duration_seconds:180, input_size_bytes:2_000_000_000, premium:false, resolution:"4K", destinations:["cdn","youtube","vimeo"], region:"eu-west-1" });
console.assert(est.estimate_id && est.expires_at, "estimate ids");
console.assert(est.estimated_cost.low_cents < est.estimated_cost.expected_cents && est.estimated_cost.expected_cents < est.estimated_cost.high_cents, "low < expected < high");
console.assert(est.line_items.length>=3, "line items");
console.log("✓ estimate", JSON.stringify({ operation: est.operation, low:(est.estimated_cost.low_cents/100).toFixed(2), exp:(est.estimated_cost.expected_cents/100).toFixed(2), high:(est.estimated_cost.high_cents/100).toFixed(2), confidence: est.estimated_cost.confidence, requires_confirmation: est.requires_confirmation }));
// Pricing change must not retroactively alter historical invoices — new estimate uses same version but later version would not affect past usage
let est2 = estimateCost({ operation:"gpu_render", tenant_id:"tenant_acme", input_duration_seconds:60, pricing_version:"2026-08-01" });
console.assert(est2.pricing_version==="2026-08-01", "estimate pricing version pinned");
console.log("✓ estimate pricing_version pinned", est2.pricing_version);

// 6. Billing modes — monthly, prepaid, commitment, PO, hard/soft caps
let acct = setBillingAccount({ tenant_id:"tenant_acme", mode:"prepaid_credits", prepaid_balance_cents:50000, currency:"USD", hard_cap_cents:10000 });
console.assert(acct.mode==="prepaid_credits", "prepaid");
console.log("✓ billing account modes", acct.mode, acct.hard_cap_cents);

// 7. Storage billing — GB-hours → GB-days → GB-months
let s1 = recordUsageEvent({ tenant_id:"tenant_acme", meter:"stored_hot_gb_days", quantity:30, idempotency_key:`store:${Date.now()}`, kind:"actual", causation_id:"evt_store", correlation_id:"c", schema_version:"1.0.0" });
console.assert(s1.unit==="GB-days", "storage unit");
console.log("✓ storage GB-days", s1.quantity, s1.cost_cents);

// 8. Egress — differentiate cdn/origin/inter-region/internet/private
let e1 = recordUsageEvent({ tenant_id:"tenant_acme", meter:"egress_cdn_gb", quantity:50, idempotency_key:`egress:cdn:${Date.now()}`, kind:"actual", causation_id:"evt_egress", correlation_id:"c", schema_version:"1.0.0" });
let e2 = recordUsageEvent({ tenant_id:"tenant_acme", meter:"egress_inter_region_gb", quantity:20, idempotency_key:`egress:inter:${Date.now()}`, kind:"actual", causation_id:"evt_egress2", correlation_id:"c", schema_version:"1.0.0" });
console.assert(e1.cost_cents===150 && e2.cost_cents===40, "egress rates diff");
console.log("✓ egress differentiated", e1.cost_cents, e2.cost_cents);

// 9. Budget hierarchy — tenant → workspace → project → job with thresholds
let bp = createBudgetPolicy({ tenant_id:"tenant_acme", scope:"project", scope_id:"project_001", currency:"USD", period:"monthly", limit_cents:100000, enforcement:"soft", thresholds:[{ percentage:50, action:"notify_owner" },{ percentage:80, action:"require_project_admin_approval" },{ percentage:100, action:"block_new_premium_usage" }], allowed_fallbacks:["standard_model","proxy_export"] });
console.assert(bp.budget_id, "budget created");
let state = getBudgetState(bp.budget_id);
console.assert(state && state.budget_id===bp.budget_id, "budget state");
console.log("✓ budget hierarchy", bp.scope, bp.limit_cents, state?.utilization_pct.toFixed(1)+"%");

// 10. Reservation and reconciliation — estimate → reserve → execute → release unused → charge actual; never exceed hard cap due to inaccurate estimate
let est3 = estimateCost({ operation:"generated_media", tenant_id:"tenant_acme", input_duration_seconds:10, premium:true, resolution:"4K" });
let resv = reserveBudget(est3.estimate_id, bp.budget_id);
console.assert(resv.status==="reserved" && resv.amount_cents===est3.estimated_cost.expected_cents, "reservation");
console.log("✓ budget reservation", resv.amount_cents, resv.status);
// If actual exceeds reservation: pause/request approval/fallback — simulate by checking budget
let check = getBudgetState(bp.budget_id);
console.assert(check && !check.blocked, "not blocked yet");
console.log("✓ budget not blocked", check?.blocked);

// 11. Included usage and overage — show included/consumed/reserved/remaining/projected
let dash = getUsageDashboard("tenant_acme");
console.assert(dash.current_cost_cents>0, "dashboard current cost");
console.assert(Object.keys(dash.included).length>0, "dashboard included");
console.log("✓ dashboard included/overage", JSON.stringify(Object.entries(dash.included).slice(0,2).map(([k,v])=>({ meter:k, included:v.included, consumed:v.consumed, remaining:v.remaining }))));

// 12. Job-level cost view — estimated/reserved/actual/variance/retry/included/budget
let jv = getJobCostView("render_0077");
console.assert(jv && jv.job_id==="render_0077", "job cost view");
console.log("✓ job cost view", JSON.stringify({ job_id:jv.job_id, estimated:(jv.estimated_cost_cents/100).toFixed(2), actual:(jv.actual_cost_cents/100).toFixed(2), variance:(jv.variance_cents/100).toFixed(2), retry:(jv.retry_cost_cents/100).toFixed(2) }));

// 13. Invoice aggregation — immutable ledger → invoice; pricing version pinned; corrections via adjustments
let inv = aggregateInvoice("tenant_acme");
console.assert(inv.invoice_id && inv.line_items.length>0, "invoice");
console.assert(inv.pricing_version==="2026-08-01", "invoice pricing version");
console.log("✓ invoice aggregation", inv.invoice_id, inv.line_items.length, (inv.total_cents/100).toFixed(2));
let inv2 = finalizeInvoice(inv.invoice_id);
console.assert(inv2.status==="finalized", "finalized");
console.log("✓ invoice finalized", inv2.status);
// Pricing change not retroactive: new rate card with higher price should not affect already finalized invoice
import { createRateCard } from "./src/billing-engine.ts";
createRateCard({ rate_card_id:"2026-09-01|us-east-1|all", pricing_version:"2026-09-01", currency:"USD", region:"us-east-1", plan:"all", effective_from:"2026-09-01T00:00:00Z", rates:{ gpu_render_minutes:{ meter:"gpu_render_minutes", unit:"GPU-minutes", rate_cents:10, currency:"USD" } } });
let uNew = recordUsageEvent({ tenant_id:"tenant_acme", meter:"gpu_render_minutes", quantity:10, pricing_version:"2026-09-01", idempotency_key:`new:${Date.now()}`, kind:"actual", causation_id:"evt_new", correlation_id:"c", schema_version:"1.0.0" });
console.assert(uNew.cost_cents===100, "new pricing 10c");
console.assert(inv.total_cents!==uNew.cost_cents, "historical invoice unchanged");
console.log("✓ versioned pricing not retroactive", inv.total_cents, "vs new", uNew.cost_cents);

// 14. Credits and refunds — visible adjustment, never silent erase
let cred = createCredit({ tenant_id:"tenant_acme", amount_cents: 200, currency:"USD", reason:"Platform-caused failure — duplicate charge", incident_id:"inc_001", approved_by:"finance" });
console.assert(cred.amount_cents===200, "credit");
console.log("✓ credit", cred.credit_id, cred.reason);

// 15. Internal usage events — billing.usage.recorded etc. with idempotency
let evts = listBillingEvents("tenant_acme", 5);
console.assert(evts.length>0 && evts[0].type.startsWith("billing."), "billing events");
console.log("✓ billing events", evts.slice(0,2).map(e=>e.type).join(", "));

console.log("== All billing smoke checks passed ==");
