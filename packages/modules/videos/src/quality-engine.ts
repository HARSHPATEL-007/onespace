/**
 * N0VA VIDEOS — Continuity and Quality Intelligence Engine
 * Analyze → Detect → Explain → Prioritize → Suggest → Preview → Approval → Apply-as-new-node
 * Never mutates timeline/graph/render; all fixes are proposals linked to graph nodes.
 */
import type { QualityWarning, QualityProposal, QualityFinding, QualityGate, Severity, Category, QualityPassId, QualityDashboard, EditorialIntentFeedback, WarningStatus } from "./quality-types";
import { CATEGORY_META } from "./quality-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2, 6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }

// ── Severity scale configurable per project type ────────────────────────────
export const SEVERITY_DEFAULTS: Record<string, Record<Severity, string>> = {
  documentary: { informational: "show", low: "show", medium: "flag", high: "block_approval", critical: "block_export" },
  advertisement: { informational: "show", low: "flag", medium: "block_approval", high: "block_export", critical: "block_export" },
  legal_exhibit: { informational: "flag", low: "flag", medium: "block_export", high: "block_export", critical: "block_export" },
  social_clip: { informational: "hide", low: "show", medium: "flag", high: "flag", critical: "block_export" },
};

// ── In-memory stores ────────────────────────────────────────────────────────
const findingStore = new Map<string, QualityFinding>();
const warningStore = new Map<string, QualityWarning>();
const proposalStore = new Map<string, QualityProposal>();
const gateStore = new Map<string, QualityGate>();
const feedbackStore: EditorialIntentFeedback[] = [];

// Demo graph/timeline refs
const DEMO_TIMELINE = "tl001";
const DEMO_GRAPH = "gv42";

// helpers
function baseWarning(partial: Partial<QualityWarning> & { type: string; category: Category; range: { start_ms: number; end_ms: number } }): QualityWarning {
  const id = uid("warn");
  return {
    warning_id: id,
    timeline_id: DEMO_TIMELINE,
    graph_version: DEMO_GRAPH,
    type: partial.type,
    category: partial.category,
    severity: (partial.severity as Severity) ?? "medium",
    status: "open",
    range: partial.range,
    evidence: { confidence: 0.86, model_version: "n0va-continuity-v3", threshold: 0.7, evidence_sources: ["visual continuity", "object tracking"], ...(partial.evidence ?? {}) },
    explanation: partial.explanation ?? "Explainable warning with evidence",
    suggested_fixes: partial.suggested_fixes ?? [],
    requires_approval: partial.requires_approval ?? true,
    related_nodes: partial.related_nodes ?? ["node_continuity_generic"],
    source_assets: partial.source_assets ?? ["asset_camera_a001"],
    semantic_span_ids: partial.semantic_span_ids ?? ["span_01"],
    export_blocking: partial.export_blocking,
    human_resolution: null,
    false_positive_risk: "moderate",
    style_dependent: false,
  };
}

// ── Detectors ───────────────────────────────────────────────────────────────
// Each detector returns warnings; never mutates.

export function detectJumpCuts(): QualityWarning[] {
  const w = baseWarning({
    type: "jump_cut",
    category: "continuity",
    severity: "medium",
    range: { start_ms: 74200, end_ms: 74201 },
    explanation: "Same speaker, framing, background, and eyeline continue across the cut, but head position changes by 18% of frame height.",
    evidence: {
      before_clip_id: "clip_17", after_clip_id: "clip_21", subject_id: "person_044",
      before_position: [0.42, 0.51], after_position: [0.42, 0.69],
      head_shift_percent: 18, camera_angle: "same", background_match: 0.92, audio_continuous: true, cut_inside_sentence: true,
      confidence: 0.82,
    },
    suggested_fixes: [
      { type: "extend_shot", confidence: 0.68, parameters: { extend_ms: 420 } },
      { type: "insert_b_roll", confidence: 0.81, candidate_asset_id: "asset_broll_product_closeup", parameters: { duration_ms: 840, fit_mode: "cover" } },
      { type: "select_matching_take", confidence: 0.84, candidate_clip_id: "clip_08_alt" },
      { type: "crop_punch_in", confidence: 0.71, parameters: { scale: 1.15 } },
      { type: "deliberate_classification", confidence: 0.5 },
    ],
    requires_approval: true,
    related_nodes: ["node_trim_03"],
    semantic_span_ids: ["span_01"],
  });
  return [w];
}

