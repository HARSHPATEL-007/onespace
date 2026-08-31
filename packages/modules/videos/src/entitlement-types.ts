/**
 * N0VA VIDEOS — Entitlement Types (Capability-based Packaging)
 * Tiers: Creator → Team → Business → Studio → Regulated
 * Five packaging dimensions: Capability / Usage / Governance / Deployment / Support
 * Prevents forcing customers into Studio for storage or Regulated for retention.
 */

export type VideoTier = "creator" | "team" | "business" | "studio" | "regulated";

export const VIDEO_TIERS: VideoTier[] = ["creator","team","business","studio","regulated"];

export type PackagingDimension = "capability" | "usage" | "governance" | "deployment" | "support";

// ── Tier positioning ─────────────────────────────────────────────────────────
export interface TierPositioning {
  tier: VideoTier;
  label: string;
  intendedUser: string;
  tagline: string;
  description: string;
}

export const TIER_POSITIONING: Record<VideoTier, TierPositioning> = {
  creator: { tier:"creator", label:"Creator", intendedUser:"Individual creators, educators, streamers, freelancers, social teams, small content businesses", tagline:"Make great videos quickly.", description:"Fast browser-based video workspace optimized for individual ownership and low operational complexity." },
  team: { tier:"team", label:"Team", intendedUser:"Marketing teams, agencies, internal comms, small production companies, distributed creative teams", tagline:"Create, review, and publish together.", description:"Multi-user workspaces with real-time collaboration, brand controls, shared libraries and pooled usage." },
  business: { tier:"business", label:"Business", intendedUser:"Enterprises needing governed video operations across departments, regions, brands, systems", tagline:"Govern video production across the enterprise.", description:"Enterprise identity, governance, integrations, analytics, audit, policy automation." },
  studio: { tier:"studio", label:"Studio", intendedUser:"Professional media teams, broadcasters, post houses, sports orgs, live production, high-volume operations", tagline:"Run professional media production at scale.", description:"Genuinely different production environment: RAW, multi-cam, live, interchange, render orchestration." },
  regulated: { tier:"regulated", label:"Regulated", intendedUser:"Healthcare, legal, finance, government, public-sector, evidentiary media", tagline:"Process sensitive video with controlled deployment, preservation, and compliance.", description:"Controlled deployment and evidence-preservation environment, not just higher storage." },
};

// ── Capability entitlements ( capability dimension = access to features ) ──────
export type CapabilityKey =
  | "editing" | "editing_advanced"
  | "proxy_editing"
  | "transitions_effects" | "transitions_advanced"
  | "templates" // personal | shared | governed | professional
  | "text_titles"
  | "captions_basic" | "captions_advanced" | "captions_controlled"
  | "transcription_basic" | "transcription_advanced"
  | "audio_cleanup_basic" | "audio_cleanup_advanced"
  | "thumbnail_generation"
  | "social_export"
  | "semantic_search_basic" | "semantic_search_advanced"
  | "personal_library" | "shared_libraries" | "shared_libraries_advanced" | "shared_libraries_controlled"
  | "version_history"
  | "review_links" | "review_links_advanced" | "review_links_evidence"
  | "watermarking"
  | "ai_basic" | "ai_advanced" | "ai_policy_controlled"
  | "voice_cloning" | "generative_video" | "upscaling" | "style_transfer" | "autonomous_editing"
  | "collaboration_realtime"
  | "brand_controls" | "brand_controls_enterprise" | "brand_controls_multi" | "brand_controls_governed"
  | "approval_basic" | "approval_workflows" | "approval_governed" | "approval_production" | "approval_compliance"
  | "shared_render_queue" | "render_orchestration_shared" | "render_orchestration_priority" | "render_orchestration_advanced" | "render_orchestration_dedicated"
  | "sso" | "scim"
  | "audit_basic" | "audit_workspace" | "audit_immutable" | "audit_production" | "audit_evidentiary"
  | "integrations_basic" | "integrations_standard" | "integrations_enterprise" | "integrations_media" | "integrations_private"
  | "raw_workflows" | "raw_optional"
  | "multicam_basic" | "multicam_optional" | "multicam_advanced"
  | "live_basic" | "live_optional" | "live_advanced" | "live_controlled"
  | "interchange_none" | "interchange_limited" | "interchange_standard" | "interchange_advanced" | "interchange_controlled"
  | "legal_hold" | "legal_hold_optional" | "legal_hold_core"
  | "worm" | "worm_optional" | "worm_core"
  | "private_deployment" | "private_deployment_optional" | "private_deployment_core"
  | "cmk" | "cmk_optional" | "cmk_core"
  | "data_residency_standard" | "data_residency_configurable" | "data_residency_regional" | "data_residency_enforced";

