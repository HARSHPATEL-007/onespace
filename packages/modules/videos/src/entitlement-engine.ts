/**
 * N0VA VIDEOS — Entitlement Engine
 * Centralized capability-based packaging (Capability / Usage / Governance / Deployment / Support)
 * Every entitlement check records tenant/feature/operation/decision/policy_version/usage_state/actor/timestamp
 */
import type {
  VideoTier, CapabilityKey, TierDefinition, EntitlementEnvelope, UsageLimits, EntitlementCheckRecord,
  CapabilityMatrixRow, AddOnId, AddOnDefinition, TierChangeEvaluation, UsageState, OverageMode,
  SupportLevel, DeploymentOption, TierPositioning,
} from "./entitlement-types";
import { VIDEO_TIERS, TIER_POSITIONING } from "./entitlement-types";

function uid(p: string){ return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso(){ return new Date().toISOString(); }

export const POLICY_VERSION = "videos-entitlement-v2026.08";

/* ── Tier catalog ───────────────────────────────────────────────────────────── */
export const CAPABILITY_MATRIX: CapabilityMatrixRow[] = [
  { capability:"Non-linear editing", creator:"Yes", team:"Yes", business:"Yes", studio:"Advanced", regulated:"Yes" },
  { capability:"Basic captions", creator:"Yes", team:"Yes", business:"Yes", studio:"Advanced", regulated:"Controlled" },
  { capability:"Basic AI", creator:"Yes", team:"Yes", business:"Yes", studio:"Advanced", regulated:"Policy-controlled" },
  { capability:"Templates", creator:"Personal", team:"Shared", business:"Governed", studio:"Professional", regulated:"Governed" },
  { capability:"Shared libraries", creator:"Limited", team:"Yes", business:"Advanced", studio:"Advanced", regulated:"Controlled" },
  { capability:"Review links", creator:"Yes", team:"Yes", business:"Advanced", studio:"Advanced", regulated:"Evidence-aware" },
  { capability:"Approval workflows", creator:"Basic", team:"Yes", business:"Governed", studio:"Production-grade", regulated:"Compliance-grade" },
  { capability:"Brand controls", creator:"Basic", team:"Yes", business:"Enterprise", studio:"Multi-brand", regulated:"Governed" },
  { capability:"SSO and SCIM", creator:"No", team:"Optional", business:"Yes", studio:"Yes", regulated:"Required or configurable" },
  { capability:"Audit logs", creator:"Basic activity", team:"Workspace", business:"Immutable export", studio:"Production audit", regulated:"Immutable and evidentiary" },
  { capability:"Integrations", creator:"Basic", team:"Standard", business:"Enterprise", studio:"Media ecosystem", regulated:"Private and controlled" },
  { capability:"RAW workflows", creator:"No", team:"No", business:"Optional", studio:"Yes", regulated:"Optional" },
  { capability:"Multi-cam", creator:"Basic or no", team:"Optional", business:"Optional", studio:"Advanced", regulated:"Optional" },
  { capability:"Live production", creator:"Limited", team:"Optional", business:"Optional", studio:"Advanced", regulated:"Controlled" },
  { capability:"Professional interchange", creator:"No", team:"Limited", business:"Standard", studio:"Advanced", regulated:"Controlled" },
  { capability:"Distributed render orchestration", creator:"Shared", team:"Shared", business:"Priority", studio:"Advanced", regulated:"Dedicated or private" },
  { capability:"Legal hold", creator:"No", team:"No", business:"Optional", studio:"Optional", regulated:"Core" },
  { capability:"WORM retention", creator:"No", team:"No", business:"Optional", studio:"Optional", regulated:"Core" },
  { capability:"Private deployment", creator:"No", team:"No", business:"Optional", studio:"Optional", regulated:"Core" },
  { capability:"Customer-managed keys", creator:"No", team:"Optional", business:"Optional", studio:"Optional", regulated:"Core" },
  { capability:"Data residency", creator:"Standard", team:"Configurable", business:"Regional", studio:"Regional", regulated:"Enforced" },
  { capability:"Support", creator:"Standard", team:"Business-hours", business:"Priority", studio:"Production support", regulated:"Dedicated support" },
];

export const TIER_CATALOG: Record<VideoTier, TierDefinition> = {
  creator: {
    tier:"creator", positioning: TIER_POSITIONING.creator,
    entitlements: {
      templates:"personal", audit:"basic", integrations:"basic",
      editing:true, proxy_editing:true, transitions_effects:true, text_titles:true,
      captions_basic:true, transcription_basic:true, audio_cleanup_basic:true, thumbnail_generation:true, social_export:true,
      semantic_search_basic:true, personal_library:true, version_history:true, review_links:true, watermarking:true,
      ai_basic:true, ai_advanced:true, voice_cloning:true, generative_video:true, upscaling:true, style_transfer:true, autonomous_editing:true, approval_basic:true, brand_controls:true,
      // negatives / limited — advanced AI metered (higher credit cost) rather than blocked
      editing_advanced:false, captions_advanced:false, collaboration_realtime:false,
      sso:false, scim:false, raw_workflows:false, multicam_basic:false, live_basic:true, interchange_none:true,
      legal_hold:false, worm:false, private_deployment:false, cmk:false,
      data_residency_standard:true,
      audit_basic:true,
    } as unknown as TierDefinition["entitlements"],
    governance: { sso:false, scim:false, audit:"basic", legalHold:false, worm:false, dataResidency:"standard", retentionConfigurable:false, approvalPolicies:"basic", complianceReports:false, siemExport:false },
    deployment: { multiTenantSaas:true, dedicatedTenant:false, privateCloud:false, customerVpc:false, onPremises:false, airGapped:false, hybrid:false, singleRegion:false, cmk:false, hsm:false },
    support: { level:"standard", slaHours:"business" },
    limits: { members:1, guests:5, activeProjects:5, storage_gb:100, monthly_processed_hours:20, concurrent_renders:1, ai_credits:1000, retention_days:30, render_gpu_hours:10, concurrent_live_inputs:1, live_hours_monthly:5, cdn_delivery_gb:100, raw_storage_gb:0 },
    allowAddOns: ["creator_ai_credits","creator_storage","creator_caption_lang","creator_premium_templates","creator_review_guests","creator_hires_export"],
  },
  team: {
    tier:"team", positioning: TIER_POSITIONING.team,
    entitlements: {
      templates:"shared", audit:"workspace", integrations:"standard",
      editing:true, proxy_editing:true, transitions_effects:true, transitions_advanced:true, text_titles:true,
      captions_basic:true, captions_advanced:true, transcription_basic:true, audio_cleanup_basic:true, thumbnail_generation:true, social_export:true,
      semantic_search_basic:true, shared_libraries:true, version_history:true, review_links:true, watermarking:true,
      ai_basic:true, collaboration_realtime:true, approval_workflows:true, brand_controls:true,
      sso:"optional" as unknown as boolean, scim:"optional" as unknown as boolean,
      audit_workspace:true, raw_workflows:false, multicam_optional:true, live_optional:true, interchange_limited:true,
      render_orchestration_shared:true, legal_hold:false, worm:false, private_deployment:false, cmk:"optional" as unknown as boolean,
      shared_render_queue:true,
    } as unknown as TierDefinition["entitlements"],
    governance: { sso:"optional", scim:"optional", audit:"workspace", legalHold:false, worm:false, dataResidency:"configurable", retentionConfigurable:true, approvalPolicies:"yes", complianceReports:false, siemExport:false },
    deployment: { multiTenantSaas:true, dedicatedTenant:false, privateCloud:false, customerVpc:false, onPremises:false, airGapped:false, hybrid:false, singleRegion:false, cmk:"optional" as unknown as boolean, hsm:false },
    support: { level:"business_hours", slaHours:"8x5" },
    limits: { members:25, guests:50, activeProjects:50, storage_gb:1000, monthly_processed_hours:500, concurrent_renders:5, ai_credits:25000, retention_days:90, render_gpu_hours:100, concurrent_live_inputs:2, live_hours_monthly:50, cdn_delivery_gb:1000, raw_storage_gb:100 },
    allowAddOns: ["team_seats","team_reviewer_packs","team_brand_kits","team_storage","team_render","team_integrations"],
  },
  business: {
    tier:"business", positioning: TIER_POSITIONING.business,
    entitlements: {
      templates:"governed", audit:"immutable", integrations:"enterprise",
      editing:true, editing_advanced:true, proxy_editing:true, transitions_effects:true, text_titles:true,
      captions_basic:true, captions_advanced:true, transcription_basic:true, audio_cleanup_advanced:true, thumbnail_generation:true, social_export:true,
      semantic_search_advanced:true, shared_libraries_advanced:true, version_history:true, review_links_advanced:true, watermarking:true,
      ai_basic:true, ai_advanced:true, collaboration_realtime:true, approval_governed:true, brand_controls_enterprise:true,
      sso:true, scim:true, audit_immutable:true, raw_optional:true, multicam_optional:true, live_optional:true, interchange_standard:true,
      render_orchestration_priority:true, legal_hold_optional:true, worm_optional:true, private_deployment_optional:true, cmk_optional:true,
    } as unknown as TierDefinition["entitlements"],
    governance: { sso:true, scim:true, audit:"immutable", legalHold:"optional", worm:"optional", dataResidency:"regional", retentionConfigurable:true, approvalPolicies:"governed", complianceReports:true, siemExport:true },
    deployment: { multiTenantSaas:true, dedicatedTenant:"optional" as unknown as boolean, privateCloud:"optional" as unknown as boolean, customerVpc:"optional" as unknown as boolean, onPremises:false, airGapped:false, hybrid:"optional" as unknown as boolean, singleRegion:"optional" as unknown as boolean, cmk:"optional" as unknown as boolean, hsm:true },
    support: { level:"priority", slaHours:"24x5", dedicatedCsm:false },
    limits: { members:250, guests:500, activeProjects:500, storage_gb:10000, monthly_processed_hours:5000, concurrent_renders:25, ai_credits:100000, retention_days:365, render_gpu_hours:1000, concurrent_live_inputs:10, live_hours_monthly:500, cdn_delivery_gb:10000, raw_storage_gb:500 },
    allowAddOns: ["business_dedicated_support","business_data_regions","business_api_limits","business_siem","business_private_inference","business_compute","business_retention"],
  },
  studio: {
    tier:"studio", positioning: TIER_POSITIONING.studio,
    entitlements: {
      templates:"professional", audit:"production", integrations:"media",
      editing:true, editing_advanced:true, proxy_editing:true, transitions_advanced:true, text_titles:true,
      captions_basic:true, captions_advanced:true, transcription_advanced:true, audio_cleanup_advanced:true, thumbnail_generation:true, social_export:true,
      semantic_search_advanced:true, shared_libraries_advanced:true, version_history:true, review_links_advanced:true, watermarking:true,
      ai_basic:true, ai_advanced:true, collaboration_realtime:true, approval_production:true, brand_controls_multi:true,
      sso:true, scim:true, audit_production:true, raw_workflows:true, multicam_advanced:true, live_advanced:true, interchange_advanced:true,
      render_orchestration_advanced:true, legal_hold_optional:true, worm_optional:true, private_deployment_optional:true, cmk_optional:true,
    } as unknown as TierDefinition["entitlements"],
    governance: { sso:true, scim:true, audit:"production", legalHold:"optional", worm:"optional", dataResidency:"regional", retentionConfigurable:true, approvalPolicies:"production", complianceReports:true, siemExport:true },
    deployment: { multiTenantSaas:true, dedicatedTenant:"optional" as unknown as boolean, privateCloud:"optional" as unknown as boolean, customerVpc:"optional" as unknown as boolean, onPremises:"optional" as unknown as boolean, airGapped:false, hybrid:"optional" as unknown as boolean, singleRegion:"optional" as unknown as boolean, cmk:"optional" as unknown as boolean, hsm:true },
    support: { level:"production", slaHours:"24x7", dedicatedCsm:true },
    limits: { members:500, guests:1000, activeProjects:2000, storage_gb:50000, monthly_processed_hours:20000, concurrent_renders:100, ai_credits:500000, retention_days:365, render_gpu_hours:10000, concurrent_live_inputs:50, live_hours_monthly:2000, cdn_delivery_gb:50000, raw_storage_gb:5000 },
    allowAddOns: ["studio_reserved_gpu","studio_live_inputs","studio_render_farm","studio_raw_storage","studio_premium_cdn","studio_broadcast_delivery","studio_color_pack"],
  },
  regulated: {
    tier:"regulated", positioning: TIER_POSITIONING.regulated,
    entitlements: {
      templates:"governed", audit:"evidentiary", integrations:"private",
      editing:true, proxy_editing:true, captions_controlled:true, transcription_basic:true, audio_cleanup_basic:true, thumbnail_generation:true,
      semantic_search_basic:true, shared_libraries_controlled:true, version_history:true, review_links_evidence:true, watermarking:true,
      ai_policy_controlled:true, approval_compliance:true, brand_controls_governed:true,
      sso:true, scim:true, audit_evidentiary:true, raw_optional:true, multicam_optional:true, live_controlled:true, interchange_controlled:true,
      render_orchestration_dedicated:true, legal_hold_core:true, worm_core:true, private_deployment_core:true, cmk_core:true,
      data_residency_enforced:true,
    } as unknown as TierDefinition["entitlements"],
    governance: { sso:true, scim:true, audit:"evidentiary", legalHold:"core", worm:"core", dataResidency:"enforced", retentionConfigurable:true, approvalPolicies:"compliance", complianceReports:true, siemExport:true },
    deployment: { multiTenantSaas:false, dedicatedTenant:true, privateCloud:true, customerVpc:true, onPremises:true, airGapped:true, hybrid:true, singleRegion:true, cmk:true, hsm:true },
    support: { level:"dedicated", slaHours:"24x7 dedicated", dedicatedCsm:true },
    limits: { members:1000, guests:1000, activeProjects:5000, storage_gb:100000, monthly_processed_hours:50000, concurrent_renders:50, ai_credits:200000, retention_days:2555, render_gpu_hours:5000, concurrent_live_inputs:20, live_hours_monthly:1000, cdn_delivery_gb:20000, raw_storage_gb:20000 },
    allowAddOns: ["regulated_cmk","regulated_vpc","regulated_onprem","regulated_airgapped","regulated_retention","regulated_compliance_pack","regulated_dr"],
  },
};

export const ADDON_CATALOG: Record<AddOnId, AddOnDefinition> = {
  creator_ai_credits: { id:"creator_ai_credits", label:"Additional AI credits", tier:"creator", category:"usage", description:"Prepaid AI inference credits for generative and transcription", metered:true },
  creator_storage: { id:"creator_storage", label:"Extra storage", tier:"creator", category:"usage", description:"Additional cloud storage, standard tier", metered:true },
  creator_caption_lang: { id:"creator_caption_lang", label:"Advanced caption languages", tier:"creator", category:"capability", description:"Access to premium languages, speaker diarization" },
  creator_premium_templates: { id:"creator_premium_templates", label:"Premium templates", tier:"creator", category:"capability", description:"Professional templates beyond personal library" },
  creator_review_guests: { id:"creator_review_guests", label:"Additional review guests", tier:"creator", category:"usage", description:"Extra guest reviewers beyond limited pool", metered:true },
  creator_hires_export: { id:"creator_hires_export", label:"High-resolution exports", tier:"creator", category:"capability", description:"4K/high-bitrate export unlock" },
  team_seats: { id:"team_seats", label:"Additional seats", tier:"team", category:"usage", description:"Extra members beyond pooled members", metered:true },
  team_reviewer_packs: { id:"team_reviewer_packs", label:"External reviewer packs", tier:"team", category:"usage", description:"Bulk reviewer seats for clients" },
  team_brand_kits: { id:"team_brand_kits", label:"Brand kits", tier:"team", category:"capability", description:"Additional brand governance kits" },
  team_storage: { id:"team_storage", label:"Extra shared storage", tier:"team", category:"usage", description:"Pooled storage expansion", metered:true },
  team_render: { id:"team_render", label:"Additional render capacity", tier:"team", category:"usage", description:"Shared render minutes and concurrent jobs" },
  team_integrations: { id:"team_integrations", label:"Advanced integrations", tier:"team", category:"capability", description:"Premium connectors" },
  business_dedicated_support: { id:"business_dedicated_support", label:"Dedicated support", tier:"business", category:"support", description:"Named CSM and priority routing" },
  business_data_regions: { id:"business_data_regions", label:"Additional data regions", tier:"business", category:"deployment", description:"Extra residency regions" },
  business_api_limits: { id:"business_api_limits", label:"Premium API limits", tier:"business", category:"usage", description:"Higher rate limits for events/webhooks" },
  business_siem: { id:"business_siem", label:"SIEM export", tier:"business", category:"governance", description:"Immutable audit forwarding to SIEM" },
  business_private_inference: { id:"business_private_inference", label:"Private inference", tier:"business", category:"governance", description:"Regional/private AI inference" },
  business_compute: { id:"business_compute", label:"Dedicated compute", tier:"business", category:"usage", description:"Reserved render/AI capacity" },
  business_retention: { id:"business_retention", label:"Advanced retention", tier:"business", category:"governance", description:"Extended retention policies beyond defaults" },
  studio_reserved_gpu: { id:"studio_reserved_gpu", label:"Reserved GPU capacity", tier:"studio", category:"usage", description:"Guaranteed GPU pools" },
  studio_live_inputs: { id:"studio_live_inputs", label:"Live production inputs", tier:"studio", category:"usage", description:"Additional concurrent live inputs/ISO" },
  studio_render_farm: { id:"studio_render_farm", label:"Dedicated render farm", tier:"studio", category:"deployment", description:"Private render orchestration farm" },
  studio_raw_storage: { id:"studio_raw_storage", label:"RAW storage", tier:"studio", category:"usage", description:"High-res RAW and master storage" },
  studio_premium_cdn: { id:"studio_premium_cdn", label:"Premium CDN", tier:"studio", category:"usage", description:"Global CDN with burst" },
  studio_broadcast_delivery: { id:"studio_broadcast_delivery", label:"Broadcast delivery", tier:"studio", category:"capability", description:"IMF/DCP, broadcast codecs" },
  studio_color_pack: { id:"studio_color_pack", label:"Color-finishing pack", tier:"studio", category:"capability", description:"ACES, HDR finishing, LUT governance" },
  regulated_cmk: { id:"regulated_cmk", label:"Customer-managed keys", tier:"regulated", category:"governance", description:"Bring-your-own-key, HSM-backed rotation" },
  regulated_vpc: { id:"regulated_vpc", label:"Private VPC", tier:"regulated", category:"deployment", description:"Customer VPC deployment" },
  regulated_onprem: { id:"regulated_onprem", label:"On-premises deployment", tier:"regulated", category:"deployment", description:"On-prem with air-gap option" },
  regulated_airgapped: { id:"regulated_airgapped", label:"Air-gapped operation", tier:"regulated", category:"deployment", description:"Fully isolated operation" },
  regulated_retention: { id:"regulated_retention", label:"Extended evidence retention", tier:"regulated", category:"governance", description:"7-20 year WORM + disposition" },
  regulated_compliance_pack: { id:"regulated_compliance_pack", label:"Advanced compliance pack", tier:"regulated", category:"governance", description:"HIPAA/finance/public-sector controls + audit evidence" },
  regulated_dr: { id:"regulated_dr", label:"Dedicated disaster-recovery region", tier:"regulated", category:"deployment", description:"Cross-region DR with residency" },
};

/* ── In-memory entitlement store + usage ledger ─────────────────────────────── */
type StoreEntry = { envelope: EntitlementEnvelope; usage: UsageState; addOns: AddOnId[]; history: EntitlementCheckRecord[] };
const entitlementStore = new Map<string, StoreEntry>(); // tenant_id -> entry
const checkLedger: EntitlementCheckRecord[] = [];

function billingPeriodNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}

