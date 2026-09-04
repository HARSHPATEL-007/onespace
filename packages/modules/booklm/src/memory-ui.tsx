"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";

export interface MemoryCard {
  id: string; key: string; value: string; scope: string; status: string;
  confidence: number; confidenceLevel: string; classification: string;
  provenance: { kind?: string; sourceRef?: string; createdBy?: string; model?: string } | null;
  evidenceRefs: string[]; visibility: string;
  lastVerifiedAt: string | null; lastUsedAt: string | null; expiresAt: string | null;
  paused: boolean; sensitive: boolean; courseId: string | null;
  dependentRecommendations: { id: string; action: string }[];
}

export interface ClassroomCard {
  id: string; key: string; value: string; status: string; version: number;
  section: string; expiresAt: string | null;
}

export interface MemoryActions {
  list: (scope?: string, search?: string) => Promise<MemoryCard[]>;
  create: (input: { key: string; value: string; scope?: string; classification?: string; courseId?: string }) => Promise<unknown>;
  confirm: (id: string, scope?: string) => Promise<unknown>;
  correct: (id: string, correction: string, newValue: string, reason: string) => Promise<unknown>;
  remove: (id: string) => Promise<{ affectedRecommendations: { id: string; action: string }[] }>;
  pause: (id: string, paused: boolean) => Promise<void>;
  setScope: (id: string, scope: string, confirmed: boolean) => Promise<unknown>;
  forget: () => Promise<unknown>;
  doNotInfer: (key: string, on: boolean) => Promise<unknown>;
  classroom: (setId: string) => Promise<ClassroomCard[]>;
  classroomPropose: (fd: FormData) => Promise<void>;
  classroomApprove: (id: string, approve: boolean) => Promise<void>;
  exportAll: () => Promise<Record<string, unknown>>;
  scan: (text: string) => Promise<{ quarantined: boolean; findings: { pattern: string; excerpt: string; severity: string }[]; rule: string }>;
}

const SCOPES = ["TASK", "SESSION", "COURSE", "LONG_TERM", "CLASSROOM"];

const CORRECTIONS = [
  { id: "value", label: "Value correction" },
  { id: "scope", label: "Scope correction" },
  { id: "time", label: "Time correction" },
  { id: "confidence", label: "Confidence correction" },
  { id: "never_true", label: "This was never true" },
  { id: "temporary", label: "True only temporarily" },
  { id: "other_subject", label: "Applies to another subject" },
  { id: "do_not_infer", label: "Do not infer this again" },
];

