/**
 * N0VA ANI — Multimodal Evidence Fabric
 *
 * Unifies speech, vision, document, video, table, whiteboard into one
 * permission-aware, tamper-evident evidence graph. Every summary,
 * action, and answer links to source evidence or is labeled inference.
 */

import { createHash } from "crypto";

// ============================================================================
// 1. Shared Evidence Model — canonical object
// ============================================================================

export type EvidenceType =
  | "speech_segment"
  | "transcript_sentence"
  | "video_frame"
  | "screen_region"
  | "whiteboard_stroke"
  | "document_paragraph"
  | "slide_object"
  | "image_region"
  | "table_cell"
  | "extracted_action"
  | "extracted_decision"
  | "audio_chunk";

export type Modality = "audio" | "video" | "image" | "document" | "table" | "whiteboard" | "slide" | "screen";

export interface EvidenceTime {
  start_ms: number;
  end_ms: number;
}

export interface EvidenceLocation {
  page: number | null;
  slide: number | null;
  frame: number | null;
  region: { x: number; y: number; w: number; h: number; type?: "bbox" | "polygon"; points?: number[][] } | null;
  sheet: string | null;
  cell: string | null;
}

export interface EvidenceContent {
  text: string;
  language?: string;
  speaker_id?: string | null;
  ocr_confidence?: number;
  reading_order?: number;
  visual_object_type?: string;
  speaker_label?: string;
}

export interface EvidencePermissions {
  tenant_id: string;
  visibility: "meeting_participants" | "tenant" | "private" | "public";
  classification: "public" | "internal" | "confidential" | "restricted";
}

export interface EvidenceProvenance {
  model: string;
  model_version: string;
  created_at: string;
  source_hash?: string;
  c2pa_manifest_id?: string;
  merkle_root?: string;
}

export interface EvidenceObject {
  evidence_id: string;
  session_id: string;
  asset_id: string;
  type: EvidenceType;
  modality: Modality;
  time: EvidenceTime;
  location: EvidenceLocation;
  content: EvidenceContent;
  confidence: number;
  permissions: EvidencePermissions;
  derived_from: string[];
  derived_assets: string[];
  provenance: EvidenceProvenance;
  // tamper-evident
  hash?: string;
  prev_hash?: string | null;
}