function tierIndex(t: VideoTier){ return VIDEO_TIERS.indexOf(t); }

function defaultEnvelope(tenant_id: string, tier: VideoTier): EntitlementEnvelope {
  const def = TIER_CATALOG[tier];
  const flat: Record<string, boolean|string|number> = {};
  for(const [k,v] of Object.entries(def.entitlements)) flat[k] = v as boolean|string|number;
  // expose governance/deployment/support as flattened entitlements as well for checks
  flat["sso"] = def.governance.sso as unknown as boolean|string;
  flat["scim"] = def.governance.scim as unknown as boolean|string;
  flat["legal_hold"] = def.governance.legalHold as unknown as boolean|string;
  flat["private_deployment"] = def.deployment.dedicatedTenant as unknown as boolean|string;
  flat["governance_audit"] = def.governance.audit;
  flat["data_residency"] = def.governance.dataResidency;
  flat["support_level"] = def.support.level;
  return {
    tenant_id, plan: tier, billing_period: billingPeriodNow(),
    entitlements: flat,
    limits: { ...def.limits } as EntitlementEnvelope["limits"],
    overrides: {},
    addOns: [],
    policy_version: POLICY_VERSION,
    updated_at: nowIso(),
  };
}

export function getEntitlement(tenant_id: string): EntitlementEnvelope {
  const entry = entitlementStore.get(tenant_id);
  if(entry) return entry.envelope;
  // default to business for existing workspaces without tier? but spec suggests Creator baseline
  // Heuristic: return creator baseline for unknown tenant to encourage upgrade path
  return defaultEnvelope(tenant_id, "creator");
}