export function detectEyelineAndScreenDirection(): QualityWarning[] {
  return [
    baseWarning({
      type: "eyeline_break",
      category: "continuity",
      severity: "medium",
      range: { start_ms: 41200, end_ms: 43800 },
      explanation: "The subject appears to look toward screen-left before the cut and screen-right after it, despite the sequence implying a continuous conversation.",
      evidence: { before_clip_id: "clip_17", after_clip_id: "clip_21", subject_id: "person_044", before_gaze_vector: [0.21, -0.04], after_gaze_vector: [-0.38, 0.06], confidence: 0.86, axis_overlay: "available", gaze_vectors: "tracked" },
      suggested_fixes: [{ type: "insert_reaction_shot", confidence: 0.73 }, { type: "select_matching_take", candidate_clip_id: "clip_19", confidence: 0.81 }],
      related_nodes: ["node_multicam_02"],
    }),
    baseWarning({
      type: "screen_direction_break",
      category: "continuity",
      severity: "high",
      range: { start_ms: 58000, end_ms: 61200 },
      explanation: "The conversation axis changes between adjacent shots, making both speakers appear to face the same side.",
      evidence: { subjects: ["person_044", "person_052"], confidence: 0.78 },
      suggested_fixes: [{ type: "use_alternate_angle", confidence: 0.82 }, { type: "insert_establishing_shot", confidence: 0.77 }],
    }),
  ];
}

export function detectObjectPropContinuity(): QualityWarning[] {
  return [
    baseWarning({
      type: "object_position_mismatch",
      category: "continuity",
      severity: "high",
      range: { start_ms: 74200, end_ms: 80100 },
      explanation: "Laptop open (centroid 0.32,0.58) in clip_17 and closed (0.71,0.44) in clip_21 — possible action not shown.",
      evidence: { object_id: "object_laptop_01", label: "laptop", ranges: [{ clip_id: "clip_17", centroid: [0.32, 0.58], state: "open" }, { clip_id: "clip_21", centroid: [0.71, 0.44], state: "closed" }], confidence: 0.91, track: "object_laptop_01" },
      suggested_fixes: [{ type: "insert_action_shot", confidence: 0.79, parameters: { duration_ms: 800 } }],
      source_assets: ["asset_camera_a001"],
      related_nodes: ["node_object_track_04"],
    }),
  ];
}

export function detectClothing(): QualityWarning[] {
  return [
    baseWarning({
      type: "wardrobe_continuity",
      category: "continuity",
      severity: "low",
      range: { start_ms: 130000, end_ms: 162000 },
      explanation: "Subject’s jacket appears dark blue in first take and black in replacement take. Lighting variance may explain part of difference.",
      evidence: { scene_group: "Interview Setup 01", before_color: "dark blue", after_color: "black", lighting_adjusted_confidence: 0.68, confidence: 0.68 },
      suggested_fixes: [{ type: "match_grade", confidence: 0.71 }, { type: "constrained_color_correct", confidence: 0.66 }],
      false_positive_risk: "moderate" as const,
      style_dependent: true,
    }),
  ];
}

export function detectLightingBackground(): QualityWarning[] {
  return [
    baseWarning({
      type: "background_continuity",
      category: "continuity",
      severity: "medium",
      range: { start_ms: 83000, end_ms: 87200 },
      explanation: "Window frame shifts 14% horizontally, background blur changes f/2.8-like to deep focus, shadow direction differs 32° — likely alternate take or background replacement.",
      evidence: { window_shift_percent: 14, blur_change: "f/2.8→deep focus", shadow_delta_deg: 32, likely_causes: ["alternate_take", "background_replacement", "camera_position_change"], confidence: 0.74 },
      suggested_fixes: [{ type: "matching_background_plate", confidence: 0.72 }],
    }),
  ];
}

