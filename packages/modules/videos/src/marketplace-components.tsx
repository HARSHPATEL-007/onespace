"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Tabs } from "@n0va/ui";
import type { MarketplaceItemRecord, MarketplaceItemType, MarketplaceSearchQuery, SecurityBadge, ProvenanceState } from "./marketplace-types";

// ── Trust badge ──────────────────────────────────────────────────────────────
function SecurityBadgeEl({ badge }: { badge?: SecurityBadge }){
  const tone = badge==="verified"? "success" : badge==="scanned"? "primary" : badge==="blocked"||badge==="revoked"? "danger" : "warning";
  return <Badge tone={tone as never}>{badge ?? "review_required"}</Badge>;
}
function ProvenanceBadge({ state }: { state?: ProvenanceState }){
  const tone = state==="n0va_certified"? "success" : state==="independently_audited"? "primary" : state==="publisher_declared"? "warning" : "neutral";
  return <Badge tone={tone as never}>{state ?? "publisher_declared"}</Badge>;
}

// ── Item card ────────────────────────────────────────────────────────────────
function ItemCard({ item, onSelect }: { item: MarketplaceItemRecord; onSelect: (id:string)=>void }){
  return (
    <div className="nv-card" style={{ padding:12, display:"flex", flexDirection:"column", gap:8, border: item.security.badge==="blocked"||item.status==="blocked" ? "1px solid #fecaca":"1px solid var(--nv-color-border)", background: item.status==="revoked"? "#fef2f2":"var(--nv-color-surface)" }}>
      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
        <Badge tone="primary">{item.type}</Badge>
        <span style={{ fontWeight:900, fontSize:13 }}>{item.title}</span>
        <Badge tone="neutral">{item.version}</Badge>
        {item.publisher.verified && <Badge tone="success">Verified</Badge>}
        <SecurityBadgeEl badge={item.security.badge} />
        <ProvenanceBadge state={item.provenance.state} />
      </div>
      <div style={{ fontSize:12, color:"var(--nv-color-text-muted)" }}>{item.description?.slice(0,120)}</div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", fontSize:11 }}>
        <span style={{ background:"var(--nv-color-surface-2)", padding:"2px 6px", borderRadius:999 }}>License: {item.license.term ?? "perpetual"}</span>
        <span style={{ background:"var(--nv-color-surface-2)", padding:"2px 6px", borderRadius:999 }}>Commercial: {item.license.commercial_use? "Worldwide":"Restricted"}</span>
        <span style={{ background:"var(--nv-color-surface-2)", padding:"2px 6px", borderRadius:999 }}>Compat: {item.compatibility.n0va_min}–{item.compatibility.n0va_max ?? "5.x"}</span>
        <span style={{ background:"var(--nv-color-surface-2)", padding:"2px 6px", borderRadius:999 }}>N0VA {item.compatibility.platforms.join("/")}</span>
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", fontSize:11, color:"var(--nv-color-text-faint)" }}>
        <span>Price: {item.pricing.price===0? "Free": `$${item.pricing.price} ${item.pricing.currency} (${item.pricing.model})`}</span>
        <span>Publisher: {item.publisher.name} {item.publisher.certification? `• ${item.publisher.certification}`:""}</span>
        <span>Deps: {item.compatibility.required_dependencies?.length ?? 0}</span>
      </div>
      <div style={{ display:"flex", gap:6 }}>
        <Button size="sm" onClick={()=> onSelect(item.item_id)}>View → Install</Button>
        <Button size="sm" variant="secondary" onClick={()=> onSelect(item.item_id)}>Preview ({item.type==="music"||item.type==="sfx"?"sample audio":"watermarked"})</Button>
      </div>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>{buildUriDisplay(item)}</div>
    </div>
  );
}
function buildUriDisplay(item: MarketplaceItemRecord){ return `n0va://marketplace/${item.type}/${item.slug}/${item.version}`; }