export function setTier(tenant_id: string, tier: VideoTier, overrides?: EntitlementEnvelope["overrides"], addOns?: AddOnId[]): EntitlementEnvelope {
  const env = defaultEnvelope(tenant_id, tier);
  if(overrides) env.overrides = { ...env.overrides, ...overrides };
  if(addOns) env.addOns = addOns;
  // apply add-on limit expansions in-memory (small bumps to illustrate) + entitlement unlocks
  for(const a of addOns ?? []){
    if(a==="creator_storage" || a==="team_storage") env.limits.storage_gb += 500;
    if(a==="creator_ai_credits") env.limits.ai_credits += 5000;
    if(a==="team_seats") env.limits.members += 5;
    if(a==="team_render" || a==="studio_reserved_gpu" || a==="business_compute") { env.limits.concurrent_renders = Math.min(500, env.limits.concurrent_renders+10); (env.limits as unknown as Record<string,number>).render_gpu_hours = ((env.limits as unknown as Record<string,number>).render_gpu_hours ?? 0)+500; }
    if(a==="studio_raw_storage") env.limits.raw_storage_gb = (env.limits.raw_storage_gb ?? 0)+1000;
    if(a==="business_siem") env.entitlements["siem_export"]=true;
    if(a==="business_private_inference") env.entitlements["private_inference"]=true;
    if(a==="regulated_cmk") { env.entitlements["cmk"]=true; env.entitlements["cmk_core"]=true; }
    if(a==="creator_caption_lang") { env.entitlements["captions_advanced"]=true; env.entitlements["captions_controlled"]=true; }
    if(a==="creator_premium_templates") env.entitlements["templates_premium"]=true;
    if(a==="creator_hires_export") { env.entitlements["render_orchestration_advanced"]=true; env.entitlements["high_res_export"]=true; }
    if(a==="creator_review_guests") env.limits.guests = (env.limits.guests ?? 5) + 10;
    if(a==="team_brand_kits") env.entitlements["brand_controls"]=true;
    if(a==="team_reviewer_packs") env.limits.guests += 25;
    if(a==="team_integrations") env.entitlements["integrations_enterprise"]=true;
    if(a==="business_data_regions") env.entitlements["additional_regions"]=true;
    if(a==="business_api_limits") env.entitlements["premium_api_limits"]=true;
    if(a==="business_retention") { env.limits.retention_days += 365; env.entitlements["advanced_retention"]=true; }
    if(a==="studio_reserved_gpu") env.entitlements["reserved_capacity"]=true;
    if(a==="studio_live_inputs") env.limits.concurrent_live_inputs = (env.limits.concurrent_live_inputs ?? 0)+10;
    if(a==="studio_premium_cdn") env.entitlements["premium_cdn"]=true;
    if(a==="studio_broadcast_delivery") env.entitlements["broadcast_delivery"]=true;
    if(a==="studio_color_pack") env.entitlements["color_finishing"]=true;
    if(a==="regulated_vpc") env.entitlements["private_deployment"]=true;
    if(a==="regulated_onprem") env.entitlements["on_premises"]=true;
    if(a==="regulated_airgapped") env.entitlements["air_gapped"]=true;
    if(a==="regulated_retention") env.limits.retention_days = 7300;
    if(a==="regulated_compliance_pack") env.entitlements["compliance_pack"]=true;
    if(a==="regulated_dr") env.entitlements["dedicated_dr"]=true;
  }
  const usage: UsageState = entitlementStore.get(tenant_id)?.usage ?? { members:1, guests:0, activeProjects:0, storage_gb:0, processed_hours:0, render_minutes:0, ai_credits_used:0, concurrent_renders:0, live_inputs:0 };
  entitlementStore.set(tenant_id, { envelope: env, usage, addOns: addOns ?? [], history: entitlementStore.get(tenant_id)?.history ?? [] });
  return env;
}

