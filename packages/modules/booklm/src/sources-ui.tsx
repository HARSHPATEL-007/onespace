"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";

export interface SourceDoc {
  id: string; title: string; format: string; status: string;
  version: number; pageCount: number | null; language: string;
  quality: { confidence?: Record<string, number>; overallStatus?: string; warnings?: { type: string; locations: string[]; reason: string }[] };
}

export interface QualityReport {
  document: { id: string; title: string; format: string; status: string; version: number; fileHash: string };
  quality: { confidence?: Record<string, number>; overallStatus?: string; warnings?: { type: string; locations: string[]; reason: string }[] } | null;
  counts: Record<string, number>;
  reviewItems: { tables: string[]; formulas: string[]; unresolvedCitations: string[] };
}

export interface SourcesActions {
  list: (setId: string) => Promise<SourceDoc[]>;
  register: (input: { setId: string; title: string; format?: string; pageCount?: number; content?: string }) => Promise<{ id: string }>;
  extract: (documentId: string, text: string) => Promise<{ blocks: number; tables: number; formulas: number; codeBlocks: number; figures: number; citations: number; language: string; mixedLanguage: boolean; quality: QualityReport["quality"] }>;
  quality: (documentId: string) => Promise<QualityReport>;
  layout: (documentId: string) => Promise<{ blockKey: string; kind: string; page: number; readingOrder: number; sectionPath: string[]; text: string; language: string; confidence: number; corrected: boolean }[]>;
  tables: (documentId: string) => Promise<{ tableKey: string; caption: string; headers: string[]; cells: { row: number; column: number; text: string; confidence?: number }[][]; footnotes: string[]; units: string[]; page: number; confidence: number; needsReview: boolean }[]>;
  formulas: (documentId: string) => Promise<{ formulaKey: string; latex: string; plain: string; variables: string[]; page: number; confidence: number; validation: { confusions?: string[] } | null; needsReview: boolean }[]>;
  figures: (documentId: string) => Promise<{ figureKey: string; kind: string; caption: string; page: number; confidence: number }[]>;
  citations: (documentId: string) => Promise<{ citationKey: string; rawText: string; normalized: { authors?: string[]; year?: string; doi?: string } | null; citationType: string; resolution: string; page: number; confidence: number }[]>;
  transcript: (documentId: string, text: string, format: "srt" | "vtt" | "plain") => Promise<{ segments: number; speakers: number; note: string }>;
  segments: (documentId: string) => Promise<{ segmentKey: string; start: number; end: number; speaker: string; text: string; confidence: number; linkedSlide: string }[]>;
  correct: (documentId: string, input: { targetType: string; targetId: string; after: string; reason?: string }) => Promise<{ correction: { id: string }; citationsFlagged: number }>;
  corrections: (documentId: string) => Promise<{ id: string; location: string; targetType: string; targetId: string; before: string; after: string; reason: string; reindexStatus: string }[]>;
  cite: (documentId: string, blockKey: string, claim: string, setId: string) => Promise<{ id: string }>;
}

const STATUS_BADGE: Record<string, string> = {
  UPLOADED: "📥 uploaded", VALIDATED: "🔍 validated", EXTRACTED: "📄 extracted",
  REVIEW_RECOMMENDED: "⚠️ review recommended", VERIFIED: "✅ verified",
  INCOMPLETE_POSSIBLE: "🧩 possibly incomplete", CORRUPT: "⛔ corrupt",
};

