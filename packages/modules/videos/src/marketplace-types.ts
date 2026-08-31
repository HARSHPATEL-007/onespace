/**
 * N0VA VIDEOS — Marketplace Types (Trusted Composable Media Marketplace)
 * Licensing, provenance, compatibility, security, commercial rights as first-class data.
 */

export type MarketplaceItemType =
  | "template" | "lut" | "motion_graphics" | "music" | "sfx"
  | "ai_model" | "voice_pack" | "compliance_pack" | "industry_workflow"
  | "agent_skill" | "export_preset" | "brand_kit";

export type MarketplaceItemStatus = "draft" | "in_review" | "published" | "deprecated" | "blocked" | "revoked";
export type MarketplaceVersion = string; // semver
export type LicenseModel = "one_time" | "subscription" | "per_project" | "per_seat" | "usage_based" | "revenue_share" | "enterprise" | "free" | "free_with_upgrade";
export type PricingCurrency = "USD" | "EUR" | "INR";

export interface Publisher {
  id: string;
  name: string;
  verified: boolean;
  slug?: string;
  certification?: CertificationLevel;
  support_contact?: string;
  incident_contact?: string;
}

export type CertificationLevel = "community" | "publisher_verified" | "n0va_compatible" | "n0va_certified" | "enterprise_approved" | "regulated_approved";
export type ProvenanceState = "publisher_declared" | "identity_verified" | "source_verified" | "cryptographically_signed" | "independently_audited" | "n0va_certified";
export type SecurityBadge = "verified" | "scanned" | "restricted" | "review_required" | "revoked" | "blocked";
export type CompatibilityLevel = "compatible" | "compatible_with_warning" | "requires_migration" | "unsupported" | "blocked";
export type UpdateChannel = "stable" | "lts" | "beta" | "canary" | "security_only";
export type LicenseEnforcementMode = "allow" | "warn" | "require_approval" | "block" | "quarantine_output";
export type PreviewMode = "watermarked_preview" | "low_res_preview" | "time_limited_preview" | "sandbox_project" | "non_commercial_trial" | "sample_audio";

// ── Common item record (spec example) ───────────────────────────────────────
export interface MarketplaceItemRecord {
  item_id: string;
  slug: string;
  type: MarketplaceItemType;
  publisher: Publisher;
  version: MarketplaceVersion;
  variant?: string;
  status: MarketplaceItemStatus;
  title: string;
  description?: string;
  content: {
    artifact_uri: string; // n0va://artifacts/item_001/3.2.1
    sha256: string;
    size_bytes: number;
    content_hash?: string; // for integrity
  };
  compatibility: CompatibilityManifest;
  license: LicenseManifest;
  provenance: ProvenanceManifest;
  security: SecurityManifest;
  rights: RightsMatrix;
  pricing: PricingManifest;
  category_metadata?: CategoryMetadata;
  created_at: string;
  updated_at: string;
}

export interface CompatibilityManifest {
  n0va_min: string;
  n0va_max?: string; // 5.x
  platforms: ("web" | "desktop" | "render-farm")[];
  gpu_required?: boolean;
  formats?: string[]; // cube, 3dl, etc.
  os?: string[];
  browsers?: string[];
  codec_requirements?: string[];
  color_pipeline?: string;
  audio_pipeline?: string;
  api_version?: string;
  required_permissions?: string[];
  required_dependencies?: string[]; // marketplace_item_ids
  level?: CompatibilityLevel;
}

export interface LicenseManifest {
  type: string; // commercial, royalty_free, cc, etc.
  identifier: string; // SPDX or custom-commercial-v2
  commercial_use: boolean;
  redistribution?: boolean;
  resale?: boolean;
  territories?: string[]; // worldwide etc.
  term?: string; // perpetual, per_term
  attribution_required?: boolean;
  per_project?: boolean;
  per_seat?: boolean;
  per_platform?: boolean;
  per_territory?: boolean;
  seats?: number;
  projects?: number;
  impressions?: number;
  expires_at?: string;
  renewal_required?: boolean;
}

export interface ProvenanceManifest {
  creator?: string;
  source_declaration?: string; // publisher-attested
  created_at?: string;
  signed_manifest?: string; // n0va://manifests/item_001
  c2pa_manifest?: string;
  chain?: ProvenanceLink[];
  state?: ProvenanceState;
  weights_sha256?: string;
  ai_bom?: AiBillOfMaterials;
}