export function getOrCreateEntry(tenant_id: string, tierHint?: VideoTier): StoreEntry {
  let e = entitlementStore.get(tenant_id);
  if(!e){
    const t = tierHint ?? "creator";
    setTier(tenant_id, t);
    e = entitlementStore.get(tenant_id)!;
  }
  return e!;
}

export function listTiers(): TierDefinition[] { return VIDEO_TIERS.map(t=>TIER_CATALOG[t]); }

export function getTierDefinition(tier: VideoTier): TierDefinition { return TIER_CATALOG[tier]; }

export function listAddOns(tier?: VideoTier): AddOnDefinition[] {
  const all = Object.values(ADDON_CATALOG);
  return tier ? all.filter(a=> a.tier===tier) : all;
}

/* ── Entitlement check (centralized) ─────────────────────────────────────── */
export function checkEntitlement(input: {
  tenant_id: string;
  feature: string; // entitlement key or capability key
  requested_operation: string; // e.g. "editing.create", "ai.generative", "render.start", "live.ingest"
  actor?: string;
  usage_delta?: Partial<Record<keyof UsageState, number>>;
  requireApproval?: boolean;
}): { allowed: boolean; decision: EntitlementCheckRecord["decision"]; reason?: string; entitlement: EntitlementEnvelope; usage: UsageState; record: EntitlementCheckRecord; overage?: OverageMode } {
  const actor = input.actor ?? "system";
  const envelope = getEntitlement(input.tenant_id);
  const entry = getOrCreateEntry(input.tenant_id, envelope.plan);
  const tierDef = TIER_CATALOG[envelope.plan];
  let decision: EntitlementCheckRecord["decision"] = "allow";
  let reason: string | undefined;
  let overageMode: OverageMode | undefined;

  // Capability entitlement check: entitlements[feature] or feature substring
  const entitlementValue = envelope.entitlements[input.feature];
  const featureExists = input.feature in envelope.entitlements;
  // For tier "optional" we treat as denied unless add-on or override enables it
  if(featureExists){
    const v = entitlementValue as unknown;
    if(v===false) { decision="deny"; reason=`Capability '${input.feature}' not included in ${envelope.plan} tier — requires upgrade or add-on`; }
    else if(v==="optional" || (typeof v==="string" && v.includes("optional"))) { decision="deny"; reason=`Capability '${input.feature}' is optional in ${envelope.plan} — enable via add-on or upgrade`; }
  } else {
    // unknown feature — check if it's a known entitlement key (across any tier); if so, deny when missing
    const knownKeys = new Set<string>([
      ...Object.keys(TIER_CATALOG.creator.entitlements), ...Object.keys(TIER_CATALOG.team.entitlements),
      ...Object.keys(TIER_CATALOG.business.entitlements), ...Object.keys(TIER_CATALOG.studio.entitlements),
      ...Object.keys(TIER_CATALOG.regulated.entitlements), ...Object.keys(ADDON_CATALOG),
      "editing","editing_advanced","proxy_editing","captions_basic","captions_advanced","captions_controlled","ai_basic","ai_advanced","ai_policy_controlled",
      "voice_cloning","generative_video","upscaling","style_transfer","autonomous_editing","render_orchestration_shared","render_orchestration_priority","render_orchestration_advanced","render_orchestration_dedicated",
      "raw_workflows","multicam_advanced","live_basic","live_advanced","live_optional","live_controlled","interchange_none","interchange_limited","interchange_standard","interchange_advanced","interchange_controlled",
      "legal_hold","legal_hold_optional","legal_hold_core","worm","worm_optional","worm_core","private_deployment","private_deployment_optional","private_deployment_core","cmk","cmk_optional","cmk_core","sso","scim"
    ]);
    if(knownKeys.has(input.feature)){
      decision="deny"; reason=`Capability '${input.feature}' not included in ${envelope.plan} tier — requires upgrade or add-on`;
    } else {
    // fallback umbrella for legacy groups
    const umbrellaMap: Record<string, CapabilityKey[]> = {
      "editing": ["editing","editing_advanced"], "ai": ["ai_basic","ai_advanced","ai_policy_controlled"], "render": ["shared_render_queue","render_orchestration_shared","render_orchestration_advanced"],
      "raw": ["raw_workflows"], "multicam": ["multicam_basic","multicam_advanced"], "live": ["live_basic","live_advanced"], "interchange": ["interchange_limited","interchange_advanced"],
      "legal_hold": ["legal_hold","legal_hold_optional","legal_hold_core"], "worm": ["worm","worm_optional","worm_core"],
    };
     const group = umbrellaMap[input.feature];
    if(group){
      const anyAllowed = group.some(k=> {
        const vv = envelope.entitlements[k as string];
        return vv===true || vv==="Yes" || vv==="Advanced" || vv==="core";
      });
      if(!anyAllowed){ decision="deny"; reason=`No entitlement for group '${input.feature}' in ${envelope.plan}`; }
    }
    // else unknown feature -> allow but warn (metered) to not break existing modules
    }
  }

  // Usage limit checks
  const usage = entry.usage;
  const limits = envelope.limits;
  const deltas = input.usage_delta ?? {};
  let overageDetected = false;
  // storage
  if(deltas.storage_gb && usage.storage_gb + deltas.storage_gb > limits.storage_gb){ overageDetected=true; overageMode="hard_cap"; decision="overage_block"; reason=`Storage limit exceeded: ${usage.storage_gb + deltas.storage_gb} > ${limits.storage_gb} GB (${envelope.plan})`; }
  if(deltas.processed_hours && usage.processed_hours + deltas.processed_hours > limits.monthly_processed_hours){ overageDetected=true; overageMode="soft_cap"; if(decision==="allow") decision="deny"; reason = reason ?? `Processed hours limit exceeded: ${usage.processed_hours} + ${deltas.processed_hours} > ${limits.monthly_processed_hours} hrs`; }
  if(deltas.render_minutes && usage.render_minutes + deltas.render_minutes > ((limits as unknown as Record<string,number>).render_minutes_monthly ?? Infinity)){ /* not in limits map */ }
  if(deltas.ai_credits_used && usage.ai_credits_used + deltas.ai_credits_used > limits.ai_credits){ overageDetected=true; overageMode="soft_cap"; if(decision==="allow") decision="deny"; reason=reason ?? `AI credits exhausted: ${usage.ai_credits_used} + ${deltas.ai_credits_used} > ${limits.ai_credits}`; }
  if(deltas.members && usage.members + deltas.members > limits.members){ overageDetected=true; overageMode="hard_cap"; if(decision==="allow") decision="overage_block"; reason=reason ?? `Member limit exceeded: ${usage.members}+${deltas.members} > ${limits.members}`; }
  if(deltas.activeProjects && usage.activeProjects + (deltas.activeProjects ?? 0) > limits.activeProjects){ overageDetected=true; overageMode="soft_cap"; if(decision==="allow") decision="deny"; reason=reason ?? `Active project limit exceeded: ${usage.activeProjects} >= ${limits.activeProjects}`; }

  // Policy-controlled AI (regulated) -> require approval flag
  if(input.feature.includes("ai") && envelope.plan==="regulated" && input.requireApproval){ decision="allow_with_approval"; reason="Regulated AI requires human approval per policy"; }

  const record: EntitlementCheckRecord = {
    tenant: input.tenant_id,
    feature: input.feature,
    requested_operation: input.requested_operation,
    decision: decision as EntitlementCheckRecord["decision"],
    policy_version: POLICY_VERSION,
    usage_state: { ...usage } as unknown as Record<string, number>,
    actor, timestamp: nowIso(), tier: envelope.plan, reason,
  };
  entry.history.push(record);
  checkLedger.push(record);
  // keep last 1000
  if(entry.history.length>1000) entry.history.splice(0, entry.history.length-1000);
  if(checkLedger.length>5000) checkLedger.splice(0, 1000);

  return { allowed: decision==="allow" || (decision as string)==="metered_allow" || decision==="allow_with_approval", decision: record.decision, reason, entitlement: envelope, usage, record, overage: overageMode };
}

