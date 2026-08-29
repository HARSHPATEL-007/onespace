/**
 * N0VA VIDEOS — Brand Intelligence Engine
 * Compiler → Registries → Detectors → Findings → Gates → Waivers
 */
import type {
  BrandPolicy, BrandRule, LogoAsset, FontPolicy, ColorPolicy, PronunciationEntry, DisclaimerRule,
  LowerThirdTemplate, TerminologyRule, RegionalProfile, BrandFinding, BrandGate, BrandWaiver, BrandDashboard, CompiledRuleProposal,
} from "./brand-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }
function hash(s: string) { return `sha3-512:${s.slice(0, 32)}${Math.random().toString(36).slice(2, 6)}`; }

// ── Registries ─────────────────────────────────────────────────────────────
const policies = new Map<string, BrandPolicy>();
const logoRegistry = new Map<string, LogoAsset>();
const fontRegistry: FontPolicy = {
  primary_family: "N0VA Sans", approved_weights: [400, 500, 600, 700], fallbacks: ["Arial", "Noto Sans"],
  minimum_size_px: { "1080p": 42, "9x16": 38 }, allowed_tracking_range: [-10, 40], allowed_line_height_range: [0.95, 1.3], license_status: "approved",
};
const colorPolicy: ColorPolicy = {
  primary: { hex: "#142B4A", rgb: [20, 43, 74], cmyk: [73, 42, 0, 71], lab: [17, 0, -24] },
  accent: { hex: "#F2A900", contrast_on_primary: 5.8 }, allowed_modes: ["light", "dark"], forbidden: ["accent_on_white_for_small_text", "primary_with_unapproved_gradient"],
};
const pronunciationDict = new Map<string, PronunciationEntry>([
  ["N0VA|en-IN", { term: "N0VA", locale: "en-IN", display: "N0VA", phonemes: "NOH-vah", ipa: "/ˈnoʊ.və/", must_not_be_pronounced_as: ["N-zero-V-A", "nova with short o"], priority: "high" }],
]);
const disclaimerRegistry = new Map<string, DisclaimerRule>([
  ["legal.performance.claim_04", { rule_id: "legal.performance.claim_04", trigger: { terms: ["fastest", "number one", "guaranteed"] }, required_copy: "Based on internal testing under controlled conditions.", placement: "within_same_scene", minimum_duration_ms: 3000, minimum_font_size_px: 36, required_regions: ["IN", "US"], severity: "critical" }],
]);
const lowerThirdRegistry = new Map<string, LowerThirdTemplate>([
  ["lt_interview_v3", { template_id: "lt_interview_v3", version: "3.1", fields: { name: { required: true, max_characters: 32, source: "approved_person_registry" }, title: { required: true, max_characters: 48, source: "approved_role_registry" } }, rules: { logo: "logo_primary_horizontal", font: "N0VA Sans", safe_anchor: "bottom_left_16x9", caption_collision_policy: "move_up" } }],
]);
const terminologyRegistry: TerminologyRule[] = [{ preferred: "customers", avoid: ["users", "consumers"], context: "external_marketing", severity: "medium", replacement: "customers" }];
const regionalProfiles = new Map<string, RegionalProfile>([
  ["IN", { region: "IN", locale: "en-IN", currency: "INR", decimal_style: "indian", required_disclaimers: ["legal_claims_in_04"], preferred_terms: { support: "customer care" }, voice: { pronunciation_dictionary: "brand_en_in_v2" }, platform_profiles: ["youtube_india", "instagram_india"] }],
  ["US", { region: "US", locale: "en-US", currency: "USD", decimal_style: "us", required_disclaimers: [], preferred_terms: {}, voice: { pronunciation_dictionary: "brand_en_us_v2" }, platform_profiles: ["youtube", "broadcast"] }],
]);

const findings = new Map<string, BrandFinding>();
const waiversStore = new Map<string, BrandWaiver>();
const compiledProposals: CompiledRuleProposal[] = [];

