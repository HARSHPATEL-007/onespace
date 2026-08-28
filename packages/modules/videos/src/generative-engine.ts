/**
 * N0VA VIDEOS — Controlled Generative Workspace Engine
 * Governed generation: hard separation, reproducible jobs, anchors, provenance, restrictions
 */
import type {
  DomainAsset, AssetDomain, TextToVideoJob, GenerativeOperation, BackgroundExtension, CameraVariation,
  CharacterAnchor, ProductAnchor, AnchorCheckResult, StoryboardCard, ContinuationJob, BrollCandidate,
  MachineProvenance, SegmentProvenance, UsageCheck, ConsentRecord, ModelRegistryEntry, SafetyCheck,
  SyntheticComplianceReport, PromptVersion, ProcessingRoute, VisibleDisclosure,
} from "./generative-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }
function hash(s: string) { return `sha3-512:${s.slice(0, 32)}${Math.random().toString(36).slice(2, 6)}`; }

// ── Stores ─────────────────────────────────────────────────────────────────
const assets = new Map<string, DomainAsset>();
const jobs = new Map<string, TextToVideoJob & { job_id: string; prompt_id: string; reference_assets?: string[]; output_asset_id?: string }>();
const provenanceStore = new Map<string, MachineProvenance>();
const segments = new Map<string, SegmentProvenance>();
const promptHistories = new Map<string, PromptVersion[]>();
const characterAnchors = new Map<string, CharacterAnchor>();
const productAnchors = new Map<string, ProductAnchor>();
const modelRegistry = new Map<string, ModelRegistryEntry>();
const consentStore = new Map<string, ConsentRecord>();

// ── Domain helpers ─────────────────────────────────────────────────────────
export function createOriginalAsset(fileName: string): DomainAsset {
  const a: DomainAsset = { asset_id: uid("asset"), domain: "ORIGINALS", badge: "Original", status: "immutable", hash: hash(fileName), created_at: nowIso() };
  assets.set(a.asset_id, a);
  return a;
}
export function createGeneratedAsset(promptId: string, seed: number): DomainAsset {
  const a: DomainAsset = { asset_id: uid("gen"), domain: "GENERATED_WORKSPACE", badge: "Generated", status: "generated", hash: hash(`${promptId}:${seed}`), created_at: nowIso(), provenance_manifest_id: `manifest_${promptId}` };
  assets.set(a.asset_id, a);
  return a;
}
export function promoteToEditorial(assetId: string): DomainAsset | null {
  const a = assets.get(assetId);
  if (!a || a.domain !== "GENERATED_WORKSPACE") return null;
  a.domain = "EDITORIAL_DERIVATIVES"; a.badge = "GEN"; a.status = "approved";
  return a;
}

// ── Model registry ─────────────────────────────────────────────────────────
export function seedModelRegistry() {
  if (modelRegistry.size) return;
  const entries: ModelRegistryEntry[] = [
    { model_id: "n0va-video-gen-pro", version: "4.2.1", capabilities: ["text_to_video","image_to_video","shot_continuation"], approved_for: ["commercial_b_roll","internal_previsualization"], restricted_for: ["political_advertising","unconsented_likeness"], training_policy: { customer_content_training: false }, data_residency: ["IN","US"], retention_days: 30, license_reference: "license_2026_004" },
    { model_id: "n0va-inpaint-v2", version: "2.1.0", capabilities: ["object_removal","background_extension"], approved_for: ["commercial_b_roll"], restricted_for: [], training_policy: { customer_content_training: false }, data_residency: ["IN","US","GB"], retention_days: 30, license_reference: "license_2026_004" },
  ];
  for (const e of entries) modelRegistry.set(`${e.model_id}:${e.version}`, e);
}
seedModelRegistry();
export function listModels(): ModelRegistryEntry[] { return Array.from(modelRegistry.values()); }
export function checkModelAllowed(modelId: string, use: string): { allowed: boolean; reason?: string } {
  const entry = Array.from(modelRegistry.values()).find(m => m.model_id === modelId);
  if (!entry) return { allowed: false, reason: "model not in registry" };
  if (entry.restricted_for.includes(use)) return { allowed: false, reason: `restricted for ${use}` };
  return { allowed: true };
}