export function recordUsage(tenant_id: string, delta: Partial<UsageState>){
  const entry = getOrCreateEntry(tenant_id);
  for(const [k,v] of Object.entries(delta)) (entry.usage as unknown as Record<string,number>)[k] = (((entry.usage as unknown as Record<string,number>)[k] ?? 0) + (v as number));
}

export function getUsage(tenant_id: string): UsageState { return { ...getOrCreateEntry(tenant_id).usage }; }

export function getCheckHistory(tenant_id: string, limit=50): EntitlementCheckRecord[] {
  const h = getOrCreateEntry(tenant_id).history;
  return h.slice(-limit).reverse();
}

export function getGlobalLedger(limit=100): EntitlementCheckRecord[] { return checkLedger.slice(-limit).reverse(); }

/* ── Overage evaluation (warning → threshold → soft cap → hard cap → admin approval) ── */
export function evaluateOverage(tenant_id: string): { mode: OverageMode; usage: UsageState; limits: UsageLimits; warnings: string[]; blocked: boolean } {
  const entry = getOrCreateEntry(tenant_id);
  const u = entry.usage; const l = entry.envelope.limits;
  const warnings: string[]=[];
  let mode: OverageMode="warning"; let blocked=false;
  const pct = (used:number, cap:number)=> cap ? used/cap : 0;
  if(pct(u.storage_gb, l.storage_gb)>=0.8) warnings.push(`Storage ${Math.round(pct(u.storage_gb,l.storage_gb)*100)}% — ${u.storage_gb}/${l.storage_gb} GB`);
  if(pct(u.processed_hours, l.monthly_processed_hours)>=0.8) warnings.push(`Processed hours ${Math.round(pct(u.processed_hours,l.monthly_processed_hours)*100)}% — ${u.processed_hours}/${l.monthly_processed_hours} hrs`);
  if(pct(u.ai_credits_used, l.ai_credits)>=0.8) warnings.push(`AI credits ${Math.round(pct(u.ai_credits_used,l.ai_credits)*100)}% — ${u.ai_credits_used}/${l.ai_credits}`);
  if(pct(u.activeProjects, l.activeProjects)>=0.8) warnings.push(`Active projects ${u.activeProjects}/${l.activeProjects}`);
  if(u.storage_gb>l.storage_gb || u.processed_hours>l.monthly_processed_hours || u.ai_credits_used>l.ai_credits){ mode="hard_cap"; blocked=true; }
  else if(warnings.length>=2) mode="soft_cap";
  else if(warnings.length===1) mode="budget_threshold";
  return { mode, usage: {...u}, limits: {...l}, warnings, blocked };
}

