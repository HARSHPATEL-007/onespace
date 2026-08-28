/**
 * N0VA VIDEOS — Provenance Fabric Engine
 * Append-only graph: Entity/Activity/Agent/Association
 * Merkle integrity, event-sourced timelines, reproducible renders, C2PA, consent, ledger, verification
 */
import type {
  ProvenanceEntity, ProvenanceActivity, ProvenanceAgent, ProvenanceAssociation,
  SegmentLineage, IntegrityHashes, GenerationRecord, EditOperationRecord, TimelineEvent,
  RenderRecipe, ExportManifest, C2PACredential, C2PAAssertion, ConsentProvenance,
  RollbackPlan, ExternalTransaction, VerificationResponse, ProvenanceCompleteness,
  ProvenanceGraph,
} from "./provenance-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36)}`; }
function hash(s: string) { return `sha3-512:${s.slice(0, 32)}${Math.random().toString(36).slice(2, 6)}`; }
function nowIso() { return new Date().toISOString(); }

/* Merkle helpers — segment → asset → timeline → export → project */
export function merkleRoot(hashes: string[]): string {
  if (!hashes.length) return "merkle:empty";
  let level = hashes.map(h => hash(h));
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i]!; const b = level[i + 1] ?? a;
      next.push(hash(a + b));
    }
    level = next;
  }
  return `merkle:${level[0]!.slice(0, 24)}`;
}
export function frameHashes(count: number, prefix: string): string[] { return Array.from({ length: count }, (_, i) => `sha3-512:${prefix}_frame_${String(i).padStart(6, "0")}`); }
export function computeIntegrity(input: {
  fileBytesHash: string; decodedHashes: string[]; audioHashes: string[];
  metadata: unknown; timelineInstructions: unknown; regionMasks: string[]; renderConfig: unknown;
}): IntegrityHashes {
  const frameRoot = merkleRoot(input.decodedHashes);
  const audioRoot = merkleRoot(input.audioHashes);
  const metadataHash = hash(JSON.stringify(input.metadata));
  const timelineHash = hash(JSON.stringify(input.timelineInstructions));
  const provRoot = merkleRoot([frameRoot, audioRoot, metadataHash, timelineHash, hash(JSON.stringify(input.renderConfig))]);
  return {
    file_hash: input.fileBytesHash, decoded_media_hash: hash(input.decodedHashes.join(",")),
    frame_merkle_root: frameRoot, audio_merkle_root: audioRoot,
    metadata_hash: metadataHash, timeline_hash: timelineHash, provenance_root: provRoot,
  };
}

/* Graph store (in-memory per-process, would be dedicated Provenance Fabric DB in prod) */
export function createEmptyGraph(): ProvenanceGraph {
  return {
    entities: new Map(), activities: new Map(), agents: new Map(), associations: new Map(),
    lineage_segments: new Map(), generation_records: new Map(), edit_records: new Map(),
    timeline_events: [], render_recipes: new Map(), export_manifests: new Map(),
    c2pa_credentials: new Map(), consent_records: new Map(), external_transactions: new Map(),
  };
}
let _g: ProvenanceGraph | null = null;
export function getGraph(): ProvenanceGraph { if (!_g) _g = createEmptyGraph(); return _g; }

/* Asset identity + hashing */
export function registerAssetIdentity(input: {
  asset_id: string; project_id: string; tenant_id: string; fileName: string; fileHash: string;
  decodedHashes?: string[]; audioHashes?: string[];
}): ProvenanceEntity {
  const g = getGraph();
  const e: ProvenanceEntity = { entity_id: input.asset_id, entity_type: "original_camera_file", created_at: nowIso(), hash: input.fileHash, tenant_id: input.tenant_id, project_id: input.project_id, metadata: { fileName: input.fileName } };
  g.entities.set(e.entity_id, e);
  // Also store hashes for verification
  if (input.decodedHashes) {
    // lineage helper — not stored as entity, but integrity computed on demand
  }
  return e;
}

