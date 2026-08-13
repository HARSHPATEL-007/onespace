/**
 * N0VA VOICE (Project Echo) — transcript intelligence, pure layer.
 *
 * Turns raw transcript text into structured, time-linked extractions:
 * tasks, follow-ups, reminders, decisions, approvals, delegates, research
 * items, and calendar intents. Relative dates resolve against the recording
 * time; summaries are layered (1-line, bullets, decisions, questions, risks);
 * sensitive terms can be redacted. No I/O — fully deterministic and testable.
 */

export type ExtractionKind = "TASK" | "FOLLOW_UP" | "REMINDER" | "DECISION" | "APPROVAL" | "DELEGATE" | "RESEARCH" | "EVENT";

export interface TranscribedSegment {
  startMs: number;
  endMs: number;
  speaker: string;
  text: string;
  confidence: number;
}

export interface ExtractedItem {
  kind: ExtractionKind;
  category: string;
  title: string;
  ownerName?: string;
  dueAt?: Date;
  startAt?: Date;
  endAt?: Date;
  durationMin?: number;
  confidence: number;
  sourceStartMs: number;
  sourceEndMs: number;
  sourceText: string;
}

export interface Summary {
  oneLine: string;
  bullets: string[];
  decisions: string[];
  actionItems: string[];
  openQuestions: string[];
  risks: string[];
}

export interface ParserOptions {
  /** Recording time used to resolve relative dates ("tomorrow", "friday at 3"). */
  now?: Date;
  /** Speaker label → user id map (known-user matching where allowed). */
  speakerMap?: Record<string, string>;
  /** Terms to redact from transcript surfaces (privacy). */
  sensitiveTerms?: string[];
  /** Overrides: force a segment's speaker to a user id. */
  mentions?: Record<string, string>;
}