// ── Seed registries ─────────────────────────────────────────────────────────
(function seed() {
  logoRegistry.set("logo_primary_horizontal", {
    logo_id: "logo_primary_horizontal", asset_hash: hash("logo_primary"), allowed_backgrounds: ["brand_white", "brand_navy", "approved_photo_low_detail"],
    minimum_width_px: { digital_1080p: 120, mobile_9x16: 96 }, clearspace: { unit: "logo_height", top: 1, right: 1, bottom: 1, left: 1 },
    allow_distortion: false, allow_unapproved_color: false, allow_rotation: false, variants: ["primary", "horizontal", "stacked", "monochrome", "reversed"],
  });
  const policy: BrandPolicy = {
    brand_id: "brand_nova_001", version: "2026.08", status: "approved", effective_from: "2026-08-01T00:00:00Z", effective_until: null,
    owners: ["brand_director_001", "legal_001"],
    rules: [
      { rule_id: "logo.clearspace.primary", category: "logo", severity: "high", kind: "hard", scope: ["all_public_exports"], action: "block_export", description: "Primary logo must maintain 1x logo-height clear space on all sides.", source: { document: "Brand Book v7", page: 18, policy_version: "2026.08" } },
      { rule_id: "typography.font.primary", category: "typography", severity: "medium", kind: "required", scope: ["all_public_exports"], action: "block_export", description: "Primary font must be N0VA Sans Semibold.", source: { document: "Brand Book v7", page: 24, policy_version: "2026.08" } },
      { rule_id: "color.primary.accuracy", category: "color", severity: "medium", kind: "required", scope: ["all_public_exports"], action: "require_waiver", description: "Primary color #142B4A must be within tolerance.", source: { document: "Brand Book v7", page: 32, policy_version: "2026.08" } },
      { rule_id: "voice.product_name.pronunciation", category: "voice", severity: "medium", kind: "required", scope: ["en-IN", "en-US"], action: "require_waiver", description: "N0VA must be pronounced NOH-vah.", source: { document: "Voice Guide", page: 12, policy_version: "2026.08" } },
      { rule_id: "product.nova-phone-2026.geometry", category: "product", severity: "high", kind: "hard", scope: ["all_public_exports"], action: "block_export", description: "Product nova-phone-2026 must have 2 lenses, correct color, logo placement within 8%.", source: { document: "Product Catalog", page: 7, policy_version: "2026.08" } },
      { rule_id: "legal.performance.claim_04", category: "disclaimer", severity: "critical", kind: "hard", scope: ["IN", "US"], action: "block_export", description: "Claims fastest/number one/guaranteed require disclaimer 3s 36px.", source: { document: "Legal Claims Guide", page: 11, policy_version: "2026.08" } },
      { rule_id: "lower_third.lt_interview_v3", category: "lower_third", severity: "medium", kind: "required", scope: ["all_public_exports"], action: "require_waiver", description: "Lower thirds must use lt_interview_v3 template.", source: { document: "Brand Book v7", page: 44, policy_version: "2026.08" } },
      { rule_id: "music.license.campaign_2026", category: "music", severity: "high", kind: "hard", scope: ["public_youtube", "broadcast"], action: "block_export", description: "Music must be licensed for campaign 2026 public/broadcast.", source: { document: "Sonic Guide", page: 9, policy_version: "2026.08" } },
      { rule_id: "visual_style.camera_motion", category: "visual_style", severity: "low", kind: "recommended", scope: ["all_public_exports"], action: "suggest", description: "Handheld shake must be within controlled motion profile.", source: { document: "Visual Style Guide", page: 15, policy_version: "2026.08" } },
      { rule_id: "terminology.external.customers", category: "terminology", severity: "medium", kind: "required", scope: ["external_marketing"], action: "require_waiver", description: "Use customers, not users/consumers.", source: { document: "Voice Guide", page: 22, policy_version: "2026.08" } },
    ],
    regional_overrides: [{ region: "IN", policy_version: "2026.08-IN" }],
  };
  policies.set(`${policy.brand_id}:${policy.version}`, policy);
})();

