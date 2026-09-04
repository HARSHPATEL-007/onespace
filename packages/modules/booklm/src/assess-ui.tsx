"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";
import type { GraphConcept } from "./graph-ui";

export interface DimProfile {
  score: number | null; tasks: number; successes: number;
  quality: number; coverage: number; confidence: number;
  limitations: string[];
  conditions: Record<string, { n: number; avg: number }>;
}

export interface ProfileData {
  dimensions: Record<string, DimProfile>;
  scores: Record<string, number | null>;
  rule: { rule: string; action: string } | null;
}

export interface AssessActions {
  profile: (setId: string, conceptKey?: string) => Promise<ProfileData>;
  logEvidence: (input: {
    setId: string; conceptKey: string; conceptId?: string; dimension: string;
    score: number; correct?: boolean; supportLevel?: string; condition?: string;
    transferLevel?: number; prompt?: string; answer?: string; confidence?: number;
    reasonableMethod?: boolean;
  }) => Promise<unknown>;
  reports: (setId: string, conceptKey: string, conceptLabel: string) => Promise<{
    learner: { concept: string; strengths: string[]; developing: string[]; nextGrowthArea: string | null; evidence: string; transferNote: string | null; confidence: number; limitations: string[] };
    educator: { concept: string; coverage: string; reliableFinding: string; unresolvedQuestion: string; explanations: string[]; recommendedAssessment: string[] };
    sequence: { dim: string; question: string; done: number; score: number | null }[];
  }>;
  saveBlueprint: (fd: FormData) => Promise<void>;
  blueprints: (setId: string) => Promise<{ id: string; objective: string; weights: Record<string, number>; minimums: Record<string, number> }[]>;
  blueprintCheck: (setId: string, objective: string) => Promise<unknown>;
}

const DIMS = [
  "retrieval", "application", "novel_transfer", "error_diagnosis",
  "concept_mapping", "teach_back", "oral_explanation", "practical_demonstration",
  "project_evaluation", "reflection_metacognition", "peer_assessment", "portfolio_evidence",
];

const CONDITIONS = ["unspecified", "open_book", "closed_book", "limited_resource", "tool_assisted", "collaborative", "oral", "practical"];
const SUPPORTS = ["independent", "cued", "scaffolded", "demonstrated"];

