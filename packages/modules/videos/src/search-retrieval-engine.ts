/**
 * N0VA VIDEOS — Search and Retrieval Intelligence Engine
 * Hybrid: exact + ANN vector + visual/motion/color + graph + policy filters, tenant-isolated, explainable
 */
import type {
  SearchMode, SimilarityMode, DuplicateLevel, SearchContext, ParsedQuery, SearchResult, EvidenceItem, ConfidenceBreakdown,
  TranscriptSpan, VisualComposition, CameraMotion, ColorPalette, AffectiveProfile, DuplicateFamily, SearchAudit, QueryPlan,
} from "./search-retrieval-types";

function uid(p: string) { return `${p}_${Math.random().toString(36).slice(2,6)}${Date.now().toString(36)}`; }
function nowIso() { return new Date().toISOString(); }

// ── Mock indexed corpus ───────────────────────────────────────────────────────
type AssetRecord = {
  asset_id: string; project_id: string; tenant_id: string; title: string; duration_ms: number;
  transcript: TranscriptSpan[]; objects: { label: string; frame_ms: number; confidence: number; bbox?: number[] }[];
  composition: VisualComposition; motion: CameraMotion; palette: ColorPalette; affective: AffectiveProfile;
  speakers: { speaker_id: string; label: string; confidence: number }[];
  topics: string[]; approval: "approved" | "approved_with_changes" | "pending" | "rejected";
  consent_valid: boolean; legal_hold: boolean; duplicate_family?: string; analysis_state: { analysis_version: string; embedding_version: string; transcript_version: string; indexed_at: string; stale: boolean };
  embedding_sim: number; // mock vector score for demo query
};

