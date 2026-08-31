"use client";
import { useState } from "react";
import { Badge, Button } from "@n0va/ui";
export function VolumetricPanel({ tenantId="tenant_acme" }: { tenantId?: string }){
  const [asset, setAsset] = useState<unknown>(null);
  const [session, setSession] = useState<unknown>(null);
  const create = async()=>{
    const { createVolumetricAsset, startImmersiveSession } = await import("./volumetric-engine");
    const a=createVolumetricAsset({ tenant_id: tenantId, format:"gaussian_splat", bytes: 2_500_000_000, provenance:{ actor:"user_demo", policy_version:"volumetric-v1", explainable:true } });
    setAsset(a);
    const s=startImmersiveSession({ tenant_id: tenantId, asset_id: a.asset_id, format:"gaussian_splat", playback:"headset", policy_decision:"allow" });
    setSession(s);
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", gap:8 }}><Button size="sm" onClick={create}>Create Volumetric (gaussian_splat) + Immersive Session (headset, DRM consent-aware)</Button></div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800, fontSize:12 }}>Volumetric Asset — searchable, policy-validated</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(asset ?? { note:"No asset" }, null, 2)}</pre></div>
        <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800, fontSize:12 }}>Immersive Session — holographic 8K/VR180</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(session ?? { note:"No session" }, null, 2)}</pre></div>
      </div>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Volumetric: neRF/gaussian_splat/point_cloud/mesh/hologram/VR180, spatial_hash, every asset searchable, every playback policy-validated, consent-aware, DRM + forensic watermark.</div>
    </div>
  );
}