/* ── Add-ons ────────────────────────────────────────────────────────────────── */
export function applyAddOn(tenant_id: string, addOnId: AddOnId): EntitlementEnvelope {
  const entry = getOrCreateEntry(tenant_id);
  if(!ADDON_CATALOG[addOnId]) throw new Error(`Unknown add-on ${addOnId}`);
  const def = ADDON_CATALOG[addOnId];
  // validate tier eligibility: creator add-ons on higher tiers also allowed? but restrict to >= required tier
  const tierRank = tierIndex(entry.envelope.plan);
  const addonTierRank = tierIndex(def.tier as VideoTier);
  // allow cross-tier add-ons? simplest: allow if current tier rank >= add-on tier rank OR add-on is metered usage
  // creator add-ons are usable on creator only? but allow on higher tiers as extra
  const currentAddOns = entry.addOns;
  if(currentAddOns.includes(addOnId)) return entry.envelope;
  const next = [...currentAddOns, addOnId];
  return setTier(tenant_id, entry.envelope.plan, entry.envelope.overrides, next);
}

export function removeAddOn(tenant_id:string, addOnId: AddOnId): EntitlementEnvelope {
  const entry = getOrCreateEntry(tenant_id);
  const next = entry.addOns.filter(a=>a!==addOnId);
  return setTier(tenant_id, entry.envelope.plan, entry.envelope.overrides, next);
}

