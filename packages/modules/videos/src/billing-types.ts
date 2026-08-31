/**
 * N0VA VIDEOS — Billing Types (Usage-Based Billing)
 * Subscription entitlements + transparent metered billing
 * Every charge includes: metric/quantity/unit/rate/currency/period/resource/tenant/project/asset/region/provider/pricing_version
 * Immutable ledger — corrections via adjustments. Versioned pricing.
 */

export type MeterKey =
  | "stored_media_gb_hours" | "stored_media_gb_days" | "stored_media_gb_months"
  | "stored_logical_gb_days" | "stored_physical_gb_days" | "stored_derived_gb_days" | "stored_replica_gb_days"
  | "stored_hot_gb_days" | "stored_warm_gb_days" | "stored_cool_gb_days" | "stored_cold_gb_days" | "stored_frozen_gb_days" | "stored_cryogenic_gb_days"
  | "egress_cdn_gb" | "egress_origin_gb" | "egress_inter_region_gb" | "egress_internet_gb" | "egress_private_gb" | "egress_bytes"
  | "egress_cdn_cache_gb" | "egress_downloads" | "watch_hours"
  | "gpu_render_seconds" | "gpu_render_minutes" | "gpu_render_hours" | "gpu_wall_seconds" | "gpu_active_seconds"
  | "ai_inference_minutes" | "ai_processed_video_minutes" | "ai_processed_audio_minutes" | "ai_frame_batches" | "ai_tokens" | "ai_gpu_seconds"
  | "ai_preview_minutes" | "ai_premium_minutes" | "ai_private_minutes"
  | "transcription_minutes" | "transcription_diarized_minutes" | "transcription_translated_minutes" | "transcription_premium_minutes"
  | "generated_video_seconds" | "generated_video_weighted_seconds" | "generated_image_frames" | "generated_audio_seconds" | "voice_cloned_seconds" | "lip_synced_seconds"
  | "live_ingest_hours" | "live_processing_hours" | "live_output_hours" | "live_input_feed_hours" | "live_destination_hours" | "live_caption_minutes" | "live_production_hour"
  | "premium_model_requests" | "premium_transcription_minutes" | "premium_generative_seconds"
  | "archive_retrieval_requests" | "archive_restored_gb" | "archive_staging_gb_days" | "archive_egress_gb" | "archive_expedited_fee"
  | "drm_packaging_ops" | "drm_license_issuance" | "drm_key_rotation" | "watermark_embed_ops" | "watermark_verify_ops" | "secure_playback_minutes";

export type BillingUnit =
  | "GB-hours" | "GB-days" | "GB-months" | "GB" | "TB" | "bytes"
  | "GPU-seconds" | "GPU-minutes" | "GPU-hours" | "GPU-ms"
  | "inference-minutes" | "video-minutes" | "audio-minutes"
  | "requests" | "operations" | "licenses" | "sessions" | "minutes" | "hours" | "seconds" | "frames" | "tokens";

export type Currency = "USD" | "EUR" | "INR" | "GBP" | "JPY";
export type Region = string; // eu-west-1 etc.
export type PricingVersion = string; // 2026-08-01

export interface Rate {
  meter: MeterKey;
  unit: BillingUnit;
  rate_cents: number; // per unit
  currency: Currency;
  tier_multiplier?: Record<string, number>; // e.g. hot: 1.0, cryogenic: 0.1
  complexity_multipliers?: Record<string, number>; // 4K: 2.5, HDR: 1.3
}

export interface RateCard {
  rate_card_id: string;
  pricing_version: PricingVersion;
  currency: Currency;
  region: Region;
  plan: import("./entitlement-types").VideoTier | "all";
  effective_from: string; // ISO
  effective_until?: string;
  rates: Partial<Record<MeterKey, Rate>>;
  description?: string;
}