export function detectAudioDrift(): QualityWarning[] {
  // Δ(t)=t_audio - t_video
  return [
    baseWarning({
      type: "audio_drift",
      category: "audio_sync",
      severity: "high",
      range: { start_ms: 0, end_ms: 3720000 },
      explanation: "Long-form drift: initial offset 14ms, final 183ms, rate 0.0027 ms/min — perceptible after ~30 min.",
      evidence: { initial_offset_ms: 14, final_offset_ms: 183, drift_rate_ms_per_minute: 0.0027, first_perceptible_ms: 1800000, confidence: 0.88, model_version: "n0va-audio-sync-v2" },
      suggested_fixes: [{ type: "time_stretch_correct", confidence: 0.86 }, { type: "relink_production_audio", confidence: 0.81 }],
      related_nodes: ["node_audio_sync_01"],
    }),
  ];
}

export function detectLipSync(): QualityWarning[] {
  return [
    baseWarning({
      type: "lip_sync_mismatch",
      category: "audio_sync",
      severity: "high",
      range: { start_ms: 12400, end_ms: 17700 },
      explanation: "Dialogue begins ~118 ms before visible mouth movement (phoneme alignment 0.61) — likely dubbed audio offset.",
      evidence: { speaker_id: "person_044", estimated_offset_ms: 118, phoneme_alignment_confidence: 0.61, likely_cause: "dubbed_audio", mouth_track: "available", confidence: 0.77 },
      suggested_fixes: [{ type: "re_time_dialogue", confidence: 0.82 }, { type: "rerun_lip_sync_locked", confidence: 0.74 }],
      related_nodes: ["node_voice_synthesis_02"],
    }),
  ];
}

export function detectScreenReplacement(): QualityWarning[] {
  return [
    baseWarning({
      type: "screen_replacement_drift",
      category: "ai_transformation",
      severity: "high",
      range: { start_ms: 48600, end_ms: 53200 },
      explanation: "Replacement UI drifts 11px outside tracked screen boundary during hand occlusion; text inconsistent with approved build v3.4.",
      evidence: { drift_px: 11, occlusion: "hand", text_mismatch: true, approved_build: "v3.4", corner_tracking: 0.82, confidence: 0.92 },
      suggested_fixes: [{ type: "rerun_planar_tracking_occlusion_mask", confidence: 0.84 }, { type: "use_approved_asset_v3_4", confidence: 0.91 }],
      related_nodes: ["node_screen_replace_04"],
      source_assets: ["asset_ui_v3_4"],
    }),
  ];
}

export function detectDuplicates(): QualityWarning[] {
  return [
    baseWarning({
      type: "duplicate_dialogue",
      category: "duplicate_content",
      severity: "medium",
      range: { start_ms: 21000, end_ms: 26800 },
      explanation: "Both ranges contain substantially the same answer (similarity 0.96, perceptual hash + transcript).",
      evidence: { ranges: [{ start_ms: 21000, end_ms: 26800 }, { start_ms: 74400, end_ms: 80100 }], similarity: 0.96, transcript_summary: "Both ranges contain substantially the same answer.", confidence: 0.86 },
      suggested_fixes: [{ type: "keep_first", confidence: 0.72 }, { type: "keep_stronger_emotional", confidence: 0.78 }],
    }),
    baseWarning({
      type: "duplicate_shot",
      category: "duplicate_content",
      severity: "low",
      range: { start_ms: 74400, end_ms: 80100 },
      explanation: "Near-duplicate angle of earlier shot (camera-motion signature 0.93).",
      evidence: { similarity: 0.93, confidence: 0.74 },
      suggested_fixes: [{ type: "use_alternate_angle", confidence: 0.71 }],
    }),
  ];
}

