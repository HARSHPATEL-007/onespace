"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const s = {
  card: { background: "var(--nv-surface, #16151d)", border: "1px solid var(--nv-border, #2a2936)", borderRadius: "var(--nv-radius-md, 12px)", padding: 16, marginBottom: 12 },
  row: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const },
  col: { display: "flex", flexDirection: "column" as const, gap: 8 },
  input: { background: "var(--nv-surface2, #1e1d27)", border: "1px solid var(--nv-border, #2a2936)", color: "var(--nv-text, #e8e6ef)", borderRadius: 8, padding: "8px 10px", fontSize: 13, minWidth: 150 },
  textarea: { background: "var(--nv-surface2, #1e1d27)", border: "1px solid var(--nv-border, #2a2936)", color: "var(--nv-text, #e8e6ef)", borderRadius: 8, padding: "8px 10px", fontSize: 13, width: "100%", minHeight: 72, resize: "vertical" as const },
  select: { background: "var(--nv-surface2, #1e1d27)", border: "1px solid var(--nv-border, #2a2936)", color: "var(--nv-text, #e8e6ef)", borderRadius: 8, padding: "8px 10px", fontSize: 13 },
  button: { background: "var(--nv-accent, #7c5cfc)", border: 0, color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" },
  smallButton: { background: "var(--nv-surface2, #1e1d27)", border: "1px solid var(--nv-border, #2a2936)", color: "var(--nv-text, #e8e6ef)", borderRadius: 8, padding: "4px 10px", fontSize: 12, cursor: "pointer" },
  label: { fontSize: 12, color: "var(--nv-muted, #9a97a8)" },
  chip: { display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600 },
  sub: { fontSize: 12, color: "var(--nv-muted, #9a97a8)", padding: "2px 0" },
};

interface Segment {
  id: string;
  order: number;
  startMs: number;
  endMs: number;
  speaker: string;
  text: string;
  correctedText?: string | null;
  confidence: number;
}
interface Extraction {
  id: string;
  kind: string;
  category?: string | null;
  title: string;
  confidence: number;
  state: string;
  dueAt?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  sourceText?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  assigneeName?: string | null;
}
interface Recording {
  id: string;
  voiceId: string;
  title: string;
  source: string;
  status: string;
  language?: string | null;
  audioDurationMs?: number | null;
  confidenceAvg?: number | null;
  transcriptVersion: number;
  summary?: { oneLine?: string; bullets?: string[]; decisions?: string[]; actionItems?: string[]; openQuestions?: string[]; risks?: string[] } | null;
  createdAt: string;
  segments?: Segment[];
  extractions?: Extraction[];
}
export type VoiceRecording = Recording;

const KIND_COLORS: Record<string, string> = {
  REMINDER: "#3b82f6", APPROVAL: "#f59e0b", DELEGATE: "#8b5cf6", FOLLOW_UP: "#06b6d4",
  DECISION: "#10b981", EVENT: "#ec4899", RESEARCH: "#64748b", TASK: "#22c55e",
};
const STATUS_COLORS: Record<string, string> = {
  PENDING: "#64748b", TRANSCRIBING: "#3b82f6", EXTRACTED: "#22c55e", DONE: "#10b981", FAILED: "#ef4444", RECORDING: "#f59e0b",
};
const fmt = (ms?: number | null) => (ms == null ? "–" : `${Math.max(1, Math.round(ms / 1000))}s`);
const dt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "");
const stateLabel = (st: string) => (st === "CONFIRMED" ? "Created ✓" : st === "REJECTED" ? "Rejected ✕" : st === "AUTO_CREATED" ? "Auto-created" : "Draft");

