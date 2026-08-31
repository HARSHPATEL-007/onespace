import type { CampaignAsset, CampaignPerformance, CampaignSyncState } from "./campaign-intelligence-types";
function uid(p:string){ return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso(){ return new Date().toISOString(); }
const campaigns = new Map<string, CampaignSyncState>();

export function createCampaignSync(input: Omit<CampaignSyncState,"last_sync_at">): CampaignSyncState {
  const c: CampaignSyncState = { ...input, last_sync_at: nowIso() };
  campaigns.set(c.campaign_id, c); return c;
}
export function getCampaign(campaign_id:string){ return campaigns.get(campaign_id) ?? null; }
export function listCampaigns(tenant_id?:string){ const arr=[...campaigns.values()]; return tenant_id? arr.filter(c=> c.tenant_id===tenant_id): arr; }
export function addCampaignAsset(campaign_id:string, asset: CampaignAsset){
  const c=campaigns.get(campaign_id); if(!c) throw new Error("Campaign not found");
  c.assets.push(asset); c.last_sync_at=nowIso(); return c;
}
export function recordPerformance(perf: CampaignPerformance){
  const c=campaigns.get(perf.campaign_id); if(!c) throw new Error("Campaign not found");
  c.performance.push(perf); c.last_sync_at=nowIso(); return perf;
}
export function getCrossPlatformInsights(tenant_id:string){
  const camps=listCampaigns(tenant_id);
  const byPlatform: Record<string, number>={};
  for(const cp of camps){ for(const p of cp.performance){ byPlatform[p.platform]=(byPlatform[p.platform]??0)+ (p.metrics["views"]??0); } }
  return { campaigns: camps.length, byPlatform, explainable: true, synced: camps.filter(c=> c.last_sync_at).length };
}
export function clearForTests(){ campaigns.clear(); }