/* ── Upgrade / downgrade evaluation ────────────────────────────────────────── */
const DEPLOYMENT_MIGRATION_ORDER: DeploymentOption[] = ["multi_tenant_saass","dedicated_tenant","customer_vpc","private_cloud","on_premises","air_gapped"];

export function evaluateTierChange(from: VideoTier, to: VideoTier): TierChangeEvaluation {
  const fi=tierIndex(from), ti=tierIndex(to);
  const direction = ti>fi?"upgrade":ti<fi?"downgrade":"lateral";
  const warnings: string[]=[]; const dataPreservation: string[]=[];
  const blockedReasons: string[]=[];
  const immediateCapabilities: string[] = ["Seats","AI credits","Render capacity","Storage","Integrations","Support"];
  // deployment migration requirement
  const fromDep = TIER_CATALOG[from].deployment; const toDep = TIER_CATALOG[to].deployment;
  const requiresMigration = JSON.stringify(fromDep)!==JSON.stringify(toDep) && (to==="regulated" || from==="regulated" || (DEPLOYMENT_MIGRATION_ORDER.includes("dedicated_tenant") && to!=="creator"));
  let migrationPath: DeploymentOption[] | undefined;
  if(requiresMigration){
    // Example migration path logic
    if(from==="creator" && to==="regulated") migrationPath=["multi_tenant_saass","dedicated_tenant","customer_vpc","private_cloud","on_premises"];
    else if(to==="studio" || to==="business") migrationPath=["multi_tenant_saass","dedicated_tenant"];
    else if(to==="creator") migrationPath=undefined;
    else migrationPath=DEPLOYMENT_MIGRATION_ORDER.slice(0, tierIndex(to)+1) as DeploymentOption[];
  }
  if(direction==="downgrade"){
    warnings.push("Downgrade will disable new usage but preserve existing data — no automatic deletion.");
    warnings.push("Resources exceeding new limits will be marked over-limit and require admin remediation within grace period.");
    warnings.push("Over-limit projects/assets are read-only until upgraded or reduced.");
    dataPreservation.push("Existing audit history preserved, new exports restricted.");
    dataPreservation.push("RAW and professional projects preserved, new RAW ingest blocked (Studio→Business).");
    if(from==="regulated" && to!=="regulated"){
      warnings.push("Regulated→Business: legal holds, retention, encryption controls NOT auto-removed — requires explicit compliance review.");
      dataPreservation.push("WORM retention and legal holds remain active until compliance review releases them.");
      blockedReasons.push("Compliance review required before downgrade from Regulated can complete — holds must be explicitly acknowledged.");
    }
    if(from==="business" && to==="team"){
      dataPreservation.push("Preserve audit history but restrict new audit exports after downgrade.");
    }
    if(from==="studio" && to==="business"){
      dataPreservation.push("Preserve RAW and professional projects, restrict new RAW ingest.");
    }
    warnings.push("Grace period: 14 days to remediate over-limit resources or export data.");
    if(to==="creator" && from!=="creator"){
      blockedReasons.push("Creator downgrade requires reducing to 1 member and ≤100GB storage; current usage may block — run remediation first.");
    }
  }
  if(direction==="upgrade"){
    warnings.push("Upgrade takes effect quickly for seats, AI credits, render capacity, storage, integrations, support.");
    if(requiresMigration) warnings.push(`Deployment change requires migration workflow: ${(migrationPath ?? []).join(" → ")}`);
    dataPreservation.push("No data loss — all existing projects/assets retained and entitlements expanded immediately for non-deployment changes.");
  }
  return {
    from, to, direction: direction as TierChangeEvaluation["direction"],
    allowed: blockedReasons.length===0 || direction==="upgrade",
    immediateCapabilities, requiresMigration: !!requiresMigration, migrationPath, warnings, gracePeriodDays: direction==="downgrade"?14:0, dataPreservation, blockedReasons: blockedReasons.length?blockedReasons:undefined,
  };
}