const KIND_PATTERNS: Array<{ kind: ExtractionKind; category: string; re: RegExp; base: number }> = [
  { kind: "REMINDER", category: "Reminder", re: /remind (me|us|you)|reminder|don'?t forget|heads ?up/i, base: 0.92 },
  { kind: "APPROVAL", category: "Approval request", re: /approval|approve|sign ?off|green light|buy ?off|for (my|your|our) review/i, base: 0.9 },
  { kind: "DELEGATE", category: "Delegate request", re: /can you|could you|please (send|share|draft|reach out|take care|handle)|assign (it|this|that) to|delegate/i, base: 0.86 },
  { kind: "FOLLOW_UP", category: "Follow-up", re: /follow ?up|check (back|in)|circle back|get back to|ping (them|him|her|me)|touch base/i, base: 0.85 },
  { kind: "DECISION", category: "Decision", re: /we (decided|agreed|settled|committed)|decision (is|was|made)|consensus|lock(ed)? (it|this) in|going with/i, base: 0.88 },
  { kind: "EVENT", category: "Meeting intent", re: /let'?s (meet|schedule|sync|set ?up|book)|meet(ing)? (at|on|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|this)|schedule (a|the|our)|book (a|the)|sync up|standup|huddle/i, base: 0.87 },
  { kind: "RESEARCH", category: "Research item", re: /research|look into|figure out|investigate|find (out|a way)|check (the|our) (docs|notes|numbers)|dig into/i, base: 0.8 },
  { kind: "TASK", category: "To-do", re: /i'?ll (take care|handle|send|draft|reach out|write|update|do)|i will |we (need|have) to|need to (send|update|write|fix|review|prepare)|have to |someone (needs|has) to|must (do|get)|to[- ]?do/i, base: 0.82 },
];

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b|\b(noon|midnight|morning|afternoon|evening)\b/i;
const DURATION_RE = /\b(\d+|an?|half)\s*(minutes?|mins?|hours?|hrs?)\b/i;
const RELATIVE_RE = /\b(today|tomorrow|tonight|this (morning|afternoon|evening|week|weekend)|next (week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|end of (the )?(week|day|month)|in (\d+|a few|a couple of) days?)\b/i;

function sentenceCase(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Split transcript into sentences, preserving rough char offsets for timing. */
export function splitSentences(text: string): Array<{ text: string; start: number; end: number }> {
  const out: Array<{ text: string; start: number; end: number }> = [];
  const re = /[^.!?]+[.!?]*/g;
  let m: RegExpExecArray | null;
  let offset = 0;
  while ((m = re.exec(text)) !== null) {
    const t = m[0].trim();
    if (!t) continue;
    const start = m.index;
    const end = m.index + m[0].length;
    out.push({ text: t, start, end });
    offset = end;
  }
  void offset;
  return out;
}

/** Map a char offset in the full transcript to the segment containing it. */
export function segmentForOffset(segments: TranscribedSegment[], text: string, offset: number): TranscribedSegment | null {
  let cumulative = 0;
  for (const seg of segments) {
    const segStart = cumulative;
    const segEnd = cumulative + seg.text.length;
    if (offset >= segStart && offset <= segEnd) return seg;
    cumulative = segEnd + 1;
  }
  return segments[segments.length - 1] ?? null;
}

/** Resolve a relative/absolute date-time expression against `now` (UTC-safe). Returns null when no date/time is mentioned. */
export function resolveDateTime(text: string, now: Date): Date | null {
  const lower = text.toLowerCase();

  const rel = lower.match(/tomorrow|tonight|this (morning|afternoon|evening|week|weekend)|next (week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|end of (the )?(week|day|month)/);
  let day: Date | null = null;
  let dayMatched = Boolean(rel);
  if (rel) {
    const expr = rel[0] ?? "";
    if (expr === "tomorrow") day = addDays(startOfDay(now), 1);
    else if (expr === "tonight") day = startOfDay(now);
    else if (expr.startsWith("this morning") || expr.startsWith("this afternoon") || expr.startsWith("this evening")) day = startOfDay(now);
    else if (expr.startsWith("this week")) day = startOfWeek(now);
    else if (expr.startsWith("this weekend")) day = addDays(startOfDay(now), 6 - now.getDay());
    else if (expr.startsWith("next week")) day = addDays(startOfWeek(now), 7);
    else if (expr.startsWith("end of")) {
      if (expr.endsWith("day")) day = startOfDay(now);
      else if (expr.endsWith("week")) day = addDays(startOfDay(now), 6 - now.getDay());
      else if (expr.endsWith("month")) day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    } else {
      const wd = WEEKDAYS.findIndex((w) => expr.includes(w));
      if (wd >= 0 && WEEKDAYS[wd]) {
        let daysAhead = (wd - now.getDay() + 7) % 7;
        if (daysAhead === 0) daysAhead = 7;
        day = addDays(startOfDay(now), daysAhead);
      }
    }
  }

  if (!day) {
    const wdIdx = WEEKDAYS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(lower));
    if (wdIdx >= 0) {
      dayMatched = true;
      let daysAhead = (wdIdx - now.getDay() + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      day = addDays(startOfDay(now), daysAhead);
    }
  }

  const inDays = lower.match(/in (\d+|a few|a couple of) days?/);
  if (!day && inDays) {
    dayMatched = true;
    const n = inDays[1] ?? "";
    const k = n === "a few" ? 3 : n === "a couple of" ? 2 : parseInt(n, 10);
    day = addDays(startOfDay(now), k || 1);
  }

  const ordinal = lower.match(/\bthe? (\d{1,2})(st|nd|rd|th)\b/);
  if (!day && ordinal) {
    dayMatched = true;
    const d = parseInt(ordinal[1] ?? "1", 10);
    const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), d));
    day = d > now.getUTCDate() ? thisMonth : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, d));
  }

  const time = text.match(/(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?|(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)|(?:^|\s)at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  const wordTime = text.match(/\b(noon|midnight|morning|afternoon|evening)\b/i);
  if (!dayMatched && !time && !wordTime) return null;

  if (!day) day = startOfDay(now);
  let hour = 9;
  let minute = 0;
  if (time && !wordTime) {
    let h = parseInt(time[1] ?? time[3] ?? "9", 10);
    const mm = time[2] ? parseInt(time[2], 10) : 0;
    const period = ((time[2] ? time[3] : (time[4] ?? time[8])) ?? "").toLowerCase().replace(/\./g, "");
    if (period === "pm" && h < 12) h += 12;
    if (period === "am" && h === 12) h = 0;
    hour = h;
    minute = mm;
  } else if (wordTime) {
    const w = (wordTime[1] ?? "").toLowerCase();
    if (w === "noon") hour = 12;
    else if (w === "midnight") hour = 0;
    else if (w === "morning") hour = 9;
    else if (w === "afternoon") hour = 14;
    else if (w === "evening") hour = 17;
  }

  const result = new Date(day);
  result.setUTCHours(hour, minute, 0, 0);
  return result;
}

export function resolveDurationMin(text: string): number | null {
  const m = text.match(DURATION_RE);
  if (!m) return null;
  const n = (m[1] ?? "").toLowerCase();
  const unit = (m[2] ?? "").toLowerCase();
  const value = n === "an" || n === "a" ? 1 : n === "half" ? 0.5 : parseFloat(n);
  const min = unit.startsWith("min") || unit.startsWith("m") ? value : value * 60;
  return Math.round(min);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  return addDays(day, -day.getDay());
}

/**
 * Parse a full transcript into structured extractions.
 * Each sentence is matched against commitment patterns; relative dates and
 * durations resolve against `now`; owners come from speaker mapping or
 * "assign to X" mention extraction.
 */
export function extractFromTranscript(segments: TranscribedSegment[], opts: ParserOptions = {}): ExtractedItem[] {
  const now = opts.now ?? new Date();
  const items: ExtractedItem[] = [];
  const seen = new Set<string>();

  for (const seg of segments) {
    const sentences = splitSentences(seg.text);
    const segLen = Math.max(1, seg.text.length);
    for (const sentence of sentences) {
      const startFrac = seg.text.indexOf(sentence.text.trim()) / segLen;
      const startMs = seg.startMs + Math.round((seg.endMs - seg.startMs) * Math.max(0, startFrac));
      const endMs = seg.startMs + Math.round((seg.endMs - seg.startMs) * Math.max(0.01, startFrac + sentence.text.length / segLen));
      const local: TranscribedSegment = { startMs, endMs, speaker: seg.speaker, text: sentence.text, confidence: seg.confidence };

      for (const { kind, category, re, base } of KIND_PATTERNS) {
        if (!re.test(sentence.text)) continue;

        const due = resolveDateTime(sentence.text, now);
        const durationMin = resolveDurationMin(sentence.text);

        // owner inference: "assigned to X" / "send to X" / "for X" mentions
        let ownerName: string | undefined;
        const mention = sentence.text.match(/\b(?:to|for|assign(?:ed)? to)\s+(@?[A-Z][a-zA-Z0-9_.-]+)\b/);
        if (mention && !/^(me|us|you|him|her|them|the team|it)$/i.test(mention[1] ?? "")) ownerName = mention[1];
        else if (opts.speakerMap?.[seg.speaker]) ownerName = opts.speakerMap[seg.speaker];

        const dateBoost = due ? 0.05 : 0;
        const confidence = Math.min(0.98, base + seg.confidence * 0.08 + dateBoost);

        const title = sentenceCase(sentence.text.replace(/^(so|okay|ok|yeah|right|um|uh)[,.]?\s*/i, "").slice(0, 160));

        const dedupKey = `${kind}|${sentence.text.toLowerCase().slice(0, 60)}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        const startAt = kind === "EVENT" && due ? due : undefined;
        const endAt = startAt && durationMin ? new Date(startAt.getTime() + durationMin * 60_000) : undefined;

        items.push({
          kind,
          category,
          title,
          ownerName,
          dueAt: kind === "EVENT" ? undefined : (due ?? undefined),
          startAt,
          endAt,
          durationMin: durationMin ?? undefined,
          confidence,
          sourceStartMs: local.startMs,
          sourceEndMs: local.endMs,
          sourceText: sentence.text.slice(0, 200),
        });
        break; // one classification per sentence
      }
    }
  }
  return items;
}

/** Build the layered summary: 1-line, bullets, decisions, actions, questions, risks. */
export function buildSummary(segments: TranscribedSegment[], items: ExtractedItem[]): Summary {
  const fullText = segments.map((s) => s.text).join(" ");
  const sentences = splitSentences(fullText).map((s) => sentenceCase(s.text));

  const decisions = sentences.filter((s) => /(we decided|we agreed|decision is|decision was|consensus|going with|locked (it|this) in)/i.test(s)).slice(0, 6);
  const openQuestions = sentences.filter((s) => /(\?$|^(what|who|when|where|how|should we|can we|do we)\b)/i.test(s)).slice(0, 6);
  const risks = sentences.filter((s) => /(risk|concern|blocker|at risk|careful|must not|worried|tight schedule|dependency)/i.test(s)).slice(0, 5);

  const actionItems = items.map((i) => i.title).slice(0, 8);
  const bullets = sentences.slice(0, 8);

  const oneLine =
    decisions[0] ??
    sentences[0] ??
    (segments[0]?.text ? sentenceCase(segments[0].text.slice(0, 140)) : "");

  return { oneLine: oneLine.slice(0, 200), bullets, decisions, actionItems, openQuestions, risks };
}

/** Redact sensitive terms from a transcript (privacy; keeps references intact). */
export function redactTranscript(text: string, terms: string[] = []): string {
  let out = text;
  for (const term of terms) {
    if (!term.trim()) continue;
    out = out.replace(new RegExp(escapeRegExp(term.trim()), "gi"), "[redacted]");
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Deterministic dev heuristic: split a raw utterance into timed segments. */
export function segmentTranscript(text: string, opts: { durationMs?: number; speakers?: number } = {}): TranscribedSegment[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [];
  const speakers = opts.speakers ?? 2;
  const totalChars = text.length;
  const durationMs = opts.durationMs ?? Math.max(3000, totalChars * 130);
  const segments: TranscribedSegment[] = [];
  let cursor = 0;
  let speakerIdx = 0;
  for (const [i, s] of sentences.entries()) {
    const fraction = totalChars === 0 ? 1 : (s.end - s.start) / totalChars;
    const startMs = Math.round(cursor);
    const endMs = Math.round(cursor + fraction * durationMs);
    cursor = endMs;
    if (i % 3 === 0) speakerIdx = (speakerIdx + 1) % Math.max(1, speakers);
    const confidence = Math.min(0.97, 0.72 + (s.text.length % 5) * 0.04);
    segments.push({
      startMs,
      endMs,
      speaker: `SPEAKER_${String(speakerIdx).padStart(2, "0")}`,
      text: s.text,
      confidence: Number(confidence.toFixed(2)),
    });
  }
  return segments;
}