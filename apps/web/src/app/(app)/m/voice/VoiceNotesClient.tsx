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
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 },
  dialog: { background: "var(--nv-surface, #16151d)", border: "1px solid var(--nv-border, #2a2936)", borderRadius: 12, padding: 18, maxWidth: 520, width: "90%" },
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
  priority?: string | null;
  dueAt?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  sourceText?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  assigneeName?: string | null;
}
interface TopicInfo { label: string; count: number }
interface EntityInfo { name: string; kind: string }
interface Recording {
  id: string;
  voiceId: string;
  title: string;
  source: string;
  status: string;
  consent?: string | null;
  language?: string | null;
  audioDurationMs?: number | null;
  confidenceAvg?: number | null;
  transcriptVersion: number;
  audioUrl?: string | null;
  meta?: { topics?: { topics?: TopicInfo[]; entities?: EntityInfo[] }; dependency?: string } | null;
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
const PRIORITY_COLORS: Record<string, string> = { LOW: "#64748b", MEDIUM: "#3b82f6", HIGH: "#ef4444" };
const CONSENT_LABELS: Record<string, string> = {
  NONE: "None", INFORMED: "Informed", GUEST_DISCLOSED: "Guests disclosed", ON_DEVICE: "On-device",
};
const fmt = (ms?: number | null) => (ms == null ? "–" : `${Math.max(1, Math.round(ms / 1000))}s`);
const dt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "");
const stateLabel = (st: string) => (st === "CONFIRMED" ? "Created ✓" : st === "REJECTED" ? "Rejected ✕" : st === "AUTO_CREATED" ? "Auto-created" : "Draft");