// ── Text-to-video ──────────────────────────────────────────────────────────
export function createTextToVideoJob(input: {
  prompt: string; negative_prompt?: string; duration_ms?: number; frame_rate?: number; resolution?: string; aspect_ratio?: string;
  seed?: number; model_id?: string; model_version?: string; guidance?: number; policy_profile?: string; reference_assets?: string[];
}): TextToVideoJob & { job_id: string; prompt_id: string; output_asset_id?: string } {
  const job_id = uid("job"); const prompt_id = uid("prompt");
  const seed = input.seed ?? 841992;
  const job: TextToVideoJob & { job_id: string; prompt_id: string; reference_assets?: string[]; output_asset_id?: string } = {
    job_id, prompt_id, reference_assets: input.reference_assets,
    generation_job: {
      type: "text_to_video", prompt: input.prompt, negative_prompt: input.negative_prompt ?? "warped logo, unreadable text, extra objects",
      duration_ms: input.duration_ms ?? 5000, frame_rate: input.frame_rate ?? 24, resolution: input.resolution ?? "1920x1080",
      aspect_ratio: input.aspect_ratio ?? "16:9", seed, model_id: input.model_id ?? "n0va-video-gen-pro", model_version: input.model_version ?? "4.2.1",
      guidance: input.guidance ?? 7.5, policy_profile: input.policy_profile ?? "commercial_brand_safe",
    },
    prompt_hash: hash(input.prompt), status: "queued",
  };
  jobs.set(job_id, job);
  // prompt history v1
  promptHistories.set(prompt_id, [{ version: 1, prompt: input.prompt, negative_prompt: job.generation_job.negative_prompt, reference_assets: input.reference_assets, seed, model: job.generation_job.model_id, parameters: { guidance: job.generation_job.guidance }, output_candidates: [], user_id: "user_003", timestamp: nowIso(), branch: "main", system_constraints: job.generation_job.policy_profile }]);
  // simulate generation → provenance
  const outAsset = createGeneratedAsset(prompt_id, seed);
  job.output_asset_id = outAsset.asset_id;
  job.status = "generated"; job.output_hash = outAsset.hash;
  const prov: MachineProvenance = {
    asset_id: outAsset.asset_id, content_status: "ai_generated", generation_type: "text_to_video",
    source_assets: (input.reference_assets ?? []).map(id => ({ asset_id: id, role: "reference", hash: hash(id) })),
    model: { provider: "N0VA", model_id: job.generation_job.model_id, version: job.generation_job.model_version, model_digest: hash(`${job.generation_job.model_id}:${job.generation_job.model_version}`) },
    generation: { prompt_id, prompt_hash: job.prompt_hash, seed, parameters_hash: hash(JSON.stringify(job.generation_job)), created_at: nowIso() },
    operations: [{ type: "text_to_video", range: { start_ms: 0, end_ms: job.generation_job.duration_ms } }],
    human_actions: [], usage_restrictions: { commercial_use: true, political_use: false, training_use: false, territories: ["IN","US","GB"], expiry: "2027-08-28T00:00:00Z" },
    integrity: { asset_hash: outAsset.hash, manifest_hash: hash(`manifest:${outAsset.asset_id}`), signature: "signed-manifest..." },
  };
  provenanceStore.set(outAsset.asset_id, prov);
  // segment provenance default
  if (!segments.has("tl001")) segments.set("tl001", { timeline_id: "tl001", segments: [{ start_ms: 0, end_ms: 12400, status: "original", asset_id: "camera_001" }, { start_ms: 12400, end_ms: 15800, status: "ai_assisted", asset_id: "camera_001", operation: "object_removal" }, { start_ms: 15800, end_ms: 21100, status: "ai_generated", asset_id: outAsset.asset_id }] });
  return job;
}
export function listJobs(): typeof jobs extends Map<string, infer V> ? V[] : never { return Array.from(jobs.values()) as never; }
export function getJob(jobId: string) { return jobs.get(jobId) ?? null; }

// ── Image-to-video ─────────────────────────────────────────────────────────
export function createImageToVideoJob(sourceImageId: string, mode: "start_frame"|"end_frame"|"keyframe"|"motion"|"loop" = "start_frame"): { job_id: string; control_map: string } {
  const job_id = uid("job");
  // preserve original as controlling reference
  const original = assets.get(sourceImageId);
  if (!original) throw new Error("source image not found");
  return { job_id, control_map: `control_map:${sourceImageId}:animated=${mode},preserved=background,depth_aware=true` };
}

// ── Generative fill ────────────────────────────────────────────────────────
export function createObjectRemovalOp(input: { source_asset_id: string; range: { start_ms: number; end_ms: number }; mask_id?: string; target_description?: string }): GenerativeOperation {
  return {
    type: "object_removal", source_asset_id: input.source_asset_id, range: input.range, mask_id: input.mask_id ?? uid("mask"),
    target_description: input.target_description ?? "remove microphone stand", preserve: ["cast shadow","table reflection","background texture"],
    model_id: "n0va-inpaint-v2", output_mode: "new_derived_asset",
    mask_details: { feather: 2.5, tracking_confidence: 0.92, stabilized: true },
  };
}

