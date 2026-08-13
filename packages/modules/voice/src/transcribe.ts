/**
 * N0VA VOICE (Project Echo) — transcription abstraction.
 *
 * Broker-style port: the pipeline depends on TranscriberPort; real STT
 * engines (Whisper, cloud STT) plug in behind it. The heuristic engine is
 * the default dev backend — it converts a raw utterance (or provided text)
 * into timestamped, speaker-labeled segments with confidence scores, so the
 * full extraction pipeline is exercisable offline.
 */
import { segmentTranscript, type TranscribedSegment } from "./parser";

export interface TranscriptionResult {
  segments: TranscribedSegment[];
  language: string;
  confidenceAvg: number;
  durationMs: number;
  engine: string;
}

export interface TranscriberPort {
  readonly name: string;
  transcribe(input: { audioRef?: string; textHint?: string; durationMs?: number; language?: string }): Promise<TranscriptionResult>;
}

/** Heuristic dev engine: segments a text hint with deterministic timing. */
export const heuristicTranscriber: TranscriberPort = {
  name: "heuristic",
  async transcribe({ textHint = "", durationMs, language = "en" }) {
    const segments = segmentTranscript(textHint, { durationMs });
    const confidenceAvg = segments.length ? Number((segments.reduce((a, s) => a + s.confidence, 0) / segments.length).toFixed(2)) : 0;
    return {
      segments,
      language,
      confidenceAvg,
      durationMs: segments.length ? segments[segments.length - 1]!.endMs : durationMs ?? 0,
      engine: "heuristic",
    };
  },
};

export function transcriberFromEnv(): TranscriberPort {
  const name = process.env.VOICE_TRANSCRIBER ?? "heuristic";
  if (name === "heuristic") return heuristicTranscriber;
  // Future: whisper / cloud STT adapters register here.
  return heuristicTranscriber;
}