export function VoiceNotesClient({ initial }: { initial: Recording[] }) {
  const [records, setRecords] = useState<Recording[]>(initial);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState("NOTE");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [room, setRoom] = useState("");
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [recMs, setRecMs] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/voice/recordings");
    const json = (await res.json()) as { recordings?: Recording[] };
    setRecords(json.recordings ?? []);
    const set = new Set<string>();
    for (const r of json.recordings ?? []) for (const seg of r.segments ?? []) set.add(seg.speaker);
    setSpeakers([...set].sort());
  }, []);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  async function ingest() {
    setBusy(true);
    setStatus("ingesting…");
    const res = await fetch("/api/voice/recordings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title || "Voice note",
        source,
        textHint: text.trim() || undefined,
        audioDurationMs: recMs || undefined,
        mimeType: recording ? "audio/webm" : undefined,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; status?: string; error?: string };
    setStatus(res.ok ? `ingested (${json.status ?? ""})` : `error: ${json.error ?? res.status}`);
    setBusy(false);
    setText("");
    setTitle("");
    setRecMs(0);
    if (res.ok) reload();
  }

  async function toggleRecord() {
    if (recording) {
      mediaRef.current?.stop();
      if (tickRef.current) clearInterval(tickRef.current);
      setRecording(false);
      if (chunksRef.current.length && recMs >= 1000) {
        setStatus(`captured ${Math.round(recMs / 1000)}s audio — transcribe via text hint or send audio file`);
      } else {
        setStatus("recording too short");
      }
      chunksRef.current = [];
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.start();
      mediaRef.current = rec;
      setRecMs(0);
      const started = Date.now();
      tickRef.current = setInterval(() => setRecMs(Date.now() - started), 500);
      setRecording(true);
      setStatus("recording… say commitments out loud");
    } catch {
      setStatus("microphone unavailable — paste text instead");
    }
  }

  async function search() {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (speaker) p.set("speaker", speaker);
    if (room) p.set("room", room);
    const res = await fetch(`/api/voice/search?${p.toString()}`);
    const json = (await res.json()) as { results?: Recording[] };
    setRecords(json.results ?? []);
  }

  async function correct(id: string, corrections: Record<string, string>) {
    const res = await fetch(`/api/voice/recordings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments: Object.entries(corrections).map(([sid, correctedText]) => ({ id: sid, correctedText })) }),
    });
    if (res.ok) reload();
    return res.ok;
  }

  async function decide(ext: Extraction, action: "confirm" | "reject") {
    const res = await fetch(`/api/voice/extractions/${ext.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        kind: ext.kind,
        dueAt: ext.dueAt,
        startAt: ext.startAt,
        endAt: ext.endAt,
        title: ext.title,
        sourceText: ext.sourceText,
      }),
    });
    if (res.ok) reload();
  }

  async function remove(id: string) {
    await fetch(`/api/voice/recordings/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    reload();
  }

  return (
    <div>
      <div style={s.card}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Voice Notes <span style={s.label}>(Echo)</span></div>
        <div style={{ ...s.col, gap: 8 }}>
          <div style={s.row}>
            <input style={{ ...s.input, flex: 1 }} placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <select style={s.select} value={source} onChange={(e) => setSource(e.target.value)}>
              {["NOTE", "MEMO", "HUDDLE", "UPLOAD", "LIVE"].map((v) => <option key={v}>{v}</option>)}
            </select>
            <button style={recording ? { ...s.button, background: "#ef4444" } : s.smallButton} onClick={toggleRecord}>
              {recording ? `● ${Math.round(recMs / 1000)}s stop` : "Rec"}
            </button>
          </div>
          <textarea style={s.textarea} placeholder="Paste or speak a transcript — e.g. &quot;Let&apos;s meet Friday at 3, Sarah should send the vendor approval by end of week, remind me to update the docs tomorrow&quot;" value={text} onChange={(e) => setText(e.target.value)} />
          <div style={s.row}>
            <button style={s.button} disabled={busy} onClick={ingest}>Transcribe & Extract</button>
            {status && <span style={s.label}>{status}</span>}
          </div>
        </div>
      </div>

      <div style={s.card}>
        <div style={{ ...s.row, marginBottom: 8 }}>
          <input style={{ ...s.input, flex: 1 }} placeholder="Search transcripts…" value={q} onChange={(e) => setQ(e.target.value)} />
          <input style={{ ...s.input, width: 110 }} placeholder="Room" value={room} onChange={(e) => setRoom(e.target.value)} />
          <select style={s.select} value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
            <option value="">All speakers</option>
            {speakers.map((sp) => <option key={sp}>{sp}</option>)}
          </select>
          <button style={s.smallButton} onClick={search}>Search</button>
          <button style={s.smallButton} onClick={reload}>Reset</button>
        </div>
        {records.length === 0 && <div style={s.sub}>No voice notes yet.</div>}
        {records.map((r) => (
          <VoiceNoteCard key={r.id} r={r} onCorrect={correct} onDecide={decide} onDelete={remove} onReextract={async (id) => { const res = await fetch(`/api/voice/recordings/${id}/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); if (res.ok) reload(); }} />
        ))}
      </div>
    </div>
  );
}

