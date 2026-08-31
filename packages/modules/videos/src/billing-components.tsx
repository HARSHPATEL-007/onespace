"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Tabs } from "@n0va/ui";
import type { EstimateRequest, EstimateResponse, EstimateOperation, BudgetPolicy, Invoice, UsageDashboard, JobCostView, BillingEvent } from "./billing-types";
import type { VideoTier } from "./entitlement-types";

// ── Estimate card ──────────────────────────────────────────────────────────
export function EstimateCard({ estimate, onApprove, onCancel }: { estimate: EstimateResponse; onApprove?: ()=>void; onCancel?: ()=>void }){
  const exp = (estimate.estimated_cost.expected_cents/100).toFixed(2);
  const low = (estimate.estimated_cost.low_cents/100).toFixed(2);
  const high = (estimate.estimated_cost.high_cents/100).toFixed(2);
  return (
    <div className="nv-card" style={{ padding:16, display:"flex", flexDirection:"column", gap:12, border: estimate.requires_confirmation? "1px solid #f59e0b":"1px solid var(--nv-color-border)", background: estimate.requires_confirmation? "#fffbeb":"var(--nv-color-surface)" }}>
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <span style={{ fontWeight:900, fontSize:14 }}>{estimate.operation}</span>
        <Badge tone={estimate.requires_confirmation?"warning":"success"}>{estimate.requires_confirmation? "Confirmation required":"Auto-approve"}</Badge>
        <Badge tone="neutral">{estimate.pricing_version}</Badge>
        <Badge tone="neutral">{estimate.currency}</Badge>
        <span style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Expires {new Date(estimate.expires_at).toLocaleTimeString()} • {estimate.region}</span>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, textAlign:"center" }}>
        <div style={{ background:"#ecfdf5", border:"1px solid #86efac", borderRadius:8, padding:10 }}>
          <div style={{ fontSize:11, color:"#065f46", fontWeight:700 }}>LOW</div>
          <div style={{ fontWeight:900, fontSize:16 }}>${low}</div>
        </div>
        <div style={{ background:"#fef3c7", border:"1px solid #fcd34d", borderRadius:8, padding:10 }}>
          <div style={{ fontSize:11, color:"#92400e", fontWeight:700 }}>EXPECTED • {Math.round(estimate.estimated_cost.confidence*100)}% conf</div>
          <div style={{ fontWeight:900, fontSize:18 }}>${exp}</div>
          <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>budget reserved ${exp}</div>
        </div>
        <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:10 }}>
          <div style={{ fontSize:11, color:"#991b1b", fontWeight:700 }}>HIGH</div>
          <div style={{ fontWeight:900, fontSize:16 }}>${high}</div>
        </div>
      </div>
      {estimate.variance_notes && <div style={{ fontSize:11, color:"#92400e", background:"#fef3c7", padding:"6px 10px", borderRadius:6 }}>{estimate.variance_notes[0]}</div>}
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ background:"var(--nv-color-surface-2)", textAlign:"left" }}>
              <th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Line item</th>
              <th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Qty</th>
              <th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Unit</th>
              <th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Rate</th>
              <th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Cost</th>
              <th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Included</th>
            </tr>
          </thead>
          <tbody>
            {estimate.line_items.map((li,i)=>(
              <tr key={i}>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)", fontWeight:700 }}>{li.name}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{li.quantity}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{li.unit}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>${(li.rate_cents/100).toFixed(2)}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)", fontWeight:800 }}>${(li.cost_cents/100).toFixed(2)}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{li.included_quantity ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
        {estimate.requires_confirmation ? (
          <>
            <Button size="sm" onClick={onApprove}>Approve expected (${exp})</Button>
            <Button size="sm" variant="secondary" onClick={onApprove}>Approve up to max (${high})</Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>Use standard model / lower resolution / proxy only / cancel</Button>
          </>
        ) : (
          <Badge tone="success">Within included usage — no confirmation needed (budget reserved ${exp})</Badge>
        )}
      </div>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>What will this cost? What is included? What if estimate changes? → High estimate accounts for timeline complexity, VFR, temporal effects, retries, fallback, storage retrieval, multiple destinations.</div>
    </div>
  );
}