// ── Compiler — PDF/logo/font → structured pending rules ─────────────────────
export function compileBrandDocuments(input: { brandbook_v7?: string; regional_guide?: string; logo_files?: string[] }): CompiledRuleProposal[] {
  const proposals: CompiledRuleProposal[] = [
    { rule_id: "logo.clearspace.primary", description: "Primary logo must maintain 1x logo-height clear space on all sides.", source: { document: "Brand Book v7", page: 18 }, proposed_severity: "high", proposed_action: "block_export", status: "pending_approval" },
    { rule_id: "voice.product_name.pronunciation", description: "N0VA must be pronounced NOH-vah, not N-zero-V-A.", source: { document: "Voice Guide", page: 12 }, proposed_severity: "medium", proposed_action: "require_waiver", status: "pending_approval" },
  ];
  compiledProposals.push(...proposals);
  return proposals;
}
export function approveCompiledRule(rule_id: string, approver: string): CompiledRuleProposal | null {
  const p = compiledProposals.find(x => x.rule_id === rule_id);
  if (!p) return null;
  p.status = "approved";
  // promote to policy (mock)
  const policy = policies.get("brand_nova_001:2026.08");
  if (policy && !policy.rules.some(r => r.rule_id === rule_id)) {
    policy.rules.push({ rule_id, category: "logo", severity: p.proposed_severity as never, kind: "hard", scope: ["all_public_exports"], action: "block_export", description: p.description, source: { document: p.source.document, page: p.source.page, policy_version: "2026.08" } });
  }
  return p;
}
export function listCompiledProposals(): CompiledRuleProposal[] { return [...compiledProposals]; }

// ── Policy access ───────────────────────────────────────────────────────────
export function getPolicy(brandId: string, version: string): BrandPolicy | null { return policies.get(`${brandId}:${version}`) ?? null; }
export function listPolicies(): BrandPolicy[] { return Array.from(policies.values()); }
export function createPolicy(input: { brand_id: string; version: string; owners?: string[] }): BrandPolicy {
  const p: BrandPolicy = { brand_id: input.brand_id, version: input.version, status: "draft", effective_from: nowIso(), effective_until: null, owners: input.owners ?? ["brand_director_001"], rules: [], regional_overrides: [] };
  policies.set(`${p.brand_id}:${p.version}`, p);
  return p;
}

// ── Detectors ───────────────────────────────────────────────────────────────
function baseFinding(partial: Partial<BrandFinding> & { rule_id: string; category: BrandFinding["category"]; range: BrandFinding["range"] }): BrandFinding {
  const rule = findRule(partial.rule_id);
  return {
    finding_id: uid("bf"),
    timeline_id: "tl001",
    graph_version: "gv42",
    rule_id: partial.rule_id,
    category: partial.category,
    severity: (partial.severity as BrandFinding["severity"]) ?? rule?.severity ?? "medium",
    status: "open",
    scope: partial.scope ?? {},
    range: partial.range,
    evidence: partial.evidence ?? {},
    explanation: partial.explanation ?? rule?.description ?? "Brand rule violation",
    source_reference: partial.source_reference ?? rule?.source ?? { document: "Brand Book v7", page: 18, policy_version: "2026.08" },
    suggested_fixes: partial.suggested_fixes ?? [],
    export_effect: (rule?.severity === "critical" || rule?.severity === "high") ? "block" : "warn",
    confidence: partial.confidence ?? 0.92,
  };
}
function findRule(rule_id: string): BrandRule | undefined {
  for (const p of policies.values()) { const r = p.rules.find(x => x.rule_id === rule_id); if (r) return r; }
  return undefined;
}

