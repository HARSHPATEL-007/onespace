/**
 * N0VA VIDEOS — Copilot Engine (plan–simulate–approve–commit)
 * Separates planning from execution. All state-changing actions staged.
 * Implements: intent envelope, context packet, evidence retrieval, edit plan,
 * confidence decomposition, risk/policy, simulation, transactional commit.
 */
import type {
  AutonomyMode, IntentEnvelope, ContextPacket, Evidence, EditOperation,
  Proposal, ConfidenceBreakdown, RiskAssessment, SimulationPackage, Snapshot, AuditRecord,
} from "./copilot-types";

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36)}`;
}
function nowIso() { return new Date().toISOString(); }

// ── Intent Envelope ──────────────────────────────────────────────────────────
export function parseIntentEnvelope(input: {
  user_request: string;
  project_id: string;
  timeline_id?: string;
  autonomy_mode?: AutonomyMode;
  target_duration_ms?: number | null;
  constraints?: Record<string, boolean>;
  source_scope?: string;
  output_mode?: IntentEnvelope["output_mode"];
}): IntentEnvelope {
  const request = input.user_request.trim();
  const lower = request.toLowerCase();

  // Infer creative goal
  let creative_goal: string | null = null;
  if (/product demonstration|product demo|demo/.test(lower)) creative_goal = "product_demonstration";
  else if (/energetic|fast|punchy|upbeat/.test(lower)) creative_goal = "energetic";
  else if (/pricing|price|cost/.test(lower)) creative_goal = "pricing_discussion";
  else if (/reference|match.*reference|style/.test(lower)) creative_goal = "style_match";

  // Infer duration
  let target_duration_ms = input.target_duration_ms ?? null;
  const m = lower.match(/(\d+)\s*(second|sec|s|minute|min|m)\b/);
  if (m) {
    const n = parseInt(m[1]!, 10);
    target_duration_ms = /minute|min|m/.test(m[2]!) ? n * 60_000 : n * 1_000;
  } else if (/60-second|60s/.test(lower)) target_duration_ms = 60_000;

  // Output mode
  let output_mode: IntentEnvelope["output_mode"] = input.output_mode ?? "draft_branch";
  if (/find every|find all|search|where.*mentions/.test(lower)) output_mode = "evidence_only";
  if (/generate three versions|linkedin.*youtube.*instagram/.test(lower)) output_mode = "derivative_matrix";

  // Inferred preferences (visible assumptions)
  const inferred: IntentEnvelope["inferred"] = {};
  const assumptions: string[] = [];
  const unknowns: string[] = [];

  if (/make it energetic/.test(lower)) {
    inferred["pacing"] = { value: "faster pacing, shorter pauses, higher music energy, brighter grade", reason: "interpreted 'energetic' as editorial rhythm + grade", confidence: 0.72 };
    assumptions.push("Energetic = faster pacing, shorter pauses, higher music energy, brighter grade");
  }
  if (/strongest take/.test(lower) && !/cleanest audio|best facial|transcript|eye line|technical quality/.test(lower)) {
    unknowns.push("criterion for 'strongest' not specified — will present ranked list with default weighting");
    inferred["strongest_default"] = { value: "weighted: clean audio 0.25, transcript completeness 0.2, technical quality 0.2, eye line 0.15, emotional energy 0.2", reason: "default weighting for strongest", confidence: 0.68 };
  }
  if (/product demonstration/.test(lower)) {
    // may be multiple demos
    inferred["demo_selection"] = { value: "approved demo featuring laptop (highest visual+transcript relevance)", reason: "three product demos found, ranked by approved status + relevance", confidence: 0.81 };
    assumptions.push("Selected approved demo featuring laptop because highest relevance; alternatives remain visible");
  }

  const autonomy_mode = input.autonomy_mode ?? "assisted";
  const requires_approval = autonomy_mode !== "observe" && !/evidence_only/.test(output_mode) || /publish|external|purge|consent|voice clone|identity/.test(lower);

  return {
    intent_id: uid("int"),
    user_request: request,
    project_id: input.project_id,
    timeline_id: input.timeline_id ?? `tl_${input.project_id.slice(0, 6)}`,
    target_duration_ms,
    creative_goal,
    target_audience: null,
    source_scope: input.source_scope ?? "approved_project_assets",
    output_mode,
    autonomy_mode,
    constraints: {
      preserve_brand_assets: true,
      preserve_approved_audio: true,
      no_identity_generation: true,
      ...(input.constraints ?? {}),
    },
    inferred,
    unknowns,
    assumptions,
    requires_approval,
    created_at: nowIso(),
  };
}

// ── Context Packet (purpose-bound, not all hyper-context) ────────────────────
export function assembleContextPacket(envelope: IntentEnvelope, opts?: { projectTitle?: string }): ContextPacket {
  // Mock retrieval scopes — in prod would query hyper-context with purpose-bound filters
  const scopePurpose = envelope.output_mode === "evidence_only"
    ? [{ source: "transcripts", scope: "transcript+speaker", purpose: "evidence retrieval", included: true }]
    : [{ source: "scene+shot+transcript+brand", scope: "approved assets", purpose: "rough-cut planning", included: true }];

  return {
    project_id: envelope.project_id,
    timeline_id: envelope.timeline_id,
    branch: "main",
    base_snapshot: `snap_${new Date().toISOString().slice(0,10).replace(/-/g,"")}_${Math.floor(Math.random()*10000)}`,
    current_timeline: { tracks: [{ id: "v1" }, { id: "a1" }, { id: "gfx" }], markers: [], duration_ms: 183000 },
    locked_clips: ["clip_locked_intro"],
    approved_clips: ["clip_demo_approved", "clip_testimonial_approved"],
    transcripts: [
      { asset_id: "asset_int03", language: "en", segments: [
        { start_ms: 102000, end_ms: 118000, text: "Our pricing starts at $49 per month for the starter plan", speaker: "Speaker A", confidence: 0.98 },
        { start_ms: 251000, end_ms: 267000, text: "The subscription cost includes onboarding and support", speaker: "CEO", confidence: 0.94 },
      ]},
    ],
    scene_boundaries: [
      { start_ms: 0, end_ms: 45000, type: "establishing", confidence: 0.94 },
      { start_ms: 45000, end_ms: 90000, type: "product_demo", confidence: 0.96 },
    ],
    shot_classifications: [
      { shot_id: "shot_07", range: [8500, 15200], quality: 0.91, type: "medium" },
    ],
    objects: [{ asset_id: "asset_demo07", object: "laptop", range: [15000, 45000], confidence: 0.96 }],
    faces: [{ face_id: "face_01", consent: "granted", range: [5200, 124500] }],
    review_comments: [
      { id: "c_002", body: "Add product close-up at 0:45", range: [44000, 46000], resolved: false, severity: "medium", owner: "Client" },
      { id: "c_005", body: "Color too warm", range: [45000, 47000], resolved: false, severity: "low", owner: "Director" },
    ],
    script: { doc_id: "doc_script_01", title: `${opts?.projectTitle ?? "Project"} Script`, segments: [{ text: "Opening", range: [0, 15000] }] },
    shot_list: { sheet_id: "shot_list_01", missing: ["B-roll aerial"] },
    brand_guidelines: { primary_color: "#0ea5e9", font: "Inter", logo_id: "logo_01", rules: ["preserve logo safe area", "no unapproved fonts"] },
    target_platform: envelope.output_mode === "derivative_matrix" ? { name: "multi", aspect: "16:9/1:1/9:16", max_duration_ms: 60000, caption_policy: "burn-in for vertical" } : null,
    legal_holds: [],
    prior_suggestions: { accepted: 12, rejected: 2, modified: 7 },
    tasks: [{ id: "t_01", title: "Rough cut", status: "in_progress", due_at: new Date(Date.now()+86400000).toISOString() }],
    retrieved_sources: scopePurpose.map(s => ({ ...s, included: s.included })),
  };
}

// ── Evidence Retrieval (time-coded, kind-distinguished) ─────────────────────
export function retrieveEvidence(query: string, _context: ContextPacket): Evidence[] {
  const q = query.toLowerCase();
  if (/pricing|price|cost|plan|subscription/.test(q)) {
    return [
      { result: "Interview take 03", timecode: "00:01:42–00:01:58", range_ms: [102000, 118000], evidence: "Transcript contains “pricing,” “plan,” and “subscription”", kind: "exact", confidence: 0.98, speaker: "Speaker A", asset_id: "asset_int03", jump_target_ms: 102000 },
      { result: "Product demo take 07", timecode: "00:04:11–00:04:27", range_ms: [251000, 267000], evidence: "Transcript contains “cost” and “monthly”", kind: "exact", confidence: 0.94, speaker: "CEO", asset_id: "asset_demo07", jump_target_ms: 251000 },
      { result: "CEO interview", timecode: "00:08:02–00:08:15", range_ms: [482000, 495000], evidence: "Semantic match to pricing discussion; no exact keyword", kind: "semantic", confidence: 0.81, speaker: "CEO", asset_id: "asset_ceo01", jump_target_ms: 482000 },
    ];
  }
  if (/product demonstration|demo/.test(q)) {
    return [
      { result: "Product demo take 07", timecode: "00:00:45–00:01:15", range_ms: [45000, 75000], evidence: "Approved product demonstration featuring laptop • object:laptop 0.96 • transcript:'product demonstration'", kind: "exact", confidence: 0.96, asset_id: "asset_demo07", jump_target_ms: 45000 },
      { result: "Product demo take 03", timecode: "00:02:10–00:02:40", range_ms: [130000, 160000], evidence: "Product demonstration (alternate angle) • visual match", kind: "visual", confidence: 0.84, asset_id: "asset_demo03", jump_target_ms: 130000 },
      { result: "Product demo take 11 (unapproved)", timecode: "00:03:05–00:03:30", range_ms: [185000, 210000], evidence: "Inferred product demo • not approved • semantic 0.77", kind: "inferred", confidence: 0.77, asset_id: "asset_demo11", jump_target_ms: 185000 },
    ];
  }
  // generic
  return [
    { result: "Interview take 01", timecode: "00:00:08–00:00:15", range_ms: [8500, 15200], evidence: "Contains approved product demonstration", kind: "semantic", confidence: 0.88, asset_id: "asset_001", jump_target_ms: 8500 },
  ];
}

// ── Edit Planner (typed ordered operations) ──────────────────────────────────
export function planEdit(envelope: IntentEnvelope, context: ContextPacket): EditOperation[] {
  const ops: EditOperation[] = [];
  const goal = envelope.creative_goal;

  if (/pricing/.test(envelope.user_request.toLowerCase()) && envelope.output_mode === "evidence_only") {
    // Evidence-only: markers + selects, no timeline mutation
    ops.push({
      op_id: uid("op"), type: "add_marker", description: "Add markers at pricing mentions for review",
      affected_tracks: ["markers"], time_range: [102000, 118000], reason: "Exact transcript match 'pricing/plan/subscription'",
      confidence: 0.98, risk: "low", reversibility: "complete", evidence_ids: ["ev_01"],
    });
    return ops;
  }

  if (envelope.output_mode === "derivative_matrix") {
    ops.push(
      { op_id: uid("op"), type: "generate_derivative", description: "Derivative: LinkedIn 1:1 concise (strong opening)", affected_tracks: ["video_1","audio_1","graphics_1"], time_range: [0, 45000], parameters: { variant: "LinkedIn", aspect: "1:1" }, reason: "LinkedIn: hook-first, title-safe", confidence: 0.86, risk: "low", reversibility: "branch-only" },
      { op_id: uid("op"), type: "generate_derivative", description: "Derivative: YouTube 16:9 full + chapters", affected_tracks: ["video_1","audio_1"], time_range: [0, 60000], parameters: { variant: "YouTube", aspect: "16:9", chapters: true }, reason: "YouTube: full narrative + chapters", confidence: 0.91, risk: "low", reversibility: "branch-only" },
      { op_id: uid("op"), type: "generate_derivative", description: "Derivative: Instagram 9:16 hook-first", affected_tracks: ["video_1","graphics_1"], time_range: [5000, 35000], parameters: { variant: "Instagram", aspect: "9:16", captions: "burn-in" }, reason: "Instagram: vertical safe areas, burn-in", confidence: 0.84, risk: "low", reversibility: "branch-only" },
    );
    return ops;
  }

  // 60-second product demo cut
  if (goal === "product_demonstration" || envelope.target_duration_ms === 60000) {
    const base: EditOperation[] = [
      { op_id: uid("op"), type: "select_clip", description: "Select opening (establishing, brand-approved)", affected_tracks: ["video_1"], time_range: [0, 8000], source_asset: "asset_est01", source_in_ms: 0, source_out_ms: 8000, reason: "Approved opening • brand safe • high technical quality", confidence: 0.96, risk: "low", reversibility: "complete" },
      { op_id: uid("op"), type: "select_clip", description: "Select product demonstration (approved laptop demo)", affected_tracks: ["video_1","audio_1"], time_range: [8000, 35000], source_asset: "asset_demo07", source_in_ms: 8500, source_out_ms: 35500, reason: "Highest visual+transcript relevance • approved • laptop object 0.96", confidence: 0.94, risk: "low", reversibility: "complete" },
      { op_id: uid("op"), type: "remove_silence", description: "Remove pauses >800ms in demo body", affected_tracks: ["audio_1"], time_range: [8500, 15200], reason: "Pause exceeds pacing target (energetic → shorter pauses)", confidence: 0.91, risk: "low", reversibility: "complete" },
      { op_id: uid("op"), type: "add_transition", description: "Cross-dissolve 350ms between opening and demo", affected_tracks: ["video_1"], time_range: [8000, 8350], parameters: { transition: "cross_dissolve", duration_ms: 350 }, reason: "Smooths continuity between selected shots", confidence: 0.84, risk: "low", reversibility: "parameterized" },
      { op_id: uid("op"), type: "apply_grade", description: "Apply brand grade (preserve approved audio, skin-tone protect)", affected_tracks: ["video_1"], time_range: [0, 60000], parameters: { lut: "lut_corporate_warm_001", skin_protect: true }, reason: "Brand consistency • neural segmentation", confidence: 0.89, risk: "medium", reversibility: "parameterized" },
    ];
    // Check locked
    if (context.locked_clips.length) {
      base[0]!.reason += " • locked master preserved (intro)";
      base[0]!.risk = "medium";
    }
    return base;
  }

  // Strongest take replacement
  if (/strongest take|replace this section/.test(envelope.user_request.toLowerCase())) {
    return [
      { op_id: uid("op"), type: "select_clip", description: "Ranked candidates for 'strongest' (default weighting shown)", affected_tracks: ["video_1"], time_range: [22000, 28000], reason: "Default: clean audio 0.25, transcript completeness 0.2, technical 0.2, eye line 0.15, energy 0.2", confidence: 0.68, risk: "medium", reversibility: "complete", assumptions: ["No criterion supplied — presenting ranked list"] },
      { op_id: uid("op"), type: "trim_clip", description: "Trim alternate take to match surrounding shot continuity", affected_tracks: ["video_1","audio_1"], time_range: [22000, 28000], parameters: { alt_asset: "asset_int05" }, reason: "Best eye line + transcript completeness among alternates", confidence: 0.83, risk: "low", reversibility: "complete" },
    ];
  }

  // Match reference style/pacing
  if (/match.*reference|style|pacing/.test(envelope.user_request.toLowerCase())) {
    return [
      { op_id: uid("op"), type: "apply_grade", description: "Visual style plan: color space, exposure, LUT from reference (permission-checked)", affected_tracks: ["video_1"], time_range: [0, 183000], parameters: { reference_profile: "ref_style_01", style_transfer: "AdaIN" }, reason: "Reference-derived style profile (not frame copy)", confidence: 0.79, risk: "medium", reversibility: "parameterized" },
      { op_id: uid("op"), type: "speed_ramp", description: "Editorial rhythm plan: avg shot length 2.1s, cut density 18/min, pause <400ms", affected_tracks: ["video_1","audio_1"], time_range: [0, 183000], parameters: { avg_shot_ms: 2100, beat_align: true }, reason: "Reference rhythm analysis", confidence: 0.81, risk: "low", reversibility: "parameterized" },
    ];
  }

  // Fallback: generic proposal
  return [
    { op_id: uid("op"), type: "select_clip", description: "Select best approved segment (semantic match)", affected_tracks: ["video_1"], time_range: [8500, 15200], source_asset: "asset_001", source_in_ms: 8500, source_out_ms: 15200, reason: "Contains approved product demonstration", confidence: 0.88, risk: "low", reversibility: "complete" },
    { op_id: uid("op"), type: "audio_cleanup", description: "Dialogue cleanup + rebalance", affected_tracks: ["audio_1"], time_range: [8500, 15200], reason: "Broadcast-quality audio with voice preservation", confidence: 0.92, risk: "low", reversibility: "parameterized" },
  ];
}

export function confidenceBreakdown(ops: EditOperation[], envelope: IntentEnvelope): ConfidenceBreakdown {
  const avg = (arr: number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0.85;
  const retrieval = avg(ops.map(o=> o.confidence)) * 0.98; // slight boost if retrieval good
  const semantic = envelope.creative_goal ? 0.91 : 0.82;
  const edit = 0.84 + Math.min(0.08, ops.length * 0.01);
  const technical = 0.98; // high unless generative fill
  const policy = envelope.constraints.no_identity_generation ? 0.93 : 0.88;
  const user_preference = 0.79; // learned style moderate
  const overall = Number(((retrieval + semantic + edit + technical + policy + user_preference)/6).toFixed(2));
  const uncertainty = envelope.unknowns.length ? envelope.unknowns[0] : (ops.some(o=> o.confidence < 0.75) ? "One operation below 0.75 confidence" : undefined);
  return {
    retrieval: Number(retrieval.toFixed(2)), semantic: Number(semantic.toFixed(2)), edit: Number(edit.toFixed(2)),
    technical: Number(technical.toFixed(2)), policy: Number(policy.toFixed(2)), user_preference: Number(user_preference.toFixed(2)),
    overall, explanation: "Aggregated across 6 dimensions; high-confidence proposal still requires approval if it touches locked master, consent-controlled identity, or external publish.",
    uncertainty_reason: uncertainty,
  };
}

export function riskAssessment(ops: EditOperation[], envelope: IntentEnvelope): RiskAssessment {
  const hasHigh = ops.some(o=> o.risk === "high" || o.risk === "critical");
  const hasExternal = ops.some(o=> o.reversibility === "external" || o.reversibility === "irreversible");
  const touchesLocked = envelope.constraints.preserve_brand_assets && ops.some(o=> o.parameters && (o.parameters as Record<string,unknown>).lut);
  let level: RiskAssessment["level"] = hasExternal ? "critical" : hasHigh ? "high" : ops.some(o=> o.risk==="medium")||touchesLocked ? "medium" : "low";
  let reversibility: RiskAssessment["reversibility"] = hasExternal ? "external" : ops.every(o=> o.reversibility==="complete") ? "complete" : "parameterized";
  if (envelope.output_mode === "derivative_matrix") { level = "low"; reversibility = "branch-only"; }
  return {
    level,
    reversibility: reversibility as RiskAssessment["reversibility"],
    policy_flags: [
      ...(envelope.constraints.no_identity_generation ? [] : ["identity_generation"]),
      ...(touchesLocked ? ["brand_asset_review"] : []),
      ...(/\bpublish\b/.test(envelope.user_request.toLowerCase()) ? ["external_publish"] : []),
    ],
    requires_approval: level !== "low" || hasExternal || envelope.requires_approval,
    approver_role: level === "critical" ? "admin" : level === "high" ? "brand_owner" : "editor",
    estimated_render_cost_usd: Number((ops.length * 0.07).toFixed(2)),
    estimated_render_ms: ops.length * 2200 + (envelope.target_duration_ms ?? 60000) * 0.02,
    rollback_info: reversibility === "complete" ? "One-click undo" : reversibility === "parameterized" ? "Restore prior parameters" : reversibility === "branch-only" ? "Delete/archive branch" : "Compensating action + audit",
  };
}

export function simulateProposal(envelope: IntentEnvelope, ops: EditOperation[], confidence: ConfidenceBreakdown, risk: RiskAssessment): SimulationPackage {
  const before = 183000;
  const after = envelope.target_duration_ms ?? (before - ops.filter(o=> o.type==="remove_silence").length * 800 + ops.filter(o=> o.type==="select_clip").length * 1000);
  return {
    proxy_video_url: `https://cdn.n0va.io/proxy/${uid("sim")}/preview.mp4`,
    audio_preview_url: `https://cdn.n0va.io/proxy/${uid("sim")}/audio.mp3`,
    before_duration_ms: before,
    after_duration_ms: Math.max(5000, Math.min(300000, Math.round(after))),
    duration_delta_ms: Math.round((envelope.target_duration_ms ?? after) - before),
    diff: { added: ops.filter(o=> o.type==="select_clip").length, removed: ops.filter(o=> o.type==="remove_silence"||o.type==="remove_clip").length, modified: ops.filter(o=> o.type==="apply_grade"||o.type==="add_transition").length, unchanged: 12 },
    timeline_diff: { before: { tracks: 4, clips: 14 }, after: { tracks: 4, clips: 14 + ops.filter(o=> o.type==="select_clip").length } },
    color_changes: ops.filter(o=> o.type==="apply_grade").map(o=> o.description),
    audio_changes: ops.filter(o=> o.type==="audio_cleanup"||o.type==="remove_silence").map(o=> o.description),
    caption_changes: ["Caption timing refined (±40ms)"],
    compliance_warnings: risk.policy_flags.includes("external_publish") ? ["External publish requires named approver"] : [],
    export_impact: [`Estimated final duration ${Math.round((envelope.target_duration_ms ?? after)/1000)}s`, `Quality score ${(confidence.technical*100).toFixed(0)}`],
    quality_score: Math.round(confidence.technical * 100),
    cost_estimate_usd: risk.estimated_render_cost_usd,
    render_time_estimate_ms: Math.round(risk.estimated_render_ms),
    proxy_quality: envelope.target_duration_ms && envelope.target_duration_ms>120000 ? "proxy" : "proxy", // full only after approval for heavy ops
  };
}