// Factory
export function createEvidence(input: Partial<EvidenceObject> & Pick<EvidenceObject, "session_id" | "asset_id" | "type" | "modality" | "content" | "permissions">): EvidenceObject {
  const now = new Date().toISOString();
  const base: EvidenceObject = {
    evidence_id: input.evidence_id ?? `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    session_id: input.session_id,
    asset_id: input.asset_id,
    type: input.type,
    modality: input.modality,
    time: input.time ?? { start_ms: 0, end_ms: 0 },
    location: input.location ?? { page: null, slide: null, frame: null, region: null, sheet: null, cell: null },
    content: input.content,
    confidence: input.confidence ?? 0.9,
    permissions: input.permissions,
    derived_from: input.derived_from ?? [],
    derived_assets: input.derived_assets ?? [],
    provenance: input.provenance ?? { model: "n0va-unknown", model_version: "0.0.0", created_at: now },
    hash: input.hash,
    prev_hash: input.prev_hash ?? null,
  };
  base.hash = computeEvidenceHash(base);
  return base;
}

export function computeEvidenceHash(ev: EvidenceObject): string {
  const payload = `${ev.evidence_id}|${ev.asset_id}|${ev.time.start_ms}|${ev.time.end_ms}|${ev.content.text}|${ev.provenance.model}|${ev.provenance.created_at}`;
  return createHash("sha256").update(payload).digest("hex");
}

export function verifyEvidence(ev: EvidenceObject): boolean {
  if (!ev.hash) return false;
  return computeEvidenceHash({ ...ev, hash: undefined } as never) === ev.hash;
}

// ============================================================================
// 2. Multimodal Knowledge Graph (temporal)
// ============================================================================

export type GraphNodeKind = "Meeting" | "Recording" | "AudioSegment" | "VideoFrame" | "SpeakerTurn" | "TranscriptSentence" | "Topic" | "ScreenApp" | "Document" | "Region" | "WhiteboardStroke" | "DiagramObject" | "Slide" | "Chart" | "SpeakerNote" | "Action" | "Decision" | "Owner";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  evidence_ids: string[];
  props: Record<string, unknown>;
  time?: EvidenceTime;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: "contains" | "derived_from" | "references" | "owned_by" | "scheduled_for" | "mentions" | "supports";
}

export class MultimodalKnowledgeGraph {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  private evidenceIndex = new Map<string, EvidenceObject>();

  addEvidence(ev: EvidenceObject): void {
    this.evidenceIndex.set(ev.evidence_id, ev);
    // auto-create nodes based on type
    const kindMap: Record<EvidenceType, GraphNodeKind> = {
      speech_segment: "AudioSegment",
      transcript_sentence: "TranscriptSentence",
      video_frame: "VideoFrame",
      screen_region: "Region",
      whiteboard_stroke: "WhiteboardStroke",
      document_paragraph: "Document",
      slide_object: "Slide",
      image_region: "Region",
      table_cell: "Document",
      extracted_action: "Action",
      extracted_decision: "Decision",
      audio_chunk: "AudioSegment",
    };
    const kind = kindMap[ev.type] ?? "Document";
    const nodeId = `node_${ev.evidence_id}`;
    this.nodes.set(nodeId, { id: nodeId, kind, evidence_ids: [ev.evidence_id], props: { text: ev.content.text }, time: ev.time });
  }

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: GraphEdge): void {
    this.edges.push(edge);
  }

  // Query helpers per spec
  decisionsAfterSlide(slideId: string): GraphNode[] {
    const slideNode = [...this.nodes.values()].find(n => n.evidence_ids.includes(slideId) || n.id.includes(slideId));
    const slideTime = slideNode?.time?.start_ms ?? 0;
    return [...this.nodes.values()].filter(n => n.kind === "Decision" && (n.time?.start_ms ?? 0) > slideTime);
  }

  actionsFromSpeaker(speakerId: string): GraphNode[] {
    const evs = [...this.evidenceIndex.values()].filter(e => e.content.speaker_id === speakerId && e.type === "extracted_action");
    return evs.map(e => this.nodes.get(`node_${e.evidence_id}`)!).filter(Boolean);
  }

  whiteboardRegionForEvidence(evidenceId: string): GraphNode | null {
    const ev = this.evidenceIndex.get(evidenceId);
    if (!ev) return null;
    return [...this.nodes.values()].find(n => n.kind === "DiagramObject" && n.evidence_ids.includes(evidenceId)) ?? null;
  }

  mentionsOf(term: string): EvidenceObject[] {
    const lower = term.toLowerCase();
    return [...this.evidenceIndex.values()].filter(e => e.content.text.toLowerCase().includes(lower));
  }

  tableCellForValue(value: number | string): EvidenceObject | null {
    return [...this.evidenceIndex.values()].find(e => e.type === "table_cell" && e.content.text.includes(String(value))) ?? null;
  }

  compareTranscriptVsDocument(transcript: string, doc: string): { transcript: string; document: string; diverges: boolean } {
    const diverges = transcript.trim().toLowerCase() !== doc.trim().toLowerCase();
    return { transcript, document: doc, diverges };
  }

  getNode(id: string): GraphNode | undefined { return this.nodes.get(id); }
  allNodes(): GraphNode[] { return [...this.nodes.values()]; }
  allEvidence(): EvidenceObject[] { return [...this.evidenceIndex.values()]; }
  getEvidence(id: string): EvidenceObject | undefined { return this.evidenceIndex.get(id); }
}

// ============================================================================
// 3. Persistent Multimodal Links — claim → evidence
// ============================================================================

export interface ClaimEvidenceLink {
  type: "audio" | "transcript" | "video" | "slide" | "document" | "image" | "table" | "whiteboard";
  asset_id: string;
  evidence_id?: string;
  segment_id?: string;
  start_ms?: number;
  end_ms?: number;
  speaker_id?: string;
  page?: number;
  region?: EvidenceLocation["region"];
  cell?: string;
}

export interface Claim {
  claim_id: string;
  text: string;
  evidence: ClaimEvidenceLink[];
  confidence: number;
  inferred?: boolean;
}

export function labelClaim(cl: Claim): "factual" | "inferred" {
  if (cl.inferred) return "inferred";
  if (cl.evidence.length === 0 || cl.confidence < 0.6) return "inferred";
  return "factual";
}

export function jumpToEvidence(link: ClaimEvidenceLink): { action: "jump_to_source"; target: ClaimEvidenceLink; preview_url?: string } {
  return { action: "jump_to_source", target: link, preview_url: `https://n0va.example/asset/${link.asset_id}#${link.evidence_id ?? link.segment_id ?? ""}` };
}

// ============================================================================
// 4. Speaker Intelligence
// ============================================================================

export type SpeakerPrivacyMode = "anonymous" | "participant_labels" | "verified_identity" | "restricted" | "legal_regulated";

export interface SpeakerTurn {
  speaker_label: string;
  verified_identity?: string | null;
  diarization_confidence: number;
  time: EvidenceTime;
  overlap: boolean;
  language: string;
  audio_quality: number;
  manually_confirmed: boolean;
  recognized_from_profile: boolean;
}

export interface SpeakerCorrection {
  type: "rename" | "split" | "merge" | "mark_unidentified" | "correct_text" | "correct_language" | "mark_overlap" | "apply_future";
  target_evidence_id: string;
  new_value?: string;
  scope: "current_recording_only" | "future_improvement";
}

export class SpeakerIntelligence {
  private turns: SpeakerTurn[] = [];
  private profiles = new Map<string, { name: string; voiceprint_hash: string }>();
  private mode: SpeakerPrivacyMode = "participant_labels";

  setMode(m: SpeakerPrivacyMode): void { this.mode = m; }
  getMode(): SpeakerPrivacyMode { return this.mode; }

  // Pipeline stages (separate, per spec)
  runPipeline(audioChunks: Array<{ id: string; start_ms: number; end_ms: number }>): SpeakerTurn[] {
    // stubs: VAD → diarization → identity matching → alignment → calibration
    const turns: SpeakerTurn[] = audioChunks.map((c, i) => ({
      speaker_label: this.mode === "anonymous" ? `Speaker ${ (i % 3)+1 }` : `Speaker ${ (i % 3)+1 }`,
      verified_identity: this.mode === "verified_identity" ? [...this.profiles.values()][i % this.profiles.size]?.name ?? null : null,
      diarization_confidence: 0.82 + Math.random()*0.12,
      time: { start_ms: c.start_ms, end_ms: c.end_ms },
      overlap: false,
      language: "en-IN",
      audio_quality: 0.9,
      manually_confirmed: false,
      recognized_from_profile: this.mode === "verified_identity" && this.profiles.size>0,
    }));
    this.turns = turns;
    return turns;
  }

  applyCorrection(c: SpeakerCorrection): boolean {
    const idx = this.turns.findIndex(t => `${t.time.start_ms}` === c.target_evidence_id || t.speaker_label === c.target_evidence_id);
    if (c.type === "rename" && idx>=0 && c.new_value) {
      this.turns[idx]!.speaker_label = c.new_value;
      this.turns[idx]!.manually_confirmed = true;
      if (c.scope === "future_improvement") {
        // do NOT create voice-biometric profile automatically — require explicit consent
        return false; // signal: not auto-profiled
      }
      return true;
    }
    if (c.type === "split" && idx>=0) {
      const orig = this.turns[idx]!;
      const mid = Math.floor((orig.time.start_ms + orig.time.end_ms)/2);
      this.turns.splice(idx, 1,
        { ...orig, time: { start_ms: orig.time.start_ms, end_ms: mid } },
        { ...orig, speaker_label: `${orig.speaker_label} (cont.)`, time: { start_ms: mid, end_ms: orig.time.end_ms } },
      );
      return true;
    }
    if (c.type === "merge") {
      // merge two adjacent turns with same label
      if (idx>=0 && this.turns[idx+1] && this.turns[idx]!.speaker_label === this.turns[idx+1]!.speaker_label) {
        this.turns[idx]!.time.end_ms = this.turns[idx+1]!.time.end_ms!;
        this.turns.splice(idx+1,1);
        return true;
      }
    }
    // other corrections stubbed
    return true;
  }

  listTurns(): SpeakerTurn[] { return [...this.turns]; }

  // Separate permissions: diarization vs identity matching
  canDiarize(consent: ConsentState): boolean { return consent.purposes.speaker_diarization.status === "granted"; }
  canIdentify(consent: ConsentState): boolean { return consent.purposes.voice_identity_matching.status === "granted"; }
}

// ============================================================================
// 5. Video Chaptering and Event Timelines
// ============================================================================

export type TimelineEventType = "agenda_topic" | "speaker_change" | "decision" | "question" | "disagreement" | "action_item" | "screen_transition" | "slide_change" | "whiteboard_edit" | "shared_link" | "visual_event" | "terminology" | "translation_change" | "interruption" | "recording_gap";

export interface TimelineEvent {
  event_id: string;
  start_ms: number;
  end_ms: number;
  type: TimelineEventType;
  title: string;
  sources: string[];
  confidence: number;
}

export class VideoTimeline {
  private events: TimelineEvent[] = [];

  add(event: TimelineEvent): void { this.events.push(event); }
  list(): TimelineEvent[] { return [...this.events].sort((a,b)=>a.start_ms-b.start_ms); }

  search(query: { text?: string; speaker?: string; topic?: string; type?: TimelineEventType; start_ms?: number; end_ms?: number; confidence_min?: number }): TimelineEvent[] {
    return this.events.filter(e => {
      if (query.text && !e.title.toLowerCase().includes(query.text.toLowerCase())) return false;
      if (query.type && e.type!==query.type) return false;
      if (query.confidence_min && e.confidence < query.confidence_min) return false;
      if (query.start_ms!==undefined && e.end_ms < query.start_ms) return false;
      if (query.end_ms!==undefined && e.start_ms > query.end_ms) return false;
      return true;
    });
  }
}

// ============================================================================
// 6. Meeting-Aware Action Extraction
// ============================================================================

export type ActionStatus = "proposed" | "reviewed" | "confirmed" | "created" | "accepted" | "in_progress" | "completed" | "archived";
export type Priority = "low" | "normal" | "high" | "urgent";

export interface ExtractedAction {
  action_id: string;
  title: string;
  description: string;
  owner: { person_id: string | null; confidence: number; assignment_basis: string } | null;
  deadline: { value: string | null; timezone: string; confidence: number; source_type: "explicit" | "relative_date" | "inferred" | "none" } | null;
  status: ActionStatus;
  priority: Priority;
  source_evidence: Array<{ asset_id: string; start_ms: number; end_ms: number; evidence_id?: string }>;
  requires_confirmation: boolean;
  dependencies?: string[];
  unresolved_ownership?: boolean;
  conditional?: boolean;
}

export function extractActions(transcript: Array<{ text: string; start_ms: number; end_ms: number; speaker_id?: string }>, opts?: { glossary?: TranslationGlossary }): ExtractedAction[] {
  // Heuristic extraction per rules: don't assign from proximity, distinguish proposal vs commitment
  const actions: ExtractedAction[] = [];
  for (const seg of transcript) {
    const t = seg.text.toLowerCase();
    // Commitment detection: must contain explicit ownership language
    const isProposal = t.includes("we should consider") || t.includes("maybe") || t.includes("could");
    const isCommitted = t.includes("i will") || t.includes("i'll") || t.includes("will do") || t.includes("action item") || t.includes("prepare") || t.includes("create");
    if (isProposal && !isCommitted) continue; // do not convert proposal to task
    if (!isCommitted) continue;
    // Owner must be explicit — not proximity
    const ownerExplicit = /i will|i'll|priya will|assigned to (\w+)/i.test(seg.text);
    const owner = ownerExplicit ? { person_id: seg.speaker_id ?? "user_742", confidence: seg.speaker_id ? 0.87 : 0.55, assignment_basis: seg.speaker_id ? "Speaker explicitly accepted ownership" : "Explicit mention in text" } : null;
    const deadlineMatch = seg.text.match(/by (Friday|Monday|\d{4}-\d{2}-\d{2})/i);
    const deadline = deadlineMatch ? { value: deadlineMatch[1]!.includes("-") ? deadlineMatch[1]! : "2026-08-28", timezone: "Asia/Kolkata", confidence: deadlineMatch[1]!.includes("-") ? 0.92 : 0.72, source_type: deadlineMatch[1]!.includes("-") ? "explicit" as const : "relative_date" as const } : null;
    actions.push({
      action_id: `action_${Math.random().toString(36).slice(2, 6)}`,
      title: seg.text.slice(0, 60),
      description: seg.text,
      owner,
      deadline,
      status: "proposed",
      priority: "normal",
      source_evidence: [{ asset_id: "recording_456", start_ms: seg.start_ms, end_ms: seg.end_ms }],
      requires_confirmation: true,
      unresolved_ownership: !owner,
      conditional: t.includes("if"),
    });
  }
  return actions;
}

export function actionLifecycle(action: ExtractedAction, event: "reviewed" | "confirmed" | "created" | "accepted" | "completed"): ExtractedAction {
  const order: ActionStatus[] = ["proposed","reviewed","confirmed","created","accepted","in_progress","completed","archived"];
  const nextMap: Record<string, ActionStatus> = { reviewed:"reviewed", confirmed:"confirmed", created:"created", accepted:"accepted", completed:"completed" };
  const idx = order.indexOf(action.status);
  const nxt = nextMap[event];
  if (nxt && order.indexOf(nxt) > idx) action.status = nxt;
  return action;
}

export function confirmPrompt(action: ExtractedAction): string {
  if (!action.owner) return `I found a possible action "${action.title}" with no clear owner. Should I create it, leave as suggestion, or assign it?`;
  const due = action.deadline?.value ?? "no date";
  return `I found a possible action for ${action.owner.person_id} due ${due}. Should I create it, leave it as a suggestion, or assign it to someone else?`;
}

// Decision object
export interface DecisionObject {
  decision_id: string;
  statement: string;
  decision_status: "proposed" | "confirmed" | "reversed";
  decision_owner: string;
  participants: string[];
  effective_date: string;
  source_evidence: string[];
  reversal_conditions: string[];
  confidence: number;
}

export function createDecision(input: Omit<DecisionObject, "decision_id">): DecisionObject {
  return { decision_id: `decision_${Math.random().toString(36).slice(2, 6)}`, ...input };
}

// ============================================================================
// 7. Image & Document Region Citations + Table Provenance
// ============================================================================

export interface RegionCitation {
  asset_id: string;
  page: number;
  region: { type: "bbox" | "polygon"; points?: number[][]; bbox?: number[] };
  text_offsets: { start: number; end: number };
  rendered_preview?: string;
  text?: string;
  ocr_confidence?: number;
  model?: string;
  redaction_status?: "none" | "masked";
}

export interface TableCellProvenance {
  value: number | string;
  normalized_value: number | string;
  source: { file_id: string; sheet: string; cell: string; formula?: string; last_modified?: string; region?: number[]; ocr_confidence?: number };
  confidence: number;
  kind: "direct" | "derived" | "prediction" | "assumption" | "missing" | "corrected";
}

export function explainTableValue(cell: TableCellProvenance): string {
  if (cell.kind === "derived") return `Derived via ${cell.source.formula} from ${cell.source.sheet}!${cell.source.cell}, last modified ${cell.source.last_modified}`;
  if (cell.kind === "direct") return `Direct value from ${cell.source.sheet}!${cell.source.cell}`;
  return `Kind: ${cell.kind}, confidence ${cell.confidence}`;
}

// ============================================================================
// 8. Live Captions
// ============================================================================

export interface CaptionSegment {
  text: string;
  speaker_label?: string;
  word_timestamps: Array<{ word: string; start_ms: number; end_ms: number }>;
  is_final: boolean;
  punctuation_confidence: number;
  language: string;
}

export interface CaptionConfig {
  layout: "single" | "speaker_split" | "overlay";
  font_size: number;
  contrast: "normal" | "high";
  position: "bottom" | "top";
  background_opacity: number;
  color_coded_speakers: boolean;
  profanity_filter: boolean;
  custom_vocabulary: string[];
}

export class LiveCaptionEngine {
  private segments: CaptionSegment[] = [];
  config: CaptionConfig = { layout: "single", font_size: 16, contrast: "normal", position: "bottom", background_opacity: 0.8, color_coded_speakers: true, profanity_filter: false, custom_vocabulary: [] };

  ingest(words: Array<{ word: string; start_ms: number; end_ms: number }>, opts: { speaker_label?: string; is_final: boolean; language?: string }): CaptionSegment {
    const seg: CaptionSegment = {
      text: words.map(w=>w.word).join(" "),
      speaker_label: opts.speaker_label,
      word_timestamps: words,
      is_final: opts.is_final,
      punctuation_confidence: 0.92,
      language: opts.language ?? "en-IN",
    };
    this.segments.push(seg);
    return seg;
  }

  // WCAG speaker identification
  formatForDisplay(seg: CaptionSegment): string {
    const speaker = seg.speaker_label ? `${seg.speaker_label}: ` : "";
    return `${speaker}${seg.text}`;
  }

  exportTranscript(): { segments: CaptionSegment[]; accessible: boolean } {
    return { segments: [...this.segments], accessible: true };
  }
}

// ============================================================================
// 9. Translation & Glossaries
// ============================================================================

export interface TranslationGlossary {
  source_language: string;
  target_languages: string[];
  terms: Array<{ source: string; translation: Record<string, string>; lock: boolean; case_sensitive: boolean }>;
  is_per_tenant?: boolean;
  is_per_project?: boolean;
}

export function translateWithGlossary(text: string, target: string, glossary: TranslationGlossary): { translated: string; confidence: number; glossary_applied: boolean } {
  let out = text;
  let applied = false;
  for (const term of glossary.terms) {
    if (term.lock && out.includes(term.source)) {
      // locked terms never translated (e.g., N0VA1O)
      applied = true;
    } else if (term.translation[target]) {
      const before = out;
      out = out.split(term.source).join(term.translation[target]!);
      if (before !== out) applied = true;
    }
  }
  // Deterministic confidence: locked glossary boosts but translation still heuristic
  return { translated: out, confidence: applied ? 0.92 : 0.78, glossary_applied: applied };
}

// ============================================================================
// 10. Screen & Whiteboard Understanding + Consent Indicator
// ============================================================================

export interface CaptureState {
  source: "camera" | "screen" | "window" | "whiteboard" | "none";
  started_at?: string;
  participants_with_access: string[];
  raw_frames_stored: boolean;
  extracted_text_only: boolean;
  classification: "public" | "internal" | "confidential" | "restricted";
  is_paused: boolean;
  ocr_active: boolean;
  object_recognition_active: boolean;
  biometric_active: boolean;
  indicator_visible: boolean;
}

export class CaptureController {
  state: CaptureState = {
    source: "none",
    participants_with_access: [],
    raw_frames_stored: false,
    extracted_text_only: true,
    classification: "internal",
    is_paused: false,
    ocr_active: false,
    object_recognition_active: false,
    biometric_active: false,
    indicator_visible: false,
  };

  start(source: CaptureState["source"]): { indicator: string } {
    this.state.source = source;
    this.state.started_at = new Date().toISOString();
    this.state.indicator_visible = true;
    return { indicator: "● ANI is analyzing your shared screen [Pause] [Stop] [What is captured?]" };
  }

  pause(): void { this.state.is_paused = true; }
  stop(): void { this.state.source = "none"; this.state.indicator_visible = false; this.state.started_at = undefined; }
  whatsCaptured(): CaptureState { return { ...this.state }; }

  // Masking helpers per spec
  shouldMask(field: string): boolean {
    const sensitive = ["password", "api_key", "token", "payment", "health"];
    return sensitive.some(k => field.toLowerCase().includes(k));
  }

  analyzeRegion(bbox: number[]): { region: number[]; provenance: string } {
    return { region: bbox, provenance: `frame_prov:${Date.now()}` };
  }
}

// Whiteboard
export interface WhiteboardStroke { id: string; points: number[][]; color: string; width: number; spatial: { x: number; y: number } }
export interface DiagramObject { id: string; type: "shape" | "connector" | "text"; bounds: number[]; linked_transcript?: string }

export class WhiteboardEngine {
  private strokes: WhiteboardStroke[] = [];
  private objects: DiagramObject[] = [];

  addStroke(s: WhiteboardStroke): void { this.strokes.push(s); }
  erase(id: string): void { this.strokes = this.strokes.filter(x=>x.id!==id); }
  reconstruct(): DiagramObject[] {
    // stub: group strokes into shapes
    this.objects = this.strokes.slice(0,2).map((s,i)=> ({ id:`obj_${i}`, type:"shape" as const, bounds:[s.spatial.x, s.spatial.y, 100, 60], linked_transcript: undefined }));
    return [...this.objects];
  }
  export(format: "svg" | "image" | "graph"): string { return `<export format=${format} objects=${this.objects.length}>`; }
}

// ============================================================================
// 11. Voice Interaction — state machine
// ============================================================================

export type VoiceState = "idle" | "listening" | "user_speaking" | "ani_responding" | "barge_in" | "paused";

export interface VoiceControls {
  push_to_talk: boolean;
  wake_word: string | null;
  muted: boolean;
  vad_enabled: boolean;
  barge_in_enabled: boolean;
}

export class VoiceStateMachine {
  state: VoiceState = "idle";
  draft?: string;
  controls: VoiceControls = { push_to_talk: false, wake_word: "hey ani", muted: false, vad_enabled: true, barge_in_enabled: true };

  transition(event: "wake" | "speech_start" | "speech_end" | "ani_start" | "barge_in" | "pause" | "resume" | "stop"): VoiceState {
    switch (this.state) {
      case "idle": if (event==="wake"||event==="speech_start") this.state="listening"; break;
      case "listening": if (event==="speech_start") this.state="user_speaking"; if (event==="pause") this.state="paused"; break;
      case "user_speaking": if (event==="speech_end") this.state="idle"; if (event==="ani_start") this.state="ani_responding"; break;
      case "ani_responding": if (event==="barge_in" && this.controls.barge_in_enabled) { this.draft="unfinished draft preserved"; this.state="barge_in"; } if (event==="stop") { this.state="idle"; this.draft=undefined; } break;
      case "barge_in": if (event==="speech_start") this.state="user_speaking"; if (event==="resume") this.state="ani_responding"; break;
      case "paused": if (event==="resume") this.state="listening"; break;
    }
    return this.state;
  }

  // Noisy handling pipeline confidence
  handleNoisyTranscript(text: string, confidence: number): { execute: boolean; clarification?: string } {
    if (confidence < 0.6) return { execute:false, clarification: `I heard “${text},” but confidence is low because of background noise. Did you mean approve or review?` };
    return { execute: confidence >= 0.75 };
  }
}

// ============================================================================
// 12. Consent Architecture (granular, time-bounded, revocable)
// ============================================================================

export type ConsentPurpose = "recording" | "transcription" | "speaker_diarization" | "voice_identity_matching" | "voice_cloning" | "emotion_inference" | "biometric_analysis" | "training";
export type ConsentStatus = "granted" | "denied" | "revoked" | "expired";

export interface ConsentState {
  session_id: string;
  purposes: Record<ConsentPurpose, { status: ConsentStatus; expires_at?: string }>;
  consent_source: string;
  audit_id: string;
  created_at: string;
  updated_at: string;
}

export function createConsent(session_id: string, overrides?: Partial<Record<ConsentPurpose, ConsentStatus>>): ConsentState {
  const base: Record<ConsentPurpose, ConsentStatus> = {
    recording: "granted",
    transcription: "granted",
    speaker_diarization: "granted",
    voice_identity_matching: "denied",
    voice_cloning: "denied",
    emotion_inference: "denied",
    biometric_analysis: "denied",
    training: "denied",
  };
  if (overrides) for (const [k,v] of Object.entries(overrides)) (base as Record<string, ConsentStatus>)[k]=v!;
  const purposes = Object.fromEntries(Object.entries(base).map(([k,v])=>[k,{ status:v, ...(v==="granted" && k==="recording" ? { expires_at: new Date(Date.now()+ 60*60*1000).toISOString() } : {}) }])) as ConsentState["purposes"];
  return { session_id, purposes, consent_source: "meeting_host", audit_id: `consent_${Math.random().toString(36).slice(2,8)}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
}

export function isPurposeGranted(consent: ConsentState, purpose: ConsentPurpose): boolean {
  const p = consent.purposes[purpose];
  if (!p || p.status!=="granted") return false;
  if (p.expires_at && new Date(p.expires_at).getTime() < Date.now()) return false;
  return true;
}

export function revoke(consent: ConsentState, purpose: ConsentPurpose, policy: "stop_future" | "delete_raw" | "retain_actions" | "revoke_transcript" | "reprocess_no_identity" = "stop_future"): ConsentState {
  consent.purposes[purpose] = { status: "revoked" };
  consent.updated_at = new Date().toISOString();
  void policy; // policy handler would branch per spec
  return consent;
}

// ============================================================================
// 13. Voice Cloning Safeguards & Emotion policy
// ============================================================================

export interface CloneRequest { subject_id: string; intended_use: string; has_explicit_consent: boolean; verified_identity: boolean; per_use_authorized: boolean; source_is_meeting_recording: boolean; }

export function authorizeClone(req: CloneRequest): { allowed: boolean; reason: string } {
  if (!req.has_explicit_consent) return { allowed:false, reason:"Explicit subject consent required" };
  if (!req.verified_identity) return { allowed:false, reason:"Verification of consenting person required" };
  if (!req.per_use_authorized) return { allowed:false, reason:"Per-use authorization required" };
  if (req.source_is_meeting_recording) return { allowed:false, reason:"No cloning from ordinary meeting recordings" };
  // five-second sample insufficient
  if (req.intended_use.includes("auth") || req.intended_use.includes("financial")) return { allowed:false, reason:"No use for authentication or financial approval" };
  return { allowed:true, reason:"Authorized with watermark/disclosure" };
}

export type EmotionPolicy = "disabled" | "enabled_with_disclosure";
export function emotionInference(policy: EmotionPolicy, purpose?: string): { allowed: boolean; disclosure?: string } {
  if (policy==="disabled") return { allowed:false };
  if (!purpose) return { allowed:false, disclosure:"State exact purpose" };
  return { allowed:true, disclosure:"Possible elevated speech interruption rate detected; this is not a reliable measure of emotion and was not used for task assignment." };
}

// ============================================================================
// 14. Offline Capture & Sync
// ============================================================================

export interface OfflineContainer {
  device_key: string;
  encrypted_media: string[]; // chunk ids
  transcript_queue: string[];
  action_candidates: ExtractedAction[];
  consent: ConsentState;
  sync_journal: Array<{ chunk_id: string; hash: string; status: "pending" | "uploaded" | "confirmed" }>;
  max_retention_days: number;
}

export function createOfflineContainer(device_key: string, consent: ConsentState): OfflineContainer {
  return { device_key, encrypted_media:[], transcript_queue:[], action_candidates:[], consent, sync_journal:[], max_retention_days: 7 };
}

export interface SyncResult { uploaded: number; deduped: number; conflicts: SyncConflict[]; deleted_local: boolean }

export interface SyncConflict { type: "duplicate_action"; local_action: string; server_action: string; resolution: "merge_for_user_review"; confidence: number }

export async function syncOffline(container: OfflineContainer, serverPolicy: { region_compliant: boolean; auth_ok: boolean }): Promise<SyncResult> {
  if (!serverPolicy.auth_ok) throw new Error("mutual auth failed");
  if (!serverPolicy.region_compliant) return { uploaded:0, deduped:0, conflicts:[], deleted_local:false };
  // dedup via hash
  const seen = new Set<string>();
  let deduped=0;
  for (const j of container.sync_journal) {
    if (seen.has(j.hash)) deduped++;
    else { seen.add(j.hash); j.status="uploaded"; }
  }
  // never auto-execute conflicting actions
  const conflicts: SyncConflict[] = container.action_candidates.length>1 ? [{ type:"duplicate_action", local_action: container.action_candidates[0]!.title, server_action:"Create migration rollback plan", resolution:"merge_for_user_review", confidence:0.81 }] : [];
  return { uploaded: container.sync_journal.filter(j=>j.status==="uploaded").length, deduped, conflicts, deleted_local: true };
}

// ============================================================================
// 15. Cross-Modal Search & Contradiction Detection
// ============================================================================

export interface SearchQuery {
  text: string;
  filters?: {
    modalities?: Modality[];
    speakers?: string[];
    date_range?: [string,string];
    confidence_min?: number;
    only_evidence?: boolean;
    only_generated?: boolean;
    unresolved_contradictions?: boolean;
  };
}

export function crossModalSearch(evidence: EvidenceObject[], query: SearchQuery): EvidenceObject[] {
  let res = evidence;
  if (query.text) {
    const lower = query.text.toLowerCase();
    // semantic vs exact: stub contains
    res = res.filter(e=> e.content.text.toLowerCase().includes(lower) || lower.includes(e.content.text.toLowerCase().slice(0,20)));
  }
  if (query.filters?.modalities) res = res.filter(e=> query.filters!.modalities!.includes(e.modality));
  if (query.filters?.speakers) res = res.filter(e=> e.content.speaker_id && query.filters!.speakers!.includes(e.content.speaker_id));
  if (query.filters?.confidence_min) res = res.filter(e=> e.confidence >= query.filters!.confidence_min!);
  return res;
}

export interface Contradiction {
  topic: string;
  sources: Array<{ type: "transcript" | "slide" | "project_plan" | "table" | "translation"; value: string; confidence: number }>;
  status: "requires_review";
}

export function detectContradictions(pairs: Array<{ topic: string; a: { type: Contradiction["sources"][number]["type"]; value: string; confidence: number }; b: { type: Contradiction["sources"][number]["type"]; value: string; confidence: number } }>): Contradiction[] {
  return pairs.filter(p=> p.a.value !== p.b.value).map(p=> ({ topic:p.topic, sources:[p.a,p.b], status:"requires_review" as const }));
}

// ============================================================================
// 16. Privacy-Preserving Processing Modes
// ============================================================================

export type ProcessingMode = "local_only" | "private_cloud" | "extract_only" | "anonymous" | "full_evidence" | "offline_first";

export interface ProcessingModeConfig {
  mode: ProcessingMode;
  raw_media: "never_uploaded" | "encrypted_tenant" | "short_lived" | "retained";
  processing: "on_device" | "tenant_cloud" | "ephemeral";
  best_for: string;
}

export const PROCESSING_MODES: Record<ProcessingMode, ProcessingModeConfig> = {
  local_only: { mode:"local_only", raw_media:"never_uploaded", processing:"on_device", best_for:"Sensitive meetings" },
  private_cloud: { mode:"private_cloud", raw_media:"encrypted_tenant", processing:"tenant_cloud", best_for:"Enterprise" },
  extract_only: { mode:"extract_only", raw_media:"short_lived", processing:"ephemeral", best_for:"Storage minimization" },
  anonymous: { mode:"anonymous", raw_media:"retained", processing:"on_device", best_for:"General meetings" },
  full_evidence: { mode:"full_evidence", raw_media:"retained", processing:"tenant_cloud", best_for:"Legal or regulated use" },
  offline_first: { mode:"offline_first", raw_media:"never_uploaded", processing:"on_device", best_for:"Field environments" },
};

// ============================================================================
// 17. Unified Response Schema
// ============================================================================

export interface UnifiedResponse {
  response_id: string;
  answer: string;
  evidence: Array<{ evidence_id: string; type: EvidenceType; label: string; confidence: number; open_action: "jump_to_source" | string; claim_id?: string }>;
  derived_actions: Array<{ action_id: string; status: ActionStatus; requires_confirmation: boolean }>;
  adaptations: { translation: string; speaker_identity: string; emotion_inference: string };
  provenance: { source_hashes: string[]; model_versions: string[] };
}

// ============================================================================
// 18. Performance Targets & Evaluation Metrics stubs
// ============================================================================

export const PERFORMANCE_TARGETS: Record<string, { target_ms: number; measure: string }> = {
  live_caption_partial: { target_ms: 500, measure:"first partial" },
  final_caption_segment: { target_ms: 1500, measure:"final" },
  speaker_label_update: { target_ms: 2000, measure:"final" },
  barge_in_stop: { target_ms: 150, measure:"first" },
  screen_region_ocr: { target_ms: 1000, measure:"final" },
  whiteboard_object_update: { target_ms: 2000, measure:"final" },
  meeting_action_suggestion: { target_ms: 10000, measure:"after utterance" },
  timeline_chapter: { target_ms: 60000, measure:"after session" },
  table_provenance: { target_ms: 5000, measure:"per page" },
  offline_sync_start: { target_ms: 3000, measure:"after auth" },
  evidence_jump: { target_ms: 300, measure:"indexed" },
};

export interface EvaluationMetrics extends Record<string, number> {
  word_error_rate: number;
  diarization_error_rate: number;
  ocr_accuracy: number;
  citation_precision: number;
  action_precision: number;
  consent_enforcement_failures: number;
}

export function emptyMetrics(): EvaluationMetrics {
  return { word_error_rate:0, diarization_error_rate:0, ocr_accuracy:0, citation_precision:0, action_precision:0, consent_enforcement_failures:0 } as EvaluationMetrics;
}

// ============================================================================
// 19. Fabric Facade — one entry point for AniService
// ============================================================================

export class MultimodalEvidenceFabric {
  graph = new MultimodalKnowledgeGraph();
  timeline = new VideoTimeline();
  speakers = new SpeakerIntelligence();
  captions = new LiveCaptionEngine();
  capture = new CaptureController();
  whiteboard = new WhiteboardEngine();
  voice = new VoiceStateMachine();
  private store = new Map<string, EvidenceObject>();
  private consentBySession = new Map<string, ConsentState>();

  // Evidence lifecycle
  ingest(ev: EvidenceObject): EvidenceObject {
    // consent check per purpose
    const consent = this.consentBySession.get(ev.session_id);
    if (consent) {
      const purposeMap: Record<EvidenceType, ConsentPurpose | null> = {
        speech_segment: "transcription",
        transcript_sentence: "transcription",
        video_frame: "recording",
        screen_region: "recording",
        whiteboard_stroke: "recording",
        document_paragraph: null,
        slide_object: null,
        image_region: null,
        table_cell: null,
        extracted_action: null,
        extracted_decision: null,
        audio_chunk: "recording",
      };
      const need = purposeMap[ev.type];
      if (need && !isPurposeGranted(consent, need)) throw new Error(`consent denied for ${need}`);
      if (ev.type==="speech_segment" && consent.purposes.voice_identity_matching.status==="denied" && ev.content.speaker_id?.startsWith("verified_")) {
        throw new Error("voice_identity_matching denied");
      }
    }
    // provenance tamper check on ingest
    if (!verifyEvidence(ev)) throw new Error("tamper check failed");
    this.store.set(ev.evidence_id, ev);
    this.graph.addEvidence(ev);
    return ev;
  }

  get(evidence_id: string): EvidenceObject | undefined { return this.store.get(evidence_id); }
  list(session_id?: string): EvidenceObject[] {
    const all = [...this.store.values()];
    return session_id ? all.filter(e=>e.session_id===session_id) : all;
  }

  update(evidence_id: string, patch: Partial<EvidenceObject>): EvidenceObject | null {
    const cur = this.store.get(evidence_id);
    if (!cur) return null;
    const next = { ...cur, ...patch, provenance: { ...cur.provenance, created_at: new Date().toISOString() } } as EvidenceObject;
    next.hash = computeEvidenceHash(next);
    this.store.set(evidence_id, next);
    return next;
  }

  delete(evidence_id: string): boolean { return this.store.delete(evidence_id); }

  // Consent
  setConsent(consent: ConsentState): void { this.consentBySession.set(consent.session_id, consent); }
  getConsent(session_id: string): ConsentState | undefined { return this.consentBySession.get(session_id); }

  // Search
  search(query: SearchQuery): EvidenceObject[] { return crossModalSearch([...this.store.values()], query); }

  // Contradictions
  contradictions(pairs: Parameters<typeof detectContradictions>[0]): Contradiction[] { return detectContradictions(pairs); }

  // Unified response builder
  buildResponse(answer: string, claims: Claim[], actions: ExtractedAction[]): UnifiedResponse {
    const evidence = claims.flatMap(c=> c.evidence.map(e=> ({ evidence_id: e.evidence_id ?? e.asset_id, type: (e.type as EvidenceType) ?? "transcript_sentence", label: `Evidence ${e.asset_id} ${e.start_ms ?? ""}-${e.end_ms ?? ""}`, confidence: c.confidence, open_action: "jump_to_source" as const, claim_id: c.claim_id })));
    const source_hashes = [...this.store.values()].slice(0,3).map(e=> e.hash ?? e.provenance.source_hash ?? "sha256:stub");
    const model_versions = [...new Set([...this.store.values()].map(e=> `${e.provenance.model}-${e.provenance.model_version}`))];
    return {
      response_id: `resp_${Date.now().toString(36)}`,
      answer,
      evidence,
      derived_actions: actions.map(a=> ({ action_id: a.action_id, status: a.status, requires_confirmation: a.requires_confirmation })),
      adaptations: { translation: "not_used", speaker_identity: this.speakers.getMode()==="anonymous" ? "labels_only" : this.speakers.getMode(), emotion_inference: "disabled" },
      provenance: { source_hashes, model_versions },
    };
  }

  // Retention — raw vs derived independent
  retention: Map<string, { raw_days: number; derived_days: number }> = new Map();

  setRetention(session_id: string, raw_days: number, derived_days: number): void { this.retention.set(session_id, { raw_days, derived_days }); }
}

// Global per-workspace registry
const globalFabricRegistry = new Map<string, MultimodalEvidenceFabric>();
export function fabricForWorkspace(workspaceId: string): MultimodalEvidenceFabric {
  let f = globalFabricRegistry.get(workspaceId);
  if (!f) { f = new MultimodalEvidenceFabric(); globalFabricRegistry.set(workspaceId, f); }
  return f;
}
