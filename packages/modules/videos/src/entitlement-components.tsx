"use client";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Dialog, Tabs } from "@n0va/ui";
import type { VideoTier, EntitlementEnvelope, UsageState, EntitlementCheckRecord, CapabilityMatrixRow, AddOnId, TierChangeEvaluation } from "./entitlement-types";
import { TIER_POSITIONING, VIDEO_TIERS } from "./entitlement-types";
import { CAPABILITY_MATRIX, TIER_CATALOG, ADDON_CATALOG, COMMERCIAL_METRICS, getCommercialIndicator } from "./entitlement-engine";

// ── Tier badge ───────────────────────────────────────────────────────────────
export function TierBadge({ tier, size="md" }: { tier: VideoTier; size?: "sm"|"md"|"lg" }){
  const colors: Record<VideoTier,string> = { creator:"#818cf8", team:"#34d399", business:"#f59e0b", studio:"#ec4899", regulated:"#ef4444" };
  const label = TIER_POSITIONING[tier].label;
  const pad = size==="sm"?"2px 8px": size==="lg"?"6px 14px":"4px 10px";
  const fs = size==="sm"?11: size==="lg"?14:12;
  return <span style={{ background:`${colors[tier]}18`, color:colors[tier], border:`1px solid ${colors[tier]}40`, padding:pad, borderRadius:999, fontWeight:800, fontSize:fs, letterSpacing:0.2 }}>{label}</span>;
}