export type UsageKind = "actual" | "estimated" | "included" | "reserved" | "adjustment" | "credit";
export type PricingSource = "internal" | "cloud_provider" | "cdn_provider" | "ai_provider" | "gpu_scheduler";

export interface UsageEvent {
  usage_id: string;
  idempotency_key: string; // usage:render_0077:attempt_2 — duplicate prevention
  tenant_id: string;
  workspace_id?: string;
  project_id?: string;
  asset_id?: string;
  job_id?: string;
  meter: MeterKey;
  quantity: number;
  unit: BillingUnit;
  rate_cents: number; // snapshot
  cost_cents: number;
  currency: Currency;
  pricing_version: PricingVersion;
  region: Region;
  provider?: string;
  period: string; // YYYY-MM
  causation_id?: string;
  correlation_id?: string;
  schema_version: string;
  recorded_at: string;
  kind: UsageKind;
  adjustment_for?: string; // original usage_id if correction
  metadata?: Record<string, unknown>;
}

export interface NormalizedUsage {
  internal_quantity: number;
  internal_unit: BillingUnit;
  display_quantity: number;
  display_unit: BillingUnit;
  invoice_quantity: number;
  invoice_unit: BillingUnit;
}

export type EstimateOperation =
  | "high_resolution_export" | "gpu_render" | "ai_inference" | "transcription" | "generated_media" | "live_production" | "archive_retrieval" | "drm_package" | "bulk_download" | "egress_delivery";

export interface EstimateRequest {
  operation: EstimateOperation;
  tenant_id: string;
  project_id?: string;
  asset_ids?: string[];
  input_duration_seconds?: number;
  input_size_bytes?: number;
  model_id?: string;
  model_version?: string;
  premium?: boolean;
  resolution?: string; // 4K etc.
  codec?: string;
  destinations?: string[];
  region?: Region;
  pricing_version?: PricingVersion;
  currency?: Currency;
}

export interface EstimateLineItem {
  name: string;
  meter: MeterKey;
  quantity: number;
  unit: BillingUnit;
  rate_cents: number;
  cost_cents: number;
  included_quantity?: number; // plan included
}

export interface EstimateResponse {
  estimate_id: string;
  operation: EstimateOperation;
  expires_at: string;
  currency: Currency;
  pricing_version: PricingVersion;
  region: Region;
  included: Partial<Record<string, number>>; // plan included usage
  estimated_usage: Partial<Record<string, number>>;
  estimated_cost: { low_cents: number; expected_cents: number; high_cents: number; confidence: number };
  line_items: EstimateLineItem[];
  requires_confirmation: boolean;
  budget_reserved_cents?: number;
  variance_notes?: string[];
}

export type BudgetScope = "organization" | "tenant" | "workspace" | "project" | "user" | "agent" | "job";
export type BudgetPeriod = "daily" | "monthly" | "quarterly" | "annual" | "per_job";
export type BudgetAction = "notify_owner" | "require_project_admin_approval" | "block_new_premium_usage" | "block_all" | "fallback_to_standard" | "notify_finance";
export type BudgetEnforcement = "soft" | "hard";

export interface BudgetThreshold {
  percentage: number; // 50, 80, 100
  action: BudgetAction;
}

export interface BudgetPolicy {
  budget_id: string;
  scope: BudgetScope;
  scope_id: string; // project_id etc.
  tenant_id: string;
  currency: Currency;
  period: BudgetPeriod;
  limit_cents: number;
  enforcement: BudgetEnforcement;
  thresholds: BudgetThreshold[];
  allowed_fallbacks?: string[]; // standard_model, proxy_export etc.
  per_operation_cap_cents?: number;
  hard_cap_cents?: number;
  created_at: string;
  updated_at: string;
}

export interface BudgetState {
  budget_id: string;
  consumed_cents: number;
  reserved_cents: number;
  remaining_cents: number;
  projected_cents: number;
  utilization_pct: number;
  threshold_breached?: BudgetThreshold;
  blocked: boolean;
}