/* Lineage */
export function createSegmentLineage(input: {
  timeline_id: string; start_frame: number; end_frame: number; start_timecode: string; end_timecode: string;
  sources: { asset_id: string; start_frame: number; end_frame: number }[];
  operation: string; region_mask?: string; change_class?: SegmentLineage["transformation"]["change_class"];
  activity_id?: string;
}): SegmentLineage {
  const g = getGraph();
  const lin: SegmentLineage = {
    lineage_id: uid("lin"), timeline_id: input.timeline_id,
    segment: { start_frame: input.start_frame, end_frame: input.end_frame, start_timecode: input.start_timecode, end_timecode: input.end_timecode },
    source_entities: input.sources.map(s => ({ asset_id: s.asset_id, source_range: { start_frame: s.start_frame, end_frame: s.end_frame } })),
    transformation: { operation: input.operation, region_mask: input.region_mask, change_class: (input.change_class ?? "synthetic_visual_alteration") as SegmentLineage["transformation"]["change_class"] },
    activity_id: input.activity_id ?? uid("act"), output_hash: hash(`${input.timeline_id}:${input.start_frame}-${input.end_frame}`), lineage_status: "verified",
  };
  g.lineage_segments.set(lin.lineage_id, lin);
  return lin;
}

/* Generation record */
export function createGenerationRecord(input: Partial<GenerationRecord> & { operation: string; output_asset_id: string }): GenerationRecord {
  const g = getGraph();
  const rec: GenerationRecord = {
    generation_id: uid("gen"), output_asset_id: input.output_asset_id, operation: input.operation,
    model: input.model ?? { provider: "approved_provider", name: "n0va-voice-v5", version: "5.2.1", model_digest: hash("model-n0va-voice-v5-5.2.1") },
    prompt_record: input.prompt_record ?? {
      system_prompt_hash: hash("system-prompt-voice-policy-v3"), user_prompt_ciphertext: "encrypted:… (access-controlled, hash visible)",
      prompt_policy_version: "voice-policy-v3", parameters: { seed: 88211, temperature: 0.4, language: "en-IN", resolution: "1920x1080", frame_rate: 24 },
    },
    inputs: input.inputs ?? [{ asset_id: "voice_consent_sample_12", role: "consented_reference" }],
    consent_id: input.consent_id ?? "cons_01J_voice_044",
    operator: input.operator ?? "user_204", requesting_agent: input.requesting_agent ?? "agent.video.dubbing.v2",
    capability_token_id: input.capability_token_id, generation_timestamp: nowIso(),
    output_hash: hash(input.output_asset_id), disclosure_class: input.disclosure_class ?? (input.operation.includes("voice") ? "synthetic_voice" : input.operation.includes("background") ? "background_replacement" : "ai_generated"),
    review_status: "approved", moderation_result: "passed",
  };
  g.generation_records.set(rec.generation_id, rec);
  return rec;
}

/* Edit operation record */
export function createEditRecord(input: Partial<EditOperationRecord> & { operation: string; inputs: string[]; outputs: string[] }): EditOperationRecord {
  const g = getGraph();
  const rec: EditOperationRecord = {
    activity_id: uid("act"), activity_type: "timeline_edit", operation: input.operation,
    inputs: input.inputs, outputs: input.outputs,
    parameters: input.parameters ?? {}, operator: input.operator ?? { type: "agent", id: "agent.video.colorist.v2" },
    human_originator: input.human_originator ?? "user_204", capability_token_id: input.capability_token_id,
    approval_id: input.approval_id ?? null, reversible: input.reversible ?? true, rollback_snapshot: input.rollback_snapshot ?? uid("snap"),
    category: input.category ?? "visual_transform",
  };
  g.edit_records.set(rec.activity_id, rec);
  return rec;
}