export type TemplateTier = "personal" | "shared" | "governed" | "professional";
export type AuditTier = "basic" | "workspace" | "immutable" | "production" | "evidentiary";
export type IntegrationTier = "basic" | "standard" | "enterprise" | "media" | "private";

// ── Usage packaging ──────────────────────────────────────────────────────────
export type UsageKey =
  | "members" | "guests" | "active_projects"
  | "storage_gb" | "processed_hours_monthly" | "render_minutes_monthly" | "render_gpu_hours"
  | "ai_credits_monthly" | "ai_inference_units"
  | "cdn_delivery_gb" | "concurrent_renders" | "concurrent_live_inputs" | "live_hours_monthly"
  | "concurrent_jobs" | "output_hours" | "raw_storage_gb" | "master_storage_gb"
  | "ai_enhancement_hours";

export interface UsageLimits {
  members: number; // 1 for creator, pooled for team/business etc.
  guests: number;
  activeProjects: number;
  storage_gb: number;
  monthly_processed_hours: number;
  concurrent_renders: number;
  ai_credits: number;
  retention_days: number;
  // studio/regulated extensions
  render_gpu_hours?: number;
  concurrent_live_inputs?: number;
  live_hours_monthly?: number;
  cdn_delivery_gb?: number;
  raw_storage_gb?: number;
}

// ── Governance packaging ─────────────────────────────────────────────────────
export type GovernanceKey =
  | "sso" | "scim" | "mfa" | "conditional_access" | "rbac" | "abac"
  | "audit_logs" | "audit_export" | "siem_forwarding"
  | "retention_policies" | "legal_hold" | "worm" | "chain_of_custody"
  | "data_residency" | "approval_policies" | "compliance_reports" | "ai_usage_policies"
  | "download_controls" | "external_sharing_restrictions" | "regional_access" | "plugin_controls" | "export_restrictions"
  | "data_classification" | "central_policy";

export interface GovernanceEntitlements {
  sso: boolean | "optional";
  scim: boolean | "optional";
  audit: AuditTier;
  legalHold: boolean | "optional" | "core";
  worm: boolean | "optional" | "core";
  dataResidency: "standard" | "configurable" | "regional" | "enforced";
  retentionConfigurable: boolean;
  approvalPolicies: "basic" | "yes" | "governed" | "production" | "compliance";
  complianceReports: boolean;
  siemExport: boolean;
}

// ── Deployment packaging ─────────────────────────────────────────────────────
export type DeploymentOption =
  | "multi_tenant_saass"
  | "dedicated_tenant"
  | "private_cloud"
  | "customer_vpc"
  | "on_premises"
  | "air_gapped"
  | "hybrid"
  | "single_region";

export interface DeploymentEntitlements {
  multiTenantSaas: boolean;
  dedicatedTenant: boolean | "optional";
  privateCloud: boolean | "optional";
  customerVpc: boolean | "optional";
  onPremises: boolean | "optional";
  airGapped: boolean | "optional";
  hybrid: boolean | "optional";
  singleRegion: boolean | "optional";
  cmk: boolean | "optional" | "core";
  hsm: boolean;
}

// ── Support packaging ─────────────────────────────────────────────────────────
export type SupportLevel = "standard" | "business_hours" | "priority" | "production" | "dedicated";

export interface SupportEntitlements {
  level: SupportLevel;
  slaHours?: string;
  dedicatedCsm?: boolean;
}

// ── Full tier definition ─────────────────────────────────────────────────────
export interface TierDefinition {
  tier: VideoTier;
  positioning: TierPositioning;
  entitlements: Partial<Record<CapabilityKey, boolean | string>> & { templates: TemplateTier; audit: AuditTier; integrations: IntegrationTier };
  governance: GovernanceEntitlements;
  deployment: DeploymentEntitlements;
  support: SupportEntitlements;
  limits: UsageLimits;
  // overrides allow tenant-specific grant without tier inflation
  allowAddOns: AddOnId[];
}

