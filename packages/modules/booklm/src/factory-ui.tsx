"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";

export interface FactoryArtifact {
  id: string; type: string; title: string;
  reviewStatus: string; version: number;
  extractionConfidence: number; sourceVersions: string[];
  concepts: string[]; updatedAt: string;
}

export interface FactoryActions {
  build: (setId: string) => Promise<{ modelId: string; nodes: number; prereqs: number }>;
  generate: (input: { setId: string; type: string; title?: string; depth?: string; topic?: string; language?: string; objectives?: string[]; highStakes?: boolean }) => Promise<{
    artifact: FactoryArtifact; content: Record<string, unknown>;
    validation: { valid: boolean; issues: string[]; reviewRequired: boolean };
    route: string; autoPublished: boolean;
  }>;
  list: (setId: string) => Promise<FactoryArtifact[]>;
  get: (id: string) => Promise<{ id: string; type: string; title: string; content: Record<string, unknown>; sourceDocs: string[]; sourceVersions: string[]; concepts: string[]; objectives: string[]; extractionConfidence: number; reviewStatus: string; version: number }>;
  validate: (id: string) => Promise<{ valid: boolean; issues: string[]; reviewRequired: boolean }>;
  review: (id: string, approve: boolean) => Promise<void>;
  publish: (id: string) => Promise<void>;
  transform: (id: string, kind: "translate" | "adapt" | "accessibility", opts: Record<string, unknown>) => Promise<unknown>;
  regenerate: (id: string) => Promise<unknown>;
  provenance: (id: string) => Promise<unknown>;
  impact: (documentKey: string) => Promise<{ affected: { id: string; type: string; title: string; reviewStatus: string }[]; note: string }>;
  consistency: (setId: string) => Promise<{ checked: { id: string; type: string }[]; alerts: { kinds: string[]; detail: string; artifactIds: string[] }[] }>;
  envelope: (id: string) => Promise<EnvelopeShape>;
  leakage: (setId: string) => Promise<LeakageShape>;
  pack: (setId: string, gaps: string[]) => Promise<{ setId: string; gaps: string[]; items: { id: string; type: string; title: string }[]; note: string }>;
}

export interface EnvelopeShape {
  artifact_id: string; type: string; title: string;
  source_documents: string[]; source_versions: string[];
  concepts: string[]; learning_objectives: string[];
  citations: boolean; extraction_confidence: number; review_status: string;
  generated_at: string;
  source_status: { verified: boolean; stale_versions: string[]; affected_by_source_change: boolean };
}

export interface LeakageShape {
  setId: string; status: string; practiceCount: number; gradedCount: number;
  leaks: { practiceId: string; practiceTitle: string; gradedId: string; gradedTitle: string; similarity: number; sharedAnswers: string[]; action: string }[];
  note: string;
}

const TYPES = [
  "summary", "glossary", "concept_map", "prereq_map", "flashcard_set",
  "practice_test", "case_study", "debate", "lab", "coding_assignment",
  "viva", "revision_sheet", "audio_lesson", "deck", "teaching_notes",
  "gap_sheet", "evidence_graph",
];

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "📝 draft", IN_REVIEW: "👀 in review", APPROVED: "✅ approved",
  PUBLISHED: "📢 published", SUPERSEDED: "🗄 superseded", REJECTED: "⛔ rejected",
};