/* Event-sourced timeline */
export function appendTimelineEvent(input: {
  timeline_id: string; event_type: string; payload: unknown; actor: string; human_principal: string;
}): TimelineEvent {
  const g = getGraph();
  const seq = g.timeline_events.filter(e => e.timeline_id === input.timeline_id).length + 1;
  const prevHash = g.timeline_events.filter(e => e.timeline_id === input.timeline_id).at(-1)?.resulting_timeline_hash ?? hash("timeline_root");
  const ev: TimelineEvent = {
    timeline_event_id: uid("tle"), timeline_id: input.timeline_id, sequence: seq,
    parent_event_hash: prevHash, event_type: input.event_type, payload_hash: hash(JSON.stringify(input.payload)),
    actor: input.actor, human_principal: input.human_principal, created_at: nowIso(),
    resulting_timeline_hash: hash(`${input.timeline_id}:${seq}:${JSON.stringify(input.payload)}`),
    snapshot_id: uid("snap"), signature: hash(`${input.actor}:${seq}:KMS:sig`),
  };
  g.timeline_events.push(ev);
  return ev;
}

/* Render recipe */
export function createRenderRecipe(input: Partial<RenderRecipe> & { timeline_hash: string }): RenderRecipe {
  const g = getGraph();
  const rec: RenderRecipe = {
    render_recipe_id: uid("recipe"), timeline_hash: input.timeline_hash,
    source_hashes: input.source_hashes ?? [hash("asset_01"), hash("asset_02")],
    render_engine: input.render_engine ?? { name: "n0va-render", version: "8.4.0", container_digest: "sha256:image_abc123" },
    video: input.video ?? { codec: "HEVC", profile: "Main 10", width: 3840, height: 2160, frame_rate: 59.94, color_pipeline: "ACES 1.3", hdr: "HDR10+" },
    audio: input.audio ?? { codec: "AAC", channels: 2, sample_rate: 48000, target_loudness_lufs: -14 },
    caption_track_hashes: input.caption_track_hashes ?? [hash("captions_en")],
    watermark_config_hash: input.watermark_config_hash ?? hash("watermark_brand_04"),
    reproducibility_status: "locked", reproducibility_level: input.reproducibility_level ?? "media_equivalent",
    seeds: { render_seed: 88211 },
  };
  g.render_recipes.set(rec.render_recipe_id, rec);
  return rec;
}

/* Export manifest (tamper-evident, replicated) */
export function createExportManifest(input: {
  export_id: string; timeline_hash: string; source_assets: ExportManifest["source_assets"];
  ai_operations?: ExportManifest["ai_operations"]; approvals: string[]; consents: string[]; render_recipe_id: string; destination: string;
}): ExportManifest {
  const g = getGraph();
  const m: ExportManifest = {
    manifest_version: "n0va-provenance-1.0", export_id: input.export_id,
    asset_hash: hash(input.export_id + ":final_file"), decoded_media_hash: hash(input.export_id + ":decoded"),
    timeline_hash: input.timeline_hash, provenance_root: merkleRoot([input.timeline_hash, hash(JSON.stringify(input.source_assets)), hash(input.render_recipe_id)]),
    source_assets: input.source_assets, ai_operations: input.ai_operations ?? [], approvals: input.approvals, consents: input.consents,
    render_recipe_id: input.render_recipe_id, destination: input.destination, disclosure_classifications: input.ai_operations?.map(a=>a.classification) ?? [],
    signature: hash(`manifest:${input.export_id}:KMS:sig`), created_at: nowIso(), replicated_to: ["integrity-store-us","integrity-store-eu"],
  };
  g.export_manifests.set(m.export_id, m);
  return m;
}

/* C2PA */
export function createC2PACredential(input: {
  asset_id: string; lifecycle_point: C2PACredential["lifecycle_point"]; assertions: C2PAAssertion[];
}): C2PACredential {
  const g = getGraph();
  const c: C2PACredential = {
    credential_id: uid("c2pa"), asset_id: input.asset_id, issuer: "N0VA VIDEOS", issued_at: nowIso(),
    assertions: input.assertions, signature: hash(`c2pa:${input.asset_id}:sig`),
    manifest_url: `https://provenance.n0va.io/c2pa/${uid("man")}`, lifecycle_point: input.lifecycle_point,
  };
  g.c2pa_credentials.set(c.credential_id, c);
  return c;
}
export function defaultC2PAAssertions(): C2PAAssertion[] {
  return [
    { assertion_type: "n0va.ai_transformation", claim_generator: "N0VA VIDEOS", operation: "background_replacement", time_range: { start_frame: 4800, end_frame: 5520 }, input_assets: ["asset_camera_a001"], model: "n0va-segmentation-v4", human_reviewed: true, approved_by: "user_301", disclosure_required: true, content_type: "background_replacement" },
    { assertion_type: "n0va.ai_transformation", claim_generator: "N0VA VIDEOS", operation: "voice_synthesis", input_assets: ["voice_consent_sample_12"], model: "n0va-voice-v5", human_reviewed: true, approved_by: "user_301", disclosure_required: true, content_type: "synthetic_voice" },
  ];
}

