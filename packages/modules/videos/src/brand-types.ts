/**
 * N0VA VIDEOS — Brand Intelligence Types
 * Executable brand policy → timeline analysis → findings/gates/waivers
 */
export type RuleSeverity = "low" | "medium" | "high" | "critical";
export type RuleKind = "hard" | "required" | "recommended" | "contextual" | "experimental";
export type BrandCategory = "logo" | "typography" | "color" | "voice" | "product" | "disclaimer" | "lower_third" | "music" | "visual_style" | "terminology" | "regional" | "graphics";

export type BrandRule = {
  rule_id: string; // logo.clearspace.primary
  category: BrandCategory;
  severity: RuleSeverity;
  kind: RuleKind;
  scope: string[]; // all_public_exports, en-IN etc.
  action: "block_export" | "require_waiver" | "suggest";
  description: string;
  source: { document: string; page: number; policy_version: string };
  regional_overrides?: { region: string; policy_version: string }[];
};

export type BrandPolicy = {
  brand_id: string;
  version: string; // 2026.08
  status: "draft" | "approved" | "archived";
  effective_from: string;
  effective_until: string | null;
  owners: string[];
  rules: BrandRule[];
  regional_overrides: { region: string; policy_version: string }[];
};

export type LogoAsset = {
  logo_id: string;
  asset_hash: string;
  allowed_backgrounds: string[];
  minimum_width_px: { digital_1080p: number; mobile_9x16: number };
  clearspace: { unit: "logo_height"; top: number; right: number; bottom: number; left: number };
  allow_distortion: boolean;
  allow_unapproved_color: boolean;
  allow_rotation: boolean;
  variants: string[];
  expiry?: string;
};

export type FontPolicy = {
  primary_family: string;
  approved_weights: number[];
  fallbacks: string[];
  minimum_size_px: { "1080p": number; "9x16": number };
  allowed_tracking_range: [number, number];
  allowed_line_height_range: [number, number];
  license_status: "approved" | "pending" | "unlicensed";
};

export type ColorPolicy = {
  primary: { hex: string; rgb: number[]; cmyk: number[]; lab: number[] };
  accent: { hex: string; contrast_on_primary: number };
  allowed_modes: string[];
  forbidden: string[];
};

export type PronunciationEntry = {
  term: string;
  locale: string;
  display: string;
  phonemes: string;
  ipa: string;
  must_not_be_pronounced_as: string[];
  priority: "high" | "medium" | "low";
};

export type DisclaimerRule = {
  rule_id: string;
  trigger: { terms: string[] };
  required_copy: string;
  placement: string;
  minimum_duration_ms: number;
  minimum_font_size_px: number;
  required_regions: string[];
  severity: RuleSeverity;
};

export type LowerThirdTemplate = {
  template_id: string;
  version: string;
  fields: {
    name: { required: boolean; max_characters: number; source: string };
    title: { required: boolean; max_characters: number; source: string };
  };
  rules: { logo: string; font: string; safe_anchor: string; caption_collision_policy: string };
};

export type TerminologyRule = {
  preferred: string;
  avoid: string[];
  context: string;
  severity: RuleSeverity;
  replacement?: string;
};

export type RegionalProfile = {
  region: string;
  locale: string;
  currency: string;
  decimal_style: string;
  required_disclaimers: string[];
  preferred_terms: Record<string, string>;
  voice: { pronunciation_dictionary: string };
  platform_profiles: string[];
};

export type BrandFinding = {
  finding_id: string;
  timeline_id: string;
  graph_version: string;
  rule_id: string;
  category: BrandCategory;
  severity: RuleSeverity;
  status: "open" | "waived" | "resolved" | "dismissed";
  scope: { region?: string; platform?: string };
  range: { start_ms: number; end_ms: number };
  evidence: Record<string, unknown>;
  explanation: string;
  source_reference: { document: string; page: number; policy_version: string };
  suggested_fixes: { type: string; parameters: Record<string, unknown> }[];
  export_effect: "block" | "warn" | "allow";
  confidence: number;
};

export type BrandGate = {
  gate_id: string;
  timeline_id: string;
  graph_version: string;
  export_profile: string;
  brand_policy: string;
  region: string;
  result: "blocked" | "ready" | "ready_with_warnings";
  summary: { critical: number; high: number; medium: number; low: number };
  blocking_findings: string[];
  evaluated_at: string;
};

export type BrandWaiver = {
  waiver_id: string;
  finding_id: string;
  rule_id: string;
  approved_by: string;
  reason: string;
  scope: { timeline_version?: string; platforms?: string[]; regions?: string[] };
  expires_at: string;
  audit_record: string;
};

export type BrandDashboard = {
  policy: string;
  region: string;
  output: string;
  summary: { critical: number; high: number; medium: number; low: number };
  by_category: Record<string, number>;
  export_status: "BLOCKED" | "READY" | "READY_WITH_WARNINGS";
  findings: BrandFinding[];
};

export type CompiledRuleProposal = {
  rule_id: string;
  description: string;
  source: { document: string; page: number };
  proposed_severity: RuleSeverity;
  proposed_action: string;
  status: "pending_approval" | "approved" | "rejected";
};