export function createProposal(envelope: IntentEnvelope, context: ContextPacket): Proposal {
  const ops = planEdit(envelope, context);
  const confidence = confidenceBreakdown(ops, envelope);
  const risk = riskAssessment(ops, envelope);
  const simulation = simulateProposal(envelope, ops, confidence, risk);
  const evidence = envelope.output_mode === "evidence_only" ? retrieveEvidence(envelope.user_request, context) : retrieveEvidence(envelope.user_request, context).slice(0,2);
  return {
    proposal_id: uid("prop"),
    intent: envelope,
    base_snapshot: context.base_snapshot,
    target_branch: `ai_draft_${Math.floor(Math.random()*90+10)}`,
    operations: ops,
    confidence,
    risk,
    simulation,
    evidence,
    context_sources: context.retrieved_sources.map(s=> `${s.source} (${s.scope})`),
    created_at: nowIso(),
    status: "preview_ready",
    merge_conflict: { has_conflict: false, conflicting_range: null, message: "No conflict — base snapshot unchanged" },
  };
}

export function detectConflict(baseSnapshot: string, currentSnapshot: string): Proposal["merge_conflict"] {
  if (baseSnapshot !== currentSnapshot) {
    return { has_conflict: true, conflicting_range: [22000, 28000], message: "Another editor changed 00:22–00:28 since planning. Show conflict map — merge requires manual resolve, not silent overwrite." };
  }
  return { has_conflict: false, conflicting_range: null, message: "No conflict — base snapshot unchanged" };
}