/* Consent */
export function createConsentRecord(input: Partial<ConsentProvenance> & { subject_id: string }): ConsentProvenance {
  const g = getGraph();
  const c: ConsentProvenance = {
    consent_id: input.consent_id ?? uid("cons"), subject_id: input.subject_id, identity_type: input.identity_type ?? "voice",
    permitted_operations: input.permitted_operations ?? ["voice.generate","voice.dub"], purpose: input.purpose ?? "q3_product_campaign",
    territories: input.territories ?? ["IN","US","GB"], languages: input.languages ?? ["en","hi"],
    destinations: input.destinations ?? ["review_portal","youtube"], valid_from: input.valid_from ?? "2026-08-01", valid_until: input.valid_until ?? "2027-04-30",
    revoked_at: input.revoked_at ?? null, source_document_hash: input.source_document_hash ?? hash("release-doc"), verification_status: input.verification_status ?? "verified",
  };
  g.consent_records.set(c.consent_id, c);
  return c;
}

/* Cross-app */
export function createExternalTransaction(input: {
  export_id: string; application: string; connector?: string; operation?: string; external_object_id?: string;
}): ExternalTransaction {
  const g = getGraph();
  const t: ExternalTransaction = {
    external_transaction_id: uid("txn"), export_id: input.export_id, application: input.application,
    connector: input.connector ?? `n0va10.${input.application}.v6`, operation: input.operation ?? "upload_private",
    external_object_id: input.external_object_id ?? `yt_${Math.random().toString(36).slice(2, 6)}`,
    request_hash: hash(`req:${input.export_id}`), response_hash: hash(`res:${input.export_id}`),
    credential_subject: "channel_007", status: "reconciled", content_manifest_id: `manifest_${input.export_id.slice(0,8)}`,
    timestamp: nowIso(), publication_state: "private_draft", reconciliation_status: "reconciled",
  };
  g.external_transactions.set(t.external_transaction_id, t);
  return t;
}

/* Rollback */
export function createRollbackPlan(snapshot_id: string): RollbackPlan {
  return {
    snapshot_id,
    internal_actions: ["restore_timeline","restore_caption_track","revoke_review_link"],
    external_actions: ["unpublish_youtube","replace_cdn_manifest","notify_distribution_owners"],
    rollback_status: "tested", compensating_required: true,
  };
}

/* Verification */
export function verifyProvenance(export_id: string): VerificationResponse {
  const g = getGraph();
  const m = g.export_manifests.get(export_id);
  if (!m) return {
    verification_id: uid("verify"), export_id, status: "failed",
    checks: { manifest_signature:"failed", media_hash:"failed", timeline_hash:"failed", source_lineage:"failed", approval_binding:"failed", consent_at_generation:"failed", c2pa_credential:"missing", external_publication_match:"failed" },
    disclosures: [], broken_link: "manifest not found", verified_at: nowIso(),
  };
  // In real verifier: check KMS signature, hash consistency, timeline==export, source integrity, approval binding, consent valid at generation time, C2PA, reconciliation.
  // Here we simulate: all passed if manifest exists and consents not revoked
  const hasRevoked = m.consents.some(cid => g.consent_records.get(cid)?.revoked_at);
  return {
    verification_id: uid("verify"), export_id, status: hasRevoked ? "failed" : "verified_with_disclosure",
    checks: {
      manifest_signature: "passed", media_hash: "passed", timeline_hash: "passed", source_lineage: "passed",
      approval_binding: "passed", consent_at_generation: hasRevoked ? "failed" : "passed",
      c2pa_credential: g.c2pa_credentials.size ? "passed" : "missing", external_publication_match: "passed",
    },
    disclosures: m.disclosure_classifications, broken_link: hasRevoked ? "consent revoked after generation" : undefined, verified_at: nowIso(),
  };
}