export type AddOnId =
  | "creator_ai_credits" | "creator_storage" | "creator_caption_lang" | "creator_premium_templates" | "creator_review_guests" | "creator_hires_export"
  | "team_seats" | "team_reviewer_packs" | "team_brand_kits" | "team_storage" | "team_render" | "team_integrations"
  | "business_dedicated_support" | "business_data_regions" | "business_api_limits" | "business_siem" | "business_private_inference" | "business_compute" | "business_retention"
  | "studio_reserved_gpu" | "studio_live_inputs" | "studio_render_farm" | "studio_raw_storage" | "studio_premium_cdn" | "studio_broadcast_delivery" | "studio_color_pack"
  | "regulated_cmk" | "regulated_vpc" | "regulated_onprem" | "regulated_airgapped" | "regulated_retention" | "regulated_compliance_pack" | "regulated_dr";

export interface AddOnDefinition {
  id: AddOnId;
  label: string;
  tier: VideoTier | "cross";
  category: PackagingDimension;
  description: string;
  metered?: boolean;
}

// ── Entitlement envelope (centralized service) ───────────────────────────────
export interface EntitlementEnvelope {
  tenant_id: string;
  plan: VideoTier;
  billing_period: string; // YYYY-MM
  entitlements: Record<string, boolean | string | number>;
  limits: UsageLimits & Record<string, number>;
  overrides: {
    region?: string;
    data_residency?: string;
    support_level?: SupportLevel;
    deployment?: DeploymentOption;
    [k: string]: unknown;
  };
  addOns?: AddOnId[];
  policy_version: string;
  updated_at: string;
}

export interface EntitlementCheckRecord {
  tenant: string;
  feature: string;
  requested_operation: string;
  decision: "allow" | "deny" | "allow_with_approval" | "metered_allow" | "overage_block";
  policy_version: string;
  usage_state: Record<string, number>;
  actor: string;
  timestamp: string;
  tier: VideoTier;
  reason?: string;
}

// ── Cross-tier capability matrix row ─────────────────────────────────────────
export type MatrixCell = "Yes" | "No" | "Limited" | "Basic" | "Advanced" | "Controlled" | "Optional" | "Policy-controlled" | "Required" | "Shared" | "Priority" | "Dedicated" | "Governed" | "Production-grade" | "Compliance-grade" | "Evidence-aware" | "Standard" | "Configurable" | "Regional" | "Enforced" | "Multi-brand" | "Enterprise" | "Professional" | "Private and controlled" | "Media ecosystem" | "Immutable export" | "Core" | "Basic or no" | string;

export interface CapabilityMatrixRow {
  capability: string;
  creator: MatrixCell;
  team: MatrixCell;
  business: MatrixCell;
  studio: MatrixCell;
  regulated: MatrixCell;
}

// ── Upgrade/downgrade ────────────────────────────────────────────────────────
export type TierChangeDirection = "upgrade" | "downgrade" | "lateral";
export interface TierChangeEvaluation {
  from: VideoTier;
  to: VideoTier;
  direction: TierChangeDirection;
  allowed: boolean;
  immediateCapabilities: string[]; // seats, credits, render, storage, integrations, support
  requiresMigration: boolean;
  migrationPath?: DeploymentOption[];
  warnings: string[];
  gracePeriodDays?: number;
  dataPreservation: string[];
  blockedReasons?: string[];
}

// ── Overage & governance ─────────────────────────────────────────────────────
export type OverageMode = "warning" | "budget_threshold" | "soft_cap" | "hard_cap" | "admin_approval";

export interface UsageState {
  members: number;
  guests: number;
  activeProjects: number;
  storage_gb: number;
  processed_hours: number;
  render_minutes: number;
  ai_credits_used: number;
  concurrent_renders: number;
  live_inputs: number;
}

// ── Commercial metrics ───────────────────────────────────────────────────────
export interface CommercialMetricDef {
  key: string;
  label: string;
  unit?: string;
  tier: VideoTier | "all";
  description: string;
}

// ── RAW / interchange / live etc. are modeled as capabilities already.