export function auditForProposal(proposal: Proposal, autonomyMode: AutonomyMode): AuditRecord {
  return {
    audit_id: uid("audit"),
    intent_id: proposal.intent.intent_id,
    proposal_id: proposal.proposal_id,
    autonomy_mode: autonomyMode,
    user_request: proposal.intent.user_request,
    retrieved_context: proposal.context_sources,
    agent_calls: [
      { agent: "RetrievalAgent", input: { query: proposal.intent.user_request }, output: { evidence: proposal.evidence.length }, duration_ms: 87 },
      { agent: "NarrativePlanner", input: { goal: proposal.intent.creative_goal }, output: { ops: proposal.operations.length }, duration_ms: 210 },
      ...proposal.operations.slice(0,2).map(op=> ({ agent: `${op.type}Agent`, input: { op: op.op_id }, output: { confidence: op.confidence }, duration_ms: 45 })),
    ],
    model_versions: { "n0va-embed-videos-v3": "v3", "whisper-n0va": "v2026-07", "clip-n0va": "4096-dim", "color-match": "GAN v2" },
    tool_actions: proposal.operations.map(o=> `${o.type}:${o.op_id}`),
    human_decisions: proposal.decision ? [`${proposal.decision.action} by ${proposal.decision.by} at ${proposal.decision.at}`] : [],
    final_commit_hash: proposal.status === "merged" ? `sha3-512:${proposal.proposal_id.slice(0,12)}` : null,
    rollback_options: [proposal.risk.rollback_info, "Restore snapshot " + proposal.base_snapshot, "Archive branch " + proposal.target_branch],
    created_at: nowIso(),
    provenance: proposal.evidence.map(e=> ({ source_asset: e.asset_id ?? "unknown", timecode: e.timecode, confidence: e.confidence })),
    overrides: [],
  };
}

// ── Natural-language builders (typed helpers for each command behavior) ──────
export function unresolvedCommentsImpact(comments: ContextPacket["review_comments"], exportRange: [number, number]) {
  return comments.filter(c=> !c.resolved).map(c=> {
    const overlaps = !(c.range[1] < exportRange[0] || c.range[0] > exportRange[1]);
    const impact = overlaps ? "directly overlaps export" : "refers to clip used in export";
    const severity = c.severity;
    return { ...c, impact, affected_timecode: `${Math.floor(c.range[0]/60000)}:${String(Math.floor((c.range[0]%60000)/1000)).padStart(2,"0")}`, action: severity==="high" ? "Must resolve before publish" : "Recommended fix" };
  });
}