export interface ProvenanceLink {
  role: "created_by" | "published_by" | "derived_from" | "modified_by" | "installed_by" | "used_in" | "exported_into" | "revoked_by" | "superseded_by";
  actor: string;
  item_id?: string;
  project_id?: string;
  timestamp: string;
  content_hash?: string;
}

export interface AiBillOfMaterials {
  model_id: string;
  version: string;
  weights_sha256: string;
  base_models?: string[];
  datasets?: { name: string; provenance: string; license: string }[];
  evaluation?: { wer?: number; languages?: number; safety_report?: string; bias_report?: string; latency_ms?: number };
  rights?: { commercial_inference?: boolean; fine_tuning?: boolean; model_redistribution?: boolean; training?: boolean };
}

export interface SecurityManifest {
  scan_status: "passed" | "failed" | "pending" | "review_required";
  scan_version?: string; // scanner-4.2
  last_scanned_at?: string;
  known_vulnerabilities?: number;
  sandbox_required?: boolean;
  network_permissions?: { mode: "deny_by_default" | "allow"; allowed_domains?: string[] };
  badge?: SecurityBadge;
  vulnerabilities?: { id: string; severity: "low"|"medium"|"high"|"critical"; title: string }[];
  revocation_status?: "active" | "revoked";
  revoked_at?: string;
  revoke_reason?: string;
}

export interface RightsMatrix {
  personal_use?: boolean;
  internal_commercial?: boolean;
  commercial_video?: boolean;
  paid_advertising?: boolean;
  broadcast?: boolean;
  client_work?: boolean;
  resale_standalone?: boolean;
  training?: boolean;
  ai_generation?: boolean;
  voice_impersonation?: boolean;
  redistribution_source?: boolean;
  territories?: string[];
  term?: string;
  attribution_required?: boolean;
  restrictions?: string[];
}

export interface PricingManifest {
  model: LicenseModel;
  price: number;
  currency: PricingCurrency;
  billing_period?: string; // monthly etc.
  usage_included?: string; // describes if usage included vs permission only
  revenue_share_pct?: number;
}

// ── Category-specific metadata (summarized) ─────────────────────────────────
export type CategoryMetadata =
  | TemplateMetadata | LutMetadata | MotionGraphicsMetadata | MusicSfxMetadata
  | AiModelMetadata | VoicePackMetadata | CompliancePackMetadata | WorkflowMetadata
  | AgentSkillMetadata | ExportPresetMetadata | BrandKitMetadata;

export interface TemplateMetadata {
  kind: "template";
  required_fonts?: string[];
  required_plugins?: string[];
  supported_resolutions?: string[];
  supported_frame_rates?: string[];
  color_space?: string;
  audio_layout?: string;
  caption_support?: boolean;
  brand_kit_slots?: string[];
  input_requirements?: string[];
  estimated_render_cost_cents?: number;
  licensed_stock?: string[];
  preview_only_media?: string[];
}

export interface LutMetadata {
  kind: "lut";
  lut_format: "cube" | "3dl" | "look" | "csp";
  input_color_space?: string;
  output_color_space?: string;
  log_profile?: string;
  camera_profile?: string;
  hdr_or_sdr?: "hdr" | "sdr" | "both";
  classification?: "technical" | "creative";
  aces_compatible?: boolean;
}

export interface MotionGraphicsMetadata {
  kind: "motion_graphics";
  package_types?: ("titles"|"lower_thirds"|"logo_animations"|"transitions"|"openers")[];
  required_fonts?: string[];
  font_licensing?: string;
  expression_runtime?: string;
  plugin_deps?: string[];
  external_urls?: string[];
  data_inputs?: string[];
  sandbox?: { filesystem:false; network:false; credential:false; cross_tenant:false };
}

export interface MusicSfxMetadata {
  kind: "music"|"sfx";
  rights_type: "royalty_free"|"rights_managed"|"subscription_only"|"per_project"|"editorial_only"|"public_domain"|"cc"|"ai_generated";
  sync_rights?: boolean;
  master_rights?: boolean;
  territories?: string[];
  term?: string;
  media_types?: string[];
  monetization?: boolean;
  paid_ads?: boolean;
  broadcast?: boolean;
  resale?: boolean;
  attribution?: boolean;
}

export interface AiModelMetadata {
  kind: "ai_model";
  purpose?: string;
  architecture?: string;
  weights_hash?: string;
  compute_requirements?: string;
  regions?: string[];
  private_inference?: boolean;
  input_limits?: string;
  commercial_inference?: boolean;
  no_training?: boolean;
  ai_bom?: AiBillOfMaterials;
}

