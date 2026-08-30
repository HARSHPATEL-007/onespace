/**
 * N0VA VIDEOS — Live-to-Edit Continuum Engine
 * Pipeline: verified recordings → conform → transcript → moments → derivatives → review → package
 */
import type {
  PostEventProject, ConformMap, EventMoment, Chapter, SpeakerMoment, TranscriptSegment, SilenceSegment,
  DerivativePlan, DerivativeAsset, QuoteCard, ContentPackage, HighlightScore, EditRecipe,
} from "./live-edit-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }

const projects = new Map<string, PostEventProject>();
const transcriptEdits = new Map<string, { project_id: string; start_segment_id: string; end_segment_id: string; mode: string }>();

// ── Conform ──────────────────────────────────────────────────────────────────
export function generateConformMap(sessionId: string): ConformMap {
  return {
    master_clock: { timebase:"90000", start_timecode:"01:00:00:00", wall_clock_start:"2026-08-30T04:00:00Z" },
    sources: [
      { source_id:"iso_cam_01", offset_ms:42, drift_ppm:1.8, confidence:0.98 },
      { source_id:"iso_cam_02", offset_ms:-17, drift_ppm:2.1, confidence:0.97 },
      { source_id:"iso_cam_03", offset_ms: 5, drift_ppm:0.9, confidence:0.99 },
      { source_id:"program", offset_ms:0, drift_ppm:0.5, confidence:1.0 },
    ],
    missing_ranges: [],
    status:"verified",
  };
}

// ── Moments ──────────────────────────────────────────────────────────────────
function seedMoments(): EventMoment[] {
  return [
    { moment_id:"moment_0042", time_range:{ start_ms:842100, end_ms:914800 }, signals:{ speaker_id:"speaker_07", topic:"security architecture", scene_type:"product_demo", audience_reaction:0.88, chat_velocity:0.74, producer_marker:true, transcript_confidence:0.96, visual_emphasis:0.81 }, derived_assets:["chapter_08","highlight_003","social_clip_003","quote_card_011"], lineage:{ source_isos:["iso_cam_02","iso_cam_04"], transcript_segments:["seg_044"] } },
    { moment_id:"moment_0043", time_range:{ start_ms:914800, end_ms:960000 }, signals:{ speaker_id:"speaker_01", topic:"pricing", audience_reaction:0.62, transcript_confidence:0.92 }, derived_assets:["highlight_004"], lineage:{ source_isos:["iso_cam_01"], transcript_segments:["seg_045"] } },
  ];
}
function seedChapters(): Chapter[] {
  return [
    { chapter_id:"ch_008", start_ms:842100, title:"Security Architecture", source:"approved_agenda", confidence:1.0, thumbnail_frame_ms:854200, end_condition:"next_agenda_item", status:"approved" },
    { chapter_id:"ch_009", start_ms:914800, title:"Pricing", source:"producer_marker", confidence:0.92, thumbnail_frame_ms:920000, status:"pending" },
  ];
}
function seedHighlights(): HighlightScore[] {
  return [
    { engagement:0.84, editorial_value:0.91, narrative_completeness:0.88, technical_quality:0.96, rights_clearance:1.0, caption_confidence:0.94, final_score:0.89, decision:"review_required" },
  ];
}
function seedSpeakers(): SpeakerMoment[] {
  return [
    { speaker_id:"speaker_02", display_name:"Aarav Mehta", total_ms: 18*60*1000, segments: Array.from({length:5},(_,i)=>({ segment_id:`seg_04${i}`, start_ms:182340+i*5000, end_ms:186900+i*5000, text:"The platform protects every production boundary.", topic:"security", confidence:0.96 })), quotable_moments:3 },
    { speaker_id:"speaker_01", display_name:"CEO", total_ms:24*60*1000, segments:[{ segment_id:"seg_001", start_ms:8500, end_ms:15200, text:"Welcome to our Q3 product launch", confidence:0.98 }], quotable_moments:2 },
  ];
}
function seedTranscripts(): TranscriptSegment[] {
  return [
    { segment_id:"seg_044", speaker_id:"speaker_02", start_ms:182340, end_ms:186900, text:"The platform protects every production boundary.", word_timestamps:[{word:"The",start_ms:182340,end_ms:182500,confidence:0.99},{word:"platform",start_ms:182500,end_ms:183000,confidence:0.97}], source_isos:["iso_cam_02","iso_cam_04"], caption_versions:["live_v1","corrected_v2"], confidence:0.96, edit_status:"included", rights_status:"cleared" },
    { segment_id:"seg_045", speaker_id:"speaker_02", start_ms:186900, end_ms:191200, text:"Every production boundary should be observable.", word_timestamps:[], source_isos:["iso_cam_02"], caption_versions:["live_v1"], confidence:0.97, edit_status:"included", rights_status:"cleared" },
    { segment_id:"seg_051", speaker_id:"speaker_02", start_ms:200000, end_ms:204000, text:"We will now discuss pricing.", word_timestamps:[], source_isos:["iso_cam_01"], caption_versions:["live_v1"], confidence:0.95, edit_status:"included", rights_status:"cleared" },
  ];
}