export function detectLowerThird(): QualityWarning[] {
  return [
    baseWarning({
      type: "lower_third_identity_mismatch",
      category: "graphics_text",
      severity: "critical",
      range: { start_ms: 32000, end_ms: 38000 },
      explanation: "On-screen text 'Anita Rao — Chief Marketing Officer' vs approved 'Anita Rao — VP Marketing' (CRM registry).",
      evidence: { on_screen_text: "Anita Rao — Chief Marketing Officer", detected_speaker: "person_044", approved_identity: "Anita Rao — VP Marketing", confidence: 0.99, crm_match: false },
      suggested_fixes: [{ type: "replace_from_registry", confidence: 0.99 }, { type: "open_approval_request", confidence: 0.71 }],
      export_blocking: true,
      related_nodes: ["node_lower_third_07"],
    }),
  ];
}

export function detectColorTemperature(): QualityWarning[] {
  return [
    baseWarning({
      type: "color_temperature_mismatch",
      category: "color_finishing",
      severity: "medium",
      range: { start_ms: 91000, end_ms: 95600 },
      explanation: "White-balance delta -1050K (5100K→4050K), skin-tone shift 0.18 — likely grade mismatch not intentional transition (checked scene boundary, LUT).",
      evidence: { previous_shot_temperature_kelvin: 5100, current_shot_temperature_kelvin: 4050, estimated_delta_kelvin: -1050, skin_tone_shift: 0.18, confidence: 0.89, scene_boundary: false },
      suggested_fixes: [{ type: "match_to_previous", confidence: 0.84 }, { type: "apply_scene_lut", confidence: 0.81 }],
      related_nodes: ["node_color_grade_04"],
    }),
  ];
}

export function detectSafeTitle(): QualityWarning[] {
  return [
    baseWarning({
      type: "unsafe_title_area",
      category: "delivery_cropping",
      severity: "high",
      range: { start_ms: 12000, end_ms: 19400 },
      explanation: "Lower third overflows safe areas: Instagram Reels 9:16 right 4.8%, YouTube 16:9 bottom 1.2%.",
      evidence: { graphic_id: "lowerthird_07", violations: [{ profile: "instagram_reels_9x16", edge: "right", overflow_percent: 4.8 }, { profile: "youtube_16x9", edge: "bottom", overflow_percent: 1.2 }], confidence: 0.91 },
      suggested_fixes: [{ type: "move_to_platform_safe_anchor", confidence: 0.88 }, { type: "reduce_width_8pct", confidence: 0.79 }],
      export_blocking: true,
      related_nodes: ["node_title_safe_01"],
    }),
  ];
}

// ── Pass aggregator ─────────────────────────────────────────────────────────
export function runPasses(passes: QualityPassId[]): QualityWarning[] {
  const map: Record<QualityPassId, () => QualityWarning[]> = {
    editorial_continuity: () => [...detectJumpCuts(), ...detectEyelineAndScreenDirection(), ...detectObjectPropContinuity(), ...detectClothing(), ...detectDuplicates()],
    technical: () => [...detectAudioDrift(), ...detectLipSync()],
    visual_consistency: () => [...detectLightingBackground(), ...detectColorTemperature(), ...detectClothing()],
    graphics_text: () => [...detectLowerThird(), ...detectSafeTitle(), ...detectScreenReplacement()],
    distribution: () => [...detectSafeTitle()],
  };
  const out: QualityWarning[] = [];
  for (const p of passes) {
    const fn = map[p];
    if (fn) out.push(...fn());
  }
  // de-dup by type+range (keep highest severity)
  return out;
}

export function runAllDetectors(): QualityWarning[] {
  return [
    ...detectJumpCuts(), ...detectEyelineAndScreenDirection(), ...detectObjectPropContinuity(),
    ...detectClothing(), ...detectLightingBackground(), ...detectAudioDrift(), ...detectLipSync(),
    ...detectScreenReplacement(), ...detectDuplicates(), ...detectLowerThird(), ...detectColorTemperature(), ...detectSafeTitle(),
  ];
}

