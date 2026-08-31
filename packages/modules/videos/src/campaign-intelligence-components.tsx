"use client";
import { useState } from "react";
import { Badge, Button } from "@n0va/ui";
export function CampaignIntelligencePanel({ tenantId="tenant_acme" }: { tenantId?: string }){
  const [campaign, setCampaign] = useState<unknown>(null);
  const create = async()=>{
    const { createCampaignSync, recordPerformance, getCrossPlatformInsights } = await import("./campaign-intelligence-engine");
    const cid=`camp_${Date.now()}`;
    const c=createCampaignSync({ campaign_id:cid, tenant_id: tenantId, linked_workspace_task:`task_${Date.now()}`, linked_calendar_event:`cal_${Date.now()}`, assets:[{ campaign_id:cid, tenant_id: tenantId, asset_id:"asset_001", platform:"youtube", export_preset:"youtube_4k", lineage:{ provenance_chain:["asset_001"], policy_version:"campaign-v1" } }], performance:[] });
    recordPerformance({ campaign_id: c.campaign_id, platform:"youtube", asset_id:"asset_001", metrics:{ views: 12500, watch_time: 89000, ctr:0.042, cvr:0.012, cpm:12, roas:3.2 }, explainable:{ top_creative_factor:"thumbnail", model_version:"camp-v3", confidence:0.81 }, synced_at: new Date().toISOString() });
    recordPerformance({ campaign_id: c.campaign_id, platform:"tiktok", asset_id:"asset_001", metrics:{ views: 34000, watch_time: 45000, ctr:0.067, cvr:0.02, cpm:8, roas:2.8 }, explainable:{ top_creative_factor:"hook_3s", model_version:"camp-v3", confidence:0.79 }, synced_at: new Date().toISOString() });
    const insights=getCrossPlatformInsights(tenantId);
    setCampaign({ campaign: c, insights });
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"flex", gap:8 }}><Button size="sm" onClick={create}>Create Cross-Platform Campaign (YouTube + TikTok, synced to workspace)</Button></div>
      <pre style={{ background:"#0f0f12", color:"#e5e7eb", padding:12, borderRadius:8, overflow:"auto", fontSize:11 }}>{JSON.stringify(campaign ?? { note:"No campaign — campaign intelligence syncs workspace tasks/calendar, assets variants per platform, cross-platform views/ctr explainable" }, null, 2)}</pre>
      <div style={{ fontSize:11, color:"var(--nv-color-text-faint)" }}>Campaign intelligence: every campaign synchronized to workspace, every insight explainable, cross-platform performance by creative factor, policy_version lineage, rights manifest per variant.</div>
    </div>
  );
}