export interface BudgetReservation {
  reservation_id: string;
  estimate_id: string;
  budget_id: string;
  tenant_id: string;
  amount_cents: number;
  expires_at: string;
  status: "reserved" | "released" | "charged" | "expired";
  created_at: string;
}

export interface InvoiceLineItem {
  meter: MeterKey;
  description: string;
  quantity: number;
  unit: BillingUnit;
  rate_cents: number;
  cost_cents: number;
  included_quantity?: number;
  overage_quantity?: number;
}

export interface Invoice {
  invoice_id: string;
  tenant_id: string;
  period: string; // YYYY-MM
  currency: Currency;
  pricing_version: PricingVersion;
  line_items: InvoiceLineItem[];
  subtotal_cents: number;
  discount_cents: number;
  credit_cents: number;
  total_cents: number;
  status: "draft" | "finalized" | "paid" | "void" | "adjusted";
  finalized_at?: string;
  adjustments?: UsageEvent[]; // credit/debit records
}

export interface CreditRecord {
  credit_id: string;
  tenant_id: string;
  original_usage_id?: string;
  invoice_id?: string;
  amount_cents: number;
  currency: Currency;
  reason: string;
  incident_id?: string;
  approved_by?: string;
  expires_at?: string;
  created_at: string;
}

export interface JobCostView {
  job_id: string;
  operation: string;
  estimated_cost_cents?: number;
  reserved_cents?: number;
  actual_cost_cents: number;
  variance_cents: number;
  variance_pct: number;
  breakdown: InvoiceLineItem[];
  retry_cost_cents: number;
  included_consumed: Partial<Record<string, number>>;
  budget_impact?: BudgetState;
}

export interface UsageDashboard {
  period: string;
  tenant_id: string;
  current_cost_cents: number;
  projected_cost_cents: number;
  included: Record<string, { included: number; consumed: number; reserved: number; remaining: number; overage_rate_cents: number }>;
  top_drivers: { meter: MeterKey; cost_cents: number; pct: number }[];
  by_project: { project_id: string; cost_cents: number }[];
  by_meter: { meter: MeterKey; cost_cents: number }[];
  by_model?: { model_id: string; cost_cents: number }[];
  by_region?: { region: string; cost_cents: number }[];
}

export type BillingEventType =
  | "billing.usage.recorded" | "billing.usage.reserved" | "billing.usage.released"
  | "billing.estimate.created" | "billing.estimate.approved" | "billing.estimate.expired"
  | "billing.budget.threshold.reached" | "billing.budget.exceeded"
  | "billing.usage.adjusted" | "billing.invoice.finalized" | "billing.credit.issued";

export interface BillingEvent {
  type: BillingEventType;
  tenant: { id: string };
  project?: { id: string };
  entity?: { type: string; id: string };
  causation_id: string;
  correlation_id: string;
  idempotency_key: string;
  schema_version: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export type ReconciliationState = "matched" | "under_review" | "missing_provider" | "missing_internal" | "rate_mismatch" | "duplicate" | "pending_adjustment";
export interface ReconciliationRecord {
  internal_usage_id: string;
  provider_record_id?: string;
  provider: PricingSource;
  state: ReconciliationState;
  variance_cents?: number;
  notes?: string;
}

export type MeteredDimension = "stored_media" | "egress" | "gpu_render" | "ai_inference" | "transcription" | "generated_media" | "live_stream" | "premium_model" | "archive_retrieval" | "drm_watermark";

export type BillingMode = "monthly_subscription"|"usage_overage"|"prepaid_credits"|"enterprise_commitment"|"purchase_orders";
export interface BillingAccount {
  tenant_id: string;
  mode: BillingMode;
  prepaid_balance_cents: number;
  hard_cap_cents?: number;
  soft_cap_cents?: number;
  currency: Currency;
}