export interface VoicePackMetadata {
  kind: "voice_pack";
  voice_owner?: string;
  identity_verification?: string;
  consent_document?: string;
  consent_scope?: string;
  permitted_languages?: string[];
  permitted_emotions?: string[];
  commercial_use?: boolean;
  territories?: string[];
  term?: string;
  revocation_terms?: string;
  restrictions?: { political?: boolean; adult?: boolean; impersonation?: boolean };
  usage_modes?: ("read_only"|"narration"|"character"|"enterprise_internal"|"public_advertising"|"dubbing")[];
}

export interface CompliancePackMetadata {
  kind: "compliance_pack";
  jurisdictions?: string[];
  regulations?: string[];
  effective_date?: string;
  review_date?: string;
  policy_owner?: string;
  evidence_requirements?: string[];
  limitations?: string[];
  human_review_required?: boolean;
  executable_rules?: string[];
}

export interface WorkflowMetadata {
  kind: "industry_workflow";
  project_schema?: string;
  roles?: string[];
  stages?: string[];
  approval_gates?: string[];
  required_metadata?: string[];
  ai_agents?: string[];
  export_presets?: string[];
  retention_behavior?: string;
}

export interface AgentSkillMetadata {
  kind: "agent_skill";
  actions?: string[];
  required_permissions?: string[];
  input_data?: string[];
  output_data?: string[];
  external_systems?: string[];
  network_access?: string;
  human_approval_points?: string[];
  max_cost_cents?: number;
  max_runtime_seconds?: number;
  failure_behavior?: string;
  rollback_behavior?: string;
  capability_manifest?: AgentCapabilityManifest;
  sandbox?: { tenant_isolation:true; resource_limits:true; network_policy:true; credential_isolation:true };
}

export interface AgentCapabilityManifest {
  skill_id: string;
  version: string;
  permissions: string[]; // read:timeline etc.
  prohibited: string[];
  network: { mode:"deny_by_default"|"allow"; allowed_domains:string[] };
  approval: { required_for:string[] };
}

export interface ExportPresetMetadata {
  kind: "export_preset";
  codec?: string;
  container?: string;
  resolution?: string;
  frame_rate?: string;
  bit_depth?: string;
  color_space?: string;
  hdr_format?: string;
  audio_format?: string;
  caption_behavior?: string;
  drm_settings?: string;
  destination?: string;
}

export interface BrandKitMetadata {
  kind: "brand_kit";
  logos?: string[];
  fonts?: string[];
  colors?: string[];
  luts?: string[];
  rules?: BrandKitRules;
}

export interface BrandKitRules {
  logo?: { approved_assets:string[]; minimum_clear_space:number; required_on_exports:boolean };
  fonts?: { approved:string[]; fallback:string };
  colors?: { primary:string[]; accent:string[] };
  export?: { required_presets:string[] };
}

// ── Address immutable identifier ────────────────────────────────────────────
export interface MarketplaceAddress {
  marketplace_item_id: string;
  publisher_id: string;
  item_type: MarketplaceItemType;
  product_slug: string;
  version: MarketplaceVersion;
  variant?: string;
  license_id?: string;
  content_hash?: string;
  uri?: string; // n0va://marketplace/lut/cinematic-warm/3.2.1
}

// ── Entitlement / installation ──────────────────────────────────────────────
export interface MarketplaceEntitlement {
  entitlement_id: string;
  item_id: string;
  version: string;
  tenant_id: string;
  project_id?: string;
  user_id?: string;
  license_id: string;
  purchased_at: string;
  expires_at?: string;
  seats?: number;
  projects_used?: number;
  status: "active" | "expired" | "revoked" | "quarantined";
  enforcement_mode: LicenseEnforcementMode;
  order_id?: string;
  receipt_url?: string;
}

export interface MarketplaceInstallation {
  installation_id: string;
  item_id: string;
  version: string;
  tenant_id: string;
  project_id?: string;
  installed_by: string;
  installed_at: string;
  status: "installed" | "pending_review" | "blocked" | "revoked" | "uninstalled";
  sandbox?: boolean;
  lockfile_entry?: MarketplaceLockEntry;
  provenance_attached?: boolean;
}

export interface MarketplaceLockEntry {
  item_id: string;
  slug: string;
  type: MarketplaceItemType;
  version: string;
  content_hash: string;
  installed_at: string;
}

export interface MarketplaceLockfile {
  project_id: string;
  marketplace_lock: Record<string, string>; // type → version
  entries: MarketplaceLockEntry[];
  pinned_at: string;
  updated_at: string;
}