export function SourcesPanel({ setId, actions }: { setId: string; actions: SourcesActions }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [docs, setDocs] = useState<SourceDoc[] | null>(null);
  const [docId, setDocId] = useState("");
  const [report, setReport] = useState<QualityReport | null>(null);
  const [blocks, setBlocks] = useState<Awaited<ReturnType<SourcesActions["layout"]>> | null>(null);
  const [overlay, setOverlay] = useState(false);
  const [collection, setCollection] = useState<"tables" | "formulas" | "figures" | "citations" | null>(null);
  const [cdata, setCdata] = useState<unknown>(null);
  const [segments, setSegments] = useState<Awaited<ReturnType<SourcesActions["segments"]>> | null>(null);
  const [corrections, setCorrections] = useState<Awaited<ReturnType<SourcesActions["corrections"]>> | null>(null);
  // register
  const [title, setTitle] = useState("");
  const [paste, setPaste] = useState("");
  // correct
  const [corrTarget, setCorrTarget] = useState("");
  const [corrKind, setCorrKind] = useState("block");
  const [corrAfter, setCorrAfter] = useState("");
  const [corrReason, setCorrReason] = useState("");
  // transcript
  const [transcript, setTranscript] = useState("");
  const [tformat, setTformat] = useState<"srt" | "vtt" | "plain">("plain");
  // cite
  const [citeBlock, setCiteBlock] = useState("");
  const [citeClaim, setCiteClaim] = useState("");

  const load = () => {
    void actions.list(setId).then((d) => {
      setDocs(d);
      if (!docId && d[0]) select(d[0].id);
    }).catch(() => undefined);
  };
  if (docs === null) load();

  const select = (id: string) => {
    setDocId(id);
    setReport(null); setBlocks(null); setCdata(null); setCollection(null);
    setSegments(null); setCorrections(null);
    void actions.quality(id).then((r) => setReport(r)).catch(() => undefined);
    void actions.layout(id).then((b) => setBlocks(b)).catch(() => undefined);
  };

  const loadCollection = (kind: "tables" | "formulas" | "figures" | "citations") => {
    setCollection(kind); setCdata(null);
    void actions[kind](docId).then((d) => setCdata(d)).catch(() => undefined);
  };

  const confColor = (c: number) => c >= 0.85 ? "var(--nv-color-success)" : c >= 0.6 ? "var(--nv-color-warning, #b45309)" : "var(--nv-color-danger)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Register + extract */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>📄 Sources (immutable originals, validated extraction)</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <select className="nv-input" value={docId} onChange={(e) => select(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
            {(docs ?? []).map((d) => <option key={d.id} value={d.id}>{d.title} [{d.status}]</option>)}
          </select>
          <Button variant="secondary" size="sm" onClick={load}>Refresh</Button>
        </div>
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, cursor: "pointer" }}>+ Register document & extract pasted text</summary>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <input className="nv-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" style={{ flex: 1, minWidth: 160 }} />
            <Button size="sm" onClick={() => {
              if (!title.trim() || !paste.trim()) return;
              void actions.register({ setId, title: title.trim(), content: paste })
                .then((d) => actions.extract(d.id, paste))
                .then(() => { setTitle(""); setPaste(""); load(); refresh(); });
            }}>Register + extract</Button>
          </div>
          <textarea className="nv-input" value={paste} onChange={(e) => setPaste(e.target.value)} rows={5}
            placeholder="Paste markdown/text: headings, pipe tables, $$latex$$, ```code```, [12] citations…" style={{ marginTop: 6, resize: "vertical" }} />
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 4 }}>
            Binary parsing (PDF OCR, vision layout) lands in Phase 2 — pasted text extracts deterministically today, with confidence and review flags.
          </div>
        </details>
      </div>

      {/* Quality report */}
      {report && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 800 }}>Extraction quality — {report.document.title}</div>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
            {STATUS_BADGE[report.document.status] ?? report.document.status} · v{report.document.version} · hash {report.document.fileHash.slice(0, 18) || "n/a"}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6, fontSize: 12 }}>
            {Object.entries(report.quality?.confidence ?? {}).map(([k, v]) => (
              <span key={k}>{k.replace(/([A-Z])/g, " $1").toLowerCase()}: <b style={{ color: confColor(v) }}>{Math.round(v * 100)}%</b></span>
            ))}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            Blocks {report.counts.blocks} · tables {report.counts.tables} · formulas {report.counts.formulas} ·
            figures {report.counts.figures} · citations {report.counts.citations} · code {report.counts.codeBlocks} · segments {report.counts.segments}
          </div>
          {(report.quality?.warnings ?? []).map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: "var(--nv-color-danger)" }}>⚠ {w.type.replace(/_/g, " ")} @ {w.locations.join(", ")} — {w.reason}</div>
          ))}
          {(report.reviewItems.tables.length + report.reviewItems.formulas.length + report.reviewItems.unresolvedCitations.length) > 0 && (
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Needs review — tables: {report.reviewItems.tables.join(", ") || "—"} · formulas: {report.reviewItems.formulas.join(", ") || "—"} ·
              unresolved citations: {report.reviewItems.unresolvedCitations.slice(0, 3).join(", ") || "—"}
            </div>
          )}
        </div>
      )}

      {/* Layout viewer + confidence overlay */}
      {blocks && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontWeight: 800 }}>Layout ({blocks.length} blocks)</span>
            <div style={{ flex: 1 }} />
            <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> Confidence overlay
            </label>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {blocks.slice(0, 60).map((b) => (
              <div key={b.blockKey} style={{
                fontSize: 12, padding: 6, borderRadius: 6,
                borderLeft: overlay ? `4px solid ${confColor(b.confidence)}` : undefined,
                background: "var(--nv-color-surface-2, transparent)",
              }}>
                <div style={{ color: "var(--nv-color-text-faint)" }}>
                  [{b.kind}] p{b.page} #{b.readingOrder} · {b.sectionPath.join(" / ") || "—"} · {b.language}
                  {overlay && <> · conf <b style={{ color: confColor(b.confidence) }}>{Math.round(b.confidence * 100)}%</b></>}
                  {b.corrected ? " · ✏️ corrected" : ""}
                </div>
                <div style={{ fontWeight: b.kind === "heading" ? 800 : 400 }}>{b.text.slice(0, 400)}</div>
              </div>
            ))}
          </div>
          {/* Cite a block */}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <input className="nv-input" value={citeBlock} onChange={(e) => setCiteBlock(e.target.value)} placeholder="block key (e.g. p1_b3)" style={{ width: 140 }} />
            <input className="nv-input" value={citeClaim} onChange={(e) => setCiteClaim(e.target.value)} placeholder="claim this block supports…" style={{ flex: 1, minWidth: 160 }} />
            <Button variant="secondary" size="sm" onClick={() => {
              if (!citeBlock.trim() || !citeClaim.trim()) return;
              void actions.cite(docId, citeBlock.trim(), citeClaim.trim(), setId).then(() => { setCiteBlock(""); setCiteClaim(""); refresh(); });
            }}>Cite as evidence</Button>
          </div>
        </div>
      )}

      {/* Collections */}
      {docId && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["tables", "formulas", "figures", "citations"] as const).map((k) => (
            <Button key={k} size="sm" variant={collection === k ? undefined : "secondary"} onClick={() => loadCollection(k)}>{k}</Button>
          ))}
        </div>
      )}
      {collection === "tables" && Array.isArray(cdata) && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          {(cdata as Awaited<ReturnType<SourcesActions["tables"]>>).map((t) => (
            <div key={t.tableKey} style={{ marginTop: 6, fontSize: 12 }}>
              <b>{t.caption || t.tableKey}</b> (p{t.page}) · conf <b style={{ color: confColor(t.confidence) }}>{Math.round(t.confidence * 100)}%</b>
              {t.needsReview && <span style={{ color: "var(--nv-color-danger)" }}> · needs review</span>}
              <div style={{ color: "var(--nv-color-text-faint)" }}>headers: {t.headers.join(" | ")}</div>
              {t.cells.slice(0, 4).map((row, i) => (
                <div key={i}>{row.map((c) => `${c.text || "∅"}`).join(" | ")}</div>
              ))}
              {t.footnotes.length > 0 && <div style={{ color: "var(--nv-color-text-faint)" }}>notes: {t.footnotes.join("; ")}</div>}
            </div>
          ))}
          {(!Array.isArray(cdata) || cdata.length === 0) && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No tables.</div>}
        </div>
      )}
      {collection === "formulas" && Array.isArray(cdata) && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          {(cdata as Awaited<ReturnType<SourcesActions["formulas"]>>).map((f) => (
            <div key={f.formulaKey} style={{ fontSize: 12, marginTop: 4 }}>
              <code>{f.latex.slice(0, 120)}</code> (p{f.page}) · conf <b style={{ color: confColor(f.confidence) }}>{Math.round(f.confidence * 100)}%</b>
              {f.variables.length > 0 && <span> · vars: {f.variables.join(", ")}</span>}
              {f.needsReview && <div style={{ color: "var(--nv-color-danger)" }}>⚠ {(f.validation?.confusions ?? []).join("; ") || "needs visual confirmation"} — compare rendered form before citing.</div>}
            </div>
          ))}
        </div>
      )}
      {collection === "figures" && Array.isArray(cdata) && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          {(cdata as Awaited<ReturnType<SourcesActions["figures"]>>).map((f) => (
            <div key={f.figureKey} style={{ fontSize: 12, marginTop: 4 }}>
              <b>{f.kind}</b>: {f.caption.slice(0, 160)} (p{f.page}) · conf {Math.round(f.confidence * 100)}%
              <div style={{ color: "var(--nv-color-text-faint)" }}>Values estimated from visuals are reported as “the chart suggests”, never as extracted facts.</div>
            </div>
          ))}
        </div>
      )}
      {collection === "citations" && Array.isArray(cdata) && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          {(cdata as Awaited<ReturnType<SourcesActions["citations"]>>).map((c) => (
            <div key={c.citationKey} style={{ fontSize: 12, marginTop: 4 }}>
              <code>{c.rawText}</code> · {c.citationType}
              {c.normalized?.authors && <span> — {c.normalized.authors.join(", ")}{c.normalized.year ? ` (${c.normalized.year})` : ""}</span>}
              <span style={{ color: c.resolution && c.resolution !== "unresolved" ? "var(--nv-color-success)" : "var(--nv-color-danger)" }}>
                {" "}· {c.resolution && c.resolution !== "unresolved" ? c.resolution : "unresolved — presence ≠ support"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Transcript */}
      {docId && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>🎙 Transcript (speaker labels only)</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <select className="nv-input" value={tformat} onChange={(e) => setTformat(e.target.value as "srt" | "vtt" | "plain")} style={{ width: 120 }}>
              <option value="plain">plain</option>
              <option value="srt">SRT</option>
              <option value="vtt">VTT</option>
            </select>
            <input className="nv-input" value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste transcript…" style={{ flex: 1, minWidth: 160 }} />
            <Button variant="secondary" size="sm" onClick={() => {
              if (!transcript.trim()) return;
              void actions.transcript(docId, transcript, tformat).then(() => actions.segments(docId)).then((s) => setSegments(s));
            }}>Ingest</Button>
            <Button variant="ghost" size="sm" onClick={() => void actions.segments(docId).then((s) => setSegments(s))}>Load</Button>
          </div>
          {(segments ?? []).slice(0, 20).map((s) => (
            <div key={s.segmentKey} style={{ fontSize: 12, marginTop: 4 }}>
              [{fmtTime(s.start)}–{fmtTime(s.end)}, {s.speaker}] {s.text.slice(0, 200)}
              <span style={{ color: "var(--nv-color-text-faint)" }}> · conf {Math.round(s.confidence * 100)}% (machine-transcribed)</span>
            </div>
          ))}
        </div>
      )}

      {/* Corrections */}
      {docId && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>✏️ Corrections (versioned, reversible, reindexed)</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <select className="nv-input" value={corrKind} onChange={(e) => setCorrKind(e.target.value)} style={{ width: 140 }}>
              <option value="block">block</option>
              <option value="table_cell">table cell (key:r:c)</option>
              <option value="formula">formula</option>
              <option value="code">code</option>
              <option value="transcript">transcript</option>
            </select>
            <input className="nv-input" value={corrTarget} onChange={(e) => setCorrTarget(e.target.value)} placeholder="target id" style={{ width: 150 }} />
            <input className="nv-input" value={corrAfter} onChange={(e) => setCorrAfter(e.target.value)} placeholder="corrected text" style={{ flex: 1, minWidth: 160 }} />
            <input className="nv-input" value={corrReason} onChange={(e) => setCorrReason(e.target.value)} placeholder="reason" style={{ width: 160 }} />
            <Button size="sm" onClick={() => {
              if (!corrTarget.trim() || !corrAfter) return;
              void actions.correct(docId, { targetType: corrKind, targetId: corrTarget.trim(), after: corrAfter, reason: corrReason }).then(() => {
                setCorrTarget(""); setCorrAfter(""); select(docId); refresh();
              });
            }}>Apply</Button>
            <Button variant="ghost" size="sm" onClick={() => void actions.corrections(docId).then((c) => setCorrections(c))}>History</Button>
          </div>
          {(corrections ?? []).map((c) => (
            <div key={c.id} style={{ fontSize: 12, marginTop: 4 }}>
              {c.location}: “{(c.before || "").slice(0, 80)}” → “{(c.after || "").slice(0, 80)}” · {c.reason} · reindex {c.reindexStatus}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