export function detectLogos(timelineId = "tl001"): BrandFinding[] {
  return [
    baseFinding({
      rule_id: "logo.clearspace.primary", category: "logo", severity: "high", range: { start_ms: 4200, end_ms: 8600 },
      evidence: { detected_logo_id: "logo_primary_horizontal", clearspace_left: 0.42, required_clearspace: 1.0, confidence: 0.97, clearspace_right: 0.42, left_px: 12, required_px: 34 },
      explanation: "The primary logo has less than the required clear space on its left edge.",
      source_reference: { document: "Brand Book v7", page: 18, policy_version: "2026.08" },
      suggested_fixes: [{ type: "move_graphic", parameters: { x_delta_px: -34 } }, { type: "scale_graphic", parameters: { scale_delta: -0.06 } }, { type: "use_safe_anchor" as never, parameters: { anchor: "safe_area" } }],
      scope: { platform: "instagram_reels" }, confidence: 0.97,
    }),
    baseFinding({
      rule_id: "logo.clearspace.primary", category: "logo", severity: "high", range: { start_ms: 12000, end_ms: 19400 },
      evidence: { detected_logo_id: "logo_primary_horizontal", overflow_platform: "instagram_reels_9x16", edge: "right", overflow_percent: 4.8, confidence: 0.91 },
      explanation: "Logo cropped by platform output 9:16 right 4.8%.",
      suggested_fixes: [{ type: "move_to_safe_anchor", parameters: {} }],
      scope: { platform: "instagram_reels" },
    }),
  ];
}

export function detectFonts(): BrandFinding[] {
  return [
    baseFinding({
      rule_id: "typography.font.primary", category: "typography", severity: "medium", range: { start_ms: 18000, end_ms: 22500 },
      evidence: { detected: "Helvetica Neue Bold", approved: "N0VA Sans Semibold", confidence: 0.94 },
      explanation: "Unapproved font Helvetica Neue Bold detected, approved is N0VA Sans Semibold.",
      suggested_fixes: [{ type: "replace_font", parameters: { font: "N0VA Sans Semibold", preserve_dimensions: true } }],
    }),
  ];
}

export function detectColors(): BrandFinding[] {
  return [
    baseFinding({
      rule_id: "color.primary.accuracy", category: "color", severity: "medium", range: { start_ms: 32000, end_ms: 38000 },
      evidence: { detected_hex: "#14304F", approved_hex: "#142B4A", delta_e: 3.2, confidence: 0.88 },
      explanation: "Logo and title color mismatch — detected #14304F vs approved #142B4A delta 3.2, may be color-management conversion vs brand mismatch.",
      suggested_fixes: [{ type: "revert_to_brand_color", parameters: {} }],
    }),
  ];
}

export function detectVoice(): BrandFinding[] {
  return [
    baseFinding({
      rule_id: "voice.product_name.pronunciation", category: "voice", severity: "medium", range: { start_ms: 72440, end_ms: 73280 },
      evidence: { detected_pronunciation: "N-zero-V-A", required_pronunciation: "NOH-vah", locale: "en-IN", phonemes: "NOH-vah", confidence: 0.92 },
      explanation: "Detected pronunciation “N-zero-V-A” required is “NOH-vah” for locale en-IN.",
      suggested_fixes: [{ type: "regenerate_sentence", parameters: { phonetic: "NOH-vah" } }],
      scope: { region: "IN" },
    }),
  ];
}

export function detectProducts(): BrandFinding[] {
  return [
    baseFinding({
      rule_id: "product.nova-phone-2026.geometry", category: "product", severity: "high", range: { start_ms: 36000, end_ms: 40200 },
      evidence: { camera_module_lenses: 3, approved_lenses: 2, color_delta: 0.08, logo_placement_diff_percent: 8, confidence: 0.89 },
      explanation: "Camera module has three lenses; approved model has two. Product color outside tolerance. Logo placement differs by 8%.",
      suggested_fixes: [{ type: "replace_with_anchor", parameters: { anchor: "nova-phone-2026" } }],
    }),
  ];
}