// ── Budget controls ────────────────────────────────────────────────────────
export function BudgetPanel({ tenantId, apiBase="/api/videos/billing" }: { tenantId?: string; apiBase?: string }){
  const [budgets, setBudgets] = useState<BudgetPolicy[]>([]);
  const [period, setPeriod] = useState<BudgetPolicy["period"]>("monthly");
  const [limit, setLimit] = useState(1000);
  const [scope, setScope] = useState<BudgetPolicy["scope"]>("project");
  const [scopeId, setScopeId] = useState("project_001");
  const tid = tenantId ?? "tenant_acme";
  const refresh = async()=>{
    try{
      const r=await fetch(`${apiBase}/budget?tenant_id=${tid}`);
      if(r.ok){ const j=await r.json(); setBudgets(j.budgets ?? []); }
    }catch{}
  };
  useEffect(()=>{ void refresh(); }, [tid]);
  const create = async()=>{
    await fetch(`${apiBase}/budget`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ tenant_id: tid, scope, scope_id: scopeId, currency:"USD", period, limit_cents: Math.round(limit*100), enforcement:"soft", thresholds:[{ percentage:50, action:"notify_owner" },{ percentage:80, action:"require_project_admin_approval" },{ percentage:100, action:"block_new_premium_usage" }], allowed_fallbacks:["standard_model","proxy_export"] })});
    void refresh();
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        <select className="nv-input" value={scope} onChange={e=> setScope(e.target.value as BudgetPolicy["scope"])} style={{ maxWidth:140 }}>
          <option value="organization">Organization</option><option value="tenant">Tenant</option><option value="workspace">Workspace</option><option value="project">Project</option><option value="user">User</option><option value="agent">Agent</option><option value="job">Job</option>
        </select>
        <input className="nv-input" value={scopeId} onChange={e=> setScopeId(e.target.value)} placeholder="scope id (project_001)" style={{ maxWidth:180 }} />
        <select className="nv-input" value={period} onChange={e=> setPeriod(e.target.value as BudgetPolicy["period"])} style={{ maxWidth:140 }}>
          <option value="daily">Daily</option><option value="monthly">Monthly</option><option value="per_job">Per-job</option>
        </select>
        <input type="number" className="nv-input" value={limit} onChange={e=> setLimit(Number(e.target.value))} style={{ maxWidth:120 }} />
        <span style={{ fontSize:12 }}>USD limit</span>
        <Button size="sm" onClick={create}>Create budget</Button>
        <Button size="sm" variant="secondary" onClick={()=> void refresh()}>Refresh</Button>
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr style={{ background:"var(--nv-color-surface-2)" }}><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Scope</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Period</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Limit</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Thresholds</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Enforcement</th></tr></thead>
          <tbody>
            {budgets.map(b=>(
              <tr key={b.budget_id}>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{b.scope}:{b.scope_id}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{b.period}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>${(b.limit_cents/100).toFixed(2)}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{b.thresholds.map(t=> `${t.percentage}%→${t.action}`).join(" | ")}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{b.enforcement}</td>
              </tr>
            ))}
            {!budgets.length && <tr><td colSpan={5} style={{ padding:12, textAlign:"center", color:"var(--nv-color-text-faint)" }}>No budgets — create one to enforce soft/hard caps, per-operation/daily/monthly/premium-only caps.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Reservation flow: Estimate → Reserve budget → Start job → Record actual → Release unused reservation → Charge actual. If actual exceeds reservation: pause, request approval, fallback, or cancel — never exceed hard cap due to inaccurate estimate.</div>
    </div>
  );
}