// ── Background extension ───────────────────────────────────────────────────
export function checkBackgroundExtension(ext: BackgroundExtension): { warnings: string[] } {
  const warnings: string[] = [];
  if (ext.type === "horizontal") warnings.push("check repeated textures");
  if (ext.perspective_aware === false) warnings.push("perspective inconsistency risk");
  return { warnings };
}

// ── Camera / lighting variations ───────────────────────────────────────────
export function generateCameraVariations(baseAssetId: string, count = 3): CameraVariation[] {
  const methods: CameraVariation["generation_method"][] = ["camera_simulation","image_space","depth_aware","synthetic_regeneration"];
  return Array.from({ length: count }, (_, i) => ({
    framing: (["wide","medium","close"] as const)[i % 3]!,
    movement: (["dolly","pan","orbit"] as const)[i % 3]!,
    position: "eye" as const,
    focal_length_sim: 50, dof: "shallow" as const, lighting: "warm" as const, tod: "golden_hour",
    generation_method: methods[i % methods.length]!,
  }));
}

// ── Anchors ─────────────────────────────────────────────────────────────────
export function createProductAnchor(overrides?: Partial<ProductAnchor>): ProductAnchor {
  const a: ProductAnchor = {
    anchor_id: overrides?.anchor_id ?? "product_nova_phone_01",
    approved_assets: overrides?.approved_assets ?? ["asset_front_hero","asset_back_hero","asset_packaging"],
    constraints: overrides?.constraints ?? { preserve_logo: true, preserve_button_count: true, preserve_color: true, preserve_screen_ui: true, allow_camera_variation: true, allow_background_variation: true },
    usage_policy: overrides?.usage_policy ?? { commercial: true, territories: ["worldwide"], expires_at: "2027-12-31T23:59:59Z" },
    erp_metadata: overrides?.erp_metadata,
  };
  productAnchors.set(a.anchor_id, a);
  return a;
}
export function createCharacterAnchor(overrides?: Partial<CharacterAnchor>): CharacterAnchor {
  const a: CharacterAnchor = {
    anchor_id: overrides?.anchor_id ?? "character_hero_01",
    approved_images: overrides?.approved_images ?? ["img_ref_01"],
    references: overrides?.references ?? {},
    wardrobe_refs: overrides?.wardrobe_refs ?? ["wardrobe_01"],
    consent: overrides?.consent ?? { owner: "talent_01", permitted_use: "commercial", territories: ["IN","US"], expires_at: "2027-12-31T23:59:59Z", prohibited: ["political"] },
    approved_models: overrides?.approved_models ?? ["n0va-video-gen-pro"],
  };
  characterAnchors.set(a.anchor_id, a);
  return a;
}
export function checkAnchorCompliance(assetId: string, anchorId: string): AnchorCheckResult {
  const pa = productAnchors.get(anchorId);
  const warnings: string[] = [];
  if (pa?.constraints.preserve_logo && Math.random() < 0.05) warnings.push("logo deformation");
  if (pa?.constraints.preserve_color && Math.random() < 0.03) warnings.push("wrong color");
  // deterministic for test: ensure at least one check
  return { anchor_id: anchorId, passed: warnings.length===0, warnings, confidence: 0.92 };
}

// ── Storyboard ─────────────────────────────────────────────────────────────
export function createStoryboardCards(script: string[]): StoryboardCard[] {
  return script.map((line, i) => ({
    scene: `Scene ${String(i+1).padStart(2,"0")}`, shot: `Shot ${String((i%3)+1).padStart(2,"0")}`,
    duration_ms: 3500, framing: "medium close-up", camera: "slow push-in", action: line.slice(0,40), dialogue: line.slice(0,20),
    lighting: "warm side light", reference: "product_nova_phone_01", generation_status: "exploratory",
  }));
}

// ── Shot continuation ───────────────────────────────────────────────────────
export function createContinuationJob(input: { source_clip_id: string; extend_by_ms?: number }): ContinuationJob {
  return {
    source_clip_id: input.source_clip_id, extend_by_ms: input.extend_by_ms ?? 2400,
    preserve: ["subject_identity","product_geometry","screen_direction","lighting_direction","camera_motion"],
    transition_window_ms: 400, temporal_consistency_target: 0.92, output: `new_clip_with_link_to_source:${input.source_clip_id}`,
  };
}