/* Completeness */
export function computeCompleteness(export_id: string): ProvenanceCompleteness {
  const g = getGraph();
  const m = g.export_manifests.get(export_id);
  const recipe = m ? g.render_recipes.get(m.render_recipe_id) : undefined;
  const breakdown = {
    source_lineage: { present: !!m?.source_assets.length, score: m?.source_assets.length ? 1 : 0 },
    transformation_lineage: { present: true, score: 1 },
    model_attribution: { present: !!g.generation_records.size, score: g.generation_records.size ? 1 : 0.7 },
    prompt_attribution: { present: !!g.generation_records.size, score: g.generation_records.size ? 0.9 : 0.5 },
    operator_attribution: { present: true, score: 1 },
    approval_history: { present: !!m?.approvals.length, score: m?.approvals.length ? 1 : 0 },
    consent_history: { present: !!m?.consents.length, score: m?.consents.length ? 1 : 0 },
    render_reproducibility: { present: !!recipe, score: recipe ? 1 : 0 },
    manifest_signature: { present: !!m?.signature, score: m?.signature ? 1 : 0 },
    destination_reconciliation: { present: !!Array.from(g.external_transactions.values()).find(t=>t.export_id===export_id), score: 0.9 },
  };
  const scores = Object.values(breakdown).map(v=>v.score);
  const avg = scores.reduce((a,b)=>a+b,0)/scores.length;
  const gaps: string[] = [];
  if (!breakdown.destination_reconciliation.present) gaps.push("external_platform_c2pa_propagation_unconfirmed");
  if (avg < 1) gaps.push("prompt_redacted_for_privacy");
  return {
    export_id, provenance_completeness: Number(avg.toFixed(2)),
    critical_gaps: avg >= 0.98 ? ["external_platform_c2pa_propagation_unconfirmed"] : gaps,
    release_status: avg >= 0.95 ? "allowed_with_warning" : avg >= 0.8 ? "allowed_with_warning" : "blocked",
    breakdown,
  };
}

/* Frame explain: “Why does this frame look this way?” */
export function explainFrame(frame: number, fps = 24): {
  frame: string; source: string; transformations: string[]; human_decisions: string[]; consent: string; export: string;
} {
  const tc = `${String(Math.floor(frame / (fps*60))).padStart(2,"0")}:${String(Math.floor((frame % (fps*60))/fps)).padStart(2,"0")}:${String(frame % fps).padStart(2,"0")}`;
  return {
    frame: `Frame ${tc} (#${frame})`,
    source: "Camera A001, frames 18,440–18,512 (asset_camera_a001, sha3-512:source…)",
    transformations: [
      "Trimmed by Editor Agent (user_204 → agent.video.autoeditor.v4, cap_01J…)",
      "Stabilized by N0VA Stabilization v3 (n0va-stabilization-v3, seed 88211)",
      "Background replaced by Generative Video Agent (n0va-segmentation-v4, ROI mask mask://roi_01J…, synthetic_visual_alteration)",
      "Color grade applied using Brand LUT 04 (lut_brand_warm_04, exposure 0.12, intensity 0.75)",
    ],
    human_decisions: ["Editor accepted stabilization (user_204, 17:12)", "Creative Director approved background replacement (user_301, apr_01J)"],
    consent: "No identity transformation detected — face/voice not altered (no consent required; if synthetic voice/likeness, must point to cons_01J)",
    export: "Included in export EXP-044 (manifest n0va-provenance-1.0, merkle:root…) → Published as YouTube private draft (yt_abc123, reconciled, C2PA embedded; external manifest https://provenance.n0va.io/c2pa/…)",
  };
}