// ── License enforcement context ─────────────────────────────────────────────
export interface LicenseValidationContext {
  tenant_id: string;
  project_id?: string;
  user_id?: string;
  territory?: string;
  media_type?: string;
  commercial?: boolean;
  destination?: string;
  seats?: number;
  impressions?: number;
}

export interface LicenseValidationResult {
  item_id: string;
  valid: boolean;
  decision: LicenseEnforcementMode;
  reason?: string;
  requires_approval?: boolean;
  quarantine?: boolean;
}

// ── Security scanning ───────────────────────────────────────────────────────
export interface SecurityScanResult {
  item_id: string;
  scan_id: string;
  status: SecurityManifest["scan_status"];
  badge: SecurityBadge;
  vulnerabilities: SecurityManifest["vulnerabilities"];
  last_scanned_at: string;
  scanner_version: string;
  blocked?: boolean;
}

// ── Compatibility ───────────────────────────────────────────────────────────
export interface CompatibilityCheckResult {
  item_id: string;
  level: CompatibilityLevel;
  n0va_version: string;
  issues: string[];
  requires_migration?: boolean;
  dependency_conflicts?: string[];
}

// ── Provenance / rights manifest ───────────────────────────────────────────
export interface RightsManifest {
  asset_id: string;
  track_title?: string;
  publisher_id?: string;
  license_id?: string;
  rights: RightsMatrix;
  territories?: string[];
  term?: string;
  attribution_required?: boolean;
  proof_url?: string;
  generated_at: string;
}

export interface ProvenanceManifestAttached {
  project_id: string;
  timeline_version?: string;
  export_id?: string;
  items_used: { item_id: string; version: string; license_id: string }[];
  models_used?: string[];
  voice_packs_used?: string[];
  c2pa_manifest?: string;
  generated_at: string;
}

// ── Revenue ─────────────────────────────────────────────────────────────────
export interface MarketplaceRevenueRecord {
  tenant_id: string;
  item_id: string;
  gross_cents: number;
  publisher_payout_cents: number;
  n0va_commission_cents: number;
  refunds_cents: number;
  tax_cents: number;
  currency: PricingCurrency;
  period: string; // YYYY-MM
}

// ── Publisher onboarding ────────────────────────────────────────────────────
export interface PublisherOnboarding {
  publisher_id: string;
  identity_verification: boolean;
  business_verification: boolean;
  tax_information: boolean;
  rights_attestation: boolean;
  security_agreement: boolean;
  content_policy: boolean;
  status: "pending" | "verified" | "rejected";
  certification?: CertificationLevel;
  risk_level?: "low" | "high";
  created_at: string;
}

// ── Review / moderation ─────────────────────────────────────────────────────
export interface MarketplaceReview {
  review_id: string;
  item_id: string;
  tenant_id: string;
  user_id: string;
  ratings: { creative_quality?: number; technical_reliability?: number; compatibility?: number; documentation?: number; support?: number; license_clarity?: number; performance?: number; security?: number };
  comment?: string;
  created_at: string;
}

// ── Audit ───────────────────────────────────────────────────────────────────
export interface MarketplaceAuditEvent {
  event_id: string;
  type: string; // marketplace.item.installed etc.
  tenant_id: string;
  project_id?: string;
  asset_id?: string;
  item_id: string;
  version: string;
  license_id?: string;
  publisher_id?: string;
  actor: string;
  correlation_id?: string;
  content_hash?: string;
  policy_decision?: string;
  timestamp: string;
}

// ── Search / discovery ──────────────────────────────────────────────────────
export interface MarketplaceSearchQuery {
  q?: string;
  category?: MarketplaceItemType;
  industry?: string;
  style?: string;
  resolution?: string;
  color_space?: string;
  language?: string;
  license_type?: string;
  commercial_use?: boolean;
  paid_advertising?: boolean;
  territory?: string;
  price_min?: number;
  price_max?: number;
  compatibility?: string;
  security_status?: SecurityBadge;
  publisher_verified?: boolean;
  ai_generated?: boolean;
  private_inference?: boolean;
  data_residency?: string;
  limit?: number;
}

export interface MarketplaceSearchResult {
  items: MarketplaceItemRecord[];
  total: number;
  facets?: Record<string, { value:string; count:number }[]>;
}

// ── Update channel ───────────────────────────────────────────────────────────
export interface UpdatePolicy {
  tenant_id: string;
  auto_update_patches?: boolean;
  approve_minor?: boolean;
  pin_major?: boolean;
  require_security_review?: boolean;
  block_publisher_updates?: boolean;
  channel?: UpdateChannel;
}