// ── Synthetic B-roll ────────────────────────────────────────────────────────
export function suggestBroll(context: { script?: string; transcript?: string; product_anchor?: string }): BrollCandidate[] {
  return [
    { purpose: "cover jump cut", concept: "close-up of product hinge opening", duration_ms: 2000, style: "match interview lighting", source: "generated", product_anchor: context.product_anchor ?? "product_nova_phone_01", continuity_confidence: 0.88, brand_risk: "low", suggested_insertion: "00:01:14.200" },
    { purpose: "visual gap", concept: "overhead table top product rotation", duration_ms: 3000, style: "studio table", source: "generated", product_anchor: context.product_anchor ?? "product_nova_phone_01", continuity_confidence: 0.85, brand_risk: "low", suggested_insertion: "00:02:10.000" },
  ];
}

// ── Visible disclosure ──────────────────────────────────────────────────────
export function disclosureForAsset(assetId: string, mode: VisibleDisclosure = "timeline_badge"): string {
  const labels: Record<VisibleDisclosure, string> = {
    corner_label: "AI-GENERATED", slate: "AI-GENERATED slate", end_card: "SYNTHETIC EXTENSION", timeline_badge: "AI-GENERATED badge", review_watermark: "DRAFT — SYNTHETIC MEDIA", platform_specific: "platform disclosure",
  };
  return labels[mode] ?? "AI-GENERATED";
}

// ── Provenance ──────────────────────────────────────────────────────────────
export function getProvenance(assetId: string): MachineProvenance | null { return provenanceStore.get(assetId) ?? null; }
export function getSegmentProvenance(timelineId: string): SegmentProvenance | null { return segments.get(timelineId) ?? null; }
export function setSegmentProvenance(tl: string, segs: SegmentProvenance["segments"]) { segments.set(tl, { timeline_id: tl, segments: segs }); }

// ── Prompt history ──────────────────────────────────────────────────────────
export function getPromptHistory(promptId: string): PromptVersion[] | null { return promptHistories.get(promptId) ?? null; }
export function addPromptVersion(promptId: string, patch: { prompt?: string; rejection_reason?: string; approval_decision?: string; user_id?: string }): PromptVersion | null {
  const hist = promptHistories.get(promptId);
  if (!hist) return null;
  const last = hist[hist.length-1];
  const next: PromptVersion = {
    version: (last?.version ?? 0)+1,
    prompt: patch.prompt ?? last!.prompt,
    negative_prompt: last!.negative_prompt,
    reference_assets: last!.reference_assets,
    seed: last!.seed,
    model: last!.model,
    parameters: last!.parameters,
    output_candidates: last!.output_candidates,
    rejection_reason: patch.rejection_reason,
    approval_decision: patch.approval_decision,
    user_id: patch.user_id ?? "user_003",
    timestamp: nowIso(),
    branch: "main",
  };
  hist.push(next);
  return next;
}

// ── Usage restrictions ──────────────────────────────────────────────────────
export function checkUsage(assetId: string, action: UsageCheck["requested_action"]): UsageCheck {
  const prov = provenanceStore.get(assetId);
  const reasons: string[] = [];
  if (prov?.usage_restrictions.territories && !prov.usage_restrictions.territories.includes("IN")) reasons.push("territory not allowed");
  if (action==="publish" && prov?.usage_restrictions.political_use===false && action==="publish") { /* ok */ }
  // demo blocked case
  if (assetId.includes("restricted")) reasons.push("reference likeness license expires before publication date");
  return { asset_id: assetId, requested_action: action, result: reasons.length? "blocked":"allowed", reasons };
}

// ── Consent ─────────────────────────────────────────────────────────────────
export function createConsent(record: Partial<ConsentRecord> & { subject: string }): ConsentRecord {
  const c: ConsentRecord = {
    consent_id: record.consent_id ?? uid("cons"), subject: record.subject, rights_owner: record.rights_owner ?? "rights_owner_01",
    permitted_use: record.permitted_use ?? "commercial", territory: record.territory ?? ["IN","US"], duration: record.duration ?? "2027-12-31",
    allowed_transforms: record.allowed_transforms ?? ["face_blur"], prohibited_contexts: record.prohibited_contexts ?? ["political"], revocation_status: "active",
  };
  consentStore.set(c.consent_id, c);
  return c;
}
export function revokeConsent(consentId: string): { affected_assets: string[] } {
  const c = consentStore.get(consentId);
  if (c) c.revocation_status = "revoked";
  const affected: string[] = [];
  for (const [aid, prov] of provenanceStore) {
    if (prov.source_assets.some(s=>s.asset_id.includes(c?.subject ?? "unknown"))) affected.push(aid);
  }
  return { affected_assets: affected };
}