// ── Create post-event project ────────────────────────────────────────────────
export function createPostEventProject(input: { session_id: string; project_name: string; source_policy?: string; generate?: string[]; languages?: string[]; derivative_profiles?: string[]; review_mode?: string }): PostEventProject {
  const projectId = `postevent_${uid("proj").slice(-6)}`;
  const conform = generateConformMap(input.session_id);
  const moments = seedMoments();
  const chapters = seedChapters();
  const speaker_index = seedSpeakers();
  const transcript_segments = seedTranscripts();
  const highlights = seedHighlights();
  const derivatives: DerivativeAsset[] = [];
  // Create social derivatives for moment_0042 as example
  const plan: DerivativePlan = {
    source_moment_id:"moment_0042",
    outputs:[
      { type:"linkedin_clip", duration_target_ms:45000, aspect_ratio:"1:1", hook_style:"question", captions:"burned_in_plus_sidecar", cta:"Learn more", review_required:true },
      { type:"instagram_reel", duration_target_ms:30000, aspect_ratio:"9:16", hook_style:"statement", captions:"burned_in", review_required:true },
    ],
  };
  for (const out of plan.outputs) {
    const asset: DerivativeAsset = {
      asset_id: uid(out.type), type: out.type, aspect_ratio: out.aspect_ratio, source_ranges:[{ source:"iso_cam_02", start_ms:842100, end_ms:914800 }],
      timeline_version:2, caption_version:4, rights_status:"cleared", consent_status:"cleared", preflight_status:"pending",
      checksum:`sha3-512:${uid("hash").slice(0,12)}`,
      edit_recipe: { source_session: input.session_id, source_ranges:[{ asset_id:"iso_cam_02", start_ms:842100, end_ms:914800 }], caption_version:"captions_en_v4", model_versions:["n0va-transcript-v5","n0va-highlight-v3","n0va-reframe-v2"], editorial_approval:null },
      vertical_flags: out.aspect_ratio==="9:16" ? [] : [],
    };
    derivatives.push(asset);
  }
  const proj: PostEventProject = {
    project_id: projectId, project_name: input.project_name, source_session_id: input.session_id, source_policy: input.source_policy ?? "preserve_live_sources",
    stage:"media_conform", lane:"fast",
    conform_map: conform, moments, chapters, highlights, speaker_index, transcript_segments, derivatives,
    quote_cards: [],
    languages: input.languages ?? ["en"], derivative_profiles: input.derivative_profiles ?? ["youtube_highlight","linkedin_square"],
    review_mode: input.review_mode ?? "human_approval_required",
    rights_snapshot: { music:"cleared", faces:"pending" },
    created_at: nowIso(), updated_at: nowIso(),
  };
  projects.set(projectId, proj);
  return proj;
}
export function getPostEventProject(projectId: string): PostEventProject | null { return projects.get(projectId) ?? null; }
export function listPostEventProjects(): PostEventProject[] { return Array.from(projects.values()); }

// ── Candidates generation ────────────────────────────────────────────────────
export function generateCandidates(projectId: string, input: { candidate_types: string[]; signals: string[]; minimum_confidence?: number }): { chapters: Chapter[]; highlights: HighlightScore[]; quotes: QuoteCard[]; social: DerivativeAsset[] } {
  const proj = projects.get(projectId);
  if (!proj) throw new Error("Post-event project not found");
  const minConf = input.minimum_confidence ?? 0.8;
  const chapters = proj.chapters.filter(c=>c.confidence>=minConf);
  const highlights = proj.highlights.filter(h=>h.final_score>=minConf);
  const quotes: QuoteCard[] = [
    { quote_id:"quote_011", source_segment_ids:["seg_044","seg_045"], text:"Every production boundary should be observable.", speaker:{ id:"speaker_02", display_name:"Aarav Mehta", title:"Chief Technology Officer" }, source_time_range:{ start_ms:182340, end_ms:191200 }, context_complete:true, transcript_confidence:0.97, factual_claim:false, brand_status:"pending" as const, design_template:"brand_quote_card_2026_v2", status:"review_required" as const, mode:"verbatim" as const },
  ].filter(q=>q.transcript_confidence>=minConf);
  const social = proj.derivatives.filter(d=>d.rights_status==="cleared");
  return { chapters, highlights, quotes, social };
}