export function FactoryPanel({ setId, actions, isInstructor }: {
  setId: string; actions: FactoryActions; isInstructor: boolean;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [model, setModel] = useState<{ modelId: string; nodes: number; prereqs: number } | null>(null);
  const [artifacts, setArtifacts] = useState<FactoryArtifact[] | null>(null);
  const [open, setOpen] = useState<Record<string, Record<string, unknown> | null>>({});
  const [validation, setValidation] = useState<Record<string, { valid: boolean; issues: string[]; reviewRequired: boolean }>>({});
  const [consistency, setConsistency] = useState<{ alerts: { kinds: string[]; detail: string }[] } | null>(null);
  const [impact, setImpact] = useState<{ affected: { id: string; type: string; title: string; reviewStatus: string }[]; note: string } | null>(null);
  const [provenance, setProvenance] = useState<Record<string, unknown> | null>(null);
  const [provFor, setProvFor] = useState("");
  const [envelopes, setEnvelopes] = useState<Record<string, EnvelopeShape>>({});
  const [leakage, setLeakage] = useState<LeakageShape | null>(null);
  // generate form
  const [type, setType] = useState("summary");
  const [depth, setDepth] = useState("standard");
  const [topic, setTopic] = useState("");
  const [impactKey, setImpactKey] = useState("");
  const [gaps, setGaps] = useState("");
  const [pack, setPack] = useState<{ items: { id: string; type: string; title: string }[]; note: string } | null>(null);

  const load = () => {
    void actions.list(setId).then((a) => setArtifacts(a)).catch(() => undefined);
  };
  if (artifacts === null) load();

  const openArtifact = (id: string) => {
    if (open[id] !== undefined) {
      setOpen((m) => { const c = { ...m }; delete c[id]; return c; });
      return;
    }
    void actions.get(id).then((a) => setOpen((m) => ({ ...m, [id]: a.content }))).catch(() => undefined);
    void actions.validate(id).then((v) => setValidation((m) => ({ ...m, [id]: v }))).catch(() => undefined);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
      {/* Model */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800 }}>🏭 Study factory — one verified model, many formats</span>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" onClick={() => void actions.build(setId).then((m) => { setModel(m); refresh(); })}>
            {model ? "Rebuild model" : "Build learning model"}
          </Button>
        </div>
        {model && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginTop: 4 }}>{model.nodes} nodes · {model.prereqs} prerequisite edges — all artifacts generate from this model, never independent summaries.</div>}
      </div>

      {/* Generate */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Generate artifact</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <select className="nv-input" value={type} onChange={(e) => setType(e.target.value)} style={{ width: 180 }}>
            {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
          <select className="nv-input" value={depth} onChange={(e) => setDepth(e.target.value)} style={{ width: 150 }}>
            {["quick", "standard", "deep", "exam", "instructor"].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <input className="nv-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="topic / title" style={{ flex: 1, minWidth: 160 }} />
          <Button size="sm" onClick={() => {
            void actions.generate({ setId, type, depth, topic }).then(() => { load(); refresh(); });
          }}>Generate</Button>
          <Button variant="secondary" size="sm" onClick={() => void actions.consistency(setId).then((c) => setConsistency(c))}>Consistency check</Button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          <input className="nv-input" value={gaps} onChange={(e) => setGaps(e.target.value)} placeholder="gap concepts, comma-separated (study pack)…" style={{ flex: 1, minWidth: 200 }} />
          <Button variant="secondary" size="sm" onClick={() => {
            const list = gaps.split(",").map((g) => g.trim()).filter(Boolean).slice(0, 20);
            void actions.pack(setId, list).then((p) => { setPack(p); load(); refresh(); });
          }}>Build study pack</Button>
        </div>
        {pack && (
          <div style={{ fontSize: 12, marginTop: 6 }}>
            <span style={{ color: "var(--nv-color-success)" }}>✅ Pack built: </span>
            {pack.items.map((i) => i.title).join(" · ")}
            <div style={{ color: "var(--nv-color-text-faint)" }}>{pack.note}</div>
          </div>
        )}
        {consistency && (
          <div style={{ fontSize: 12, marginTop: 6 }}>
            {consistency.alerts.length === 0
              ? <span style={{ color: "var(--nv-color-success)" }}>✅ No cross-artifact contradictions.</span>
              : consistency.alerts.map((a, i) => (
                <div key={i} style={{ color: "var(--nv-color-danger)" }}>⚠ {a.kinds.join(", ")}: {a.detail} — instructor resolution required.</div>
              ))}
          </div>
        )}
      </div>

      {/* Artifacts */}
      {(artifacts ?? []).map((a) => (
        <div key={a.id} className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span><b>{a.title}</b> · {a.type.replace(/_/g, " ")} · v{a.version}</span>
            <span style={{ fontSize: 12 }}>{STATUS_BADGE[a.reviewStatus] ?? a.reviewStatus} · conf {Math.round(a.extractionConfidence * 100)}%</span>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={() => openArtifact(a.id)}>{open[a.id] !== undefined ? "Hide" : "Open"}</Button>
            {isInstructor && a.reviewStatus !== "APPROVED" && a.reviewStatus !== "PUBLISHED" && (
              <>
                <Button variant="secondary" size="sm" onClick={() => void actions.review(a.id, true).then(() => { load(); refresh(); })}>Approve</Button>
                <Button variant="ghost" size="sm" onClick={() => void actions.review(a.id, false).then(() => { load(); refresh(); })}>Reject</Button>
              </>
            )}
            {isInstructor && a.reviewStatus === "APPROVED" && (
              <Button variant="secondary" size="sm" onClick={() => void actions.publish(a.id).then(() => { load(); refresh(); })}>Publish</Button>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
            Sources: {a.sourceVersions.slice(0, 3).join(" · ") || "model"} · concepts: {a.concepts.slice(0, 4).join(", ")}
            {envelopes[a.id] && (
              <span> · {envelopes[a.id]!.source_status.verified ? "source verified" : `stale: ${envelopes[a.id]!.source_status.stale_versions.join(", ")}`}</span>
            )}
          </div>
          {validation[a.id] && (
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {validation[a.id]!.valid
                ? <span style={{ color: "var(--nv-color-success)" }}>✅ Validation passed.</span>
                : <span style={{ color: "var(--nv-color-danger)" }}>⚠ {validation[a.id]!.issues.join("; ")}</span>}
            </div>
          )}
          {open[a.id] !== undefined && open[a.id] !== null && (
            <div style={{ marginTop: 6 }}>
              <ArtifactView content={open[a.id]!} />
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                <Button variant="ghost" size="sm" onClick={() => void actions.envelope(a.id).then((e) => setEnvelopes((m) => ({ ...m, [a.id]: e }))).catch(() => undefined)}>Envelope</Button>
                <Button variant="ghost" size="sm" onClick={() => { setProvFor(a.id); void actions.provenance(a.id).then((p) => setProvenance(p as Record<string, unknown>)); }}>Provenance</Button>
                <Button variant="ghost" size="sm" onClick={() => void actions.regenerate(a.id).then(() => { load(); refresh(); })}>Regenerate (supersede)</Button>
                <Button variant="ghost" size="sm" onClick={() => void actions.transform(a.id, "accessibility", { formats: ["text", "audio-transcript"] }).then(() => { load(); refresh(); })}>Accessibility version</Button>
              </div>
              {provFor === a.id && provenance && (
                <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", background: "var(--nv-color-surface-2, transparent)", borderRadius: 8, padding: 8, marginTop: 6 }}>
                  {JSON.stringify(provenance, null, 1).slice(0, 1200)}
                </pre>
              )}
            </div>
          )}
        </div>
      ))}
      {artifacts !== null && artifacts.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)" }}>No artifacts yet — build the model, then generate.</div>
      )}

      {/* Assessment leakage */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontWeight: 800 }}>🔒 Assessment leakage screen (practice vs graded)</span>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" onClick={() => void actions.leakage(setId).then((r) => setLeakage(r)).catch(() => undefined)}>Screen set</Button>
        </div>
        {leakage && (
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {leakage.status === "clear"
              ? <span style={{ color: "var(--nv-color-success)" }}>✅ Clear — practice {leakage.practiceCount} · graded {leakage.gradedCount}.</span>
              : leakage.leaks.map((l, i) => (
                <div key={i} style={{ color: "var(--nv-color-danger)" }}>
                  ⚠ “{l.practiceTitle}” leaks “{l.gradedTitle}” (sim {l.similarity}{l.sharedAnswers.length > 0 ? ` · shared: ${l.sharedAnswers.join("; ")}` : ""}) — {l.action}.
                </div>
              ))}
            <div style={{ color: "var(--nv-color-text-faint)" }}>{leakage.note}</div>
          </div>
        )}
      </div>

      {/* Impact */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Source-update impact</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input className="nv-input" value={impactKey} onChange={(e) => setImpactKey(e.target.value)} placeholder="document key or version (e.g. doc_12)" style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" onClick={() => impactKey.trim() && void actions.impact(impactKey.trim()).then((r) => setImpact(r))}>Check</Button>
        </div>
        {impact && (
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {impact.affected.length === 0 ? "No artifacts reference this source." : impact.affected.map((a) => (
              <div key={a.id}>• {a.title} ({a.type}) — {a.reviewStatus.toLowerCase()}</div>
            ))}
            <div style={{ color: "var(--nv-color-text-faint)" }}>{impact.note}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ArtifactView({ content }: { content: Record<string, unknown> }) {
  const str = (v: unknown): string => typeof v === "string" ? v : JSON.stringify(v);
  const entries = Object.entries(content).filter(([k]) => !k.startsWith("_"));
  return (
    <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
      {entries.slice(0, 14).map(([k, v]) => (
        <div key={k}>
          <b>{k.replace(/_/g, " ")}:</b>{" "}
          {Array.isArray(v) ? (
            <span>{(v as unknown[]).slice(0, 6).map((x, i) => (
              <span key={i} style={{ display: "block", color: "var(--nv-color-text-faint)" }}>• {str(x).slice(0, 220)}</span>
            ))}{v.length > 6 && <span>… +{v.length - 6} more</span>}</span>
          ) : (
            <span style={{ whiteSpace: "pre-wrap" }}>{str(v).slice(0, 600)}</span>
          )}
        </div>
      ))}
    </div>
  );
}