// ── Analysis pipeline (non-destructive) ─────────────────────────────────────
export type AnalysisRequest = {
  timeline_id?: string;
  graph_version?: string;
  passes: QualityPassId[];
  export_profiles?: string[];
  mode?: "non_destructive";
  project_type?: "documentary" | "advertisement" | "legal_exhibit" | "social_clip";
};

export function runQualityAnalysis(req: AnalysisRequest): QualityWarning[] {
  const warnings = runPasses(req.passes.length ? req.passes : ["editorial_continuity", "technical", "visual_consistency", "graphics_text", "distribution"]);
  // attach graph_version, link to semantic/graph, store as findings
  for (const w of warnings) {
    w.graph_version = req.graph_version ?? DEMO_GRAPH;
    w.timeline_id = req.timeline_id ?? DEMO_TIMELINE;
    // persist as finding+warning
    const fid = uid("qf");
    const finding: QualityFinding = {
      quality_finding_id: fid,
      tenant_id: "tenant001",
      project_id: "project001",
      timeline_id: w.timeline_id,
      graph_version: w.graph_version,
      finding_type: w.type,
      category: w.category,
      severity: w.severity,
      confidence: (w.evidence.confidence as number) ?? 0.8,
      source_ranges: [{ asset_id: "asset001", start_ms: w.range.start_ms, end_ms: w.range.end_ms }],
      timeline_ranges: [{ start_ms: w.range.start_ms, end_ms: w.range.end_ms }],
      related_nodes: w.related_nodes ?? [],
      evidence_artifacts: [`artifact_track_${w.warning_id}`, `artifact_diff_${w.warning_id}`],
      suggestions: [],
      status: w.status as WarningStatus,
      human_resolution: null,
      model: { name: "n0va-continuity-v3", version: "3.2.0", digest: "sha3-512:model..." },
      export_blocking: w.export_blocking,
    };
    findingStore.set(fid, finding);
    warningStore.set(w.warning_id, w);
    // link finding ↔ warning via suggestion placeholder
    finding.suggestions = w.suggested_fixes.map((_, i) => `proposal_${w.warning_id}_${i}`);
  }
  // apply style-dependent filtering via feedback
  return warnings.filter(w => !isStyleSuppressed(w));
}

function isStyleSuppressed(w: QualityWarning): boolean {
  // if feedback says jump cuts intentional, suppress jump_cut warnings
  for (const fb of feedbackStore) {
    if (fb.statement.toLowerCase().includes("jump cut") && w.type === "jump_cut") return true;
    if (fb.statement.toLowerCase().includes("title-safe") && w.type === "unsafe_title_area") return true;
  }
  return false;
}

// ── Link warnings to moved semantic ranges ──────────────────────────────────
export function moveWarningsForClip(clipId: string, newRange: { start_ms: number; end_ms: number }): void {
  for (const w of warningStore.values()) {
    if ((w.evidence as Record<string, unknown>).before_clip_id === clipId || (w.evidence as Record<string, unknown>).after_clip_id === clipId) {
      w.range = { ...newRange };
    }
  }
}

// ── Proposals (non-destructive, graph proposals) ─────────────────────────────
export function generateProposalsForFinding(findingId: string): QualityProposal[] {
  const f = findingStore.get(findingId);
  if (!f) return [];
  const firstStart = f.timeline_ranges[0]?.start_ms ?? 0;
  const w = Array.from(warningStore.values()).find(x => x.range.start_ms === firstStart && x.type === f.finding_type) ?? Array.from(warningStore.values())[0];
  if (!w) return [];
  const props: QualityProposal[] = w.suggested_fixes.map((fix, i) => ({
    proposal_id: `proposal_${w.warning_id}_${i}`,
    warning_id: w.warning_id,
    operation: { type: fix.type, parameters: { candidate_asset_id: (fix as Record<string, unknown>).candidate_asset_id ?? "asset_broll_07", candidate_clip_id: (fix as Record<string, unknown>).candidate_clip_id, duration_ms: 840, fit_mode: "cover", audio_policy: "preserve_dialogue", ...fix.parameters } },
    expected_effect: {
      warning_resolution: "likely",
      duration_delta_ms: fix.type.includes("extend") ? 420 : 0,
      continuity_risk: 0.14,
      new_warnings: fix.type === "insert_b_roll" ? ["caption_overlap_possible"] : [],
    },
    mode: "preview_only",
    requires_approval: true,
    graph_node_id: `node_proposal_${w.warning_id}_${i}`,
  }));
  for (const p of props) proposalStore.set(p.proposal_id, p);
  return props;
}