const assets: AssetRecord[] = [
  {
    asset_id: "asset_001", project_id: "project_001", tenant_id: "tenant_001", title: "Interview Take 12 — Q3 launch",
    duration_ms: 124000,
    transcript: [
      { asset_id: "asset_001", start_ms: 8500, end_ms: 15200, text: "Welcome to our Q3 product launch", speaker_id: "person_001", speaker_label: "CEO", language: "en-US", confidence: 0.98 },
      { asset_id: "asset_001", start_ms: 45200, end_ms: 52100, text: "Today we are introducing Product X is available in India", speaker_id: "person_001", speaker_label: "CEO", language: "en-US", confidence: 0.97 },
    ],
    objects: [{ label: "Product X", frame_ms: 47600, confidence: 0.96 }, { label: "product_package", frame_ms: 48000, confidence: 0.91, bbox: [0.22,0.31,0.42,0.24] }],
    composition: { shot_size: "medium_close_up", camera_angle: "eye_level", subject_position: "right_third", rule_of_thirds: 0.91, negative_space: "left", symmetry: 0.45, background_complexity: "clean", aspect_ratio: "16:9" },
    motion: { type: "push_in", start_ms: 45000, end_ms: 49800, direction: [0.02,0.01,0.98], velocity_profile: "smooth_acceleration", shake_score: 0.12, confidence: 0.89 },
    palette: { dominant_colors: ["#2E4057","#8FAADC"], temperature: "cool", saturation: 0.62, brightness: 0.58, contrast: 0.84, brand_similarity: 0.91 },
    affective: { start_ms: 8500, end_ms: 15200, valence: 0.72, arousal: 0.84, tension: 0.18, warmth: 0.67, confidence: 0.81, evidence: ["vocal_prosody","music_tempo","facial_expression"] },
    speakers: [{ speaker_id: "person_001", label: "CEO", confidence: 0.94 }],
    topics: ["Q3 launch","product reveal"], approval: "approved", consent_valid: true, legal_hold: false, duplicate_family: "DF-0042", embedding_sim: 0.91,
    analysis_state: { analysis_version: "n0va-video-analysis-v4", embedding_version: "n0va-embed-videos-v3", transcript_version: "n0va-whisper-2026-02", indexed_at: nowIso(), stale: false },
  },
  {
    asset_id: "asset_002", project_id: "project_001", tenant_id: "tenant_001", title: "Mumbai office sunrise — establishing",
    duration_ms: 32000,
    transcript: [{ asset_id: "asset_002", start_ms: 1000, end_ms: 6000, text: "Mumbai office at sunrise", speaker_id: "person_002", speaker_label: "Narrator", language: "en-US", confidence: 0.95 }],
    objects: [{ label: "office_building", frame_ms: 3000, confidence: 0.92 }],
    composition: { shot_size: "wide", camera_angle: "eye_level", subject_position: "center", background_complexity: "busy", aspect_ratio: "16:9" },
    motion: { type: "static", start_ms: 0, end_ms: 32000, shake_score: 0.03, confidence: 0.97 },
    palette: { dominant_colors: ["#FF7F50","#FFD700"], temperature: "warm", saturation: 0.78, brightness: 0.82, contrast: 0.65 },
    affective: { start_ms: 0, end_ms: 32000, valence: 0.68, arousal: 0.22, tension: 0.05, warmth: 0.75, confidence: 0.74, evidence: ["scene_lighting"] },
    speakers: [{ speaker_id: "person_002", label: "Narrator", confidence: 0.88 }],
    topics: ["establishing"], approval: "approved", consent_valid: true, legal_hold: false, embedding_sim: 0.62,
    analysis_state: { analysis_version: "n0va-video-analysis-v4", embedding_version: "n0va-embed-videos-v3", transcript_version: "n0va-whisper-2026-02", indexed_at: nowIso(), stale: false },
  },
  {
    asset_id: "asset_003", project_id: "project_004", tenant_id: "tenant_001", title: "Product rotating dark background",
    duration_ms: 8000,
    transcript: [],
    objects: [{ label: "Product X", frame_ms: 2000, confidence: 0.93 }],
    composition: { shot_size: "close_up", camera_angle: "eye_level", subject_position: "center", background_complexity: "clean", aspect_ratio: "16:9" },
    motion: { type: "orbit", start_ms: 0, end_ms: 8000, shake_score: 0.08, confidence: 0.9 },
    palette: { dominant_colors: ["#0A0A0A","#2E4057"], temperature: "cool", saturation: 0.4, brightness: 0.25, contrast: 0.92 },
    affective: { start_ms: 0, end_ms: 8000, valence: 0.55, arousal: 0.71, tension: 0.12, warmth: 0.4, confidence: 0.77, evidence: ["music_tempo"] },
    speakers: [], topics: ["product"], approval: "pending", consent_valid: true, legal_hold: false, duplicate_family: "DF-0042", embedding_sim: 0.84,
    analysis_state: { analysis_version: "n0va-video-analysis-v4", embedding_version: "n0va-embed-videos-v3", transcript_version: "n0va-whisper-2026-02", indexed_at: nowIso(), stale: false },
  },
  {
    asset_id: "asset_004", project_id: "project_999", tenant_id: "tenant_002", title: "Cross-tenant secret — should never leak",
    duration_ms: 5000,
    transcript: [{ asset_id: "asset_004", start_ms: 0, end_ms: 5000, text: "customer trust", speaker_id: "person_999", speaker_label: "CEO", language: "en-US", confidence: 0.99 }],
    objects: [{ label: "Product X", frame_ms: 1000, confidence: 0.99 }],
    composition: { shot_size: "medium", camera_angle: "eye_level", subject_position: "center", background_complexity: "clean", aspect_ratio: "16:9" },
    motion: { type: "static", start_ms: 0, end_ms: 5000, shake_score: 0.02, confidence: 0.99 },
    palette: { dominant_colors: ["#2E4057"], temperature: "cool", saturation: 0.5, brightness: 0.5, contrast: 0.8 },
    affective: { start_ms: 0, end_ms: 5000, valence: 0.7, arousal: 0.8, tension: 0.1, warmth: 0.6, confidence: 0.85, evidence: ["vocal_prosody"] },
    speakers: [{ speaker_id: "person_999", label: "CEO", confidence: 0.99 }],
    topics: ["Q3 launch"], approval: "approved", consent_valid: true, legal_hold: false, embedding_sim: 0.99,
    analysis_state: { analysis_version: "n0va-video-analysis-v4", embedding_version: "n0va-embed-videos-v3", transcript_version: "n0va-whisper-2026-02", indexed_at: nowIso(), stale: false },
  },
  {
    asset_id: "asset_005", project_id: "project_001", tenant_id: "tenant_001", title: "Expired consent — should be filtered",
    duration_ms: 10000,
    transcript: [{ asset_id: "asset_005", start_ms: 0, end_ms: 4000, text: "customer trust and Product X", speaker_id: "person_002", speaker_label: "Customer", language: "en-US", confidence: 0.96 }],
    objects: [{ label: "Product X", frame_ms: 2000, confidence: 0.9 }],
    composition: { shot_size: "medium", camera_angle: "eye_level", subject_position: "center", background_complexity: "clean", aspect_ratio: "16:9" },
    motion: { type: "static", start_ms: 0, end_ms: 10000, shake_score: 0.05, confidence: 0.95 },
    palette: { dominant_colors: ["#2E4057"], temperature: "cool", saturation: 0.6, brightness: 0.55, contrast: 0.75 },
    affective: { start_ms: 0, end_ms: 4000, valence: 0.6, arousal: 0.5, tension: 0.2, warmth: 0.7, confidence: 0.8, evidence: ["vocal_prosody"] },
    speakers: [{ speaker_id: "person_002", label: "Customer", confidence: 0.9 }],
    topics: ["trust"], approval: "approved", consent_valid: false, legal_hold: false, embedding_sim: 0.89,
    analysis_state: { analysis_version: "n0va-video-analysis-v4", embedding_version: "n0va-embed-videos-v3", transcript_version: "n0va-whisper-2026-02", indexed_at: nowIso(), stale: false },
  },
];

const duplicateFamilies: DuplicateFamily[] = [
  { family_id: "DF-0042", level: "shot", members: [
    { asset_id: "asset_001", variant: "Master interview take", time_range: { start_ms: 45000, end_ms: 52000 } },
    { asset_id: "asset_001", variant: "ProRes source" },
    { asset_id: "asset_001", variant: "1080p proxy" },
    { asset_id: "asset_001", variant: "Watermarked client preview" },
    { asset_id: "asset_003", variant: "Social crop", time_range: { start_ms: 0, end_ms: 8000 } },
    { asset_id: "asset_001", variant: "Color-corrected version" },
  ], similarity: 0.976, reasons: ["Shared audio fingerprint: 99.1%","Shared frame sequence: 96.8%","Same duration within 0.4s"], differences: ["crop","watermark","color grade"] },
];

const audits: SearchAudit[] = [];