function VoiceNoteCard({ r, onCorrect, onDecide, onDelete, onReextract }: { r: Recording; onCorrect: (id: string, c: Record<string, string>) => Promise<boolean>; onDecide: (e: Extraction, a: "confirm" | "reject") => void; onDelete: (id: string) => void; onReextract: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const summary = r.summary;
  const pending = Object.keys(edits).length > 0;

  async function saveCorrections() {
    setSaving(true);
    const ok = await onCorrect(r.id, edits);
    if (ok) setEdits({});
    setSaving(false);
  }

  return (
    <div style={{ ...s.card, marginBottom: 8, padding: 12 }}>
      <div style={s.row}>
        <span style={{ fontWeight: 600, fontSize: 13, cursor: "pointer" }} onClick={() => setOpen(!open)}>{r.title}</span>
        <span style={{ ...s.chip, background: STATUS_COLORS[r.status] ?? "#64748b" }}>{r.status}</span>
        <span style={s.chip}>{r.source}</span>
        {r.confidenceAvg != null && <span style={s.chip}>{Math.round(r.confidenceAvg * 100)}%</span>}
        <span style={s.label}>{dt(r.createdAt)} · {fmt(r.audioDurationMs)} · v{r.transcriptVersion}</span>
        <span style={{ flex: 1 }} />
        <button style={s.smallButton} onClick={() => setOpen(!open)}>{open ? "Collapse" : "Open"}</button>
        <button style={{ ...s.smallButton, color: "#f87171" }} onClick={() => onDelete(r.id)}>Del</button>
      </div>
      {open && (
        <div style={{ ...s.col, gap: 10, marginTop: 10 }}>
          {summary && (
            <div style={{ ...s.card, padding: 10, marginBottom: 0, background: "var(--nv-surface2, #1e1d27)" }}>
              <div style={s.label}>Summary</div>
              <div style={{ fontSize: 13 }}>{summary.oneLine}</div>
              {summary.bullets?.length ? <div style={s.sub}>{summary.bullets.join(" · ")}</div> : null}
              {summary.decisions?.length ? <div style={s.sub}>Decisions: {summary.decisions.join(" ... ")}</div> : null}
              {summary.actionItems?.length ? <div style={s.sub}>Actions: {summary.actionItems.join(" ... ")}</div> : null}
              {summary.openQuestions?.length ? <div style={s.sub}>Questions: {summary.openQuestions.join(" ... ")}</div> : null}
              {summary.risks?.length ? <div style={{ ...s.sub, color: "#fca5a5" }}>Risks: {summary.risks.join(" ... ")}</div> : null}
            </div>
          )}
          <div style={s.label}>Transcript (edit to correct — re-extracts & re-summarizes)</div>
          {(r.segments ?? []).map((seg) => (
            <div key={seg.id} style={s.row}>
              <span style={{ ...s.chip, background: "#334155" }}>{seg.speaker}</span>
              <span style={{ ...s.label, width: 44 }}>{fmt(seg.startMs)}</span>
              <input
                style={{ ...s.input, flex: 1, minWidth: 200 }}
                defaultValue={edits[seg.id] ?? seg.correctedText ?? seg.text}
                onChange={(e) => setEdits((p) => ({ ...p, [seg.id]: e.target.value }))}
              />
              <span style={s.label}>{Math.round(seg.confidence * 100)}%</span>
            </div>
          ))}
          {pending && <div><button style={s.smallButton} disabled={saving} onClick={saveCorrections}>{saving ? "saving…" : "Save corrections"}</button></div>}
          <div style={s.row}>
            <span style={s.label}>Pipeline: transcript → commitments → summary</span>
            <span style={{ flex: 1 }} />
            <button style={s.smallButton} onClick={async () => { await onReextract(r.id); }}>Re-extract</button>
          </div>
          <div style={s.label}>Extracted commitments</div>
          {(r.extractions ?? []).map((ext) => (
            <div key={ext.id} style={s.row}>
              <span style={{ ...s.chip, background: KIND_COLORS[ext.kind] ?? "#64748b" }}>{ext.kind.toLowerCase()}</span>
              <span style={{ fontSize: 13, flex: 1 }}>{ext.title}</span>
              {ext.assigneeName && <span style={s.sub}>→ {ext.assigneeName}</span>}
              {ext.dueAt && <span style={s.sub}>due {new Date(ext.dueAt).toLocaleString()}</span>}
              {ext.startAt && <span style={s.sub}>{new Date(ext.startAt).toLocaleString()}</span>}
              <span style={s.chip}>{Math.round(ext.confidence * 100)}%</span>
              <span style={s.chip}>{stateLabel(ext.state)}</span>
              {ext.state === "DRAFT" && (
                <>
                  <button style={{ ...s.smallButton, background: "#065f46", borderColor: "#065f46", color: "#d1fae5" }} onClick={() => onDecide(ext, "confirm")}>✓ Confirm</button>
                  <button style={s.smallButton} onClick={() => onDecide(ext, "reject")}>✕</button>
                </>
              )}
              {ext.state === "CONFIRMED" && <span style={s.sub}>{ext.targetType}{ext.targetId ? `: ${ext.targetId.slice(0, 8)}…` : ""}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}