// ── Capability matrix ────────────────────────────────────────────────────────
export function CapabilityMatrixTable({ highlightTier }: { highlightTier?: VideoTier }){
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
        <thead>
          <tr style={{ background:"var(--nv-color-surface-2)", textAlign:"left" }}>
            <th style={{ padding:"10px 12px", border:"1px solid var(--nv-color-border)", minWidth:240 }}>Capability</th>
            {VIDEO_TIERS.map(t=>(
              <th key={t} style={{ padding:"10px 12px", border:"1px solid var(--nv-color-border)", background: highlightTier===t?"#f59e0b12":"transparent", minWidth:120 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}><TierBadge tier={t} size="sm" />{highlightTier===t && <Badge tone="primary">current</Badge>}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CAPABILITY_MATRIX.map(row=>(
            <tr key={row.capability}>
              <td style={{ padding:"8px 12px", border:"1px solid var(--nv-color-border)", fontWeight:700, background:"var(--nv-color-surface)" }}>{row.capability}</td>
              {(["creator","team","business","studio","regulated"] as VideoTier[]).map(t=>{
                const v = ((row as unknown as Record<string,string>)[t] ?? "") as string;
                const isYes = v==="Yes"||v==="Advanced"||v==="Core"||v==="Professional"||v==="Governed"||v==="Priority";
                const isNo = v==="No" || v==="No ";
                const isOptional = v==="Optional" || (v && v.includes("Optional"));
                const color = isYes?"#065f46": isNo?"#991b1b": isOptional?"#92400e":"#374151";
                const bg = isYes?"#d1fae5": isNo?"#fee2e2": isOptional?"#fef3c7":"#f3f4f6";
                return <td key={t} style={{ padding:"8px 12px", border:"1px solid var(--nv-color-border)", background: highlightTier===t? (isYes?"#d1fae5cc":isNo?"#fee2e2cc":bg): bg, color, fontWeight:600, textAlign:"center", fontSize:12 }}>{v}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", marginTop:6 }}>Never silently flatten a professional project — unsupported features must be reported explicitly (imported with approximation / not supported / requires flattening / manual conform).</div>
    </div>
  );
}

// ── Envelope card ────────────────────────────────────────────────────────────
export function EntitlementEnvelopeCard({ envelope, usage }: { envelope: EntitlementEnvelope; usage?: UsageState }){
  const def = TIER_CATALOG[envelope.plan];
  return (
    <div className="nv-card" style={{ padding:16, display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
        <TierBadge tier={envelope.plan} size="lg" />
        <div style={{ flex:1, minWidth:220 }}>
          <div style={{ fontWeight:900, fontSize:16 }}>{def.positioning.label} — {def.positioning.tagline}</div>
          <div style={{ fontSize:12, color:"var(--nv-color-text-muted)" }}>{def.positioning.description}</div>
          <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", marginTop:2 }}>Policy {envelope.policy_version} • Billing {envelope.billing_period} • Updated {new Date(envelope.updated_at).toLocaleString()}</div>
        </div>
        <Badge tone="primary">{Object.keys(envelope.entitlements).length} entitlements</Badge>
        <Badge tone="neutral">{envelope.addOns?.length ?? 0} add-ons</Badge>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px,1fr))", gap:10, fontSize:12 }}>
        <Metric k="Members" v={`${usage?.members ?? 0} / ${envelope.limits.members}`} pct={usage? (usage.members/envelope.limits.members*100):0} />
        <Metric k="Storage" v={`${usage?.storage_gb ?? 0} / ${envelope.limits.storage_gb} GB`} pct={usage? (usage.storage_gb/envelope.limits.storage_gb*100):0} />
        <Metric k="Processed hrs (mo)" v={`${usage?.processed_hours ?? 0} / ${envelope.limits.monthly_processed_hours} hrs`} pct={usage? (usage.processed_hours/envelope.limits.monthly_processed_hours*100):0} />
        <Metric k="AI credits" v={`${usage?.ai_credits_used ?? 0} / ${envelope.limits.ai_credits}`} pct={usage? (usage.ai_credits_used/envelope.limits.ai_credits*100):0} />
        <Metric k="Concurrent renders" v={`${usage?.concurrent_renders ?? 0} / ${envelope.limits.concurrent_renders}`} pct={usage? (usage.concurrent_renders/envelope.limits.concurrent_renders*100):0} />
        <Metric k="Retention" v={`${envelope.limits.retention_days} days`} pct={0} />
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", fontSize:11 }}>
        <span style={{ background:"var(--nv-color-surface-2)", padding:"4px 8px", borderRadius:999 }}>Region: {(envelope.overrides.region as string) ?? "us-east-1"}</span>
        <span style={{ background:"var(--nv-color-surface-2)", padding:"4px 8px", borderRadius:999 }}>Data residency: {(envelope.overrides.data_residency as string) ?? def.governance.dataResidency}</span>
        <span style={{ background:"var(--nv-color-surface-2)", padding:"4px 8px", borderRadius:999 }}>Support: {(envelope.overrides.support_level as string) ?? def.support.level}</span>
        {(envelope as unknown as { deployment?: string }).deployment && <span style={{ background:"#fee2e2", padding:"4px 8px", borderRadius:999 }}>{(envelope as unknown as { deployment: string }).deployment}</span>}
      </div>
      {envelope.addOns && envelope.addOns.length>0 && (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {envelope.addOns.map(a=> <Badge key={a} tone="primary">{ADDON_CATALOG[a as AddOnId]?.label ?? a}</Badge>)}
        </div>
      )}
      <details style={{ fontSize:12 }}>
        <summary style={{ cursor:"pointer", color:"var(--nv-color-primary)", fontWeight:700 }}>Raw entitlements JSON (audit-pinned)</summary>
        <pre style={{ background:"#0f0f12", color:"#e5e7eb", padding:12, borderRadius:8, overflow:"auto", fontSize:11, marginTop:8 }}>{JSON.stringify(envelope, null, 2)}</pre>
      </details>
    </div>
  );
}

function Metric({ k, v, pct }: { k: string; v: string; pct:number }){
  const color = pct>=90?"#ef4444": pct>=75?"#f59e0b": pct>=50?"#eab308":"#10b981";
  return (
    <div style={{ background:"var(--nv-color-surface)", border:"1px solid var(--nv-color-border)", borderRadius:8, padding:10 }}>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:700 }}>{k}</div>
      <div style={{ fontWeight:800, fontSize:13, marginTop:2 }}>{v}</div>
      <div style={{ height:6, background:"var(--nv-color-surface-2)", borderRadius:999, overflow:"hidden", marginTop:6 }}>
        <div style={{ height:"100%", width:`${Math.min(100, Math.max(4, pct))}%`, background:color, transition:"width 0.3s" }} />
      </div>
      <div style={{ fontSize:11, color:color, fontWeight:700, marginTop:2 }}>{pct? `${Math.round(pct)}%`: "—"}</div>
    </div>
  );
}

// ── Packaging dimensions explainer ───────────────────────────────────────────
export function PackagingDimensionsPanel({ tier }: { tier: VideoTier }){
  const def = TIER_CATALOG[tier];
  const dims = [
    { id:"Capability", desc:"Access to editing, AI, review, live, RAW, interchange, automation, integrations", items: Object.entries(def.entitlements).filter(([,v])=> v===true).slice(0, 10).map(([k])=>k) },
    { id:"Usage", desc:"Processed hours, render minutes, AI inference, storage, CDN, concurrent jobs, live streams, users/guests", items: [`${def.limits.storage_gb} GB storage`, `${def.limits.monthly_processed_hours} hrs processed/mo`, `${def.limits.ai_credits} AI credits`, `${def.limits.concurrent_renders} concurrent renders`, `${def.limits.members} members / guests pooled`] },
    { id:"Governance", desc:"SSO/SCIM, audit, retention, legal hold, residency, approvals, compliance", items: [`SSO: ${String(def.governance.sso)}`, `SCIM: ${String(def.governance.scim)}`, `Audit: ${def.governance.audit}`, `Data residency: ${def.governance.dataResidency}`, `Legal hold: ${String(def.governance.legalHold)}`, `WORM: ${String(def.governance.worm)}`] },
    { id:"Deployment", desc:"Multi-tenant SaaS → Dedicated → Private Cloud → Customer VPC → On-prem → Air-gapped", items: Object.entries(def.deployment).filter(([,v])=> v===true || v==="optional" || v==="core").map(([k,v])=> `${k}: ${String(v)}`) },
    { id:"Support", desc:"Standard → Business-hours → Priority → Production → Dedicated", items: [`${def.support.level} • ${def.support.slaHours ?? ""}`, def.support.dedicatedCsm? "Dedicated CSM": "Shared support"] },
  ];
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px,1fr))", gap:12 }}>
      {dims.map(d=>(
        <div className="nv-card" key={d.id} style={{ padding:12 }}>
          <div style={{ fontWeight:900, fontSize:13, color:"var(--nv-color-primary)" }}>{d.id}</div>
          <div style={{ fontSize:12, color:"var(--nv-color-text-muted)", marginTop:2 }}>{d.desc}</div>
          <ul style={{ fontSize:12, margin:"8px 0 0", paddingLeft:18, display:"flex", flexDirection:"column", gap:2 }}>
            {d.items.map(it=> <li key={it}>{it}</li>)}
          </ul>
        </div>
      ))}
      <div className="nv-card" style={{ padding:12, background:"#f0f9ff", border:"1px solid #bae6fd" }}>
        <div style={{ fontWeight:800, fontSize:12 }}>Packaging Principle</div>
        <div style={{ fontSize:12, color:"var(--nv-color-text-muted)", marginTop:4 }}>N0VA separates the 5 dimensions so a customer is not forced into Studio merely because it needs more storage, or into Regulated merely because it needs longer retention.</div>
        <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", marginTop:6 }}>Example: Team can buy “extra shared storage” add-on without upgrading to Business. Business can buy “advanced retention” add-on without upgrading to Regulated.</div>
      </div>
    </div>
  );
}

// ── Add-ons marketplace ──────────────────────────────────────────────────────
export function AddOnMarketplace({ tier, active, onToggle }: { tier: VideoTier; active: AddOnId[]; onToggle: (id:AddOnId)=>void }){
  const addons = Object.values(ADDON_CATALOG).filter(a=> a.tier===tier);
  const cross = Object.values(ADDON_CATALOG).filter(a=> a.tier!==tier && ["creator_ai_credits","team_storage"].includes(a.id));
  const all = [...addons, ...cross];
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px,1fr))", gap:10 }}>
      {all.map(a=>{
        const enabled = active.includes(a.id);
        return (
          <div className="nv-card" key={a.id} style={{ padding:12, border: enabled?"2px solid var(--nv-color-primary)":"1px solid var(--nv-color-border)", background: enabled?"#eef2ff":"var(--nv-color-surface)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontWeight:800, fontSize:13 }}>{a.label}</span>
              <Badge tone={enabled?"primary":"neutral"}>{a.category}</Badge>
              {a.metered && <Badge tone="warning">metered</Badge>}
            </div>
            <div style={{ fontSize:12, color:"var(--nv-color-text-muted)", marginTop:4 }}>{a.description}</div>
            <div style={{ marginTop:8 }}>
              <Button size="sm" variant={enabled?"secondary":"primary"} onClick={()=> onToggle(a.id)}>{enabled?"✓ Active — Remove":"Add add-on"}</Button>
            </div>
          </div>
        );
      })}
      <div className="nv-card" style={{ padding:12, background:"#fefce8", border:"1px solid #fde68a" }}>
        <div style={{ fontWeight:800, fontSize:12 }}>Add-on Principle</div>
        <div style={{ fontSize:12, color:"var(--nv-color-text-muted)", marginTop:4 }}>Add-ons prevent excessive tier inflation — buy only the dimension you need.</div>
      </div>
    </div>
  );
}

// ── Upgrade / downgrade panel ───────────────────────────────────────────────
export function TierChangePanel({ from, to, evaluation, onConfirm }: {
  from: VideoTier; to: VideoTier; evaluation: { direction: string; allowed: boolean; requiresMigration: boolean; migrationPath?: string[]; warnings: string[]; dataPreservation: string[]; blockedReasons?: string[]; gracePeriodDays?: number; immediateCapabilities: string[] } | null;
  onConfirm?: (target: VideoTier)=>void;
}){
  const [target, setTarget] = useState<VideoTier>(to);
  const ev = evaluation;
  return (
    <div className="nv-card" style={{ padding:16, display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
        <TierBadge tier={from} /> <span>→</span> <TierBadge tier={target} />
        <select className="nv-input" value={target} onChange={e=> setTarget(e.target.value as VideoTier)} style={{ maxWidth:160 }}>
          {VIDEO_TIERS.map(t=> <option key={t} value={t}>{TIER_POSITIONING[t].label}</option>)}
        </select>
        {ev && <Badge tone={ev.allowed?"success":"danger"}>{ev.direction}{ev.requiresMigration?" • migration":" • immediate"}</Badge>}
      </div>
      {ev ? (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:12 }}>What changes quickly</div>
              <ul style={{ fontSize:12, margin:"6px 0 0", paddingLeft:18 }}>
                {ev.immediateCapabilities.map(c=> <li key={c}>{c}</li>)}
                <li>Seats, AI credits, render capacity, storage, integrations, support → immediate</li>
                {ev.requiresMigration && <li>Deployment changes via migration workflow: {(ev.migrationPath ?? []).join(" → ")}</li>}
              </ul>
            </div>
            <div>
              <div style={{ fontWeight:800, fontSize:12 }}>Warnings</div>
              <ul style={{ fontSize:12, margin:"6px 0 0", paddingLeft:18, color:"#92400e" }}>
                {ev.warnings.map((w,i)=> <li key={i}>{w}</li>)}
              </ul>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:8, padding:10 }}>
              <div style={{ fontWeight:700, fontSize:12, color:"#065f46" }}>Data preservation (never delete automatically)</div>
              <ul style={{ fontSize:12, margin:"6px 0 0", paddingLeft:18 }}>
                {ev.dataPreservation.map((d,i)=> <li key={i}>{d}</li>)}
              </ul>
              {ev.gracePeriodDays ? <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", marginTop:6 }}>Grace period: {ev.gracePeriodDays} days • over-limit resources read-only • export offered • admin remediation required</div> : null}
            </div>
            <div style={{ background: ev.blockedReasons? "#fef2f2":"#f8fafc", border:`1px solid ${ev.blockedReasons?"#fecaca":"var(--nv-color-border)"}`, borderRadius:8, padding:10 }}>
              <div style={{ fontWeight:700, fontSize:12, color: ev.blockedReasons?"#991b1b":"#475569" }}>{ev.blockedReasons? "Blocked — compliance review required":"Ready"}</div>
              {ev.blockedReasons? <ul style={{ fontSize:12, margin:"6px 0 0", paddingLeft:18, color:"#991b1b" }}>{ev.blockedReasons.map((b,i)=> <li key={i}>{b}</li>)}</ul>
                : <div style={{ fontSize:12, color:"var(--nv-color-text-muted)", marginTop:4 }}>Change can proceed. Upgrades apply quickly for metered dimensions; deployment changes queue migration.</div>}
            </div>
          </div>
          {onConfirm && <Button onClick={()=> onConfirm(target)} disabled={ev.blockedReasons && ev.blockedReasons.length>0 && target!==from}>{target===from?"Select target tier":`Confirm ${ev.direction} → ${TIER_POSITIONING[target].label}`}</Button>}
          <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Examples — Business→Team: preserve audit history but restrict new audit exports • Studio→Business: preserve RAW/projects but restrict new RAW ingest • Regulated→Business: do NOT auto-remove legal holds/retention/encryption — explicit compliance review required.</div>
        </>
      ) : (
        <div style={{ fontSize:12, color:"var(--nv-color-text-faint)" }}>Select target tier to evaluate change.</div>
      )}
    </div>
  );
}

// ── Check history table ──────────────────────────────────────────────────────
export function EntitlementAuditLedger({ records }: { records: EntitlementCheckRecord[] }){
  if(!records.length) return <div style={{ fontSize:12, color:"var(--nv-color-text-faint)", padding:12 }}>No entitlement checks yet — every check records tenant / feature / operation / decision / policy_version / usage_state / actor / timestamp.</div>;
  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
        <thead>
          <tr style={{ background:"var(--nv-color-surface-2)", textAlign:"left" }}>
            <th style={{ padding:"8px 10px", border:"1px solid var(--nv-color-border)" }}>Time</th>
            <th style={{ padding:"8px 10px", border:"1px solid var(--nv-color-border)" }}>Feature</th>
            <th style={{ padding:"8px 10px", border:"1px solid var(--nv-color-border)" }}>Operation</th>
            <th style={{ padding:"8px 10px", border:"1px solid var(--nv-color-border)" }}>Decision</th>
            <th style={{ padding:"8px 10px", border:"1px solid var(--nv-color-border)" }}>Tier</th>
            <th style={{ padding:"8px 10px", border:"1px solid var(--nv-color-border)" }}>Actor</th>
            <th style={{ padding:"8px 10px", border:"1px solid var(--nv-color-border)" }}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r=>(
            <tr key={r.timestamp+r.feature}>
              <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)", whiteSpace:"nowrap", fontVariantNumeric:"tabular-nums" }}>{new Date(r.timestamp).toLocaleTimeString()}</td>
              <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)", fontWeight:700 }}>{r.feature}</td>
              <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{r.requested_operation}</td>
              <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}><Badge tone={r.decision==="allow"?"success": r.decision==="deny"||r.decision==="overage_block"?"danger":"warning"}>{r.decision}</Badge></td>
              <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}><TierBadge tier={r.tier} size="sm" /></td>
              <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)", fontSize:11 }}>{r.actor}</td>
              <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)", fontSize:11, color:"var(--nv-color-text-muted)" }}>{r.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Commercial metrics ───────────────────────────────────────────────────────