export function MemoryCenterPanel({ setId, actions, isInstructor }: {
  setId: string; actions: MemoryActions; isInstructor: boolean;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [scope, setScope] = useState("");
  const [search, setSearch] = useState("");
  const [cards, setCards] = useState<MemoryCard[] | null>(null);
  const [classroom, setClassroom] = useState<ClassroomCard[] | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [newScope, setNewScope] = useState("SESSION");
  const [dni, setDni] = useState("");
  const [scanText, setScanText] = useState("");
  const [scanRes, setScanRes] = useState<{ quarantined: boolean; findings: { excerpt: string; severity: string }[]; rule: string } | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [corrKind, setCorrKind] = useState("value");
  const [corrVal, setCorrVal] = useState("");
  const [corrReason, setCorrReason] = useState("");

  const load = (s = scope, q = search) => {
    void actions.list(s || undefined, q || undefined).then((c) => setCards(c)).catch(() => undefined);
  };
  if (cards === null) load();
  const loadClassroom = () => {
    void actions.classroom(setId).then((c) => setClassroom(c)).catch(() => undefined);
  };
  if (classroom === null) loadClassroom();

  const downloadExport = () => {
    void actions.exportAll().then((doc) => {
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "memory-export.json";
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const proposed = (cards ?? []).filter((c) => c.status === "PROPOSED");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Promotion inbox */}
      {proposed.length > 0 && (
        <div className="nv-card" style={{ fontSize: 13, borderColor: "var(--nv-color-warning, var(--nv-color-border))" }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>📥 {proposed.length} memor{proposed.length === 1 ? "y" : "ies"} awaiting your confirmation</div>
          {proposed.map((m) => (
            <div key={m.id} style={{ fontSize: 12, marginTop: 4 }}>
              N0VA noticed <b>{m.key}</b> = “{m.value.slice(0, 120)}”. Save scope and expiry, or dismiss.
              <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                <Button size="sm" onClick={() => void actions.confirm(m.id, m.scope).then(() => load())}>Save ({m.scope.toLowerCase().replace("_", " ")})</Button>
                <Button variant="ghost" size="sm" onClick={() => void actions.remove(m.id).then(() => load())}>Do not save</Button>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 4 }}>
            Repetition alone never promotes a memory — only your confirmation does.
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input className="nv-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search memories…" style={{ flex: 1, minWidth: 160 }} />
        <select className="nv-input" value={scope} onChange={(e) => { setScope(e.target.value); load(e.target.value, search); }} style={{ width: 150 }}>
          <option value="">All scopes</option>
          {SCOPES.map((s) => <option key={s} value={s}>{s.toLowerCase().replace("_", " ")}</option>)}
        </select>
        <Button variant="secondary" size="sm" onClick={() => load()}>Search</Button>
        <Button variant="ghost" size="sm" onClick={downloadExport}>Export</Button>
        <Button variant="ghost" size="sm" onClick={() => { if (confirm("Forget this conversation's task + session memories?")) void actions.forget().then(() => load()); }}>
          Forget conversation
        </Button>
      </div>

      {/* Cards */}
      {(cards ?? []).map((m) => (
        <div key={m.id} className="nv-card" style={{ fontSize: 13, opacity: m.paused ? 0.6 : 1 }}>
          <div style={{ fontWeight: 700 }}>“{m.value || m.key}”</div>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
            {m.key} · {m.scope.toLowerCase().replace("_", " ")} · {m.status.toLowerCase()} · {m.confidenceLevel} ({Math.round(m.confidence * 100)}%)
            {m.paused ? " · ⏸ paused" : ""}{m.sensitive ? " · 🔒 sensitive" : ""}
          </div>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
            Basis: {m.classification.toLowerCase().replace(/_/g, " ")}
            {m.provenance?.sourceRef ? ` · from ${m.provenance.sourceRef}` : ""}
            {m.expiresAt ? ` · expires ${new Date(m.expiresAt).toLocaleDateString()}` : ""}
            {m.lastUsedAt ? ` · last used ${new Date(m.lastUsedAt).toLocaleDateString()}` : ""}
          </div>
          {m.dependentRecommendations.length > 0 && (
            <div style={{ fontSize: 12 }}>Used for: {m.dependentRecommendations.map((r) => r.action.replace(/_/g, " ")).join(", ")}</div>
          )}
          {m.evidenceRefs.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Evidence: {m.evidenceRefs.slice(0, 4).join(", ")}</div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <Button variant="ghost" size="sm" onClick={() => setCorrecting(correcting === m.id ? null : m.id)}>Correct</Button>
            <Button variant="ghost" size="sm" onClick={() => void actions.pause(m.id, !m.paused).then(() => load())}>{m.paused ? "Resume" : "Pause"}</Button>
            <Button variant="ghost" size="sm" onClick={() => {
              const to = prompt("New scope (TASK, SESSION, COURSE, LONG_TERM):", m.scope);
              if (to) void actions.setScope(m.id, to.toUpperCase(), confirm("Widening scope needs explicit confirmation. Confirm?")).then(() => load()).catch((e) => alert(e instanceof Error ? e.message : "Denied"));
            }}>Scope</Button>
            <Button variant="ghost" size="sm" onClick={() => {
              if (confirm(`Delete "${m.key}"? Dependent recommendations will be recalculated.`)) {
                void actions.remove(m.id).then((r) => {
                  if (r.affectedRecommendations.length > 0) alert(`Also removed: ${r.affectedRecommendations.map((x) => x.action).join(", ")}`);
                  load();
                });
              }
            }}><span style={{ color: "var(--nv-color-danger)" }}>Delete</span></Button>
          </div>
          {correcting === m.id && (
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <select className="nv-input" value={corrKind} onChange={(e) => setCorrKind(e.target.value)} style={{ width: 200 }}>
                {CORRECTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <input className="nv-input" value={corrVal} onChange={(e) => setCorrVal(e.target.value)} placeholder="new value / scope" style={{ flex: 1, minWidth: 140 }} />
              <input className="nv-input" value={corrReason} onChange={(e) => setCorrReason(e.target.value)} placeholder="reason" style={{ flex: 1, minWidth: 140 }} />
              <Button size="sm" onClick={() => void actions.correct(m.id, corrKind, corrVal, corrReason).then(() => { setCorrecting(null); setCorrVal(""); load(); refresh(); })}>Apply</Button>
            </div>
          )}
        </div>
      ))}
      {cards !== null && cards.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)" }}>No memories at this scope. N0VA remembers only what it can justify, scope, expire, and delete.</div>
      )}

      {/* Remember */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>➕ Remember this</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input className="nv-input" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="key (e.g. preferred_explanation_style)" style={{ flex: 1, minWidth: 160 }} />
          <input className="nv-input" value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="value" style={{ flex: 1, minWidth: 160 }} />
          <select className="nv-input" value={newScope} onChange={(e) => setNewScope(e.target.value)} style={{ width: 150 }}>
            {SCOPES.map((s) => <option key={s} value={s}>{s.toLowerCase().replace("_", " ")}</option>)}
          </select>
          <Button size="sm" onClick={() => {
            if (!newKey.trim()) return;
            void actions.create({ key: newKey.trim(), value: newVal, scope: newScope, courseId: setId }).then(() => { setNewKey(""); setNewVal(""); load(); refresh(); });
          }}>Save</Button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="nv-input" value={dni} onChange={(e) => setDni(e.target.value)} placeholder="Do not infer key pattern…" style={{ flex: 1, minWidth: 160 }} />
          <Button variant="secondary" size="sm" onClick={() => { if (dni.trim()) void actions.doNotInfer(dni.trim(), true).then(() => { setDni(""); refresh(); }); }}>Do not infer this</Button>
        </div>
      </div>

      {/* Classroom */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🏫 Classroom memory (instructor-approved, course-local)</div>
        {(classroom ?? []).map((c) => (
          <div key={c.id} style={{ fontSize: 12, marginTop: 4 }}>
            <b>{c.key}</b>: {c.value.slice(0, 160)} · v{c.version} · {c.status.toLowerCase()}
            {isInstructor && c.status === "PROPOSED" && (
              <span style={{ marginLeft: 8 }}>
                <Button variant="secondary" size="sm" onClick={() => void actions.classroomApprove(c.id, true).then(loadClassroom)}>Approve</Button>{" "}
                <Button variant="ghost" size="sm" onClick={() => void actions.classroomApprove(c.id, false).then(loadClassroom)}>Revoke</Button>
              </span>
            )}
          </div>
        ))}
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 12, cursor: "pointer" }}>Propose classroom memory (needs instructor approval)</summary>
          <form action={(fd) => void actions.classroomPropose(fd).then(() => { loadClassroom(); refresh(); })} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <input type="hidden" name="setId" value={setId} />
            <input className="nv-input" name="key" placeholder="key (e.g. course_definition_theory)" required style={{ width: 220 }} />
            <input className="nv-input" name="value" placeholder="approved wording" required style={{ flex: 1, minWidth: 160 }} />
            <Button size="sm" type="submit">Propose</Button>
          </form>
        </details>
      </div>

      {/* Injection scan */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🛡 Document trust scan (pasted text is evidence, never instructions)</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input className="nv-input" value={scanText} onChange={(e) => setScanText(e.target.value)} placeholder="Paste document excerpt to scan…" style={{ flex: 1, minWidth: 200 }} />
          <Button variant="secondary" size="sm" onClick={() => void actions.scan(scanText).then((r) => setScanRes(r))}>Scan</Button>
        </div>
        {scanRes && (
          <div style={{ fontSize: 12, marginTop: 6 }}>
            {scanRes.quarantined
              ? <span style={{ color: "var(--nv-color-danger)" }}>⛔ Quarantined: instruction-override patterns detected. Will not write memory.</span>
              : <span>✅ No injection patterns. {scanRes.findings.length} low-severity note(s).</span>}
            {scanRes.findings.map((f, i) => <div key={i} style={{ color: "var(--nv-color-text-faint)" }}>[{f.severity}] …{f.excerpt}…</div>)}
            <div style={{ color: "var(--nv-color-text-faint)" }}>{scanRes.rule}</div>
          </div>
        )}
      </div>
    </div>
  );
}