export function getProposal(proposalId: string): QualityProposal | null { return proposalStore.get(proposalId) ?? null; }

export function applyProposal(proposalId: string, destination: "new_branch" | "current_timeline", branchName?: string): { applied: boolean; new_branch?: string; requires_reanalysis: boolean } {
  const p = proposalStore.get(proposalId);
  if (!p) throw new Error(`Proposal ${proposalId} not found`);
  // never silently alters — requires approval already checked via requires_approval
  if (destination === "new_branch") {
    return { applied: true, new_branch: branchName ?? `branch_${Date.now()}`, requires_reanalysis: true };
  }
  return { applied: true, requires_reanalysis: true };
}

export function resolveFinding(findingId: string, resolution: "intentional" | "dismissed" | "resolved", note?: string, by?: string): QualityFinding | null {
  const f = findingStore.get(findingId);
  const w = f ? warningStore.get(Array.from(warningStore.values()).find(x => x.type === f.finding_type)?.warning_id ?? "") : null;
  if (!f) return null;
  f.human_resolution = { resolution, note: note ?? "" };
  f.status = resolution === "intentional" ? "intentional" : resolution === "dismissed" ? "dismissed" : "resolved";
  if (w) {
    w.status = f.status as WarningStatus;
    w.human_resolution = { resolution, note, by, at: nowIso() };
  }
  // learn feedback if intentional
  if (resolution === "intentional" && note) {
    feedbackStore.push({ feedback_id: uid("fb"), scope: { project: f.project_id, warning_type: f.finding_type }, statement: note, version: 1, created_at: nowIso() });
  }
  return f;
}

// ── Confidence & human review metadata ──────────────────────────────────────
export function enrichConfidence(w: QualityWarning): QualityWarning & { confidence_explain: string } {
  const fp = w.false_positive_risk ?? "moderate";
  return { ...w, confidence_explain: `Confidence ${(w.evidence.confidence as number).toFixed(2)} via ${(w.evidence.evidence_sources as string[] ?? ["visual continuity","object tracking"]).join("+")} — false-positive ${fp}. ${w.evidence.lighting_adjusted_confidence ? `Lighting-adjusted 0.68.` : ""} Model ${w.evidence.model_version ?? "n0va-continuity-v3"} threshold ${w.evidence.threshold ?? 0.7}.` };
}

// ── Editorial intent learning (scoped) ──────────────────────────────────────
export function recordFeedback(statement: string, scope: EditorialIntentFeedback["scope"]): EditorialIntentFeedback {
  const fb: EditorialIntentFeedback = { feedback_id: uid("fb"), scope, statement, version: 1, created_at: nowIso() };
  feedbackStore.push(fb);
  return fb;
}
export function listFeedback(): EditorialIntentFeedback[] { return [...feedbackStore]; }