export function detectDisclaimers(transcript = "This is the fastest product guaranteed"): BrandFinding[] {
  const hasClaim = /(fastest|number one|guaranteed)/i.test(transcript);
  if (!hasClaim) return [];
  return [
    baseFinding({
      rule_id: "legal.performance.claim_04", category: "disclaimer", severity: "critical", range: { start_ms: 48600, end_ms: 52200 },
      evidence: { trigger_terms: ["fastest", "guaranteed"], required_copy: "Based on internal testing under controlled conditions.", placement: "within_same_scene", required_duration_ms: 3000, detected_duration_ms: 0, confidence: 0.95 },
      explanation: "Required disclaimer missing for claim fastest/guaranteed. Must be within same scene 3s 36px.",
      source_reference: { document: "Legal Claims Guide", page: 11, policy_version: "2026.08" },
      suggested_fixes: [{ type: "add_disclaimer", parameters: { copy: "Based on internal testing under controlled conditions.", duration_ms: 3000, font_size_px: 36 } }],
      scope: { region: "IN" },
    }),
  ];
}

export function detectLowerThirds(): BrandFinding[] {
  return [
    baseFinding({
      rule_id: "lower_third.lt_interview_v3", category: "lower_third", severity: "medium", range: { start_ms: 32000, end_ms: 38000 },
      evidence: { detected_speaker: "person_044", approved_title: "VP Marketing", on_screen_text: "Anita Rao — Chief Marketing Officer", confidence: 0.94 },
      explanation: "Lower third title mismatch vs approved registry.",
      suggested_fixes: [{ type: "replace_from_registry", parameters: {} }],
    }),
  ];
}

export function detectMusic(): BrandFinding[] {
  return [
    baseFinding({
      rule_id: "music.license.campaign_2026", category: "music", severity: "high", range: { start_ms: 0, end_ms: 180000 },
      evidence: { detected_track: "Corporate Pulse 04", license: "internal review only", export_target: "public YouTube and broadcast", confidence: 0.93 },
      explanation: "Music license scope internal review only, export target public YouTube and broadcast requires expanded license.",
      suggested_fixes: [{ type: "replace_track", parameters: { track: "Corporate Pulse 07" } }, { type: "request_license", parameters: {} }],
      scope: { platform: "youtube" },
    }),
  ];
}

export function detectVisualStyle(): BrandFinding[] {
  return [
    baseFinding({
      rule_id: "visual_style.camera_motion", category: "visual_style", severity: "low", range: { start_ms: 124000, end_ms: 128000 },
      evidence: { observation: "handheld shake exceeds controlled motion profile", confidence: 0.72 },
      explanation: "Handheld shake exceeds approved controlled motion profile.",
      suggested_fixes: [{ type: "stabilize_42pct", parameters: { amount: 0.42 } }, { type: "replace_with_smooth_take", parameters: {} }],
    }),
  ];
}

export function detectTerminology(): BrandFinding[] {
  return [
    baseFinding({
      rule_id: "terminology.external.customers", category: "terminology", severity: "medium", range: { start_ms: 22100, end_ms: 24700 },
      evidence: { detected: "users", preferred: "customers", context: "external_marketing", confidence: 0.88 },
      explanation: "Detected “users” preferred term is “customers” for external marketing.",
      suggested_fixes: [{ type: "replace_terminology", parameters: { from: "users", to: "customers" } }],
      scope: { region: "IN" },
    }),
  ];
}

