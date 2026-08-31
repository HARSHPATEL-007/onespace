/**
 * N0VA VIDEOS — Campaign Intelligence Types (Cross-Platform)
 * Every campaign synchronized, every insight explainable.
 */
export type CampaignPlatform = "youtube" | "tiktok" | "instagram" | "linkedin" | "broadcast" | "ott" | "web";
export type CampaignMetric = "views" | "watch_time" | "ctr" | "cvr" | "cpm" | "roas";

export interface CampaignAsset {
  campaign_id: string;
  tenant_id: string;
  asset_id: string;
  variant_id?: string;
  platform: CampaignPlatform;
  export_preset: string;
  rights_manifest_id?: string;
  lineage: { provenance_chain: string[]; policy_version: string };
}

export interface CampaignPerformance {
  campaign_id: string;
  platform: CampaignPlatform;
  asset_id: string;
  metrics: Record<CampaignMetric, number>;
  explainable: { top_creative_factor: string; model_version: string; confidence: number };
  synced_at: string;
}

export interface CampaignSyncState {
  campaign_id: string;
  tenant_id: string;
  linked_workspace_task?: string;
  linked_calendar_event?: string;
  assets: CampaignAsset[];
  performance: CampaignPerformance[];
  last_sync_at: string;
  policy_decision?: string;
}
