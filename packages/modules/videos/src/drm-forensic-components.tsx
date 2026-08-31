"use client";
import { useState } from "react";
import { Badge, Button } from "@n0va/ui";
export function DrmForensicPanel({ tenantId="tenant_acme", assetId="asset_001" }: { tenantId?: string; assetId?: string }){
  const [lic, setLic] = useState<unknown>(null);
  const [lease, setLease] = useState<unknown>(null);
  const [trace, setTrace] = useState<unknown>(null);
  const issue = async()=>{
    const { issueDrmLicense, issuePlaybackLease } = await import("./drm-forensic-engine");
    const l=issueDrmLicense({ tenant_id: tenantId, asset_id: assetId!, systems:["widevine","fairplay"] });
    setLic(l);
    const ls=issuePlaybackLease({ tenant_id: tenantId, asset_id: assetId!, user_id:"user_demo", drm_license_id: l.license_id, expires_at: new Date(Date.now()+7200*1000).toISOString() });
    setLease(ls);
  };
  const doTrace = async()=>{
    const { traceLeak, getWatermark } = await import("./drm-forensic-engine");
    const ls=lease as unknown as { watermark_id: string };
    if(!ls?.watermark_id) return;
    const wm=getWatermark(ls.watermark_id);
    const t=traceLeak(`leaked_hash_${Date.now()}`, wm?.content_hash ?? "");
    setTrace(t);
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", gap:8 }}><Button size="sm" onClick={issue}>Issue DRM + Forensic Watermark + Lease</Button><Button size="sm" variant="secondary" onClick={doTrace}>Trace Leak (forensic payload → tenant/user/session)</Button></div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
        <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800, fontSize:12 }}>DRM License — C2PA bound</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(lic ?? { note:"No license" }, null, 2)}</pre></div>
        <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800, fontSize:12 }}>Playback Lease — forensic watermark per lease</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(lease ?? { note:"No lease" }, null, 2)}</pre></div>
        <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800, fontSize:12 }}>Forensic Trace — every playback traceable</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(trace ?? { note:"No trace" }, null, 2)}</pre></div>
      </div>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>DRM Widevine/FairPlay/PlayReady, forensic watermark tenant+user+session, C2PA bound, every identity consent-aware, every playback forensic, revocation per lease.</div>
    </div>
  );
}