export function detectRegional(region = "IN"): BrandFinding[] {
  const profile = regionalProfiles.get(region);
  if (!profile) return [];
  // Example: price in USD vs INR
  return [
    baseFinding({
      rule_id: "regional.currency.display", category: "regional", severity: "medium", range: { start_ms: 42000, end_ms: 8600 } as unknown as BrandFinding["range"],
      evidence: { detected_currency: "USD", required_currency: profile.currency, required_disclaimers: profile.required_disclaimers, confidence: 0.91 },
      explanation: `Regional override India requires INR and tax wording, current lower third displays USD.`,
      suggested_fixes: [{ type: "replace_currency", parameters: { currency: profile.currency } }],
      scope: { region },
    }),
  ];
}

// ── Aggregator ─────────────────────────────────────────────────────────────
export function runBrandScan(input: { timeline_id?: string; graph_version?: string; region?: string; platforms?: string[]; checks?: string[]; transcript?: string }): BrandFinding[] {
  const checks = input.checks ?? ["logos", "fonts", "colors", "voice", "products", "disclaimers", "lower_thirds", "music", "terminology", "regional_rules"];
  const out: BrandFinding[] = [];
  if (checks.includes("logos")) out.push(...detectLogos(input.timeline_id));
  if (checks.includes("fonts")) out.push(...detectFonts());
  if (checks.includes("colors")) out.push(...detectColors());
  if (checks.includes("voice")) out.push(...detectVoice());
  if (checks.includes("products")) out.push(...detectProducts());
  if (checks.includes("disclaimers")) out.push(...detectDisclaimers(input.transcript as string | undefined));
  if (checks.includes("lower_thirds")) out.push(...detectLowerThirds());
  if (checks.includes("music")) out.push(...detectMusic());
  if (checks.includes("terminology")) out.push(...detectTerminology());
  if (checks.includes("regional_rules") && input.region) out.push(...detectRegional(input.region));
  if (checks.includes("visual_style")) out.push(...detectVisualStyle());
  // attach timeline/graph
  for (const f of out) { f.timeline_id = input.timeline_id ?? "tl001"; f.graph_version = input.graph_version ?? "gv42"; if (input.region) f.scope.region = input.region; }
  // store
  for (const f of out) findings.set(f.finding_id, f);
  return out;
}

export function getBrandFindings(timelineId?: string, opts?: { region?: string; platform?: string; category?: string; severity?: string }): BrandFinding[] {
  let all = Array.from(findings.values());
  if (timelineId) all = all.filter(f => f.timeline_id === timelineId);
  if (opts?.region) all = all.filter(f => !f.scope.region || f.scope.region === opts.region);
  if (opts?.platform) all = all.filter(f => !f.scope.platform || f.scope.platform === opts.platform);
  if (opts?.category) all = all.filter(f => f.category === opts.category);
  if (opts?.severity) all = all.filter(f => f.severity === opts.severity);
  return all;
}
export function getBrandFinding(findingId: string): BrandFinding | null { return findings.get(findingId) ?? null; }
export function clearBrandStores(): void { findings.clear(); waiversStore.clear(); }

export function explainFinding(findingId: string): { rule: string; source: string; evidence: string; affected: string; confidence: number; fix: string } | null {
  const f = findings.get(findingId);
  if (!f) return null;
  return {
    rule: `${f.rule_id} — ${f.explanation}`,
    source: `${f.source_reference.document} page ${f.source_reference.page} v${f.source_reference.policy_version}`,
    evidence: JSON.stringify(f.evidence).slice(0, 200),
    affected: `${f.timeline_id} ${f.range.start_ms}-${f.range.end_ms} graph ${f.graph_version} platform ${f.scope.platform ?? "master"}`,
    confidence: f.confidence,
    fix: f.suggested_fixes[0]?.type ?? "manual",
  };
}

export function generateProposal(findingId: string, preserve: string[] = []): { proposal_id: string; finding_id: string; operation: string; requires_approval: boolean } | null {
  const f = findings.get(findingId);
  if (!f) return null;
  return { proposal_id: uid("prop"), finding_id: findingId, operation: f.suggested_fixes[0]?.type ?? "fix", requires_approval: f.severity === "high" || f.severity === "critical" };
}