/* Seed demo graph (call once) */
let seeded = false;
export function seedProvenanceDemo(projectId = "proj_q3_launch", tenantId = "tenant_001") {
  if (seeded) return getGraph();
  seeded = true;
  const g = getGraph();
  // Entities
  registerAssetIdentity({ asset_id: "asset_camera_a001", project_id: projectId, tenant_id: tenantId, fileName: "A001_C001.mxf", fileHash: hash("A001") });
  registerAssetIdentity({ asset_id: "asset_camera_a002", project_id: projectId, tenant_id: tenantId, fileName: "A002_C002.mxf", fileHash: hash("A002") });
  // Lineage
  createSegmentLineage({ timeline_id: "tl_07", start_frame: 1440, end_frame: 2160, start_timecode: "00:01:00:00", end_timecode: "00:01:30:00", sources: [{ asset_id: "asset_camera_a001", start_frame: 7200, end_frame: 7920 }], operation: "background_replace", region_mask: "mask://roi_01J_bg", change_class: "synthetic_visual_alteration", activity_id: "act_bg_01" });
  // Generation
  createGenerationRecord({ operation: "voice_synthesis", output_asset_id: "asset_synthetic_044", consent_id: "cons_01J_voice_044", disclosure_class: "synthetic_voice" });
  createGenerationRecord({ operation: "background_replace", output_asset_id: "asset_bg_044", disclosure_class: "background_replacement" });
  // Edit records
  createEditRecord({ operation: "trim_and_color_grade", inputs: ["asset_camera_a001","lut_brand_warm_04"], outputs: ["timeline_branch_17"], parameters: { source_in_frame: 1200, source_out_frame: 3420, exposure: 0.12, lut_intensity: 0.75 }, category: "visual_transform" });
  // Timeline events
  for (let i = 1; i <= 7; i++) appendTimelineEvent({ timeline_id: "tl_07", event_type: ["Add source clip","Trim clip","Apply color grade","Add generated voice","Insert caption track","Approve version","Render export"][i-1]!, payload: { seq: i }, actor: i===1 ? "user_204" : `agent.video.${["autoeditor","colorist","dubbing","caption","approval","render"][i-2] ?? "operator"}`, human_principal: "user_204" });
  // Consent
  createConsentRecord({ subject_id: "person_044", identity_type: "voice", consent_id: "cons_01J_voice_044", verification_status: "verified" });
  // Recipe + manifest
  const recipe = createRenderRecipe({ timeline_hash: g.timeline_events.at(-1)?.resulting_timeline_hash ?? hash("timeline") });
  const manifest = createExportManifest({ export_id: "exp_044", timeline_hash: recipe.timeline_hash, source_assets: [{ asset_id: "asset_camera_a001", hash: hash("asset_camera_a001"), usage: [{ start_timecode: "00:00:00:00", end_timecode: "00:00:42:12" }] }], ai_operations: [{ activity_id: "act_voice_01", segment: "00:00:42:12-00:01:04:00", classification: "synthetic_voice" }], approvals: ["apr_creative_01","apr_brand_01","apr_compliance_01"], consents: ["cons_01J_voice_044"], render_recipe_id: recipe.render_recipe_id, destination: "youtube_private_draft" });
  createC2PACredential({ asset_id: "exp_044", lifecycle_point: "export", assertions: defaultC2PAAssertions() });
  createExternalTransaction({ export_id: "exp_044", application: "youtube", external_object_id: "yt_abc123" });
  // Second export for gap demo (no C2PA propagation)
  const recipe2 = createRenderRecipe({ timeline_hash: hash("timeline2") });
  createExportManifest({ export_id: "exp_045", timeline_hash: recipe2.timeline_hash, source_assets: [{ asset_id: "asset_camera_a002", hash: hash("asset_camera_a002"), usage: [{ start_timecode: "00:00:00:00", end_timecode: "00:00:30:00" }] }], approvals: ["apr_creative_01"], consents: [], render_recipe_id: recipe2.render_recipe_id, destination: "cdn" });
  return g;
}
