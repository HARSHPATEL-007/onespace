/**
 * N0VA1O Voice-First Interaction — real-time speech-to-text, text-to-speech,
 * and speech-to-speech with bidirectional streaming and multi-turn context.
 */

/* ---------- streaming input ---------- */

export interface AudioChunk {
  chunkId: string;
  data: string;
  timestamp: string;
  isFinal: boolean;
}

export interface PartialTranscript {
  text: string;
  isFinal: boolean;
  confidence: number;
  timestamp: string;
}

/**
 * Emit a partial transcript from an audio chunk. Pure function — in production
 * this streams from an STT engine; here it simulates partial + final output.
 */
export function emitPartialTranscript(chunk: AudioChunk, accumulated: string): PartialTranscript {
  const text = accumulated + (chunk.data ? ` ${chunk.data}` : "");
  return { text: text.trim(), isFinal: chunk.isFinal, confidence: chunk.isFinal ? 0.95 : 0.7, timestamp: chunk.timestamp };
}

/** Detect endpoint of a speech turn. Pure — uses pause duration heuristic. */
export function detectEndpoint(pauseMs: number, thresholdMs: number = 500): boolean {
  return pauseMs >= thresholdMs;
}

/* ---------- speech recognition ---------- */

export interface TranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  speaker?: string;
  language: string;
}

export interface RecognitionResult {
  segments: TranscriptSegment[];
  fullText: string;
  language: string;
  speakerCount: number;
}

/**
 * Convert spoken input to text with timestamps and confidence. Pure.
 */
export function recognizeSpeech(chunks: AudioChunk[], opts: { language?: string; speakers?: string } = {}): RecognitionResult {
  const segments: TranscriptSegment[] = [];
  let offsetMs = 0;
  const language = opts.language ?? "en";
  for (const chunk of chunks) {
    if (!chunk.data) continue;
    const durationMs = 200;
    segments.push({ text: chunk.data, startMs: offsetMs, endMs: offsetMs + durationMs, confidence: chunk.isFinal ? 0.95 : 0.7, speaker: opts.speakers, language });
    offsetMs += durationMs;
  }
  const uniqueSpeakers = new Set(segments.map((s) => s.speaker).filter(Boolean));
  return { segments, fullText: segments.map((s) => s.text).join(" "), language, speakerCount: uniqueSpeakers.size || 1 };
}

/* ---------- speech generation ---------- */

export interface VoiceStyle {
  voice: string;
  speed: number;
  pitch: number;
}

export interface TTSRequest {
  text: string;
  style: VoiceStyle;
  approved: boolean;
}

export interface TTSResult {
  audioRef: string;
  durationMs: number;
  timeToFirstAudioMs: number;
  voice: string;
}

/**
 * Generate spoken response from approved text. Pure — blocks unapproved content.
 */
export function generateSpeech(req: TTSRequest): TTSResult {
  if (!req.approved) {
    return { audioRef: "", durationMs: 0, timeToFirstAudioMs: 0, voice: req.style.voice };
  }
  const durationMs = req.text.length * 50;
  return { audioRef: `tts_${Date.now().toString(32)}`, durationMs, timeToFirstAudioMs: 150, voice: req.style.voice };
}

/* ---------- speech-to-speech control ---------- */

export interface DialogueTurn {
  turnId: string;
  role: "user" | "system";
  text: string;
  timestamp: string;
  interrupted: boolean;
}

export interface DialogueSession {
  sessionId: string;
  turns: DialogueTurn[];
  context: string[];
}

/**
 * Create a new dialogue session. Pure.
 */
export function createSession(): DialogueSession {
  return { sessionId: `sess_${Date.now().toString(32)}`, turns: [], context: [] };
}

/** Add a turn to the session. Pure. */
export function addTurn(session: DialogueSession, role: "user" | "system", text: string, interrupted: boolean = false): DialogueSession {
  const turn: DialogueTurn = { turnId: `turn_${session.turns.length}`, role, text, timestamp: new Date().toISOString(), interrupted };
  return { ...session, turns: [...session.turns, turn], context: [...session.context, text] };
}

/** Handle interruption mid-turn. Pure. */
export function interruptTurn(session: DialogueSession): DialogueSession {
  const turns = [...session.turns];
  const last = turns[turns.length - 1];
  if (last) turns[turns.length - 1] = { ...last, interrupted: true };
  return { ...session, turns };
}

/* ---------- confirmation and safety ---------- */

export interface ConfirmationResult {
  confirmed: boolean;
  action: string;
  summary: string;
  requiresExplicit: boolean;
}

/**
 * Confirm high-risk actions before execution. Pure.
 */
export function confirmAction(action: string, riskLevel: "low" | "medium" | "high", spokenConfirmation?: boolean): ConfirmationResult {
  const requiresExplicit = riskLevel === "high" || riskLevel === "medium";
  const confirmed = !requiresExplicit || spokenConfirmation === true;
  return { confirmed, action, summary: `Action: ${action}`, requiresExplicit };
}

/** Distinguish transcription confidence from action confidence. Pure. */
export function confidenceBreakdown(transcriptConfidence: number, actionConfidence: number): { transcription: number; action: number; overall: number } {
  return { transcription: transcriptConfidence, action: actionConfidence, overall: Math.round(transcriptConfidence * actionConfidence * 100) / 100 };
}

/* ---------- governance ---------- */

export interface VoiceAuditEntry {
  action: string;
  transcript: string;
  timestamp: string;
  approvalState: string;
  confidence: number;
}

/** Log a voice-driven action with transcript evidence. Pure. */
export function auditVoiceAction(action: string, transcript: string, approvalState: string, confidence: number): VoiceAuditEntry {
  return { action, transcript, timestamp: new Date().toISOString(), approvalState, confidence };
}

/* ---------- reliability ---------- */

export type AudioQuality = "good" | "degraded" | "poor";

export interface DegradationDecision {
  mode: "speech_to_speech" | "speech_to_text" | "text_only";
  reason: string;
}

/**
 * Degrade gracefully based on audio quality / latency. Pure.
 */
export function degradeGracefully(quality: AudioQuality, latencyMs: number, latencyThresholdMs: number = 1000): DegradationDecision {
  if (quality === "poor" || latencyMs > latencyThresholdMs) return { mode: "text_only", reason: `Quality: ${quality}, latency: ${latencyMs}ms` };
  if (quality === "degraded") return { mode: "speech_to_text", reason: "Degraded audio — falling back to text" };
  return { mode: "speech_to_speech", reason: "Quality sufficient for full voice" };
}

/* ---------- evaluation ---------- */

export interface VoiceMetrics {
  wordErrorRate: number;
  timeToFirstTranscriptMs: number;
  timeToFirstAudioMs: number;
  interruptionHandlingRate: number;
  taskCompletionRate: number;
}

/** Compute voice interaction metrics. Pure. */
export function measureVoice(metrics: Omit<VoiceMetrics, "wordErrorRate"> & { errorRate: number }): VoiceMetrics {
  return { wordErrorRate: metrics.errorRate, timeToFirstTranscriptMs: metrics.timeToFirstTranscriptMs, timeToFirstAudioMs: metrics.timeToFirstAudioMs, interruptionHandlingRate: metrics.interruptionHandlingRate, taskCompletionRate: metrics.taskCompletionRate };
}