// ── Dashboard & gate ───────────────────────────────────────────────────────
export function getBrandDashboard(timelineId = "tl001", region = "IN", output = "youtube_4k_hdr"): BrandDashboard {
  const all = getBrandFindings(timelineId);
  const by_category: Record<string, number> = {};
  for (const f of all) by_category[f.category] = (by_category[f.category] ?? 0) + 1;
  const summary = {
    critical: all.filter(f => f.severity === "critical").length,
    high: all.filter(f => f.severity === "high").length,
    medium: all.filter(f => f.severity === "medium").length,
    low: all.filter(f => f.severity === "low").length,
  };
  const blocked = summary.critical > 0 || summary.high > 0;
  return {
    policy: "N0VA Brand 2026.08",
    region, output,
    summary, by_category,
    export_status: blocked ? "BLOCKED" : "READY",
    findings: all,
  };
}

export function evaluateBrandGate(input: { timeline_id: string; graph_version: string; export_profile: string; brand_policy: string; region: string }): BrandGate {
  const findingsForTimeline = getBrandFindings(input.timeline_id, { region: input.region });
  // apply waivers: if waived and not expired and scope matches, exclude
  const activeFindings = findingsForTimeline.filter(f => {
    const w = Array.from(waiversStore.values()).find(wv => wv.finding_id === f.finding_id && wv.scope.regions?.includes(input.region) !== false);
    if (!w) return true;
    if (new Date(w.expires_at).getTime() < Date.now()) return true;
    return false;
  });
  const summary = {
    critical: activeFindings.filter(f => f.severity === "critical").length,
    high: activeFindings.filter(f => f.severity === "high").length,
    medium: activeFindings.filter(f => f.severity === "medium").length,
    low: activeFindings.filter(f => f.severity === "low").length,
  };
  const blocking = activeFindings.filter(f => f.severity === "critical" || f.severity === "high").map(f => f.finding_id);
  return {
    gate_id: uid("gate"),
    timeline_id: input.timeline_id,
    graph_version: input.graph_version,
    export_profile: input.export_profile,
    brand_policy: input.brand_policy,
    region: input.region,
    result: blocking.length ? "blocked" : "ready",
    summary, blocking_findings: blocking,
    evaluated_at: nowIso(),
  };
}

export function createWaiver(input: { finding_id: string; approved_by: string; reason: string; scope?: BrandWaiver["scope"]; expires_at?: string }): BrandWaiver {
  const finding = findings.get(input.finding_id);
  if (!finding) throw new Error("Finding not found");
  const w: BrandWaiver = {
    waiver_id: uid("waiver"), finding_id: input.finding_id, rule_id: finding.rule_id, approved_by: input.approved_by, reason: input.reason,
    scope: input.scope ?? {}, expires_at: input.expires_at ?? "2026-12-31T23:59:59Z", audit_record: `audit:${hash(input.reason)}`,
  };
  waiversStore.set(w.waiver_id, w);
  // mark finding waived
  finding.status = "waived";
  return w;
}
export function listWaivers(): BrandWaiver[] { return Array.from(waiversStore.values()); }
export function getWaiver(waiverId: string): BrandWaiver | null { return waiversStore.get(waiverId) ?? null; }

// ── Registries access ──────────────────────────────────────────────────────
export function getLogoRegistry(): Map<string, LogoAsset> { return logoRegistry; }
export function getFontPolicy(): FontPolicy { return fontRegistry; }
export function getColorPolicy(): ColorPolicy { return colorPolicy; }
export function getRegionalProfile(region: string): RegionalProfile | null { return regionalProfiles.get(region) ?? null; }
export function listDisclaimerRules(): DisclaimerRule[] { return Array.from(disclaimerRegistry.values()); }