export function AssessmentProfilePanel({ setId, concepts, actions, isInstructor }: {
  setId: string; concepts: GraphConcept[]; actions: AssessActions; isInstructor: boolean;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [conceptKey, setConceptKey] = useState(concepts[0]?.key ?? "");
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [report, setReport] = useState<Awaited<ReturnType<AssessActions["reports"]>> | null>(null);
  const [blueprints, setBlueprints] = useState<{ id: string; objective: string; weights: Record<string, number>; minimums: Record<string, number> }[] | null>(null);
  const [check, setCheck] = useState<unknown>(null);
  // log form
  const [dim, setDim] = useState("retrieval");
  const [score, setScore] = useState("0.75");
  const [support, setSupport] = useState("independent");
  const [condition, setCondition] = useState("unspecified");
  const [transfer, setTransfer] = useState("");
  const [note, setNote] = useState("");
  const [reasonable, setReasonable] = useState(true);

  const conceptLabel = concepts.find((c) => c.key === conceptKey)?.label ?? conceptKey;
  const conceptId = concepts.find((c) => c.key === conceptKey)?.id;

  const load = (key = conceptKey) => {
    setConceptKey(key);
    void actions.profile(setId, key || undefined).then((p) => setProfile(p)).catch(() => undefined);
    setReport(null);
  };
  if (profile === null && conceptKey) load(conceptKey);
  const loadReports = () => {
    if (!conceptKey) return;
    void actions.reports(setId, conceptKey, conceptLabel).then((r) => setReport(r)).catch(() => undefined);
  };
  const loadBlueprints = () => {
    void actions.blueprints(setId).then((b) => setBlueprints(b)).catch(() => undefined);
  };
  if (isInstructor && blueprints === null) loadBlueprints();

  const bar = (v: number | null) =>
    v === null
      ? <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>unsampled</span>
      : <span><b>{Math.round(v * 100)}</b>
        <span style={{ display: "inline-block", width: 90, height: 8, background: "var(--nv-color-border)", borderRadius: 4, marginLeft: 6, verticalAlign: "middle" }}>
          <span style={{ display: "inline-block", height: "100%", width: `${Math.round(v * 100)}%`, background: "var(--nv-color-success)", borderRadius: 4 }} />
        </span></span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <select className="nv-input" value={conceptKey} onChange={(e) => load(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
          <option value="">All concepts (set-wide)</option>
          {concepts.map((c) => <option key={c.id} value={c.key}>{c.label}</option>)}
        </select>
        <Button variant="secondary" size="sm" onClick={loadReports}>Reports</Button>
      </div>

      {/* Profile — separate dimensions, never one composite */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Assessment profile{conceptLabel ? ` — ${conceptLabel}` : ""}</div>
        {DIMS.map((d) => {
          const p = profile?.dimensions[d];
          return (
            <div key={d} style={{ marginTop: 4, fontSize: 12 }}>
              <div>{d.replace(/_/g, " ")}: {bar(p?.score ?? null)}
                {p && p.tasks > 0 && (
                  <span style={{ color: "var(--nv-color-text-faint)" }}> · {p.tasks} task(s), {p.successes} strong · coverage {Math.round(p.coverage * 100)}% · conf {Math.round(p.confidence * 100)}%</span>
                )}
              </div>
              {p && p.limitations.length > 0 && p.tasks > 0 && (
                <div style={{ color: "var(--nv-color-text-faint)" }}>⚠ {p.limitations.join("; ")}</div>
              )}
              {p && Object.keys(p.conditions).length > 1 && (
                <div style={{ color: "var(--nv-color-text-faint)" }}>
                  conditions: {Object.entries(p.conditions).map(([k, v]) => `${k} ${Math.round(v.avg * 100)}% (n=${v.n})`).join(" · ")}
                </div>
              )}
            </div>
          );
        })}
        {profile?.rule && (
          <div style={{ marginTop: 8, fontSize: 12, background: "var(--nv-color-surface-2, transparent)", borderRadius: 8, padding: 8 }}>
            <b>Decision rule [{profile.rule.rule}]:</b> {profile.rule.action}
          </div>
        )}
      </div>

      {/* Reports */}
      {report && (
        <>
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 800 }}>Your understanding of {report.learner.concept}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}><b>Strengths:</b> {report.learner.strengths.map((s) => s.replace(/_/g, " ")).join(", ") || "—"}</div>
            <div style={{ fontSize: 12 }}><b>Developing:</b> {report.learner.developing.map((s) => s.replace(/_/g, " ")).join(", ") || "—"}</div>
            {report.learner.nextGrowthArea && <div style={{ fontSize: 12 }}><b>Next growth area:</b> {report.learner.nextGrowthArea.replace(/_/g, " ")}</div>}
            <div style={{ fontSize: 12, marginTop: 4 }}><b>Evidence:</b> {report.learner.evidence}</div>
            {report.learner.transferNote && <div style={{ fontSize: 12 }}>{report.learner.transferNote}</div>}
            <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
              Confidence: moderate ({Math.round(report.learner.confidence * 100)}%). {report.learner.limitations.join("; ")}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}><b>Sequence:</b> {report.sequence.map((s) => `${s.dim.replace(/_/g, " ")}${s.done > 0 ? `✓(${s.done})` : "○"}`).join(" → ")}</div>
          </div>
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 800 }}>Educator report — {report.educator.concept}</div>
            <div style={{ fontSize: 12 }}>Coverage: {report.educator.coverage}</div>
            <div style={{ fontSize: 12 }}>Most reliable finding: {report.educator.reliableFinding}</div>
            <div style={{ fontSize: 12 }}>Primary unresolved question: {report.educator.unresolvedQuestion}</div>
            <div style={{ fontSize: 12 }}>Possible explanations: {report.educator.explanations.join("; ")}</div>
            <div style={{ fontSize: 12 }}>Recommended assessment: {report.educator.recommendedAssessment.join(", ") || "profile complete"}</div>
          </div>
        </>
      )}

      {/* Log evidence (artifacts: practical/oral/project/teach-back/peer) */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>📝 Log dimension evidence</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <select className="nv-input" value={dim} onChange={(e) => setDim(e.target.value)} style={{ width: 190 }}>
            {DIMS.map((d) => <option key={d} value={d}>{d.replace(/_/g, " ")}</option>)}
          </select>
          <input className="nv-input" value={score} onChange={(e) => setScore(e.target.value)} placeholder="score 0..1" style={{ width: 90 }} />
          <select className="nv-input" value={support} onChange={(e) => setSupport(e.target.value)} style={{ width: 140 }}>
            {SUPPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="nv-input" value={condition} onChange={(e) => setCondition(e.target.value)} style={{ width: 150 }}>
            {CONDITIONS.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
          </select>
          <input className="nv-input" value={transfer} onChange={(e) => setTransfer(e.target.value)} placeholder="transfer L1-6" style={{ width: 100 }} />
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input className="nv-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="evidence note / subscore summary" style={{ flex: 1, minWidth: 160 }} />
          <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}>
            <input type="checkbox" checked={reasonable} onChange={(e) => setReasonable(e.target.checked)} /> sound method
          </label>
          <Button size="sm" onClick={() => {
            const v = Number(score);
            if (!conceptKey || Number.isNaN(v)) return;
            void actions.logEvidence({
              setId, conceptKey, conceptId, dimension: dim, score: Math.max(0, Math.min(1, v)),
              supportLevel: support, condition, transferLevel: transfer ? Number(transfer) : undefined,
              answer: note, reasonableMethod: reasonable,
            }).then(() => { setNote(""); load(); refresh(); });
          }}>Log</Button>
        </div>
        <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 4 }}>
          Correct-through-irrelevant-method is capped at 0.4 — uncheck “sound method” when the reasoning was unsound.
        </div>
      </div>

      {/* Blueprints (instructor) */}
      {isInstructor && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>📐 Assessment blueprints (educator weights — never invented)</div>
          {(blueprints ?? []).map((b) => (
            <div key={b.id} style={{ fontSize: 12, marginTop: 4 }}>
              <b>{b.objective}</b>
              <div style={{ color: "var(--nv-color-text-faint)" }}>
                weights: {Object.entries(b.weights).map(([k, v]) => `${k} ${v}`).join(", ") || "—"} ·
                minimums: {Object.entries(b.minimums).map(([k, v]) => `${k}×${v}`).join(", ") || "—"}
              </div>
              <Button variant="ghost" size="sm" onClick={() => void actions.blueprintCheck(setId, b.objective).then((c) => setCheck(c))}>Check coverage</Button>
            </div>
          ))}
          {check !== null && (
            <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", background: "var(--nv-color-surface-2, transparent)", borderRadius: 8, padding: 8, marginTop: 6 }}>
              {JSON.stringify(check, null, 1).slice(0, 1500)}
            </pre>
          )}
          <details style={{ marginTop: 6 }}>
            <summary style={{ fontSize: 12, cursor: "pointer" }}>+ New blueprint</summary>
            <BlueprintForm setId={setId} onSave={(fd) => void actions.saveBlueprint(fd).then(() => { loadBlueprints(); refresh(); })} />
          </details>
        </div>
      )}
    </div>
  );
}

function BlueprintForm({ setId, onSave }: { setId: string; onSave: (fd: FormData) => void }) {
  const dims = [
    "retrieval", "application", "novel_transfer", "error_diagnosis",
    "concept_mapping", "teach_back", "practical_demonstration", "project_evaluation",
  ];
  return (
    <form action={onSave} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
      <input type="hidden" name="setId" value={setId} />
      <input className="nv-input" name="objective" placeholder="Learning objective" required />
      {dims.map((d) => (
        <div key={d} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
          <span style={{ width: 180 }}>{d.replace(/_/g, " ")}</span>
          <input className="nv-input" name={`w_${d}`} placeholder="weight" defaultValue={d === "retrieval" ? "0.2" : "0"} style={{ width: 90 }} />
          <input className="nv-input" name={`m_${d}`} placeholder="min tasks" defaultValue="0" style={{ width: 90 }} />
        </div>
      ))}
      <Button size="sm" type="submit">Save blueprint</Button>
    </form>
  );
}