// ── Usage dashboard ────────────────────────────────────────────────────────
export function UsageDashboardPanel({ dashboard }: { dashboard: UsageDashboard | null }){
  if(!dashboard) return <div style={{ padding:12, color:"var(--nv-color-text-faint)", fontSize:12 }}>Loading dashboard… need billing.usage.recorded events.</div>;
  const total = (dashboard.current_cost_cents/100).toFixed(2);
  const proj = (dashboard.projected_cost_cents/100).toFixed(2);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px,1fr))", gap:10 }}>
        <div className="nv-card" style={{ padding:12, background:"#f0fdf4", border:"1px solid #86efac" }}>
          <div style={{ fontSize:11, color:"#065f46", fontWeight:800 }}>CURRENT COST</div>
          <div style={{ fontWeight:900, fontSize:20 }}>${total}</div>
          <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Period {dashboard.period}</div>
        </div>
        <div className="nv-card" style={{ padding:12, background:"#eff6ff", border:"1px solid #93c5fd" }}>
          <div style={{ fontSize:11, color:"#1e40af", fontWeight:800 }}>PROJECTED</div>
          <div style={{ fontWeight:900, fontSize:20 }}>${proj}</div>
          <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>End-of-period estimate</div>
        </div>
        {dashboard.top_drivers.slice(0,3).map(d=>(
          <div key={d.meter} className="nv-card" style={{ padding:12 }}>
            <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", fontWeight:700 }}>{d.meter}</div>
            <div style={{ fontWeight:800 }}>${(d.cost_cents/100).toFixed(2)} • {d.pct.toFixed(1)}%</div>
          </div>
        ))}
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead><tr style={{ background:"var(--nv-color-surface-2)" }}><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Meter</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Included</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Used</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Reserved</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Remaining</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Overage rate</th></tr></thead>
          <tbody>
            {Object.entries(dashboard.included).map(([meter, v])=>(
              <tr key={meter}>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)", fontWeight:700 }}>{meter}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{v.included}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{v.consumed}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{v.reserved}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)", color: v.remaining<=0?"#991b1b":"#065f46", fontWeight:800 }}>{v.remaining}</td>
                <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>${(v.overage_rate_cents/100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div className="nv-card" style={{ padding:12 }}>
          <div style={{ fontWeight:800, fontSize:12 }}>By project</div>
          <ul style={{ fontSize:12, margin:"6px 0 0", paddingLeft:18 }}>
            {dashboard.by_project.slice(0,5).map(p=> <li key={p.project_id}>{p.project_id}: ${(p.cost_cents/100).toFixed(2)}</li>)}
            {!dashboard.by_project.length && <li style={{ color:"var(--nv-color-text-faint)" }}>No project breakdown yet</li>}
          </ul>
        </div>
        <div className="nv-card" style={{ padding:12 }}>
          <div style={{ fontWeight:800, fontSize:12 }}>By meter</div>
          <ul style={{ fontSize:12, margin:"6px 0 0", paddingLeft:18 }}>
            {dashboard.by_meter.slice(0,5).map(m=> <li key={m.meter}>{m.meter}: ${(m.cost_cents/100).toFixed(2)}</li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Job cost view ───────────────────────────────────────────────────────────
export function JobCostPanel({ job }: { job: JobCostView | null }){
  if(!job) return <div style={{ padding:12, color:"var(--nv-color-text-faint)", fontSize:12 }}>No job — every expensive job shows estimated / reserved / actual / variance + breakdown + retry cost + included consumed + budget impact.</div>;
  return (
    <div className="nv-card" style={{ padding:16, display:"flex", flexDirection:"column", gap:10 }}>
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <span style={{ fontWeight:900 }}>{job.job_id}</span>
        <Badge tone={job.variance_cents>0?"warning":"success"}>Variance {job.variance_cents>0?"+":""}${(job.variance_cents/100).toFixed(2)} ({job.variance_pct.toFixed(1)}%)</Badge>
        <Badge tone="neutral">{job.operation}</Badge>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, textAlign:"center", fontSize:12 }}>
        <div style={{ background:"var(--nv-color-surface-2)", borderRadius:8, padding:10 }}><div style={{ fontWeight:700 }}>Estimated</div><div style={{ fontWeight:900, fontSize:16 }}>${((job.estimated_cost_cents??0)/100).toFixed(2)}</div></div>
        <div style={{ background:"#fef3c7", borderRadius:8, padding:10 }}><div style={{ fontWeight:700 }}>Reserved</div><div style={{ fontWeight:900, fontSize:16 }}>${((job.reserved_cents??0)/100).toFixed(2)}</div></div>
        <div style={{ background:"#ecfdf5", borderRadius:8, padding:10 }}><div style={{ fontWeight:700 }}>Actual</div><div style={{ fontWeight:900, fontSize:16 }}>${(job.actual_cost_cents/100).toFixed(2)}</div></div>
        <div style={{ background: job.retry_cost_cents? "#fef2f2":"var(--nv-color-surface-2)", borderRadius:8, padding:10 }}><div style={{ fontWeight:700 }}>Retry overhead</div><div style={{ fontWeight:900 }}>${(job.retry_cost_cents/100).toFixed(2)}</div></div>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
        <thead><tr style={{ background:"var(--nv-color-surface-2)" }}><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Meter</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Qty</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Rate</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Cost</th></tr></thead>
        <tbody>{job.breakdown.map((b,i)=> <tr key={i}><td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{b.meter}</td><td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{b.quantity} {b.unit}</td><td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>${(b.rate_cents/100).toFixed(2)}</td><td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)", fontWeight:800 }}>${(b.cost_cents/100).toFixed(2)}</td></tr>)}</tbody>
      </table>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Included consumed: {JSON.stringify(job.included_consumed)} • Budget impact: {job.budget_impact? `${job.budget_impact.utilization_pct.toFixed(1)}% of budget`:"—"}</div>
    </div>
  );
}

// ── Invoice view ───────────────────────────────────────────────────────────
export function InvoicePanel({ invoice }: { invoice: Invoice | null }){
  if(!invoice) return <div style={{ padding:12, color:"var(--nv-color-text-faint)", fontSize:12 }}>No invoice — aggregated per period from immutable ledger; pricing changes never retroactively alter historical invoices.</div>;
  return (
    <div className="nv-card" style={{ padding:16, display:"flex", flexDirection:"column", gap:10 }}>
      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
        <span style={{ fontWeight:900 }}>{invoice.invoice_id}</span>
        <Badge tone={invoice.status==="finalized"?"success": invoice.status==="draft"?"warning":"neutral"}>{invoice.status}</Badge>
        <Badge tone="neutral">{invoice.period}</Badge>
        <Badge tone="neutral">{invoice.pricing_version}</Badge>
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
        <thead><tr style={{ background:"var(--nv-color-surface-2)" }}><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Meter</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Qty</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Included</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Overage</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Cost</th></tr></thead>
        <tbody>{invoice.line_items.map((li,i)=> <tr key={i}><td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{li.description}</td><td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{li.quantity} {li.unit}</td><td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{li.included_quantity ?? "—"}</td><td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{li.overage_quantity ?? "—"}</td><td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)", fontWeight:800 }}>${(li.cost_cents/100).toFixed(2)}</td></tr>)}</tbody>
      </table>
      <div style={{ display:"flex", gap:16, justifyContent:"flex-end", fontSize:13 }}>
        <span>Subtotal ${(invoice.subtotal_cents/100).toFixed(2)}</span>
        <span>Credits -${(invoice.credit_cents/100).toFixed(2)}</span>
        <span style={{ fontWeight:900, fontSize:16 }}>Total ${(invoice.total_cents/100).toFixed(2)} {invoice.currency}</span>
      </div>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Immutable usage → ledger → invoice aggregation. Corrections create adjustment records, never mutate original. Pricing version pinned per usage record.</div>
    </div>
  );
}

// ── Billing control center (main) ─────────────────────────────────────────
export function BillingControlCenter({ tenantId, apiBase="/api/videos/billing" }: { tenantId?: string; apiBase?: string }){
  const [tab, setTab] = useState("estimate");
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null);
  const [dashboard, setDashboard] = useState<UsageDashboard | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [job, setJob] = useState<JobCostView | null>(null);
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [op, setOp] = useState<EstimateOperation>("high_resolution_export");
  const [duration, setDuration] = useState(180);
  const [premium, setPremium] = useState(false);
  const [resolution, setResolution] = useState("4K");
  const tid = tenantId ?? "tenant_acme";

  const runEstimate = async()=>{
    const req: EstimateRequest = { operation: op, tenant_id: tid, input_duration_seconds: duration, input_size_bytes: duration*5_000_000, premium, resolution, destinations:["cdn","youtube"], region:"eu-west-1" };
    try{
      const r=await fetch(`${apiBase}/estimate`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(req) });
      if(r.ok){ const j=await r.json(); setEstimate(j); return; }
    }catch{}
    // fallback client-side: import engine directly
    const { estimateCost } = await import("./billing-engine");
    setEstimate(estimateCost(req));
  };
  const loadDashboard = async()=>{
    try{
      const r=await fetch(`${apiBase}/dashboard?tenant_id=${tid}`);
      if(r.ok){ const j=await r.json(); setDashboard(j.dashboard ?? j); }
      else {
        const { getUsageDashboard } = await import("./billing-engine");
        setDashboard(getUsageDashboard(tid));
      }
    }catch{
      const { getUsageDashboard } = await import("./billing-engine");
      setDashboard(getUsageDashboard(tid));
    }
  };
  const loadInvoice = async()=>{
    try{
      const r=await fetch(`${apiBase}/invoice?tenant_id=${tid}`);
      if(r.ok){ const j=await r.json(); setInvoice(j.invoice ?? j); }
      else {
        const { aggregateInvoice } = await import("./billing-engine");
        setInvoice(aggregateInvoice(tid));
      }
    }catch{
      const { aggregateInvoice } = await import("./billing-engine");
      setInvoice(aggregateInvoice(tid));
    }
  };
  const loadEvents = async()=>{
    try{
      const r=await fetch(`${apiBase}/events?tenant_id=${tid}`);
      if(r.ok){ const j=await r.json(); setEvents(j.events ?? []); }
      else {
        const { listBillingEvents } = await import("./billing-engine");
        setEvents(listBillingEvents(tid, 20));
      }
    }catch{
      const { listBillingEvents } = await import("./billing-engine");
      setEvents(listBillingEvents(tid, 20));
    }
  };

  useEffect(()=>{ void loadDashboard(); void loadEvents(); }, [tid]);
  useEffect(()=>{ void runEstimate(); }, [op, duration, premium, resolution]);

  const tabs = [
    { id:"estimate", label:"Estimate" },
    { id:"dashboard", label:"Dashboard" },
    { id:"job", label:"Job Cost" },
    { id:"invoice", label:"Invoice" },
    { id:"budgets", label:"Budgets" },
    { id:"events", label:"Events" },
    { id:"optimize", label:"Optimize" },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", background:"linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)", color:"#fff", padding:16, borderRadius:12, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ width:44, height:44, borderRadius:10, background:"linear-gradient(135deg,#38bdf8,#818cf8)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900 }}>$</div>
        <div style={{ flex:1, minWidth:260 }}>
          <div style={{ fontWeight:900, fontSize:16 }}>N0VA VIDEOS — Usage Billing</div>
          <div style={{ fontSize:12, opacity:0.8 }}>Estimate → Reserve → Execute → Reconcile • Immutable ledger • Versioned pricing {estimate?.pricing_version ?? "2026-08-01"} • Transparent before execution</div>
        </div>
        <Badge tone="primary">Usage → Meter → Rate card → Estimate → Ledger → Invoice</Badge>
      </div>

      <Tabs tabs={tabs as unknown as { id:string; label:string }[]} active={tab} onChange={setTab} />

      {tab==="estimate" && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            <select className="nv-input" value={op} onChange={e=> setOp(e.target.value as EstimateOperation)} style={{ maxWidth:180 }}>
              <option value="high_resolution_export">High-res export</option>
              <option value="gpu_render">GPU render</option>
              <option value="ai_inference">AI inference</option>
              <option value="transcription">Transcription</option>
              <option value="generated_media">Generated media</option>
              <option value="live_production">Live production</option>
              <option value="archive_retrieval">Archive retrieval</option>
              <option value="drm_package">DRM / Watermark</option>
            </select>
            <input type="number" className="nv-input" value={duration} onChange={e=> setDuration(Number(e.target.value))} style={{ maxWidth:100 }} />
            <span style={{ fontSize:12 }}>sec</span>
            <select className="nv-input" value={resolution} onChange={e=> setResolution(e.target.value)} style={{ maxWidth:100 }}>
              <option value="1080p">1080p</option><option value="4K">4K</option><option value="8K">8K</option>
            </select>
            <label style={{ display:"flex", gap:6, alignItems:"center", fontSize:12 }}><input type="checkbox" checked={premium} onChange={e=> setPremium(e.target.checked)} /> Premium model</label>
            <Button size="sm" onClick={runEstimate}>Estimate</Button>
            <Button size="sm" variant="secondary" onClick={loadDashboard}>Refresh dashboard</Button>
          </div>
          {estimate ? <EstimateCard estimate={estimate} onApprove={async()=>{
            try{ await fetch(`${apiBase}/estimate/${estimate.estimate_id}/approve`, { method:"POST" }); }catch{}
            const { approveEstimate } = await import("./billing-engine");
            try{ approveEstimate(estimate.estimate_id); }catch{}
            void loadDashboard();
          }} onCancel={()=> setEstimate(null)} /> : <div style={{ fontSize:12, color:"var(--nv-color-text-faint)" }}>No estimate — what will this cost? What is included? Can I approve/cap/cancel?</div>}
          <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Prepaid & postpaid: monthly subscription / overage / prepaid credits / enterprise commitment / purchase orders / hard & soft caps. Every usage references pricing_version {estimate?.pricing_version ?? "2026-08-01"} — pricing changes never retroactively alter invoices.</div>
        </div>
      )}

      {tab==="dashboard" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", gap:8 }}>
            <Button size="sm" onClick={loadDashboard}>Refresh</Button>
            <Button size="sm" variant="secondary" onClick={loadInvoice}>Load invoice</Button>
            <Button size="sm" variant="ghost" onClick={loadEvents}>Events</Button>
          </div>
          <UsageDashboardPanel dashboard={dashboard} />
        </div>
      )}

      {tab==="job" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", gap:8 }}>
            <Button size="sm" onClick={async()=>{ const { getJobCostView }=await import("./billing-engine"); const j=getJobCostView("render_0077"); setJob(j); }}>Load example job render_0077</Button>
            <Button size="sm" variant="secondary" onClick={()=> setJob(null)}>Clear</Button>
          </div>
          <JobCostPanel job={job} />
        </div>
      )}

      {tab==="invoice" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", gap:8 }}><Button size="sm" onClick={loadInvoice}>Aggregate draft invoice</Button><Button size="sm" variant="secondary" onClick={async()=>{ if(!invoice) return; try{ await fetch(`${apiBase}/invoice/${invoice.invoice_id}/finalize`, {method:"POST"});}catch{} const { finalizeInvoice }=await import("./billing-engine"); if(invoice) finalizeInvoice(invoice.invoice_id); void loadInvoice(); }}>Finalize</Button></div>
          <InvoicePanel invoice={invoice} />
        </div>
      )}

      {tab==="budgets" && <BudgetPanel tenantId={tid} apiBase={apiBase} />}

      {tab==="events" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", gap:8 }}><Button size="sm" onClick={loadEvents}>Refresh events</Button></div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr style={{ background:"var(--nv-color-surface-2)" }}><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Time</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Type</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Data</th></tr></thead>
              <tbody>
                {events.map((ev,i)=>(
                  <tr key={i}>
                    <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)", whiteSpace:"nowrap" }}>{new Date(ev.timestamp).toLocaleTimeString()}</td>
                    <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}><Badge tone="primary">{ev.type}</Badge></td>
                    <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)", fontSize:11, maxWidth:400, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{JSON.stringify(ev.data).slice(0,120)}</td>
                  </tr>
                ))}
                {!events.length && <tr><td colSpan={3} style={{ padding:12, textAlign:"center", color:"var(--nv-color-text-faint)" }}>No events — billing.usage.recorded / reserved / released / estimate.created / approved / budget.threshold.reached / invoice.finalized</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="optimize" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px,1fr))", gap:10 }}>
          {[
            "Proxy-first workflows",
            "Preview-before-final export",
            "Smart model routing (standard unless premium)",
            "Batch inference + caching + dedup",
            "Content-aware transcoding (per-content ladder)",
            "Regional scheduling",
            "Tier-aware storage (hot→warm→cool)",
            "CDN cache + partial archive restore",
            "Render-result reuse (cache by input_hash)",
          ].map(o=>(
            <div key={o} className="nv-card" style={{ padding:12, background:"#f0fdf4", border:"1px solid #86efac" }}>
              <div style={{ fontWeight:800, fontSize:12 }}>{o}</div>
              <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", marginTop:4 }}>Policy-aware: never downgrade regulated model without permission, never move legal-hold data, never remove watermark to save cost, never use non-resident provider, never reuse across tenants.</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