// ── Main marketplace panel ──────────────────────────────────────────────────
export function MarketplacePanel({ tenantId="tenant_acme", projectId="project_001", userId="user_demo", apiBase="/api/videos/marketplace" }: { tenantId?: string; projectId?: string; userId?: string; apiBase?: string }){
  const [q, setQ] = useState<MarketplaceSearchQuery>({ q:"", limit:20 });
  const [items, setItems] = useState<MarketplaceItemRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<MarketplaceItemRecord|null>(null);
  const [installed, setInstalled] = useState<unknown[]>([]);
  const [lockfile, setLockfile] = useState<unknown>(null);
  const [rights, setRights] = useState<unknown>(null);
  const [provenance, setProvenance] = useState<unknown>(null);
  const [tab, setTab] = useState("discover");
  const [scan, setScan] = useState<unknown>(null);
  const [compat, setCompat] = useState<unknown>(null);
  const [lic, setLic] = useState<unknown>(null);
  const [msg, setMsg] = useState<string|null>(null);

  const search = async()=>{
    try{
      const params = new URLSearchParams();
      if(q.q) params.set("q", q.q);
      if(q.category) params.set("category", q.category);
      if(q.license_type) params.set("license_type", q.license_type);
      if(q.security_status) params.set("security_status", q.security_status);
      if(q.publisher_verified!==undefined) params.set("publisher_verified", String(q.publisher_verified));
      if(q.limit) params.set("limit", String(q.limit));
      const r=await fetch(`${apiBase}/items?${params.toString()}`);
      if(r.ok){ const j=await r.json(); setItems(j.items ?? []); setTotal(j.total ?? 0); return; }
    }catch{}
    // fallback client engine
    try{
      const { searchCatalog, seedCatalog } = await import("./marketplace-engine");
      seedCatalog();
      const { searchCatalog: sc } = await import("./marketplace-engine");
      const res = sc(q);
      setItems(res.items); setTotal(res.total);
    }catch{}
  };
  useEffect(()=>{ void search(); }, []);

  const loadDetail = async(item_id:string)=>{
    try{
      const r=await fetch(`${apiBase}/items/${item_id}`);
      if(r.ok){ const j=await r.json(); setSelected(j.item ?? j); }
      else {
        const { getItem } = await import("./marketplace-engine");
        setSelected(getItem(item_id) ?? null);
      }
      // load scan/compat
      try{
        const sr=await fetch(`${apiBase}/items/${item_id}/security-scan`, { method:"POST" });
        if(sr.ok){ const sj=await sr.json(); setScan(sj); }
      }catch{}
      try{
        const cr=await fetch(`${apiBase}/items/${item_id}/validate-compatibility`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ n0va_version:"5.0.0" }) });
        if(cr.ok){ const cj=await cr.json(); setCompat(cj); }
      }catch{}
      try{
        const lr=await fetch(`${apiBase}/items/${item_id}/validate-license`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ tenant_id: tenantId, project_id: projectId, user_id: userId }) });
        if(lr.ok){ const lj=await lr.json(); setLic(lj); }
      }catch{}
    }catch{}
  };

  const doPurchase = async(item_id:string)=>{
    try{
      const r=await fetch(`${apiBase}/items/${item_id}/purchase`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ tenant_id: tenantId, project_id: projectId, user_id: userId }) });
      if(r.ok){ const j=await r.json(); setMsg(`Purchased — entitlement ${j.entitlement?.entitlement_id ?? j.license_id ?? "lic"} (order ${j.entitlement?.order_id ?? "order"})`); return; }
    }catch{}
    try{
      const { purchaseLicense } = await import("./marketplace-engine");
      const ent=purchaseLicense(item_id, tenantId, { project_id: projectId, user_id: userId });
      setMsg(`Purchased (local) — ${ent.entitlement_id}`);
    }catch(e){ setMsg(`Purchase failed: ${(e as Error).message}`); }
  };
  const doInstall = async(item_id:string)=>{
    try{
      const r=await fetch(`${apiBase}/items/${item_id}/install`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ tenant_id: tenantId, project_id: projectId, user_id: userId, n0va_version:"5.0.0" }) });
      const j=await r.json();
      if(r.ok){ setMsg(`Installed ${item_id}@${j.installation?.version ?? ""} — sandbox ${j.installation?.sandbox ? "isolated":"none"} • lockfile updated`); void refreshInstalled(); return; }
      setMsg(`Install blocked: ${j.error ?? j.reason ?? "license/compatibility/security"}`);
    }catch(e){
      try{
        const { installItem } = await import("./marketplace-engine");
        const inst=installItem(item_id, tenantId, { project_id: projectId, user_id: userId });
        setMsg(`Installed (local) ${inst.installation_id} sandbox=${inst.sandbox}`);
        void refreshInstalled();
      }catch(err){ setMsg(`Install failed: ${(err as Error).message}`); }
    }
  };
  const refreshInstalled = async()=>{
    try{
      const r=await fetch(`${apiBase}/installations?tenant_id=${tenantId}&project_id=${projectId}`);
      if(r.ok){ const j=await r.json(); setInstalled(j.installations ?? []); }
      else {
        const { listInstallations } = await import("./marketplace-engine");
        setInstalled(listInstallations({ project_id: projectId }));
      }
      const lr=await fetch(`${apiBase}/projects/${projectId}/marketplace-lock`);
      if(lr.ok){ const j=await lr.json(); setLockfile(j.lockfile ?? j); }
      else {
        const { getLockfile } = await import("./marketplace-engine");
        setLockfile(getLockfile(projectId));
      }
      const rr=await fetch(`${apiBase}/projects/${projectId}/rights-manifest`);
      if(rr.ok){ const j=await rr.json(); setRights(j.manifest ?? j); }
      const pr=await fetch(`${apiBase}/projects/${projectId}/provenance`);
      if(pr.ok){ const j=await pr.json(); setProvenance(j.provenance ?? j); }
    }catch{
      try{
        const { listInstallations, getLockfile } = await import("./marketplace-engine");
        setInstalled(listInstallations({ project_id: projectId }));
        setLockfile(getLockfile(projectId));
      }catch{}
    }
  };
  useEffect(()=>{ void refreshInstalled(); }, [projectId, tenantId]);

  const tabs = [
    { id:"discover", label:"Discover" },
    { id:"detail", label:"Detail & Trust" },
    { id:"installed", label:"Installed" },
    { id:"lockfile", label:"Lockfile" },
    { id:"rights", label:"Rights Manifest" },
    { id:"provenance", label:"Provenance" },
    { id:"governance", label:"Governance" },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", background:"linear-gradient(135deg,#0f0f12 0%,#1a1625 50%,#1e3a5f 100%)", color:"#fff", padding:16, borderRadius:12, border:"1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ width:44, height:44, borderRadius:10, background:"linear-gradient(135deg,#a78bfa,#38bdf8)", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900 }}>◈</div>
        <div style={{ flex:1, minWidth:260 }}>
          <div style={{ fontWeight:900, fontSize:16 }}>N0VA VIDEOS — Marketplace</div>
          <div style={{ fontSize:12, opacity:0.8 }}>Trusted composable media — Discover → Trust → Validate → License → Sandbox Install → Enforce → Meter → Update/Revoke/Audit</div>
          <div style={{ fontSize:11, opacity:0.6 }}>Every item: n0va://marketplace/{`{type}`}/{`{slug}`}/{`{version}` } • C2PA provenance • SPDX BOM • sandbox required for agents/motion graphics</div>
        </div>
        <Badge tone="primary">{total} published</Badge>
        <Badge tone="neutral">{tenantId}</Badge>
        <Badge tone="neutral">{projectId}</Badge>
      </div>

      <Tabs tabs={tabs as unknown as {id:string; label:string}[]} active={tab} onChange={setTab} />

      {msg && <div style={{ background:"#eff6ff", border:"1px solid #93c5fd", padding:"8px 12px", borderRadius:8, fontSize:12 }}>{msg} <Button size="sm" variant="ghost" onClick={()=> setMsg(null)}>Dismiss</Button></div>}

      {tab==="discover" && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            <input className="nv-input" placeholder="Search templates, LUTs, music, AI models, voice packs…" value={q.q ?? ""} onChange={e=> setQ(s=> ({...s, q:e.target.value}))} style={{ minWidth:260 }} />
            <select className="nv-input" value={q.category ?? ""} onChange={e=> setQ(s=> ({...s, category: e.target.value as MarketplaceItemType || undefined }))} style={{ maxWidth:160 }}>
              <option value="">All categories</option>
              <option value="template">Templates</option><option value="lut">LUTs</option><option value="motion_graphics">Motion Graphics</option><option value="music">Music</option><option value="ai_model">AI Models</option><option value="voice_pack">Voice Packs</option><option value="compliance_pack">Compliance</option><option value="agent_skill">Agent Skills</option><option value="export_preset">Export Presets</option><option value="brand_kit">Brand Kits</option><option value="industry_workflow">Workflows</option>
            </select>
            <select className="nv-input" value={q.security_status ?? ""} onChange={e=> setQ(s=> ({...s, security_status: e.target.value as SecurityBadge || undefined }))} style={{ maxWidth:140 }}>
              <option value="">Any security</option><option value="verified">Verified</option><option value="scanned">Scanned</option><option value="review_required">Review required</option><option value="blocked">Blocked</option>
            </select>
            <label style={{ display:"flex", gap:6, alignItems:"center", fontSize:12 }}><input type="checkbox" checked={!!q.publisher_verified} onChange={e=> setQ(s=> ({...s, publisher_verified: e.target.checked? true: undefined }))} /> Verified publisher</label>
            <label style={{ display:"flex", gap:6, alignItems:"center", fontSize:12 }}><input type="checkbox" checked={!!q.commercial_use} onChange={e=> setQ(s=> ({...s, commercial_use: e.target.checked? true: undefined }))} /> Commercial use</label>
            <Button size="sm" onClick={search}>Search</Button>
            <Button size="sm" variant="secondary" onClick={()=> { setQ({ limit:20 }); void search(); }}>Reset</Button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(340px,1fr))", gap:12 }}>
            {items.map(it=> <ItemCard key={it.item_id} item={it} onSelect={(id)=> { void loadDetail(id); setTab("detail"); }} />)}
            {!items.length && <div style={{ padding:24, color:"var(--nv-color-text-faint)", fontSize:12 }}>No items — try broadening filters. Popularity never replaces trust — unclear rights remain restricted.</div>}
          </div>
          <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Filters: Category • Industry • Style • Resolution • Color space • Language • License • Commercial • Paid-ads • Territory • Price • Compatibility • Security • Publisher verification • AI/human • Private inference • Data residency • Accessibility</div>
        </div>
      )}

      {tab==="detail" && (
        selected ? (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div className="nv-card" style={{ padding:16, display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                <Badge tone="primary">{selected.type}</Badge>
                <span style={{ fontWeight:900, fontSize:16 }}>{selected.title}</span>
                <Badge tone="neutral">{selected.version}</Badge>
                <SecurityBadgeEl badge={selected.security.badge} />
                <ProvenanceBadge state={selected.provenance.state} />
                <Badge tone={selected.publisher.verified?"success":"warning"}>{selected.publisher.name} • {selected.publisher.certification ?? "community"}</Badge>
              </div>
              <div style={{ fontSize:12, color:"var(--nv-color-text-muted)" }}>{selected.description}</div>
              <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>{buildUriDisplay(selected)} • sha256:{selected.content.sha256.slice(0,16)}… • {selected.content.size_bytes} bytes</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px,1fr))", gap:10, fontSize:12 }}>
                <div style={{ background:"var(--nv-color-surface-2)", padding:8, borderRadius:8 }}><div style={{ fontWeight:800 }}>License</div><div>Type: {selected.license.identifier}</div><div>Commercial: {String(selected.license.commercial_use)}</div><div>Territories: {(selected.license.territories ?? []).join(", ")}</div><div>Term: {selected.license.term}</div><div>Attribution: {String(selected.license.attribution_required)}</div></div>
                <div style={{ background:"var(--nv-color-surface-2)", padding:8, borderRadius:8 }}><div style={{ fontWeight:800 }}>Rights</div><div>Commercial video: {String(selected.rights.commercial_video)}</div><div>Paid ads: {String(selected.rights.paid_advertising)}</div><div>Broadcast: {String(selected.rights.broadcast)}</div><div>Training: {String(selected.rights.training)}</div><div>AI generation: {String(selected.rights.ai_generation)}</div></div>
                <div style={{ background:"var(--nv-color-surface-2)", padding:8, borderRadius:8 }}><div style={{ fontWeight:800 }}>Provenance</div><div>State: {selected.provenance.state}</div><div>Creator: {selected.provenance.creator}</div><div>C2PA: {selected.provenance.c2pa_manifest ?? "—"}</div><div>Signed: {selected.provenance.signed_manifest ?? "—"}</div>{selected.provenance.ai_bom && <div>AI BOM: {selected.provenance.ai_bom.model_id} • WER {selected.provenance.ai_bom.evaluation?.wer}</div>}</div>
                <div style={{ background:"var(--nv-color-surface-2)", padding:8, borderRadius:8 }}><div style={{ fontWeight:800 }}>Pricing</div><div>{selected.pricing.model} — ${selected.pricing.price} {selected.pricing.currency}</div><div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>{selected.pricing.usage_included ?? "Permission only"}</div><div>Scan: {selected.security.scan_status} • {selected.security.scan_version} • {selected.security.known_vulnerabilities} vulns {selected.security.sandbox_required? "• sandbox required":""}</div></div>
              </div>
              {selected.category_metadata && <pre style={{ background:"#0f0f12", color:"#e5e7eb", padding:10, borderRadius:8, overflow:"auto", fontSize:11 }}>{JSON.stringify(selected.category_metadata, null, 2)}</pre>}
              <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                <Button size="sm" onClick={()=> doPurchase(selected.item_id)}>Purchase — {selected.pricing.price===0? "Free": `$${selected.pricing.price}`}</Button>
                <Button size="sm" variant="secondary" onClick={()=> doInstall(selected.item_id)}>Secure Install → {projectId} (sandbox {selected.security.sandbox_required? "required":"optional"})</Button>
                <Button size="sm" variant="ghost" onClick={()=> { const p = (selected.type==="music"||selected.type==="sfx")? "sample audio" : "watermarked preview"; setMsg(`Preview — ${p} (non-commercial, watermarked, cannot create commercial output without license)`); }}>Preview (non-commercial)</Button>
              </div>
              {(!!compat || !!lic || !!scan) && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px,1fr))", gap:10, fontSize:12 }}>
                  {!!scan && <div style={{ background:"#f0fdf4", border:"1px solid #86efac", padding:8, borderRadius:8 }}><div style={{ fontWeight:800 }}>Security scan</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(scan, null, 2)}</pre></div>}
                  {!!compat && <div style={{ background: (compat as {level:string}).level==="compatible"? "#f0fdf4":"#fef2f2", border:"1px solid var(--nv-color-border)", padding:8, borderRadius:8 }}><div style={{ fontWeight:800 }}>Compatibility: {(compat as {level:string}).level}</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(compat, null, 2)}</pre></div>}
                  {!!lic && <div style={{ background: (lic as {valid:boolean}).valid? "#f0fdf4":"#fef2f2", border:"1px solid var(--nv-color-border)", padding:8, borderRadius:8 }}><div style={{ fontWeight:800 }}>License validation: {(lic as {valid:boolean}).valid? "allow":"block"}</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(lic, null, 2)}</pre></div>}
                </div>
              )}
              <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Trust summary: Commercial use {selected.rights.commercial_video? "Worldwide":"Restricted"} • License {selected.license.term} • Compat {selected.compatibility.n0va_min}–{selected.compatibility.n0va_max ?? "5.x"} • Security {selected.security.scan_status}, {selected.security.known_vulnerabilities} issues • Provenance {selected.provenance.state} • Deps {selected.compatibility.required_dependencies?.length ?? 0}</div>
              <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Do not present publisher-declared claims as independently verified. Generated-media provenance attaches model/voice/template/LUT/prompt/reference/human edits/agent actions/export preset/licenses to project/timeline/export.</div>
            </div>
          </div>
        ) : <div style={{ padding:24, color:"var(--nv-color-text-faint)", fontSize:12 }}>Select an item from Discover to see trust, provenance, licensing, and secure install.</div>
      )}

      {tab==="installed" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", gap:8 }}><Button size="sm" onClick={refreshInstalled}>Refresh</Button><Badge tone="neutral">{(installed as unknown[]).length} installations</Badge></div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr style={{ background:"var(--nv-color-surface-2)" }}><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Item</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Version</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Status</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Sandbox</th><th style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>Installed by</th></tr></thead>
              <tbody>
                {(installed as unknown as { installation_id:string; item_id:string; version:string; status:string; sandbox?:boolean; installed_by:string }[]).map(inst=>(
                  <tr key={inst.installation_id}>
                    <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{inst.item_id}</td>
                    <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{inst.version}</td>
                    <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}><Badge tone={inst.status==="installed"?"success": inst.status==="revoked"?"danger":"warning"}>{inst.status}</Badge></td>
                    <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{inst.sandbox? "isolated (tenant/resource/network/credential limits, timeout, budget cap, immutable logs)":"—"}</td>
                    <td style={{ padding:"6px 10px", border:"1px solid var(--nv-color-border)" }}>{inst.installed_by}</td>
                  </tr>
                ))}
                {!(installed as unknown[]).length && <tr><td colSpan={5} style={{ padding:12, textAlign:"center", color:"var(--nv-color-text-faint)" }}>No installations — install from Discover. Agent skills execute in isolated sandboxes with tenant/resource/network/credential isolation, timeout, budget cap.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==="lockfile" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", gap:8 }}><Button size="sm" onClick={refreshInstalled}>Refresh lockfile</Button><Badge tone="neutral">{projectId}</Badge></div>
          <pre style={{ background:"#0f0f12", color:"#e5e7eb", padding:12, borderRadius:8, overflow:"auto", fontSize:11 }}>{JSON.stringify(lockfile ?? { project_id: projectId, marketplace_lock:{}, entries:[] }, null, 2)}</pre>
          <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Production projects should not automatically receive breaking updates — lockfile pins versions. Update channels: stable / LTS / beta / canary / security-only. Auto-update patches • approve minor • pin major • require security review • block publisher updates.</div>
        </div>
      )}

      {tab==="rights" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ display:"flex", gap:8 }}><Button size="sm" onClick={refreshInstalled}>Load rights manifest</Button></div>
          <pre style={{ background:"#0f0f12", color:"#e5e7eb", padding:12, borderRadius:8, overflow:"auto", fontSize:11 }}>{JSON.stringify(rights ?? { note:"No rights manifest yet — install items that contribute to generated output; manifest attaches to project/timeline/export" }, null, 2)}</pre>
          <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Before export N0VA flags: license expired, territory mismatch, paid-ads not permitted, platform not covered, attribution missing, commercial unavailable. Download package: asset-rights-manifest.json + license-agreements/ + provenance-manifest.json + dependency-manifest.json + security-report.json + usage-history.json</div>
        </div>
      )}

      {tab==="provenance" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <pre style={{ background:"#0f0f12", color:"#e5e7eb", padding:12, borderRadius:8, overflow:"auto", fontSize:11 }}>{JSON.stringify(provenance ?? { note:"Provenance chain: created by → published by → derived from → dependencies → modified by → installed by → used in → exported into → revoked/superseded. States: publisher-declared → identity-verified → source-verified → signed → audited → n0va-certified. Do not present publisher-declared as verified." }, null, 2)}</pre>
          <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>C2PA manifests for media + generated outputs; SPDX BOM for machine-readable licensing. For AI: model/purpose/arch/weights hash/training declaration/limitations/evaluation/bias/safety/latency/compute/regions. Voice packs enforce consent/identity/territory/revocation — separate voice identity vs script vs generated audio vs distribution rights.</div>
        </div>
      )}

      {tab==="governance" && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px,1fr))", gap:10, fontSize:12 }}>
          <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800 }}>Publisher onboarding</div><div style={{ color:"var(--nv-color-text-muted)", marginTop:4 }}>Identity • Business • Tax • Rights attestation • Security agreement • Policy acceptance • Support/incident contacts. High-risk: license chain, training-data, voice consent, security assessment, model eval, compliance docs. Cert levels: community → publisher-verified → n0va-compatible → n0va-certified → enterprise → regulated (category-specific).</div></div>
          <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800 }}>Security & Revocation</div><div style={{ color:"var(--nv-color-text-muted)", marginTop:4 }}>Scan: malware, scripts, expressions, plugins, credentials, network, path traversal, bombs, media, deps, license. Static/dependency/sandbox/behavioral/network/resource/signature. Badge verified/scanned/restricted/review_required/revoked/blocked. Revocation triggers: malware, fraud, rights dispute, safety, cert expiry, regulatory — stops new installs, warns active, preserves outputs, records affected.</div></div>
          <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800 }}>Revenue</div><div style={{ color:"var(--nv-color-text-muted)", marginTop:4 }}>One-time • subscription • per-project/seat/usage • revenue share • enterprise • free+upgrade. Gross / payout / commission / refunds / tax / renewals / royalties. For AI/voice: inference minutes / generated seconds / premium / private inference → existing metering. Purchase includes permission vs usage distinction.</div></div>
          <div className="nv-card" style={{ padding:12, background:"#fefce8", border:"1px solid #fde68a" }}><div style={{ fontWeight:800 }}>Quality gate — before GA</div><div style={{ color:"var(--nv-color-text-muted)", marginTop:4 }}>Identity ✓ License ✓ Provenance ✓ Integrity ✓ Compatibility ✓ Security ✓ Rights ✓ Docs ✓ Commercial classification ✓ Sandbox test ✓ Revocation test. Principle: Discoverability → demand, Compatibility → usability, Licensing → trust, Provenance → accountability, Security → safety, Rights enforcement → commercial confidence.</div></div>
        </div>
      )}
    </div>
  );
}