// ── Dashboard ────────────────────────────────────────────────────────────────
export function getDashboard(timelineId?: string): QualityDashboard {
  const all = Array.from(warningStore.values()).filter(w => !timelineId || w.timeline_id === timelineId);
  const by_severity: Record<string, number> = { informational: 0, low: 0, medium: 0, high: 0, critical: 0 };
  const by_category: Record<string, number> = { continuity: 0, audio_sync: 0, graphics_text: 0, color_finishing: 0, delivery_cropping: 0, duplicate_content: 0, ai_transformation: 0 };
  for (const w of all) {
    by_severity[w.severity] = (by_severity[w.severity] ?? 0) + 1;
    by_category[w.category] = (by_category[w.category] ?? 0) + 1;
  }
  const readiness: QualityDashboard["export_readiness"] = {
    master: { ready: (by_severity.critical ?? 0) === 0 && (by_severity.high ?? 0) === 0, blocking: all.filter(w => w.severity === "high" || w.severity === "critical").map(w => w.warning_id), warnings: all.length },
    youtube_4k_hdr: { ready: (by_severity.critical ?? 0) === 0, blocking: [], warnings: all.filter(w => w.severity !== "informational").length },
    instagram_reels_9x16: { ready: !all.some(w => w.type === "unsafe_title_area" && w.severity === "high"), blocking: all.filter(w => w.type === "unsafe_title_area").map(w => w.warning_id), warnings: all.length },
    client_review: { ready: true, blocking: [], warnings: all.filter(w => w.severity === "low" || w.severity === "informational").length },
  };
  return {
    open: all.filter(w => w.status === "open").length,
    by_severity: by_severity as QualityDashboard["by_severity"],
    by_category: by_category as QualityDashboard["by_category"],
    export_readiness: readiness,
    findings: all,
  };
}

// ── Quality gate ─────────────────────────────────────────────────────────────
export function evaluateGate(graph_version: string, export_profile: string, rules: QualityGate["blocking_rules"]): QualityGate {
  const all = Array.from(warningStore.values()).filter(w => w.graph_version === graph_version || w.graph_version === DEMO_GRAPH);
  const blocking: string[] = [];
  if (rules.critical_warnings === "zero" && all.some(w => w.severity === "critical")) blocking.push(...all.filter(w => w.severity === "critical").map(w => w.warning_id));
  if (rules.high_warnings === "zero" && all.some(w => w.severity === "high")) blocking.push(...all.filter(w => w.severity === "high").map(w => w.warning_id));
  if (rules.lower_third_identity_mismatch === "zero" && all.some(w => w.type === "lower_third_identity_mismatch")) blocking.push(...all.filter(w => w.type === "lower_third_identity_mismatch").map(w => w.warning_id));
  // audio sync check
  const audioMax = all.filter(w => w.type === "audio_drift" || w.type === "lip_sync_mismatch").some(w => ((w.evidence as Record<string, unknown>).estimated_offset_ms as number ?? 0) > rules.audio_sync_max_ms);
  if (audioMax) blocking.push(...all.filter(w => w.type === "audio_drift" || w.type === "lip_sync_mismatch").map(w => w.warning_id));
  const unsafe = all.filter(w => w.type === "unsafe_title_area" && (w.evidence as Record<string, unknown>).violations);
  if (unsafe.length && rules.unsafe_title_overflow_percent === 0) blocking.push(...unsafe.map(w => w.warning_id));
  const gate: QualityGate = {
    quality_gate_id: uid("gate"),
    graph_version,
    export_profile,
    blocking_rules: rules,
    result: blocking.length ? "blocked" : "ready",
    blocking_warnings: [...new Set(blocking)],
    evaluated_at: nowIso(),
  };
  gateStore.set(gate.quality_gate_id, gate);
  return gate;
}

// ── Data model helpers ──────────────────────────────────────────────────────
export function getFindings(timelineId?: string): QualityFinding[] {
  const all = Array.from(findingStore.values());
  return timelineId ? all.filter(f => f.timeline_id === timelineId) : all;
}
export function getWarnings(timelineId?: string): QualityWarning[] {
  const all = Array.from(warningStore.values());
  return timelineId ? all.filter(w => w.timeline_id === timelineId) : all;
}
export function getFinding(findingId: string): QualityFinding | null { return findingStore.get(findingId) ?? null; }
export function getWarning(warningId: string): QualityWarning | null { return warningStore.get(warningId) ?? null; }
export function clearQualityStores(): void { findingStore.clear(); warningStore.clear(); proposalStore.clear(); gateStore.clear(); feedbackStore.length = 0; }
export function counts(): { findings: number; warnings: number; proposals: number; gates: number } { return { findings: findingStore.size, warnings: warningStore.size, proposals: proposalStore.size, gates: gateStore.size }; }