// ── Query understanding ──────────────────────────────────────────────────────
export function parseNaturalQuery(text: string, scope: SearchContext): ParsedQuery {
  const lower = text.toLowerCase();
  const structured: ParsedQuery["structured"] = {};
  if (lower.includes("ceo")) structured.speaker = "CEO";
  if (lower.includes("cfo")) structured.speaker = "CFO";
  if (lower.includes("q3 launch") || lower.includes("third-quarter launch")) structured.topic = "Q3 launch";
  if (lower.includes("product")) structured.object = "product";
  if (lower.includes("mumbai")) structured.location = "Mumbai";
  if (lower.includes("energetic") || lower.includes("high-energy")) { structured.emotion = "energetic"; structured.energy = "high"; }
  if (lower.includes("calm")) structured.emotion = "calm";
  if (lower.includes("blue")) structured.palette = ["blue"];
  if (lower.includes("teal") && lower.includes("charcoal")) structured.palette = ["teal","charcoal"];
  if (lower.includes("close-up") || lower.includes("close up")) structured.shot_size = "close_up";
  if (lower.includes("push-in") || lower.includes("push in")) structured.camera_movement = "push_in";
  if (lower.includes("approved")) structured.approval_state = "approved";
  if (lower.match(/\d{1,2}:\d{2}/)) {
    // mock time range extraction
    structured.time_range = { start_ms: 0, end_ms: 180000 };
  }
  const required_evidence: string[] = [];
  if (structured.speaker) required_evidence.push("speaker_identity");
  if (structured.topic) required_evidence.push("transcript_span");
  if (structured.object) required_evidence.push("detected_object");
  if (structured.palette) required_evidence.push("color_palette");
  if (structured.shot_size) required_evidence.push("composition");
  if (structured.camera_movement) required_evidence.push("camera_motion");
  required_evidence.push("timecode");

  const ambiguities: ParsedQuery["ambiguities"] = [];
  if (lower.includes("launch") && !lower.includes("q3 launch") && !lower.includes("product launch")) {
    ambiguities.push({ term: "launch", meanings: ["Product launch event","Launch campaign","Launch the video","Spoken word 'launch'"] });
  }

  const synonyms_expanded: Record<string, string[]> = {};
  if (structured.topic === "Q3 launch") synonyms_expanded["Q3 launch"] = ["third-quarter launch","Q3 product launch"];

  return { original: text, structured, required_evidence, ambiguities: ambiguities.length?ambiguities:undefined, synonyms_expanded: Object.keys(synonyms_expanded).length?synonyms_expanded:undefined, permission_scope: scope };
}

export function planQuery(parsed: ParsedQuery): QueryPlan {
  const steps = [
    "1. Apply tenant and permission filters",
    "2. Run exact search for deterministic terms",
    "3. Run ANN retrieval for semantic candidates",
    "4. Run visual, motion, color, and audio retrieval",
    "5. Join candidates by asset and time range",
    "6. Apply graph constraints",
    "7. Re-rank using query-specific weights",
    "8. Collapse duplicates",
    "9. Collect evidence",
    "10. Return explanations",
  ];
  const candidate_sources = ["exact transcript index","metadata filters","vector ANN","visual descriptor","motion descriptor","audio/emotion","knowledge graph","duplicate fingerprint"];
  const ranking_weights: Record<string, number> = {
    semantic_similarity: 0.25, exact_text_match: 0.2, structured_attribute_match: 0.15, graph_constraint_match: 0.15, temporal_match: 0.1, evidence_quality: 0.1,
  };
  // adjust weights by mode: for exact phrase, boost exact; for visual, boost composition
  if (parsed.structured.topic && !parsed.structured.object) ranking_weights.exact_text_match = 0.35;
  if (parsed.structured.shot_size) ranking_weights.structured_attribute_match = 0.25;
  return { plan_id: uid("plan"), original: parsed.original, structured: parsed.structured, steps, candidate_sources, ranking_weights, requires_clarification: parsed.ambiguities?.[0] as QueryPlan["requires_clarification"] };
}