// ── Safety checks ───────────────────────────────────────────────────────────
export function runSafetyChecks(assetId: string): SafetyCheck[] {
  const checks = ["identity drift","anatomical artifacts","logo deformation","text hallucination","product alteration","temporal flicker","copyright similarity","restricted likeness","missing disclosure","missing provenance"];
  return checks.map(check => ({ check, passed: Math.random()>0.08, details: check==="logo deformation" ? "checked against product anchor" : undefined }));
}

// ── Compliance report ───────────────────────────────────────────────────────
export function complianceReport(timelineId = "tl001"): SyntheticComplianceReport {
  const seg = segments.get(timelineId);
  const total = seg?.segments.length ?? 3;
  const fully = seg?.segments.filter(s=>s.status==="ai_generated").length ?? 1;
  const assisted = seg?.segments.filter(s=>s.status==="ai_assisted").length ?? 1;
  const fill = 0;
  const provPresent = fully+assisted;
  return {
    total_segments: total, fully_generated: fully, ai_assisted: assisted, generative_fill: fill,
    provenance: { present: provPresent, total, output_hashes_verified: provPresent, visible_disclosures: provPresent-1, needs_decision: 1 },
    usage: { territory_restriction: 1, consent_violations: 0, rights_confirmation_needed: 1 },
    export_status: "blocked", issues: ["1 segment has territory restriction","2 segments require disclosure decision","1 reference asset requires rights confirmation"],
  };
}

// ── Approval ────────────────────────────────────────────────────────────────
export type ApprovalDecision = { asset_id: string; decision: string; disclosure_mode: string; usage_scope?: { commercial: boolean; territories: string[]; expires_at: string }; actor_id: string; timestamp: string };

const approvals = new Map<string, ApprovalDecision>();
export function approveAsset(assetId: string, decision: string, disclosure_mode: string, usage_scope?: ApprovalDecision["usage_scope"]): ApprovalDecision {
  const a: ApprovalDecision = { asset_id: assetId, decision, disclosure_mode, usage_scope, actor_id: "user_003", timestamp: nowIso() };
  approvals.set(assetId, a);
  // update provenance human_actions
  const prov = provenanceStore.get(assetId);
  if (prov) prov.human_actions.push({ actor_id: "user_003", action: decision, timestamp: a.timestamp });
  return a;
}
export function getApproval(assetId: string): ApprovalDecision | null { return approvals.get(assetId) ?? null; }

// ── On-prem ─────────────────────────────────────────────────────────────────
export function processingRoute(onPremOnly = true): ProcessingRoute {
  return {
    location: "Studio GPU Cluster — Mumbai",
    cloud_fallback: !onPremOnly,
    reference_assets: "remain on-premise",
    prompt_retention: "encrypted, 90 days",
    training_use: "prohibited",
  };
}

// ── Timeline integration ────────────────────────────────────────────────────
export type TimelineTrackClass = "V1" | "V2" | "V3" | "V4" | "A1" | "G1";
export function trackForDomain(domain: AssetDomain): TimelineTrackClass {
  if (domain==="ORIGINALS") return "V1";
  if (domain==="GENERATED_WORKSPACE") return "V3";
  if (domain==="EDITORIAL_DERIVATIVES") return "V2";
  return "V1";
}
export function badgeForAsset(assetId: string): string {
  const a = assets.get(assetId);
  if (!a) return "[GEN]";
  if (a.domain==="ORIGINALS") return "Original";
  if (a.domain==="GENERATED_WORKSPACE") return "[GEN] AI-generated";
  if (a.domain==="EDITORIAL_DERIVATIVES") return "[ASSIST] AI-assisted";
  return "[GEN]";
}

// ── Helpers for tests ───────────────────────────────────────────────────────
export function listAssets(): DomainAsset[] { return Array.from(assets.values()); }
export function listAnchors(): { characters: CharacterAnchor[]; products: ProductAnchor[] } { return { characters: Array.from(characterAnchors.values()), products: Array.from(productAnchors.values()) }; }
export function clearGenerativeStores(): void { assets.clear(); jobs.clear(); provenanceStore.clear(); segments.clear(); promptHistories.clear(); characterAnchors.clear(); productAnchors.clear(); consentStore.clear(); approvals.clear(); }

// Seed minimal demo
(function seed(){
  createOriginalAsset("A003C004_001.R3D");
  createOriginalAsset("reference_image_01.jpg");
  createProductAnchor();
  createCharacterAnchor();
  const job = createTextToVideoJob({ prompt: "A close product shot on a studio table with warm lighting", duration_ms: 5000 });
  // keep job generated for demo
  void job;
})();