export function CommercialMetricsPanel({ tier }: { tier: VideoTier }){
  const indicators = getCommercialIndicator(tier);
  const metrics = COMMERCIAL_METRICS.filter(m=> m.tiers.includes(tier) || m.tiers.includes(tier));
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px,1fr))", gap:10 }}>
        {metrics.slice(0,8).map(m=>(
          <div className="nv-card" key={m.key} style={{ padding:12 }}>
            <div style={{ fontWeight:800, fontSize:12 }}>{m.label}</div>
            <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>{m.key}</div>
            <div style={{ fontSize:12, color:"var(--nv-color-text-muted)", marginTop:4 }}>{m.description}</div>
          </div>
        ))}
      </div>
      <div className="nv-card" style={{ padding:12, background:"#f8fafc", border:"1px solid var(--nv-color-border)" }}>
        <div style={{ fontWeight:800, fontSize:12 }}>Tier health indicators — a tier is successful only if it produces sustainable margins while meeting its SLA.</div>
        <ul style={{ fontSize:12, margin:"6px 0 0", paddingLeft:18 }}>
          {indicators.map(i=> <li key={i}>{i}</li>)}
          <li>Revenue per tenant / per user / per processed hour, gross margin, AI/render/storage/CDN/support cost, SLA-credit exposure, expansion/churn/upgrade rates, feature utilization</li>
        </ul>
      </div>
    </div>
  );
}