export function VoiceNotesClient({ initial }: { initial: Recording[] }) {
  const [records, setRecords] = useState<Recording[]>(initial);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState("NOTE");
  const [consent, setConsent] = useState("INFORMED");
  const [threadRef, setThreadRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [priority, setPriority] = useState("");
  const [room, setRoom] = useState("");
  const [speakers, setSpeakers] = useState<string[]>([]);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [recMs, setRecMs] = useState(0);
  const [conflict, setConflict] = useState<{ ext: Extraction; conflicts: Array<{ id: string; title: string; startAt: string; endAt: string }> } | null>(null);
  const [stats, setStats] = useState<{ total: number; draftCount: number; confirmationRate: number | null } | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch("/api/voice/recordings");
    const json = (await res.json()) as { recordings?: Recording[] };
    setRecords(json.recordings ?? []);
    const set = new Set<string>();
    for (const r of json.recordings ?? []) for (const seg of r.segments ?? []) set.add(seg.speaker);
    setSpeakers([...set].sort());
  }, []);

  useEffect(() => {
    fetch("/api/voice/stats")
      .then((r) => r.json())
      .then((j) => setStats(j.stats ?? null))
      .catch(() => {});
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function ingest(opts?: { audioBlob?: Blob; audioFile?: File; audioDurationMs?: number; source?: string }) {
    setBusy(true);
    setStatus("ingesting…");
    const res = await fetch("/api/voice/recordings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title || "Voice note",
        source: opts?.source ?? source,
        textHint: text.trim() || undefined,
        audioDurationMs: (opts?.audioDurationMs ?? recMs) || undefined,
        mimeType: opts?.audioBlob?.type || opts?.audioFile?.type || (recording ? "audio/webm" : undefined),
        consent,
        threadRef: threadRef.trim() || undefined,
        timezone: tz(),
      }),
    });
    const json = (await res.json()) as { ok?: boolean; id?: string; status?: string; error?: string };
    if (!res.ok) {
      setStatus(`error: ${json.error ?? res.status}`);
      setBusy(false);
      return;
    }
    let id = json.id;
    const blob = opts?.audioBlob ?? opts?.audioFile;
    if (id && blob) {
      const form = new FormData();
      form.append("file", blob, opts?.audioFile?.name ?? "capture.webm");
      const up = await fetch(`/api/voice/recordings/${id}/audio`, { method: "POST", body: form });
      if (up.ok && !opts?.audioFile) {
        const tr = await fetch(`/api/voice/recordings/${id}/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
        if (tr.ok) setStatus(`uploaded + re-transcribed (${json.status ?? ""})`);
      } else {
        setStatus(`captured ${blob.size > 0 ? "audio" : ""} — transcribe via text hint or send audio file`);
      }
    } else {
      setStatus(`ingested (${json.status ?? ""})`);
    }
    setBusy(false);
    setText("");
    setTitle("");
    setThreadRef("");
    setRecMs(0);
    if (res.ok) reload();
  }

  async function toggleRecord() {
    if (recording) {
      if (paused) mediaRef.current?.resume();
      mediaRef.current?.stop();
      if (tickRef.current) clearInterval(tickRef.current);
      setRecording(false);
      setPaused(false);
      if (chunksRef.current.length && recMs >= 1000) {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        setStatus(`captured ${Math.round(recMs / 1000)}s — uploading…`);
        await ingest({
          audioBlob: blob,
          audioDurationMs: recMs,
          source: "LIVE",
        });
        return;
      }
      chunksRef.current = [];
      setStatus("recording too short");
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
      setPaused(false);
      setStatus("recording… say commitments out loud");
    } catch {
      setStatus("microphone unavailable — paste text or upload a file instead");
    }
  }

  async function togglePause() {
    const rec = mediaRef.current;
    if (!rec || !recording) return;
    if (rec.state === "recording") {
      rec.pause();
      setPaused(true);
      setStatus("paused — tap resume to continue");
    } else if (rec.state === "paused") {
      rec.resume();
      setPaused(false);
      setStatus("recording…");
    }
  }

  async function uploadFile(file: File) {
    if (!file.type.startsWith("audio/")) {
      setStatus(`skip: ${file.name} is not audio`);
      return;
    }
    setBusy(true);
    setStatus(`uploading ${file.name}…`);
    const res = await fetch("/api/voice/recordings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: file.name.replace(/\.[^.]+$/, "") || "Voice note",
        source: "UPLOAD",
        mimeType: file.type,
        consent,
        threadRef: threadRef.trim() || undefined,
        timezone: tz(),
      }),
    });
    const json = (await res.json()) as { ok?: boolean; id?: string; error?: string };
    if (!res.ok || !json.id) {
      setStatus(`error: ${json.error ?? res.status}`);
      setBusy(false);
      return;
    }
    const form = new FormData();
    form.append("file", file, file.name);
    const up = await fetch(`/api/voice/recordings/${json.id}/audio`, { method: "POST", body: form });
    if (!up.ok) {
      setStatus(`audio save failed (${up.status})`);
      setBusy(false);
      reload();
      return;
    }
    setStatus("uploaded — transcribing…");
    const tr = await fetch(`/api/voice/recordings/${json.id}/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    setStatus(tr.ok ? `ingested + transcribed ${file.name}` : `transcribe step: ${tr.status}`);
    setBusy(false);
    reload();
  }

  async function search(extra?: Partial<{ q: string; topic: string; entity: string }>) {
    const p = new URLSearchParams();
    if (q || extra?.q) p.set("q", extra?.q ?? q);
    if (speaker) p.set("speaker", speaker);
    if (room) p.set("room", room);
    if (priority) p.set("priority", priority);
    if (extra?.topic) p.set("topic", extra.topic);
    if (extra?.entity) p.set("entity", extra.entity);
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

  async function setConsentFor(id: string, value: string) {
    const res = await fetch(`/api/voice/recordings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: value }),
    });
    if (res.ok) reload();
  }

  async function decide(ext: Extraction, action: "confirm" | "reject", force = false) {
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
        priority: ext.priority,
        force,
      }),
    });
    if (res.status === 409) {
      const j = (await res.json()) as { conflicts?: Array<{ id: string; title: string; startAt: string; endAt: string }> };
      setConflict({ ext, conflicts: j.conflicts ?? [] });
      return;
    }
    if (res.ok) reload();
  }

  async function remove(id: string) {
    await fetch(`/api/voice/recordings/${id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    reload();
  }

  async function reextract(id: string) {
    await fetch(`/api/voice/recordings/${id}/transcribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    reload();
  }

  return (
    <div>
      {conflict && (
        <div style={s.overlay} onClick={() => setConflict(null)}>
          <div style={s.dialog} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Time conflict — event overlaps existing calendar items</div>
            {conflict.conflicts.map((c) => (
              <div key={c.id} style={s.sub}>
                · {c.title} ({new Date(c.startAt).toLocaleString()} – {new Date(c.endAt).toLocaleTimeString()})
              </div>
            ))}
            <div style={{ ...s.row, marginTop: 12 }}>
              <button style={{ ...s.button, background: "#065f46" }} onClick={async () => { const c = conflict; setConflict(null); await decide(c.ext, "confirm", true); }}>Create anyway</button>
              <button style={s.smallButton} onClick={() => setConflict(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={s.card}>
        <div style={s.row}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Voice Notes <span style={s.label}>(Echo)</span></div>
          {stats && (
            <span style={s.label}>
              {stats.total} recordings · {stats.draftCount} drafts · confirmation rate {stats.confirmationRate == null ? "–" : `${Math.round(stats.confirmationRate * 100)}%`}
            </span>
          )}
        </div>
        {consent === "NONE" && (
          <div style={{ ...s.card, padding: 10, marginBottom: 8, borderColor: "#f59e0b", background: "rgba(245,158,11,.08)", color: "#fbbf24", fontSize: 12 }}>
            Consent is set to None — this recording&apos;s transcript is not used for commitment extraction or summaries. Choose &quot;Informed&quot; (or with guests disclosed) to enable capture.
          </div>
        )}
        <div style={{ ...s.col, gap: 8 }}>
          <div style={s.row}>
            <input style={{ ...s.input, flex: 1 }} placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <select style={s.select} value={source} onChange={(e) => setSource(e.target.value)}>
              {["NOTE", "MEMO", "HUDDLE", "UPLOAD", "LIVE"].map((v) => <option key={v}>{v}</option>)}
            </select>
            <select style={s.select} value={consent} onChange={(e) => setConsent(e.target.value)} title="Capture consent">
              {Object.entries(CONSENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input style={{ ...s.input, width: 130 }} placeholder="Thread ref" value={threadRef} onChange={(e) => setThreadRef(e.target.value)} />
            <button style={recording ? { ...s.button, background: "#ef4444" } : s.smallButton} onClick={toggleRecord}>
              {recording ? (paused ? `⏸ ${Math.round(recMs / 1000)}s resume` : `● ${Math.round(recMs / 1000)}s stop`) : "Rec"}
            </button>
            {recording && !paused && <button style={s.smallButton} onClick={togglePause}>Pause</button>}
            {recording && paused && <button style={s.smallButton} onClick={togglePause}>Resume</button>}
            <input ref={fileRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
            <button style={s.smallButton} onClick={() => fileRef.current?.click()}>Upload audio…</button>
          </div>
          <textarea style={s.textarea} placeholder="Paste or speak a transcript — e.g. &quot;Let&apos;s meet Friday at 3, Sarah should send the vendor approval by end of week, remind me to update the docs tomorrow&quot;" value={text} onChange={(e) => setText(e.target.value)} />
          <div style={s.row}>
            <button style={s.button} disabled={busy} onClick={() => ingest()}>Transcribe & Extract</button>
            {status && <span style={s.label}>{status}</span>}
          </div>
        </div>
      </div>

      <div style={s.card}>
        <div style={{ ...s.row, marginBottom: 8 }}>
          <input style={{ ...s.input, flex: 1 }} placeholder="Search transcripts, summaries…" value={q} onChange={(e) => setQ(e.target.value)} />
          <input style={{ ...s.input, width: 110 }} placeholder="Room" value={room} onChange={(e) => setRoom(e.target.value)} />
          <select style={s.select} value={speaker} onChange={(e) => setSpeaker(e.target.value)}>
            <option value="">All speakers</option>
            {speakers.map((sp) => <option key={sp}>{sp}</option>)}
          </select>
          <select style={s.select} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Any priority</option>
            {["HIGH", "MEDIUM", "LOW"].map((p) => <option key={p}>{p}</option>)}
          </select>
          <button style={s.smallButton} onClick={() => search()}>Search</button>
          <button style={s.smallButton} onClick={reload}>Reset</button>
        </div>
        {records.length === 0 && <div style={s.sub}>No voice notes yet.</div>}
        {records.map((r) => (
          <VoiceNoteCard
            key={r.id}
            r={r}
            onCorrect={correct}
            onDecide={decide}
            onDelete={remove}
            onReextract={reextract}
            onTopic={(label) => { setQ(label); search({ q: label }); }}
            onEntity={(name) => { setQ(name); search({ entity: name }); }}
            onConsent={setConsentFor}
          />
        ))}
      </div>
    </div>
  );
}

function VoiceNoteCard({ r, onCorrect, onDecide, onDelete, onReextract, onTopic, onEntity, onConsent }: {
  r: Recording;
  onCorrect: (id: string, c: Record<string, string>) => Promise<boolean>;
  onDecide: (e: Extraction, a: "confirm" | "reject", force?: boolean) => void;
  onDelete: (id: string) => void;
  onReextract: (id: string) => Promise<void>;
  onTopic: (label: string) => void;
  onEntity: (name: string) => void;
  onConsent: (id: string, value: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const summary = r.summary;
  const pending = Object.keys(edits).length > 0;
  const topics = r.meta?.topics?.topics ?? [];
  const entities = r.meta?.topics?.entities ?? [];

  async function saveCorrections() {
    setSaving(true);
    const ok = await onCorrect(r.id, edits);
    if (ok) setEdits({});
    setSaving(false);
  }

  function playAt(ms: number) {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = ms / 1000;
    void el.play();
  }

  return (
    <div style={{ ...s.card, marginBottom: 8, padding: 12 }}>
      <div style={s.row}>
        <span style={{ fontWeight: 600, fontSize: 13, cursor: "pointer" }} onClick={() => setOpen(!open)}>{r.title}</span>
        <span style={{ ...s.chip, background: STATUS_COLORS[r.status] ?? "#64748b" }}>{r.status}</span>
        <span style={s.chip}>{r.source}</span>
        {r.consent && <span style={{ ...s.chip, background: r.consent === "NONE" ? "#7f1d1d" : "#334155" }}>{CONSENT_LABELS[r.consent] ?? r.consent}</span>}
        {r.confidenceAvg != null && <span style={s.chip}>{Math.round(r.confidenceAvg * 100)}%</span>}
        <span style={s.label}>{dt(r.createdAt)} · {fmt(r.audioDurationMs)} · v{r.transcriptVersion}</span>
        <span style={{ flex: 1 }} />
        <button style={s.smallButton} onClick={() => setOpen(!open)}>{open ? "Collapse" : "Open"}</button>
        <button style={{ ...s.smallButton, color: "#f87171" }} onClick={() => onDelete(r.id)}>Del</button>
      </div>
      {open && (
        <div style={{ ...s.col, gap: 10, marginTop: 10 }}>
          {r.audioUrl && (
            <audio ref={audioRef} controls preload="metadata" src={r.audioUrl} style={{ width: "100%", height: 36 }} />
          )}
          <div style={s.row}>
            <span style={s.label}>Consent:</span>
            <select style={{ ...s.select, padding: "3px 8px", fontSize: 12 }} value={r.consent ?? "INFORMED"} onChange={(e) => onConsent(r.id, e.target.value)}>
              {Object.entries(CONSENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {(topics.length > 0 || entities.length > 0) && (
              <span style={s.row}>
                {topics.map((t) => <span key={t.label} title={`in ${t.count} segment(s)`} onClick={() => onTopic(t.label)} style={{ ...s.chip, background: "#312e81", cursor: "pointer" }}>#{t.label}</span>)}
                {entities.map((en) => <span key={en.name} title={en.kind} onClick={() => onEntity(en.name)} style={{ ...s.chip, background: "#374151", cursor: "pointer" }}>@{en.name}</span>)}
              </span>
            )}
          </div>
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
          <div style={s.label}>Transcript (click time to play — edit to correct, re-extracts & re-summarizes)</div>
          {(r.segments ?? []).map((seg) => (
            <div key={seg.id} style={s.row}>
              <span style={{ ...s.chip, background: "#334155" }}>{seg.speaker}</span>
              <button style={{ ...s.label, width: 44, cursor: r.audioUrl ? "pointer" : "default", color: r.audioUrl ? "#93c5fd" : undefined }} title="Play from here" onClick={() => playAt(seg.startMs)}>{fmt(seg.startMs)}</button>
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
              {ext.priority && <span style={{ ...s.chip, background: PRIORITY_COLORS[ext.priority] ?? "#64748b", color: "#fff" }}>{ext.priority}</span>}
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