/* ── Capability helpers ─────────────────────────────────────────────────────── */
export function isEntitled(tenant_id: string, capability: string): boolean {
  const env = getEntitlement(tenant_id);
  const v = env.entitlements[capability];
  if(v===true) return true;
  if(v==="optional" || v===false) return false;
  if(typeof v==="string") return v!=="No" && v!=="No " && v.toLowerCase()!=="no";
  return false;
}

export function getCapabilityMatrixForTenant(tenant_id: string): { matrix: CapabilityMatrixRow[]; plan: VideoTier } {
  return { matrix: CAPABILITY_MATRIX, plan: getEntitlement(tenant_id).plan };
}

/* ── Deployment / governance / usage summary per tenant ────────────────────── */
export function getPackagingSummary(tenant_id: string){
  const env = getEntitlement(tenant_id);
  const def = TIER_CATALOG[env.plan];
  const usage = getUsage(tenant_id);
  const overage = evaluateOverage(tenant_id);
  return {
    plan: env.plan,
    tierDefinition: def,
    envelope: env,
    usage,
    overage,
    checks: getCheckHistory(tenant_id, 5),
    governance: def.governance,
    deployment: def.deployment,
    support: def.support,
    limits: def.limits,
  };
}

/* ── Commercial metrics definitions (per spec) ─────────────────────────────── */
export const COMMERCIAL_METRICS: { key: string; label: string; tiers: VideoTier[]; description: string }[] = [
  { key:"revenue_per_tenant", label:"Revenue per tenant", tiers:["creator","team","business","studio","regulated"], description:"MRR/ARR per tenant" },
  { key:"revenue_per_user", label:"Revenue per user", tiers:["creator","team","business"], description:"ARPU" },
  { key:"revenue_per_processed_hour", label:"Revenue per processed hour", tiers:["studio","business"], description:"Efficiency of video hour monetization" },
  { key:"gross_margin", label:"Gross margin", tiers:["creator","team","business","studio","regulated"], description:"Revenue minus AI/render/storage/CDN/support cost" },
  { key:"ai_cost", label:"AI cost", tiers:["creator","team","business","studio","regulated"], description:"Inference cost as % of revenue" },
  { key:"render_cost", label:"Render cost", tiers:["studio","business","team"], description:"GPU-hours cost" },
  { key:"storage_cost", label:"Storage cost", tiers:["creator","team","business","studio","regulated"], description:"Cryogenic tier economics" },
  { key:"cdn_cost", label:"CDN delivery cost", tiers:["studio","business"], description:"Egress + edge" },
  { key:"support_cost", label:"Support cost", tiers:["regulated","studio","business"], description:"Human support + SLA credits" },
  { key:"upgrade_rate", label:"Upgrade rate", tiers:["creator","team","business"], description:"Tier expansion motion" },
  { key:"churn", label:"Churn", tiers:["creator","team"], description:"Logo and revenue churn" },
  { key:"feature_utilization", label:"Feature utilization", tiers:["studio","business","team"], description:"Render, live, RAW, legal hold usage" },
  { key:"creator_ai_cost_pct", label:"Creator AI cost as % of revenue", tiers:["creator"], description:"Health: AI must not exceed sustainable margin" },
  { key:"team_collab_adoption", label:"Team collaboration adoption", tiers:["team"], description:"Real-time collaboration rate" },
  { key:"business_integration_activation", label:"Business integration activation", tiers:["business"], description:"CRM/DAM/webhooks active" },
  { key:"studio_render_utilization", label:"Studio render utilization", tiers:["studio"], description:"GPU pool efficiency" },
  { key:"regulated_support_cost", label:"Regulated support cost", tiers:["regulated"], description:"Dedicated support economics" },
];

export function getCommercialIndicator(tier: VideoTier): string[] {
  const indicators: Record<VideoTier, string[]> = {
    creator: ["Creator AI cost as percentage of revenue — keep AI margin sustainable, not just usage"],
    team: ["Team collaboration adoption — shared libraries + approval workflows active"],
    business: ["Business integration activation — CRM/DAM/SSO/SCIM/webhooks"],
    studio: ["Studio render utilization — GPU-hours, RAW storage, live inputs"],
    regulated: ["Regulated support cost — dedicated support + evidence retention economics"],
  };
  return indicators[tier] ?? [];
}

/* ── Example envelope for docs ─────────────────────────────────────────────── */
export function exampleEnvelope(tenant_id="tenant_acme", tier: VideoTier="business"): EntitlementEnvelope {
  const env = defaultEnvelope(tenant_id, tier);
  env.billing_period="2026-08";
  env.overrides = { region:"eu-west-1", data_residency:"eu", support_level:"priority" };
  // shape like spec example
  env.entitlements = {
    editing:true, advanced_ai: tier!=="creator", shared_libraries: tier!=="creator", sso: tier==="business"||tier==="studio"||tier==="regulated",
    scim: tier==="business"||tier==="studio"||tier==="regulated", audit_export: tier==="business" || tier==="regulated", raw_workflows: tier==="studio", multi_cam: tier==="studio", legal_hold: tier==="regulated"||tier==="business", private_deployment: tier==="regulated",
  };
  return env;
}

/* ── Entitlement versioning helper ────────────────────────────────────────── */
export function getPolicyVersion(){ return POLICY_VERSION; }
