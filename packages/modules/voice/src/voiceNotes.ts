/**
 * N0VA VOICE (Project Echo) — server pipeline.
 *
 * Voice as a structured input stream: ingest audio → transcribe (timestamped,
 * speaker-aware, confidence) → extract action items & calendar intents →
 * summarize → index for search → confirm drafts into real tasks/events.
 * Every transition emits a canonical bus event (voice.*.ready / extracted /
 * confirmed) through the transactional outbox.
 */
import { prisma, type Prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";
import {
  emitEvent,
  voiceRecordingUploaded,
  voiceTranscriptReady,
  voiceActionExtracted,
  voiceActionConfirmed,
  voiceSummaryReady,
  voiceTranscriptCorrected,
} from "@n0va/modules-events/server";
import { extractFromTranscript, buildSummary, extractTopics, redactTranscript, type ExtractedItem, type TranscribedSegment } from "./parser";
import { transcriberFromEnv, type TranscriberPort } from "./transcribe";

const MODULE = "voice";

export type VoiceSourceName = "NOTE" | "MEMO" | "HUDDLE" | "UPLOAD" | "LIVE";
export type VoiceConsentName = "NONE" | "INFORMED" | "GUEST_DISCLOSED" | "ON_DEVICE";

export interface IngestInput {
  source: VoiceSourceName;
  title?: string;
  audioKey?: string;
  audioSizeBytes?: number;
  audioDurationMs?: number;
  mimeType?: string;
  language?: string;
  consent?: VoiceConsentName;
  retentionDays?: number;
  roomRef?: string;
  threadRef?: string;
  /** IANA zone or ISO offset ("+05:30") for wall-clock date resolution. */
  timezone?: string;
  /** Dev/demo path: transcript text transcribed instantly. */
  textHint?: string;
  segments?: TranscribedSegment[];
  /** Terms redacted from transcript surfaces (privacy). */
  sensitiveTerms?: string[];
  meta?: Record<string, unknown>;
}

export interface CorrectInput {
  title?: string;
  transcriptText?: string;
  segments?: Array<{ id: string; correctedText: string }>;
  sensitiveTerms?: string[];
  consent?: VoiceConsentName;
}

export interface SearchFilters {
  q?: string;
  speaker?: string;
  roomRef?: string;
  source?: VoiceSourceName;
  from?: string;
  to?: string;
  minConfidence?: number;
  topic?: string;
  entity?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
}

const voiceId = () => `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function tzOffsetMin(timezone?: string | null): number {
  if (!timezone) return 0;
  const m = timezone.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (m) {
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (parseInt(m[2] ?? "0", 10) * 60 + parseInt(m[3] ?? "0", 10));
  }
  const n = Number(timezone);
  if (Number.isFinite(n)) return Math.round(n);
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return Math.round((asUTC - now.getTime()) / 60_000);
  } catch {
    return 0;
  }
}

export class VoiceNotesService {
  private readonly transcriber: TranscriberPort;

  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
    transcriber?: TranscriberPort,
  ) {
    this.transcriber = transcriber ?? transcriberFromEnv();
  }

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for voice`);
    }
  }

  private async emit(type: string, payload: Record<string, unknown>, correlationId: string) {
    const factories: Record<string, (p: Record<string, unknown>, o: { producer: string; tenantId: string; aggregateId: string; correlationId: string }) => unknown> = {
      "voice.recording.uploaded": voiceRecordingUploaded,
      "voice.transcript.ready": voiceTranscriptReady,
      "voice.action.extracted": voiceActionExtracted,
      "voice.action.confirmed": voiceActionConfirmed,
      "voice.summary.ready": voiceSummaryReady,
      "voice.transcript.corrected": voiceTranscriptCorrected,
    };
    const factory = factories[type];
    if (!factory) return;
    const event = factory(payload, {
      producer: "voice-service",
      tenantId: this.workspaceId,
      aggregateId: String(payload.voiceId ?? payload.recordingId ?? ""),
      correlationId,
    }) as Parameters<typeof emitEvent>[0];
    await emitEvent(event, "redis").catch(() => {});
  }

  // ── Ingestion ────────────────────────────────────────────────────────────

  async ingest(input: IngestInput): Promise<{ id: string; voiceId: string; status: string }> {
    await this.assert("CREATE");
    const id = voiceId();
    const recording = await prisma.voiceRecording.create({
      data: {
        voiceId: id,
        workspaceId: this.workspaceId,
        createdById: this.userId,
        source: input.source,
        title: input.title ?? "",
        audioKey: input.audioKey ?? "",
        audioSizeBytes: input.audioSizeBytes ?? 0,
        audioDurationMs: input.audioDurationMs ?? 0,
        mimeType: input.mimeType ?? "audio/webm",
        language: input.language ?? "en",
        consent: input.consent ?? "INFORMED",
        retentionDays: input.retentionDays ?? 90,
        roomRef: input.roomRef ?? null,
        threadRef: input.threadRef ?? null,
        timezone: input.timezone ?? null,
        meta: (input.meta ?? {}) as Prisma.InputJsonValue,
      },
    });

    await this.emit("voice.recording.uploaded", {
      voiceId: id,
      source: input.source,
      durationMs: input.audioDurationMs ?? 0,
      creatorId: this.userId,
      roomRef: input.roomRef ?? null,
    }, id);

    if (input.textHint || input.segments) {
      return this.transcribe(recording.id, { textHint: input.textHint ?? "", segments: input.segments, sensitiveTerms: input.sensitiveTerms });
    }
    return { id: recording.id, voiceId: id, status: "PENDING" };
  }

  // ── Transcription ────────────────────────────────────────────────────────

  async transcribe(recordingId: string, opts: { textHint?: string; segments?: TranscribedSegment[]; sensitiveTerms?: string[] } = {}) {
    await this.assert("UPDATE");
    const recording = await this.owned(recordingId);
    await prisma.voiceRecording.update({ where: { id: recordingId }, data: { status: "TRANSCRIBING" } });

    const existingRows = await prisma.voiceTranscriptSegment.findMany({ where: { recordingId }, orderBy: { order: "asc" } });
    const metaHint = (recording.meta as Record<string, unknown> | null)?.textHint;
    const userProvided = Boolean(opts.segments?.length || opts.textHint || (typeof metaHint === "string" && metaHint));
    const fallbackText = existingRows.length ? existingRows.map((r) => r.correctedText ?? r.text).join(" ") : recording.transcriptText;
    const textHint = opts.textHint ?? (typeof metaHint === "string" && metaHint ? metaHint : fallbackText);

    // No new input and nothing to work from: keep current state.
    if (!textHint && !opts.segments?.length) {
      await prisma.voiceRecording.update({ where: { id: recordingId }, data: { status: recording.status } });
      return { id: recordingId, voiceId: recording.voiceId, status: recording.status, segmentCount: existingRows.length };
    }

    const result = opts.segments?.length
      ? { segments: opts.segments, language: recording.language, confidenceAvg: Number((opts.segments.reduce((a, s) => a + s.confidence, 0) / opts.segments.length).toFixed(2)), durationMs: opts.segments[opts.segments.length - 1]?.endMs ?? recording.audioDurationMs, engine: "provided" }
      // Re-transcribe of an already-segmented note without new input: keep existing segmentation (idempotent re-mine).
      : existingRows.length && !userProvided
        ? { segments: existingRows, language: recording.language, confidenceAvg: Number((existingRows.reduce((a, r) => a + r.confidence, 0) / existingRows.length).toFixed(2)), durationMs: (existingRows.at(-1)?.endMs ?? recording.audioDurationMs), engine: "existing" }
        : await this.transcriber.transcribe({ audioRef: recording.audioKey || undefined, textHint, durationMs: recording.audioDurationMs || undefined });

    const terms = opts.sensitiveTerms ?? (recording.meta as Record<string, unknown> | null)?.sensitiveTerms as string[] | undefined ?? [];
    const segments = result.segments.map((s, i) => ({
      id: `seg_${recordingId.slice(0, 8)}_${i}`,
      order: i,
      startMs: s.startMs,
      endMs: s.endMs,
      speaker: s.speaker,
      text: redactTranscript(s.text, terms),
      confidence: s.confidence,
    }));
    const transcriptText = segments.map((s) => s.text).join(" ");

    await prisma.$transaction(async (tx) => {
      await tx.voiceTranscriptSegment.deleteMany({ where: { recordingId } });
      for (const seg of segments) {
        await tx.voiceTranscriptSegment.create({ data: { ...seg, recordingId } });
      }
      await tx.voiceRecording.update({
        where: { id: recordingId },
        data: {
          status: "EXTRACTED",
          transcriptText,
          confidenceAvg: result.confidenceAvg,
          language: result.language,
          audioDurationMs: result.durationMs || recording.audioDurationMs,
          transcribedAt: new Date(),
          meta: { ...((recording.meta as Record<string, unknown>) ?? {}), topics: extractTopics(segments.map((s) => ({ startMs: s.startMs, endMs: s.endMs, speaker: s.speaker, text: s.text, confidence: s.confidence }))) } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    await this.emit("voice.transcript.ready", {
      voiceId: recording.voiceId,
      language: result.language,
      segmentCount: segments.length,
      confidenceAvg: result.confidenceAvg,
    }, recording.voiceId);

    await this.extract(recordingId);
    await this.summarize(recordingId);
    return { id: recordingId, voiceId: recording.voiceId, status: "EXTRACTED", segmentCount: segments.length };
  }

  // ── Extraction ───────────────────────────────────────────────────────────

  async extract(recordingId: string) {
    await this.assert("UPDATE");
    const recording = await this.owned(recordingId);
    const rows = await prisma.voiceTranscriptSegment.findMany({ where: { recordingId }, orderBy: { order: "asc" } });
    const segments: TranscribedSegment[] = rows.map((r) => ({
      startMs: r.startMs,
      endMs: r.endMs,
      speaker: r.speaker,
      text: r.correctedText ?? r.text,
      confidence: r.confidence,
    }));
    const speakerMap = (recording.meta as Record<string, unknown> | null)?.speakerMap as Record<string, string> | undefined;

    const items: ExtractedItem[] = extractFromTranscript(segments, { now: recording.createdAt, speakerMap, tzOffsetMin: tzOffsetMin(recording.timezone) });
    let created = 0;
    for (const item of items) {
      const existing = await prisma.voiceExtraction.findFirst({
        where: { recordingId, kind: item.kind, sourceStartMs: item.sourceStartMs },
      });
      if (existing) continue;
      await prisma.voiceExtraction.create({
        data: {
          workspaceId: this.workspaceId,
          recordingId,
          kind: item.kind,
          category: item.category,
          title: item.title,
          ownerId: item.ownerName ? await this.resolveUser(item.ownerName) : null,
          assigneeName: item.ownerName ?? null,
          dueAt: item.dueAt,
          startAt: item.startAt,
          endAt: item.endAt,
          durationMin: item.durationMin,
          priority: item.priority ?? "MEDIUM",
          attendees: item.attendees?.length ? (item.attendees as Prisma.InputJsonValue) : undefined,
          confidence: item.confidence,
          sourceStartMs: item.sourceStartMs,
          sourceEndMs: item.sourceEndMs,
          sourceText: item.sourceText,
          meta: item.dependency ? ({ dependency: item.dependency } as Prisma.InputJsonValue) : undefined,
          state: item.confidence >= 0.92 ? "AUTO_CREATED" : "DRAFT",
        },
      });
      created += 1;
      await this.emit("voice.action.extracted", {
        voiceId: recording.voiceId,
        extractionId: `ext_${recording.voiceId}_${created}`,
        kind: item.kind,
        category: item.category,
        title: item.title,
        confidence: item.confidence,
      }, recording.voiceId);
    }
    return { created };
  }

  // ── Summaries ────────────────────────────────────────────────────────────

  async summarize(recordingId: string) {
    await this.assert("UPDATE");
    const recording = await this.owned(recordingId);
    const rows = await prisma.voiceTranscriptSegment.findMany({ where: { recordingId }, orderBy: { order: "asc" } });
    const segments: TranscribedSegment[] = rows.map((r) => ({ startMs: r.startMs, endMs: r.endMs, speaker: r.speaker, text: r.correctedText ?? r.text, confidence: r.confidence }));
    const extractions = await prisma.voiceExtraction.findMany({ where: { recordingId } });
    const summary = buildSummary(segments, extractions.map((e) => ({ kind: e.kind, category: e.category, title: e.title, confidence: e.confidence, sourceStartMs: e.sourceStartMs, sourceEndMs: e.sourceEndMs, sourceText: e.sourceText })));
    await prisma.voiceRecording.update({ where: { id: recordingId }, data: { summary: summary as unknown as Prisma.InputJsonValue } });
    await this.emit("voice.summary.ready", { voiceId: recording.voiceId, oneLine: summary.oneLine }, recording.voiceId);
    return summary;
  }

  // ── Corrections (editable transcript, keeps original) ────────────────────

  async correct(recordingId: string, input: CorrectInput) {
    await this.assert("UPDATE");
    const recording = await this.owned(recordingId);
    const version = recording.transcriptVersion + 1;

    if (input.segments?.length) {
      for (const seg of input.segments) {
        if (!seg.correctedText.trim()) continue;
        await prisma.voiceTranscriptSegment.updateMany({
          where: { id: seg.id, recordingId },
          data: { correctedText: seg.correctedText },
        });
      }
    }
    const rows = await prisma.voiceTranscriptSegment.findMany({ where: { recordingId }, orderBy: { order: "asc" } });
    const oldText = recording.correctedTranscript ?? recording.transcriptText;
    const correctedTranscript = rows.map((r) => r.correctedText ?? r.text).join(" ");
    const oldWords = oldText.trim().split(/\s+/).filter(Boolean);
    const newWords = correctedTranscript.trim().split(/\s+/).filter(Boolean);
    const minLen = Math.min(oldWords.length, newWords.length);
    const diffWords = oldWords.reduce((acc, w, i) => acc + (i >= minLen || w !== newWords[i] ? 1 : 0), 0) + Math.abs(oldWords.length - newWords.length);
    const qualityStats = {
      corrections: input.segments?.length ?? 0,
      werEstimate: oldWords.length ? Number((diffWords / oldWords.length).toFixed(3)) : 0,
      updatedAt: new Date().toISOString(),
    };
    await prisma.voiceRecording.update({
      where: { id: recordingId },
      data: {
        title: input.title ?? recording.title,
        correctedTranscript,
        transcriptVersion: version,
        status: "EXTRACTED",
        ...(input.consent ? { consent: input.consent } : {}),
        qualityStats: qualityStats as Prisma.InputJsonValue,
      },
    });
    await this.emit("voice.transcript.corrected", { voiceId: recording.voiceId, version }, recording.voiceId);
    await this.extract(recordingId); // re-mine corrected text for NEW items only
    await this.summarize(recordingId);
    return { version, correctedTranscript };
  }

  // ── Confirm / reject drafts into real artifacts ──────────────────────────

  async confirmExtraction(extractionId: string, action: "confirm" | "reject", target?: { type: "task" | "calendar_event"; id: string }) {
    await this.assert("UPDATE");
    const item = await prisma.voiceExtraction.findFirst({ where: { id: extractionId, workspaceId: this.workspaceId } });
    if (!item) throw new Error("extraction not found");
    const state = action === "confirm" ? "CONFIRMED" : "REJECTED";
    await prisma.voiceExtraction.update({
      where: { id: extractionId },
      data: { state, confirmedAt: new Date(), targetType: target?.type, targetId: target?.id },
    });
    const recording = await prisma.voiceRecording.findUnique({ where: { id: item.recordingId } });
    await this.emit("voice.action.confirmed", {
      voiceId: recording?.voiceId ?? "",
      extractionId,
      kind: item.kind,
      state,
      targetType: target?.type ?? null,
      targetId: target?.id ?? null,
    }, recording?.voiceId ?? "");
    return { state };
  }

  async attachAudio(recordingId: string, info: { ext: string; sizeBytes: number; mimeType: string }) {
    await this.assert("UPDATE");
    await this.owned(recordingId);
    const audioKey = `voice://${recordingId}${info.ext}`;
    await prisma.voiceRecording.update({
      where: { id: recordingId },
      data: { audioKey, audioSizeBytes: info.sizeBytes, mimeType: info.mimeType },
    });
    return { ok: true, audioKey, audioSizeBytes: info.sizeBytes, mimeType: info.mimeType };
  }

  // ── Search ───────────────────────────────────────────────────────────────

  async search(filters: SearchFilters, limit = 25) {
    await this.assert("READ");
    const qOr: Prisma.VoiceRecordingWhereInput["OR"] = filters.q
      ? [
          { title: { contains: filters.q, mode: "insensitive" } },
          { transcriptText: { contains: filters.q, mode: "insensitive" } },
          { correctedTranscript: { contains: filters.q, mode: "insensitive" } },
          { summary: { path: ["oneLine"], string_contains: filters.q } },
        ]
      : undefined;
    const where: Prisma.VoiceRecordingWhereInput = {
      workspaceId: this.workspaceId,
      deletedAt: null,
      ...(qOr ? { OR: qOr } : {}),
      ...(filters.roomRef ? { roomRef: filters.roomRef } : {}),
      ...(filters.source ? { source: filters.source } : {}),
      ...(filters.from ? { createdAt: { gte: new Date(filters.from) } } : {}),
      ...(filters.to ? { createdAt: { lte: new Date(filters.to) } } : {}),
      ...(filters.minConfidence !== undefined ? { confidenceAvg: { gte: filters.minConfidence } } : {}),
    };
    let recordings = await prisma.voiceRecording.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
    if (filters.topic || filters.entity) {
      recordings = recordings.filter((r) => {
        const metaText = JSON.stringify(r.meta ?? {}).toLowerCase();
        return (!filters.topic || metaText.includes(filters.topic.toLowerCase())) && (!filters.entity || metaText.includes(filters.entity.toLowerCase()));
      });
    }
    const ids = recordings.map((r) => r.id);

    const [segments, extractions] = await Promise.all([
      filters.speaker
        ? prisma.voiceTranscriptSegment.findMany({ where: { recordingId: { in: ids }, speaker: filters.speaker } })
        : Promise.resolve([] as Array<{ recordingId: string; speaker: string; text: string; startMs: number; confidence: number }>),
      prisma.voiceExtraction.findMany({
        where: { recordingId: { in: ids }, state: { in: ["DRAFT", "CONFIRMED", "AUTO_CREATED"] }, ...(filters.priority ? { priority: filters.priority } : {}) },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const segByRecording = new Map<string, typeof segments>();
    for (const s of segments) {
      const list = segByRecording.get(s.recordingId) ?? [];
      list.push(s);
      segByRecording.set(s.recordingId, list);
    }
    return recordings.map((r) => ({
      ...r,
      matchedSegments: filters.speaker ? segByRecording.get(r.id) ?? [] : undefined,
      extractions: extractions.filter((e) => e.recordingId === r.id),
    }));
  }

  async list(limit = 50, status?: string) {
    await this.assert("READ");
    return prisma.voiceRecording.findMany({
      where: { workspaceId: this.workspaceId, deletedAt: null, ...(status ? { status: status as Prisma.EnumVoiceStatusFilter["equals"] } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { segments: { orderBy: { order: "asc" } }, extractions: { orderBy: { createdAt: "desc" } } },
    });
  }

  async get(recordingId: string) {
    await this.assert("READ");
    return prisma.voiceRecording.findFirst({
      where: { id: recordingId, workspaceId: this.workspaceId },
      include: { segments: { orderBy: { order: "asc" } }, extractions: { orderBy: { createdAt: "desc" } } },
    });
  }

  async softDelete(recordingId: string, opts: { audio?: boolean; transcript?: boolean } = {}) {
    await this.assert("DELETE");
    await this.owned(recordingId);
    const data: Prisma.VoiceRecordingUpdateInput = { deletedAt: new Date() };
    if (opts.audio) data.audioKey = "";
    if (opts.transcript) {
      data.transcriptText = "";
      data.correctedTranscript = null;
      data.summary = undefined;
      await prisma.voiceTranscriptSegment.deleteMany({ where: { recordingId } });
    }
    await prisma.voiceRecording.update({ where: { id: recordingId }, data });
    return { deleted: true };
  }

  async stats() {
    const [total, bySource, byStatus, extractions, draftCount, confirmedCount, rejectedCount, avgConf] = await Promise.all([
      prisma.voiceRecording.count({ where: { workspaceId: this.workspaceId, deletedAt: null } }),
      prisma.voiceRecording.groupBy({ by: ["source"], where: { workspaceId: this.workspaceId, deletedAt: null }, _count: true }),
      prisma.voiceRecording.groupBy({ by: ["status"], where: { workspaceId: this.workspaceId, deletedAt: null }, _count: true }),
      prisma.voiceExtraction.count({ where: { workspaceId: this.workspaceId } }),
      prisma.voiceExtraction.count({ where: { workspaceId: this.workspaceId, state: "DRAFT" } }),
      prisma.voiceExtraction.count({ where: { workspaceId: this.workspaceId, state: "CONFIRMED" } }),
      prisma.voiceExtraction.count({ where: { workspaceId: this.workspaceId, state: "REJECTED" } }),
      prisma.voiceRecording.aggregate({ where: { workspaceId: this.workspaceId, deletedAt: null, confidenceAvg: { not: null } }, _avg: { confidenceAvg: true } }),
    ]);
    const decided = confirmedCount + rejectedCount;
    return {
      total,
      bySource,
      byStatus,
      extractions,
      draftCount,
      confirmedCount,
      rejectedCount,
      confirmationRate: decided ? Number((confirmedCount / decided).toFixed(2)) : null,
      avgConfidence: avgConf._avg.confidenceAvg,
    };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async owned(recordingId: string) {
    const row = await prisma.voiceRecording.findFirst({ where: { id: recordingId, workspaceId: this.workspaceId } });
    if (!row) throw new Error("recording not found");
    return row;
  }

  private async resolveUser(name: string): Promise<string | null> {
    const clean = name.replace(/^@/, "");
    const user = await prisma.user.findFirst({
      where: { memberships: { some: { workspaceId: this.workspaceId, status: "ACTIVE" } }, OR: [{ name: { contains: clean, mode: "insensitive" } }, { email: { startsWith: clean } }] },
      select: { id: true },
    });
    return user?.id ?? null;
  }
}