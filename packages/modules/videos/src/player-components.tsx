"use client";
import { useState } from "react";
import { Badge, Button } from "@n0va/ui";
export function PlayerPanel({ tenantId="tenant_acme", assetId="asset_001" }: { tenantId?: string; assetId?: string }){
  const [token, setToken] = useState<unknown>(null);
  const [player, setPlayer] = useState<unknown>(null);
  const create = async()=>{
    const { createPlayer, issuePlaybackToken } = await import("./player-engine");
    const p=createPlayer({ tenant_id: tenantId, asset_id: assetId!, mode:"vod", hls_url:`https://cdn.n0va.io/${assetId}/master.m3u8`, captions:[{ kind:"captions", lang:"en", url:`https://cdn.n0va.io/${assetId}/en.vtt`, label:"English" }], drm:{ widevine:true, fairplay:true, playready:true }, watermark:{ enabled:true, text:`${tenantId}` } });
    setPlayer(p);
    const t=issuePlaybackToken({ tenant_id: tenantId, asset_id: assetId!, scope:"view", expires_at: new Date(Date.now()+3600*1000).toISOString(), watermark_text: tenantId });
    setToken(t);
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", gap:8 }}><Button size="sm" onClick={create}>Create Player (policy-validated) + Playback Token (domain+watermark+expiry)</Button></div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800, fontSize:12 }}>Player Config — every export policy-validated</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(player ?? { note:"No player — create to see HLS/DASH, captions, DRM, watermark, allowed_domains" }, null, 2)}</pre></div>
        <div className="nv-card" style={{ padding:12 }}><div style={{ fontWeight:800, fontSize:12 }}>Playback Token — every playback auditable</div><pre style={{ fontSize:11, whiteSpace:"pre-wrap" }}>{JSON.stringify(token ?? { note:"No token — issue to see domain_lock, watermark_text, signature, expiry" }, null, 2)}</pre></div>
      </div>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Basic captions (VTT), exports (mp4/mov/hls/dash), player with signed token, domain lock, forensic watermark, rights manifest bound, C2PA.</div>
    </div>
  );
}