// ── Speaker compilation ──────────────────────────────────────────────────────
export function createSpeakerCompilation(projectId: string, speakerId: string, style: string): TranscriptSegment[] {
  const proj = projects.get(projectId);
  if (!proj) throw new Error("Not found");
  const segs = proj.transcript_segments.filter(s=>s.speaker_id===speakerId);
  // Apply style filters: remove duplicates, greetings etc. mock
  if (style==="best_of") return segs.slice(0,3);
  if (style==="topic") return segs.filter(s=>s.text.toLowerCase().includes("security"));
  return segs;
}

// ── Transcript-linked editing ────────────────────────────────────────────────
export function transcriptEdit(projectId: string, input: { selection: { start_segment_id: string; end_segment_id: string }; edit_mode: string; ripple_tracks: string[]; preserve_room_tone?: boolean }): { affected: string[]; new_timeline_version: number } {
  const proj = projects.get(projectId);
  if (!proj) throw new Error("Not found");
  const start = proj.transcript_segments.find(s=>s.segment_id===input.selection.start_segment_id);
  const end = proj.transcript_segments.find(s=>s.segment_id===input.selection.end_segment_id);
  if (!start || !end) throw new Error("Segment not found");
  // Mark excluded
  for (const seg of proj.transcript_segments) {
    if (seg.start_ms>=start.start_ms && seg.end_ms<=end.end_ms) seg.edit_status="excluded";
  }
  const affected = ["camera_cuts","captions","graphics","chapter_duration","speaker_context"];
  transcriptEdits.set(uid("edit"), { project_id: projectId, start_segment_id: input.selection.start_segment_id, end_segment_id: input.selection.end_segment_id, mode: input.edit_mode });
  proj.updated_at = nowIso();
  return { affected, new_timeline_version: 3 };
}

// ── Dead-air detection ───────────────────────────────────────────────────────
export function detectSilence(classification: string = "unintended_silence"): SilenceSegment[] {
  return [
    { start_ms:428100, end_ms:431700, duration_ms:3600, classification: classification as SilenceSegment["classification"], confidence:0.92, recommended_action:"remove_with_ripple", preserve_ambience:true, review_required:false },
  ];
}

// ── Vertical reframing ───────────────────────────────────────────────────────
export function reframeVertical(sourceAssetId: string, aspectRatio: string): { asset_id: string; flags: string[] } {
  const flags: string[] = [];
  if (aspectRatio==="9:16") {
    // mock check for face cropping etc.
  }
  return { asset_id: uid("vertical"), flags };
}

// ── Quote card creation ──────────────────────────────────────────────────────
export function createQuoteCard(input: { source_segment_ids: string[]; text: string; speaker: { id:string; display_name:string; title:string }; mode?: QuoteCard["mode"] }): QuoteCard {
  const qc: QuoteCard = {
    quote_id: uid("quote"), source_segment_ids: input.source_segment_ids, text: input.text,
    speaker: input.speaker, source_time_range:{ start_ms:182340, end_ms:191200 }, context_complete:true, transcript_confidence:0.97, factual_claim:false, brand_status:"pending", design_template:"brand_quote_card_2026_v2", status:"review_required", mode: input.mode ?? "verbatim",
  };
  // validate: not combining non-contiguous without label, not wrong speaker etc. — for demo pass
  return qc;
}

// ── Content package ──────────────────────────────────────────────────────────
export function buildPackage(projectId: string, include: string[]): ContentPackage {
  const proj = projects.get(projectId);
  if (!proj) throw new Error("Not found");
  const pkg: ContentPackage = {
    package_id: uid("pkg_live"), source_session_id: proj.source_session_id,
    source_hashes:{ program_master:"sha3-512:program", clean_feed:"sha3-512:clean", transcript:"sha3-512:transcript" },
    generated_assets: proj.derivatives.map(d=>({ ...d, preflight_status: "ready_with_warnings" as const })),
    package_status:"review_required", created_at: nowIso(),
    manifest:{ include, chapters: proj.chapters.length, highlights: proj.highlights.length },
  };
  proj.content_package = pkg;
  proj.updated_at = nowIso();
  return pkg;
}

// ── Processing lanes ─────────────────────────────────────────────────────────
export function pipelineStatus(projectId: string): { fast: string; editorial: string; finishing: string } {
  const proj = projects.get(projectId);
  if (!proj) return { fast:"pending", editorial:"pending", finishing:"pending" };
  return { fast:"transcript+chapters ready (minutes)", editorial:"multi-camera conform in progress", finishing:"color/brand/accessibility queued" };
}

// ── Rights propagation ───────────────────────────────────────────────────────
export function checkDerivativeRights(derivative: DerivativeAsset, sourceMoment: EventMoment): { cleared: boolean; reason?: string } {
  // Check source restrictions
  if (sourceMoment.signals.speaker_id==="speaker_restricted") return { cleared:false, reason:"Source speaker consent: Internal event only — Instagram Reel BLOCKED" };
  return { cleared:true };
}