// ── Main entitlement control center ──────────────────────────────────────────
export function EntitlementControlCenter({ tenantId, initialTier, apiBase="/api/videos/entitlement" }: { tenantId?: string; initialTier?: VideoTier; apiBase?: string }){
  const [tier, setTier] = useState<VideoTier>(initialTier ?? "business");
  const [envelope, setEnvelope] = useState<EntitlementEnvelope | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [history, setHistory] = useState<EntitlementCheckRecord[]>([]);
  const [activeAddOns, setActiveAddOns] = useState<AddOnId[]>([]);
  const [changeTo, setChangeTo] = useState<VideoTier>("studio");
  const [evaluation, setEvaluation] = useState<TierChangeEvaluation | null>(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const effectiveTenant = tenantId ?? "tenant_acme";

  const refresh = async()=>{
    setLoading(true);
    try{
      const r = await fetch(`${apiBase}?tenant_id=${effectiveTenant}`);
      if(r.ok){ const j=await r.json(); setEnvelope(j.envelope); setUsage(j.usage); setHistory(j.history ?? []); setActiveAddOns(j.envelope?.addOns ?? []); setTier(j.envelope?.plan ?? "creator"); }
      else {
        // local fallback mock
        const { getEntitlement, getUsage, getCheckHistory } = await import("./entitlement-engine");
        setEnvelope(getEntitlement(effectiveTenant));
        setUsage(getUsage(effectiveTenant));
        setHistory(getCheckHistory(effectiveTenant, 20));
      }
    } catch{
      const { getEntitlement, getUsage, getCheckHistory } = await import("./entitlement-engine");
      setEnvelope(getEntitlement(effectiveTenant));
      setUsage(getUsage(effectiveTenant));
      setHistory(getCheckHistory(effectiveTenant, 20));
    } finally{ setLoading(false); }
  };
  useEffect(()=>{ void refresh(); }, [effectiveTenant, tier]);

  const mutateTier = async(next: VideoTier)=>{
    try{
      const r=await fetch(apiBase, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ tenant_id: effectiveTenant, plan: next })});
      if(!r.ok) throw new Error();
      await refresh();
    } catch{
      const { setTier: st } = await import("./entitlement-engine");
      st(effectiveTenant, next);
      await refresh();
    }
  };

  const toggleAddOn = async(id: AddOnId)=>{
    const next = activeAddOns.includes(id) ? activeAddOns.filter(a=>a!==id) : [...activeAddOns, id];
    setActiveAddOns(next);
    try{
      await fetch(`${apiBase}/addon`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ tenant_id: effectiveTenant, addOnId: id, enabled: !activeAddOns.includes(id) })});
    } catch{
      const { applyAddOn, removeAddOn } = await import("./entitlement-engine");
      if(activeAddOns.includes(id)) removeAddOn(effectiveTenant, id); else applyAddOn(effectiveTenant, id);
    }
    await refresh();
  };

  const evaluateChange = async(to: VideoTier)=>{
    setChangeTo(to);
    try{
      const r=await fetch(`${apiBase}/evaluate`, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ tenant_id: effectiveTenant, from: tier, to })});
      if(r.ok){ const j=await r.json(); setEvaluation(j); return; }
    } catch{}
    const { evaluateTierChange } = await import("./entitlement-engine");
    setEvaluation(evaluateTierChange(tier, to) as unknown as TierChangeEvaluation);
  };
  useEffect(()=>{ void evaluateChange(changeTo); }, [tier]);

  const tabs = [
    { id:"overview", label:"Overview" },
    { id:"matrix", label:"Capability Matrix" },
    { id:"packaging", label:"5 Dimensions" },
    { id:"addons", label:"Add-ons" },
    { id:"change", label:"Upgrade / Downgrade" },
    { id:"ledger", label:"Ledger" },
    { id:"commercial", label:"Commercial Metrics" },
    { id:"deployment", label:"Deployment" },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", background:"linear-gradient(135deg,#0f0f12 0%,#1a1625 50%,#1e1a3a 100%)", color:"#fff", padding:16, borderRadius:12, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ width:44, height:44, borderRadius:10, background:"linear-gradient(135deg,#818cf8,#38bdf8)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900 }}>◉</div>
        <div style={{ flex:1, minWidth:260 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ fontWeight:900, fontSize:16 }}>N0VA VIDEOS — Entitlements</span>
            <TierBadge tier={tier} />
            <Badge tone="neutral">{envelope?.policy_version ?? "—"}</Badge>
            <span style={{ fontSize:11, opacity:0.7, border:"1px solid rgba(255,255,255,0.15)", padding:"2px 8px", borderRadius:999}}>{effectiveTenant}</span>
          </div>
          <div style={{ fontSize:12, opacity:0.8, marginTop:4 }}>Capability-based packaging — every tier includes reliable core media; higher tiers add collaboration, governance, production depth, deployment control, compliance, dedicated economics.</div>
        </div>
        <select className="nv-input" value={tier} onChange={e=> { const nt=e.target.value as VideoTier; setTier(nt); void mutateTier(nt); }} style={{ maxWidth:160, background:"#fff", color:"#111" }}>
          {VIDEO_TIERS.map(t=> <option key={t} value={t}>{TIER_POSITIONING[t].label}</option>)}
        </select>
        <Button size="sm" variant="secondary" onClick={()=> void refresh()}>{loading?"Loading…":"↻ Refresh"}</Button>
      </div>

      <Tabs tabs={tabs as unknown as { id:string; label:string }[]} active={tab} onChange={setTab} />

      {tab==="overview" && envelope && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <EntitlementEnvelopeCard envelope={envelope} usage={usage ?? undefined} />
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px,1fr))", gap:12 }}>
            <div className="nv-card" style={{ padding:12 }}>
              <div style={{ fontWeight:800, fontSize:12 }}>Governance</div>
              <div style={{ fontSize:12, color:"var(--nv-color-text-muted)", marginTop:4 }}>Central policy, classification, retention, approvals, AI usage, download/external-sharing, regional access, SIEM forwarding</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8, fontSize:11 }}>
                <Badge tone={TIER_CATALOG[tier].governance.sso? "primary":"neutral"}>SSO: {String(TIER_CATALOG[tier].governance.sso)}</Badge>
                <Badge tone={TIER_CATALOG[tier].governance.scim? "primary":"neutral"}>SCIM</Badge>
                <Badge tone="neutral">{TIER_CATALOG[tier].governance.audit}</Badge>
                <Badge tone="neutral">{TIER_CATALOG[tier].governance.dataResidency}</Badge>
              </div>
            </div>
            <div className="nv-card" style={{ padding:12 }}>
              <div style={{ fontWeight:800, fontSize:12 }}>Integrations & Workflow</div>
              <div style={{ fontSize:12, color:"var(--nv-color-text-muted)", marginTop:4 }}>
                {tier==="business"?"CRM/CMS/DAM/PM/chat/calendar/MA/analytics + OAuth/service accounts/webhooks/event streams/bidirectional sync": tier==="studio"?"Media ecosystem + interchange (EDL/AAF/XML/OTIO) + broadcast delivery": tier==="regulated"?"Private & controlled — allowlist, no-training, private/regional inference, human review, model pinning":"Basic → Standard → Enterprise → Media → Private"}
              </div>
            </div>
            <div className="nv-card" style={{ padding:12, background:"#f0f9ff", border:"1px solid #bae6fd" }}>
              <div style={{ fontWeight:800, fontSize:12 }}>Rollout</div>
              <div style={{ fontSize:12, color:"var(--nv-color-text-muted)", marginTop:4 }}>Baseline: Creator → Team → Business (collab + governance + metering). Then Studio (RAW/interchange/render/live/color). Then Regulated (private deploy + CMK + legal hold + WORM + evidence + residency + drills).</div>
            </div>
          </div>
        </div>
      )}

      {tab==="matrix" && <CapabilityMatrixTable highlightTier={tier} />}

      {tab==="packaging" && <PackagingDimensionsPanel tier={tier} />}

      {tab==="addons" && (
        <>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <TierBadge tier={tier} />
            <span style={{ fontSize:12, color:"var(--nv-color-text-muted)" }}>Prevent excessive tier inflation — buy only what you need. Add-ons are metered where appropriate and preserve entitlement auditability.</span>
          </div>
          <AddOnMarketplace tier={tier} active={activeAddOns} onToggle={toggleAddOn} />
        </>
      )}

      {tab==="change" && (
        <TierChangePanel from={tier} to={changeTo} evaluation={evaluation as unknown as { direction:string; allowed:boolean; requiresMigration:boolean; migrationPath?:string[]; warnings:string[]; dataPreservation:string[]; blockedReasons?:string[]; gracePeriodDays?:number; immediateCapabilities:string[]}} onConfirm={async(to)=>{ setTier(to); await mutateTier(to); await evaluateChange(to); }} />
      )}

      {tab==="ledger" && <EntitlementAuditLedger records={history} />}

      {tab==="commercial" && <CommercialMetricsPanel tier={tier} />}

      {tab==="deployment" && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div className="nv-card" style={{ padding:16 }}>
              <div style={{ fontWeight:900 }}>Deployment ladder</div>
              <ol style={{ fontSize:12, margin:"8px 0 0", paddingLeft:18 }}>
                <li>Multi-tenant SaaS (default)</li>
                <li>Dedicated tenant</li>
                <li>Customer VPC</li>
                <li>Private cloud</li>
                <li>On-premises</li>
                <li>Air-gapped (Regulated)</li>
                <li>Hybrid variants</li>
              </ol>
              <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", marginTop:6 }}>Private/air-gapped may sacrifice some global features for isolation & control. Availability depends on deployment model.</div>
            </div>
            <div className="nv-card" style={{ padding:16 }}>
              <div style={{ fontWeight:900 }}>Regulated workflow (evidence-grade)</div>
              <div style={{ fontSize:12, color:"var(--nv-color-text-muted)", marginTop:4 }}>
                Ingest → Classify → Validate consent/authorization → Apply retention & legal rules → Process with approved models → Record provenance → Human review where configured → Export with evidence manifest → Preserve audit & chain of custody
              </div>
              <div style={{ fontSize:11, color:"var(--nv-color-text-faint)", marginTop:6 }}>Legal hold must override ordinary deletion and lifecycle migration unless org explicitly permits compliant migration.</div>
            </div>
          </div>
          <div className="nv-card" style={{ padding:12, background:"#f8fafc" }}>
            <div style={{ fontWeight:800, fontSize:12 }}>Regulated AI controls</div>
            <div style={{ fontSize:12, color:"var(--nv-color-text-muted)", marginTop:4 }}>AI allowlists • no-training guarantees • private/regional inference • prompt/output retention • human review • confidence thresholds • model version pinning • explainability • biometric/voice & likeness consent • automated decision restrictions • Disabled / Human approval required / Approved-model-only / Private / Regional / Audit-every-result</div>
          </div>
          <pre style={{ background:"#0f0f12", color:"#e5e7eb", padding:12, borderRadius:8, overflow:"auto", fontSize:11 }}>{JSON.stringify({ tenant_id: effectiveTenant, plan: tier, limits: TIER_CATALOG[tier].limits, deployment: TIER_CATALOG[tier].deployment, overrides: envelope?.overrides ?? {} }, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