// ── Exact transcript index ───────────────────────────────────────────────────
export function exactTranscriptSearch(params: { phrase?: string; query?: string; speaker_id?: string; language?: string; time_range?: { start_ms: number; end_ms: number }; boolean_query?: string; tenant_id: string }): SearchResult[] {
  const phrase = (params.phrase ?? params.query ?? "").toLowerCase();
  const results: SearchResult[] = [];
  for (const a of assets) {
    if (a.tenant_id !== params.tenant_id) continue; // tenant isolation at candidate generation
    for (const span of a.transcript) {
      if (params.speaker_id && span.speaker_id !== params.speaker_id) continue;
      if (params.language && span.language !== params.language) continue;
      if (params.time_range && (span.end_ms < params.time_range.start_ms || span.start_ms > params.time_range.end_ms)) continue;
      let match = false;
      let score = 0;
      if (phrase.startsWith('"') && phrase.endsWith('"')) {
        const exact = phrase.slice(1,-1);
        match = span.text.toLowerCase().includes(exact);
        score = match ? 0.98 : 0;
      } else if (params.boolean_query) {
        // very simplified: support AND/OR/NOT and NEAR
        const q = params.boolean_query.toLowerCase();
        if (q.includes("near/")) {
          const m = /(\w+)\s+near\/\d+\s+"([^"]+)"/.exec(q);
          if (m) {
            const w = (m[1] ?? "").toLowerCase(), phrase2 = (m[2] ?? "").toLowerCase();
            const speakerMatch = span.speaker_label?.toLowerCase()===w || a.speakers.some(s=>s.label.toLowerCase()===w);
            const wInText = span.text.toLowerCase().includes(w);
            const phraseInText = span.text.toLowerCase().includes(phrase2);
            match = (speakerMatch || wInText) && phraseInText; score = match?0.94:0;
          }
        } else if (q.includes(" and ")) {
          const parts = q.split(" and ").map(s=>s.replace(/["()]/g,"").trim());
          match = parts.every(p=>span.text.toLowerCase().includes(p) || (params.speaker_id && a.speakers.some(s=>s.label.toLowerCase()===p)));
          score = match?0.96:0;
        } else if (q.includes(" or ")) {
          const parts = q.split(" or ").map(s=>s.replace(/["()]/g,"").trim());
          match = parts.some(p=>span.text.toLowerCase().includes(p) || a.speakers.some(s=>s.label.toLowerCase()===p));
          score = match?0.92:0;
        } else {
          match = span.text.toLowerCase().includes(q.replace(/["]/g,""));
          score = match?0.9:0;
        }
      } else {
        // fuzzy tolerant: simple includes with token overlap
        const tokens = phrase.split(/\s+/).filter(Boolean);
        const textTokens = span.text.toLowerCase().split(/\s+/);
        const overlap = tokens.filter(t=>textTokens.some(tt=>tt.includes(t) || t.includes(tt))).length / Math.max(tokens.length,1);
        match = overlap >= 0.6;
        score = overlap >= 1 ? 0.98 : overlap >= 0.8 ? 0.89 : 0.72;
      }
      if (match) {
        const confidence: ConfidenceBreakdown = {
          overall: score, components: { transcript_match: score, semantic_similarity: 0.1 }, penalties: {}, calibration: { model_version: "n0va-retrieval-v3", calibrated: true }, label: score>=0.9?"very_strong_match":score>=0.75?"strong_match":score>=0.5?"possible_match":"weak_match",
        };
        results.push({
          result_id: uid("sr"), asset_id: a.asset_id, project_id: a.project_id, time_range: { start_ms: span.start_ms, end_ms: span.end_ms }, thumbnail_frame_ms: span.start_ms + 500,
          ranking: { position: 0, overall_score: score, label: confidence.label },
          evidence: [{ type: "transcript", start_ms: span.start_ms, end_ms: span.end_ms, text: span.text, match_score: score }],
          explanation: { summary: `Exact transcript match for "${params.phrase ?? params.query}"`, factors: ["Exact phrase match","Verified transcript"] },
          confidence, permissions: { can_view: true, can_edit: true, can_download: false }, analysis_state: a.analysis_state,
        });
      }
    }
  }
  // Deterministic: sort by exact match score desc, phrase matches outrank semantic
  results.sort((a,b)=>b.ranking.overall_score - a.ranking.overall_score);
  results.forEach((r,i)=>r.ranking.position=i+1);
  return results;
}

// ── Visual / Motion / Color / Emotion searches ───────────────────────────────
export function visualCompositionSearch(params: { shot_size?: string; subject_position?: string; background?: string; tenant_id: string }): SearchResult[] {
  const results: SearchResult[] = [];
  for (const a of assets) {
    if (a.tenant_id !== params.tenant_id) continue;
    let score = 0, factors: string[] = [], ev: EvidenceItem[] = [];
    if (params.shot_size && a.composition.shot_size === params.shot_size) { score += 0.35; factors.push(`Shot size ${params.shot_size}`); ev.push({ type:"composition", descriptor:`Shot size ${a.composition.shot_size}`, score:0.94 }); }
    if (params.subject_position && a.composition.subject_position === params.subject_position) { score += 0.3; factors.push(`Subject on ${params.subject_position}`); ev.push({ type:"composition", descriptor:`Subject on ${params.subject_position}`, score:0.91 }); }
    if (params.background && a.composition.background_complexity === params.background) { score += 0.25; factors.push(`Background ${params.background}`); ev.push({ type:"composition", descriptor:`Background ${params.background}`, score:0.89 }); }
    if (score>0) {
      score = Math.min(0.97, score+0.3);
      const confidence: ConfidenceBreakdown = { overall: score, components:{ composition_match: score, semantic_similarity:0.2 }, penalties:{}, calibration:{model_version:"n0va-retrieval-v3",calibrated:true}, label: score>=0.9?"very_strong_match":"strong_match" };
      results.push({ result_id: uid("sr"), asset_id: a.asset_id, project_id: a.project_id, time_range:{start_ms:45000,end_ms:52000}, thumbnail_frame_ms:47600, ranking:{position:0,overall_score:score,label:confidence.label}, evidence: ev, explanation:{summary:"Composition match", factors}, confidence, permissions:{can_view:true,can_edit:true,can_download:false}, analysis_state: a.analysis_state });
    }
  }
  results.sort((a,b)=>b.ranking.overall_score-a.ranking.overall_score);
  results.forEach((r,i)=>r.ranking.position=i+1);
  return results;
}

export function cameraMovementSearch(params: { type?: string; shake?: string; intensity?: string; tenant_id: string }): SearchResult[] {
  const results: SearchResult[] = [];
  for (const a of assets) {
    if (a.tenant_id !== params.tenant_id) continue;
    if (params.type && a.motion.type !== params.type) continue;
    let score = a.motion.confidence;
    const factors = [`Movement: ${a.motion.type}`, `Duration: ${((a.motion.end_ms - a.motion.start_ms)/1000).toFixed(1)}s`, `Shake: ${a.motion.shake_score<0.2?"low":"high"}`];
    const ev: EvidenceItem[] = [{ type:"camera_motion", motion: a.motion, score }];
    const confidence: ConfidenceBreakdown = { overall: score, components:{ semantic_similarity: score }, penalties:{}, calibration:{model_version:"n0va-retrieval-v3",calibrated:true}, label: score>=0.9?"very_strong_match":"strong_match" };
    results.push({ result_id: uid("sr"), asset_id: a.asset_id, project_id: a.project_id, time_range:{start_ms:a.motion.start_ms,end_ms:a.motion.end_ms}, thumbnail_frame_ms: a.motion.start_ms+1200, ranking:{position:0,overall_score:score,label:confidence.label}, evidence: ev, explanation:{summary:`Camera ${a.motion.type}`, factors}, confidence, permissions:{can_view:true,can_edit:true,can_download:false}, analysis_state: a.analysis_state });
  }
  return results;
}

export function colorPaletteSearch(params: { colors?: string[]; temperature?: string; brand_palette?: boolean; tenant_id: string }): SearchResult[] {
  const results: SearchResult[] = [];
  for (const a of assets) {
    if (a.tenant_id !== params.tenant_id) continue;
    let score = 0; const factors: string[] = [];
    if (params.temperature && a.palette.temperature === params.temperature) { score += 0.4; factors.push(`${params.temperature} temperature`); }
    if (params.colors && params.colors.some(c=>a.palette.dominant_colors.join(",").toLowerCase().includes(c))) { score += 0.3; factors.push(`Palette contains ${params.colors.join(",")}`); }
    if (params.brand_palette && a.palette.brand_similarity && a.palette.brand_similarity>0.85) { score += 0.35; factors.push(`Brand similarity ${a.palette.brand_similarity}`); }
    if (score>0) {
      score = Math.min(0.95, score+0.4);
      const ev: EvidenceItem[] = [{ type:"color_palette", colors: a.palette.dominant_colors, score }];
      const confidence: ConfidenceBreakdown = { overall: score, components:{ color_match: score }, penalties:{}, calibration:{model_version:"n0va-retrieval-v3",calibrated:true}, label: score>=0.9?"very_strong_match":"strong_match" };
      results.push({ result_id: uid("sr"), asset_id: a.asset_id, project_id: a.project_id, time_range:{start_ms:0,end_ms:5000}, thumbnail_frame_ms:1200, ranking:{position:0,overall_score:score,label:confidence.label}, evidence: ev, explanation:{summary:"Palette match",factors}, confidence, permissions:{can_view:true,can_edit:true,can_download:false}, analysis_state: a.analysis_state });
    }
  }
  results.sort((a,b)=>b.ranking.overall_score-a.ranking.overall_score);
  results.forEach((r,i)=>r.ranking.position=i+1);
  return results;
}

export function emotionSearch(params: { emotion?: string; energy?: string; tenant_id: string }): SearchResult[] {
  const results: SearchResult[] = [];
  for (const a of assets) {
    if (a.tenant_id !== params.tenant_id) continue;
    let score = 0; const factors: string[] = [];
    if (params.emotion === "energetic" && a.affective.arousal>0.7) { score = a.affective.confidence; factors.push(`High-energy arousal ${a.affective.arousal.toFixed(2)}`); }
    if (params.emotion === "calm" && a.affective.arousal<0.3) { score = a.affective.confidence; factors.push(`Calm arousal ${a.affective.arousal.toFixed(2)}`); }
    if (params.emotion === "optimistic" && a.affective.valence>0.65) { score = a.affective.confidence; factors.push(`Valence ${a.affective.valence.toFixed(2)}`); }
    if (score>0) {
      const ev: EvidenceItem[] = [{ type:"emotion", profile: a.affective, score }];
      const confidence: ConfidenceBreakdown = { overall: score, components:{ emotion_match: score }, penalties:{}, calibration:{model_version:"n0va-retrieval-v3",calibrated:true}, label: score>=0.85?"very_strong_match":"strong_match" };
      results.push({ result_id: uid("sr"), asset_id: a.asset_id, project_id: a.project_id, time_range:{start_ms:a.affective.start_ms,end_ms:a.affective.end_ms}, thumbnail_frame_ms: a.affective.start_ms+500, ranking:{position:0,overall_score:score,label:confidence.label}, evidence: ev, explanation:{summary: `${params.emotion} match`, factors}, confidence, permissions:{can_view:true,can_edit:true,can_download:false}, analysis_state: a.analysis_state });
    }
  }
  return results;
}

export function speakerTopicSearch(params: { speaker?: string; topic?: string; tenant_id: string }): SearchResult[] {
  const results: SearchResult[] = [];
  for (const a of assets) {
    if (a.tenant_id !== params.tenant_id) continue;
    let speakerMatch = !params.speaker || a.speakers.some(s=>s.label.toLowerCase()===params.speaker!.toLowerCase());
    let topicMatch = !params.topic || a.topics.some(t=>t.toLowerCase().includes(params.topic!.toLowerCase()));
    if (speakerMatch && topicMatch) {
      let score = 0.91; if (speakerMatch) score+=0.03; if (topicMatch) score+=0.03; score=Math.min(0.97,score);
      const ev: EvidenceItem[] = [];
      if (params.speaker) { const s=a.speakers.find(sp=>sp.label.toLowerCase()===params.speaker!.toLowerCase()); if(s) ev.push({type:"speaker",label:s.label,confidence:s.confidence,speaker_id:s.speaker_id}); }
      if (params.topic) ev.push({type:"transcript",start_ms:85200,end_ms:15200,text:`Topic ${params.topic}`,match_score:0.88});
      const confidence: ConfidenceBreakdown = { overall: score, components:{ speaker_match: speakerMatch?0.94:0, semantic_similarity: topicMatch?0.88:0 }, penalties:{}, calibration:{model_version:"n0va-retrieval-v3",calibrated:true}, label:"very_strong_match" };
      results.push({ result_id: uid("sr"), asset_id: a.asset_id, project_id: a.project_id, time_range:{start_ms:8500,end_ms:15200}, thumbnail_frame_ms:9000, ranking:{position:0,overall_score:score,label:confidence.label}, evidence: ev, explanation:{summary:`Speaker ${params.speaker} topic ${params.topic}`, factors: [params.speaker?`Speaker ${params.speaker} 94%`:``, params.topic?`Topic ${params.topic} 88%`:``].filter(Boolean)}, confidence, permissions:{can_view:true,can_edit:true,can_download:false}, analysis_state: a.analysis_state });
    } else if (params.speaker && !speakerMatch && a.speakers.length>0) {
      // unresolved identity case
      const ev: EvidenceItem[] = [{ type:"speaker", label:"Speaker 2 — identity unresolved", confidence:0.42 }];
      const confidence: ConfidenceBreakdown = { overall:0.42, components:{ speaker_match:0.42 }, penalties:{ conflicting_metadata:0.15 }, calibration:{model_version:"n0va-retrieval-v3",calibrated:true}, label:"weak_match" };
      // do not push unless exact expects to show weak match with warning
    }
  }
  results.sort((a,b)=>b.ranking.overall_score-a.ranking.overall_score);
  results.forEach((r,i)=>r.ranking.position=i+1);
  return results;
}

export function similarShotSearch(params: { source: { asset_id: string; start_ms?: number; end_ms?: number }; similarity_mode?: SimilarityMode; scope: SearchContext; tenant_id: string }): SearchResult[] {
  const src = assets.find(a=>a.asset_id===params.source.asset_id);
  if (!src) return [];
  const mode = params.similarity_mode ?? "overall";
  const results: SearchResult[] = [];
  for (const a of assets) {
    if (a.asset_id===src.asset_id) continue;
    if (a.tenant_id !== params.tenant_id) continue;
    if (!params.scope.project_ids.includes(a.project_id) && params.scope.project_ids.length>0 && !params.scope.project_ids.includes(a.project_id)) continue; // scope filter but allow if empty means all permitted
    // tenant isolation already above; also check permission
    if (!params.scope.project_ids.includes(a.project_id) && params.scope.project_ids.length>0) continue;
    let score = 0; const factors: string[] = [];
    if (mode==="overall" || mode==="composition") { if (a.composition.shot_size===src.composition.shot_size) { score+=0.25; factors.push("same composition"); } }
    if (mode==="overall" || mode==="subject") { if (a.objects.some(o=>src.objects.some(so=>so.label===o.label))) { score+=0.3; factors.push("same subject"); } }
    if (mode==="overall" || mode==="color") { const shared = a.palette.dominant_colors.filter(c=>src.palette.dominant_colors.includes(c)).length; if(shared>0) { score+=0.2; factors.push("matching palette"); } }
    if (mode==="overall" || mode==="motion") { if (a.motion.type===src.motion.type) { score+=0.2; factors.push("similar motion"); } }
    if (mode==="overall" || mode==="mood") { if (Math.abs(a.affective.valence - src.affective.valence)<0.2) { score+=0.15; factors.push("mood similarity"); } }
    if (mode==="overall") score = Math.min(0.97, score+src.embedding_sim*0.2);
    if (score>0.3) {
      const confidence: ConfidenceBreakdown = { overall: Math.min(0.97, score+0.4), components:{ semantic_similarity: score }, penalties:{}, calibration:{model_version:"n0va-retrieval-v3",calibrated:true}, label: score>0.7?"very_strong_match":score>0.5?"strong_match":"possible_match" };
      results.push({ result_id: uid("sr"), asset_id: a.asset_id, project_id: a.project_id, time_range:{start_ms:0,end_ms:5000}, thumbnail_frame_ms:1200, ranking:{position:0,overall_score:confidence.overall,label:confidence.label}, evidence:[{type:"semantic_similarity",score:score,model:"n0va-embed-videos-v3"}], explanation:{summary:`Similar to ${src.asset_id} mode ${mode}`, factors}, confidence, permissions:{can_view:true,can_edit:true,can_download:false}, analysis_state: a.analysis_state });
    }
  }
  results.sort((a,b)=>b.ranking.overall_score-a.ranking.overall_score);
  results.forEach((r,i)=>r.ranking.position=i+1);
  return results.slice(0,10);
}

export function duplicateSearch(params: { asset_id: string; levels?: DuplicateLevel[]; thresholds?: { near_duplicate?: number; semantic_duplicate?: number }; tenant_id: string }): { families: DuplicateFamily[]; level_results: Record<string, SearchResult[]> } {
  const families: DuplicateFamily[] = [];
  const level_results: Record<string, SearchResult[]> = {};
  const target = assets.find(a=>a.asset_id===params.asset_id);
  if (!target) return { families, level_results };
  // File level: cryptographic hash exact (mock: same asset_id)
  if (!params.levels || params.levels.includes("file")) {
    // only exact same file hash would match — none for demo besides itself
    level_results.file = [];
  }
  if (!params.levels || params.levels.includes("media")) {
    // perceptual hash
    const mediaMatches = assets.filter(a=>a.duplicate_family===target.duplicate_family && a.asset_id!==target.asset_id);
    level_results.media = mediaMatches.map(a=>({ result_id: uid("sr"), asset_id: a.asset_id, project_id: a.project_id, time_range:{start_ms:0,end_ms:a.duration_ms}, thumbnail_frame_ms:1000, ranking:{position:0,overall_score:0.976,label:"very_strong_match" as const}, evidence:[{type:"semantic_similarity" as const,score:0.976,model:"perceptual_hash"}], explanation:{summary:"Near-duplicate: 97.6%",factors:["Shared audio fingerprint: 99.1%","Shared frame sequence: 96.8%"]}, confidence:{overall:0.976,components:{semantic_similarity:0.976},penalties:{},calibration:{model_version:"n0va-retrieval-v3",calibrated:true},label:"very_strong_match"}, permissions:{can_view:true,can_edit:true,can_download:false}, duplicate_family_id: target.duplicate_family, analysis_state: a.analysis_state }));
  }
  if (!params.levels || params.levels.includes("shot")) {
    level_results.shot = level_results.media ?? [];
  }
  if (!params.levels || params.levels.includes("semantic")) {
    level_results.semantic = assets.filter(a=>a.topics.some(t=>target.topics.includes(t)) && a.asset_id!==target.asset_id).map(a=>({ result_id: uid("sr"), asset_id: a.asset_id, project_id: a.project_id, time_range:{start_ms:0,end_ms:5000}, thumbnail_frame_ms:1000, ranking:{position:0,overall_score:0.82,label:"strong_match" as const}, evidence:[{type:"semantic_similarity" as const,score:0.82,model:"n0va-embed-videos-v3"}], explanation:{summary:"Semantic duplicate: same event different angle",factors:["Same event"]}, confidence:{overall:0.82,components:{semantic_similarity:0.82},penalties:{},calibration:{model_version:"n0va-retrieval-v3",calibrated:true},label:"strong_match"}, permissions:{can_view:true,can_edit:true,can_download:false}, duplicate_family_id: target.duplicate_family, analysis_state: a.analysis_state }));
  }
  // Find families containing target
  for (const fam of duplicateFamilies) if (fam.members.some(m=>m.asset_id===params.asset_id)) families.push(fam);
  // tenant filter families: filter members to only tenant's assets
  const filteredFamilies = families.map(f=>({ ...f, members: f.members.filter(m=>assets.some(a=>a.asset_id===m.asset_id && a.tenant_id===params.tenant_id))}));
  return { families: filteredFamilies, level_results };
}

// ── Fusion + ranking ─────────────────────────────────────────────────────────
export function fuseResults(candidates: SearchResult[][], weights?: Record<string, number>): SearchResult[] {
  // Reciprocal rank fusion simplified: score = sum 1/(k+rank)
  const k=60;
  const map = new Map<string, { result: SearchResult; fused: number }>();
  for (const list of candidates) {
    for (let i=0;i<list.length;i++) {
      const r = list[i]!;
      const key = `${r.asset_id}:${r.time_range.start_ms}-${r.time_range.end_ms}`;
      const score = 1/(k + (i+1));
      const existing = map.get(key);
      if (existing) existing.fused += score * (weights?.semantic_similarity ?? 1);
      else map.set(key, { result: r, fused: score });
    }
  }
  const fused = Array.from(map.values()).map(v=>({ ...v.result, ranking: { ...v.result.ranking, overall_score: Math.min(0.99, v.fused*2), label: (v.fused*2>=0.9?"very_strong_match":v.fused*2>=0.75?"strong_match":v.fused*2>=0.5?"possible_match":"weak_match") as ConfidenceBreakdown["label"] }}));
  fused.sort((a,b)=>b.ranking.overall_score - a.ranking.overall_score);
  fused.forEach((r,i)=>r.ranking.position=i+1);
  return fused;
}

export function applyPolicyFilters(results: SearchResult[], context: SearchContext, opts?: { exclude_expired_consent?: boolean; exclude_legal_hold?: boolean; exclude_rejected?: boolean }): { filtered: SearchResult[]; filtered_counts: { inaccessible_projects: number; expired_consent: number; legal_hold: number } } {
  let filtered = [...results];
  let expired_consent = 0, legal_hold = 0, inaccessible_projects = 0;
  const before = filtered.length;
  // tenant isolation already enforced at candidate generation; double-check
  filtered = filtered.filter(r=>{
    const rec = assets.find(a=>a.asset_id===r.asset_id);
    if (!rec) return false;
    if (rec.tenant_id !== context.tenant_id) { inaccessible_projects++; return false; }
    if (!context.project_ids.includes(rec.project_id) && context.project_ids.length>0 && context.project_ids.includes(rec.project_id)===false) {
      // if scope is limited, filter out assets not in scope — count as inaccessible
      if (!context.project_ids.includes(rec.project_id)) { inaccessible_projects++; return false; }
    }
    return true;
  });
  // consent filter
  if (opts?.exclude_expired_consent !== false) {
    const keep: SearchResult[] = [];
    for (const r of filtered) {
      const rec = assets.find(a=>a.asset_id===r.asset_id);
      if (rec && !rec.consent_valid) { expired_consent++; continue; }
      keep.push(r);
    }
    filtered = keep;
  }
  if (opts?.exclude_legal_hold !== false) {
    const keep: SearchResult[] = [];
    for (const r of filtered) {
      const rec = assets.find(a=>a.asset_id===r.asset_id);
      if (rec && rec.legal_hold) { legal_hold++; continue; }
      keep.push(r);
    }
    filtered = keep;
  }
  if (opts?.exclude_rejected !== false) {
    filtered = filtered.filter(r=>{
      const rec = assets.find(a=>a.asset_id===r.asset_id);
      return rec?.approval !== "rejected";
    });
  }
  // Note: semantic similarity never overrides these filters
  return { filtered, filtered_counts: { inaccessible_projects, expired_consent, legal_hold } };
}

// ── Smart hybrid entry ───────────────────────────────────────────────────────
export function smartSearch(params: { query: string; scope: SearchContext; mode?: SearchMode; limit?: number; includeEvidence?: boolean }): { results: SearchResult[]; plan: QueryPlan; parsed: ParsedQuery; audit: SearchAudit; why_groups?: { interpretation: string; results: SearchResult[] }[] } {
  const parsed = parseNaturalQuery(params.query, params.scope);
  const plan = planQuery(parsed);
  // Progressive: fast path candidates
  const candidates: SearchResult[][] = [];
  // Exact transcript for deterministic terms
  if (parsed.structured.topic || parsed.structured.speaker || params.query.includes('"')) {
    const phrase = parsed.structured.topic ?? params.query;
    candidates.push(exactTranscriptSearch({ phrase, speaker_id: parsed.structured.speaker==="CEO"?"person_001":undefined, tenant_id: params.scope.tenant_id }));
  }
  // Vector ANN mock: semantic similarity candidates (use embedding_sim)
  const vectorCandidates: SearchResult[] = assets.filter(a=>a.tenant_id===params.scope.tenant_id && params.scope.project_ids.includes(a.project_id) && a.embedding_sim>0.7).map(a=>{
    const confidence: ConfidenceBreakdown = { overall: a.embedding_sim, components:{ semantic_similarity: a.embedding_sim }, penalties:{}, calibration:{model_version:"n0va-retrieval-v3",calibrated:true}, label: a.embedding_sim>=0.9?"very_strong_match":a.embedding_sim>=0.75?"strong_match":"possible_match" };
    return { result_id: uid("sr"), asset_id: a.asset_id, project_id: a.project_id, time_range:{start_ms:45000,end_ms:52000}, thumbnail_frame_ms:47600, ranking:{position:0,overall_score:a.embedding_sim,label:confidence.label}, evidence:[{type:"semantic_similarity",score:a.embedding_sim,model:"n0va-embed-videos-v3"}], explanation:{summary:`Semantic ${a.embedding_sim}`,factors:["Multimodal embedding"]}, confidence, permissions:{can_view:true,can_edit:true,can_download:false}, analysis_state: a.analysis_state } as SearchResult;
  });
  candidates.push(vectorCandidates);
  // Visual/motion/color/emotion if requested
  if (parsed.structured.shot_size) candidates.push(visualCompositionSearch({ shot_size: parsed.structured.shot_size, tenant_id: params.scope.tenant_id }));
  if (parsed.structured.camera_movement) candidates.push(cameraMovementSearch({ type: parsed.structured.camera_movement, tenant_id: params.scope.tenant_id }));
  if (parsed.structured.palette) candidates.push(colorPaletteSearch({ colors: parsed.structured.palette, tenant_id: params.scope.tenant_id }));
  if (parsed.structured.emotion) candidates.push(emotionSearch({ emotion: parsed.structured.emotion, tenant_id: params.scope.tenant_id }));
  if (parsed.structured.speaker || parsed.structured.topic) candidates.push(speakerTopicSearch({ speaker: parsed.structured.speaker, topic: parsed.structured.topic, tenant_id: params.scope.tenant_id }));

  // Fuse
  let fused = fuseResults(candidates, plan.ranking_weights);
  // Collapse duplicates — keep highest scoring per duplicate family
  const seenFamily = new Set<string>();
  const deduped: SearchResult[] = [];
  for (const r of fused) {
    const fam = assets.find(a=>a.asset_id===r.asset_id)?.duplicate_family;
    if (fam && seenFamily.has(fam)) continue; // collapse
    if (fam) seenFamily.add(fam);
    deduped.push(r);
  }
  fused = deduped;

  // Apply policy filters (never bypass)
  const { filtered, filtered_counts } = applyPolicyFilters(fused, params.scope);

  // Confidence calibration + explanation generation already included
  // Add graph path where applicable
  for (const r of filtered) {
    const rec = assets.find(a=>a.asset_id===r.asset_id);
    if (rec && rec.project_id==="project_001") r.graph_path = ["proj_001","scene_012","product_007","consent_032","review_dec_0194"];
  }

  // Audit
  const audit: SearchAudit = {
    audit_id: uid("audit"), query_text: params.query, parsed_intent: parsed, scope: params.scope, mode: params.mode ?? "smart",
    model_versions: ["n0va-retrieval-v3","n0va-video-analysis-v4"], index_versions: ["fulltext_transcript","vector_visual","vector_multimodal","temporal_interval"],
    candidate_sources: plan.candidate_sources, ranking_factors: Object.keys(plan.ranking_weights), results_displayed: Math.min(filtered.length, params.limit ?? 25),
    filtered_counts, timestamp: nowIso(),
  };
  audits.push(audit);

  // Handle ambiguity: run parallel interpretations if needed
  let why_groups: { interpretation: string; results: SearchResult[] }[] | undefined;
  if (parsed.ambiguities) {
    const firstAmb = parsed.ambiguities[0];
    if (firstAmb) {
      why_groups = firstAmb.meanings.map(m=>({
        interpretation: m,
        results: filtered.slice(0,2), // mock parallel labeling
      }));
    }
  }

  const limited = filtered.slice(0, params.limit ?? 25);
  limited.forEach((r,i)=>r.ranking.position=i+1);
  return { results: limited, plan, parsed, audit, why_groups };
}

// ── Tenant + freshness ───────────────────────────────────────────────────────
export function isStale(asset_id: string): boolean { return assets.find(a=>a.asset_id===asset_id)?.analysis_state.stale ?? false; }
export function reindex(asset_id: string): void {
  const rec = assets.find(a=>a.asset_id===asset_id);
  if (rec) { rec.analysis_state.indexed_at = nowIso(); rec.analysis_state.stale = false; }
}

// ── Metrics ──────────────────────────────────────────────────────────────────
export function searchMetrics(): Record<string, number> {
  return {
    total_assets: assets.length,
    indexed_assets: assets.filter(a=>!a.analysis_state.stale).length,
    duplicate_families: duplicateFamilies.length,
    avg_embedding_sim: Number((assets.reduce((s,a)=>s+a.embedding_sim,0)/assets.length).toFixed(2)),
  };
}
export function listAudits(): SearchAudit[] { return [...audits]; }
export function getSearchAudit(auditId: string): SearchAudit | null { return audits.find(a=>a.audit_id===auditId) ?? null; }
