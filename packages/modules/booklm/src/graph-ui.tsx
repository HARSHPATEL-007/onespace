"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";
import { learnerStatusLabel } from "./learner";

export interface GraphConcept { id: string; key: string; label: string }
export interface GraphRecommendation {
  id: string; action: string; reasonCodes: string[]; explanation: string[];
  evidence: string[]; alternatives: string[]; expectedBenefit: string; confidence: number;
}
export interface GraphPath { name: string; tradeOff: string; totalMinutes: number; steps: { conceptKey: string; label: string; kind: string; minutes: number; reason: string }[] }
export interface GraphMisconception {
  id: string; statement: string; status: string; severity: string; confidence: number;
  learnerAcknowledged: boolean; concept: { id: string; key: string; label: string };
}
export interface GraphGoal { id: string; title: string; status: string; progress: number; competencyKeys: string[] }
export interface GraphChange { conceptId: string; label: string; delta: number; observations: number; direction: string }
export interface GraphDecaying { conceptId: string; label: string; key: string; status: string; recall: number; daysSinceVerified: number; predicted: number }

export interface GraphData {
  recommendations: GraphRecommendation[];
  paths: GraphPath[];
  strategies: { strategies: { strategy: string; effectiveness: string; rate: number }[]; note: string } | null;
  misconceptions: GraphMisconception[];
  goals: GraphGoal[];
  changed: GraphChange[];
  decaying: GraphDecaying[];
}

export interface GraphActions {
  generate: (setId: string) => Promise<unknown>;
  recStatus: (id: string, status: "ACCEPTED" | "REJECTED" | "DISMISSED") => Promise<void>;
  reportMisconception: (input: { conceptId: string; statement: string }) => Promise<unknown>;
  acknowledge: (id: string, acknowledged: boolean) => Promise<void>;
  addGoal: (fd: FormData) => Promise<void>;
  observe: (input: { conceptId: string; dimension: string; value: number; sourceType: string }) => Promise<unknown>;
  correct: (fd: FormData) => Promise<void>;
  undo: (fd: FormData) => Promise<void>;
  conceptDetail: (conceptId: string) => Promise<{ history: unknown; cohort: unknown }>;
  exportGraph: (level: string) => Promise<Record<string, unknown>>;
}

const STAGE_LABEL: Record<string, string> = {
  CANDIDATE: "a pattern worth a second look", EVIDENCE_GATHERING: "collecting examples",
  TESTING: "testing with a quick check", CLARIFICATION: "asking what you meant",
  CONFIRMED: "current interpretation to revisit", REMEDIATION: "working through a counterexample",
  REASSESSED: "checking again in a new context", RESOLVED: "resolved", DORMANT: "quiet for now",
  PERSISTENT: "still showing up — trying a different angle",
};

const REASON_LABEL: Record<string, string> = {
  prerequisite_gap: "Prerequisite gap", misconception_detected: "Interpretation to revisit",
  mastery_decay: "Memory decay", goal_alignment: "Goal alignment",
  transfer_opportunity: "Transfer opportunity", recent_struggle: "Recent struggle",
};

export function LearnerGraphPanel({ setId, concepts, data, actions }: {
  setId: string; concepts: GraphConcept[]; data: GraphData; actions: GraphActions;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [pathIdx, setPathIdx] = useState(1);
  const [conceptId, setConceptId] = useState(concepts[0]?.id ?? "");
  const [detail, setDetail] = useState<{ history: any; cohort: any } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [obsDim, setObsDim] = useState("recall");
  const [obsVal, setObsVal] = useState("0.8");
  const [misText, setMisText] = useState("");
  const path = data.paths[pathIdx];

  const loadDetail = (id: string) => {
    setConceptId(id);
    setLoadingDetail(true);
    void actions.conceptDetail(id)
      .then((d) => { setDetail(d as { history: any; cohort: any }); setLoadingDetail(false); })
      .catch(() => setLoadingDetail(false));
  };

  const downloadExport = (level: string) => {
    void actions.exportGraph(level).then((doc) => {
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/ld+json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `learner-graph-${level}.jsonld`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Goals */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🎯 Goals ({data.goals.filter((g) => g.status === "ACTIVE").length} active)</div>
        {data.goals.slice(0, 5).map((g) => (
          <div key={g.id} style={{ fontSize: 12, marginTop: 4 }}>
            <b>{g.title}</b> — {Math.round(g.progress * 100)}% · {g.status.toLowerCase()}
            <div style={{ height: 6, background: "var(--nv-color-border)", borderRadius: 3, marginTop: 2 }}>
              <div style={{ height: "100%", background: "var(--nv-color-success)", borderRadius: 3, width: `${Math.round(g.progress * 100)}%` }} />
            </div>
          </div>
        ))}
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 12, cursor: "pointer" }}>+ New goal</summary>
          <form action={(fd) => void actions.addGoal(fd).then(refresh)} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <input className="nv-input" name="title" placeholder="Goal title" required style={{ flex: 1, minWidth: 160 }} />
            <input className="nv-input" name="competencyKeys" placeholder="concept keys, comma-separated" style={{ flex: 1, minWidth: 160 }} />
            <Button size="sm" type="submit">Add</Button>
          </form>
        </details>
      </div>

      {/* Recommendations */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontWeight: 800 }}>💡 Recommended next actions</span>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" onClick={() => void actions.generate(setId).then(refresh)}>Regenerate</Button>
        </div>
        {data.recommendations.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No open recommendations — generate a fresh set from your evidence.</div>
        )}
        {data.recommendations.map((r) => (
          <div key={r.id} style={{ borderTop: "1px solid var(--nv-color-border)", paddingTop: 6, marginTop: 6, fontSize: 12 }}>
            <div><b>{r.action.replace(/_/g, " ")}</b> · conf {Math.round(r.confidence * 100)}%</div>
            <div style={{ color: "var(--nv-color-text-faint)" }}>
              {r.reasonCodes.map((c) => REASON_LABEL[c] ?? c).join(" · ")}
            </div>
            {r.explanation.map((e, i) => <div key={i}>• {e}</div>)}
            <div style={{ color: "var(--nv-color-text-faint)" }}>If you skip: {r.alternatives.join(" / ")}</div>
            <div>Expected benefit: {r.expectedBenefit}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <Button variant="secondary" size="sm" onClick={() => void actions.recStatus(r.id, "ACCEPTED").then(refresh)}>Accept</Button>
              <Button variant="ghost" size="sm" onClick={() => void actions.recStatus(r.id, "REJECTED").then(refresh)}>Reject</Button>
              <Button variant="ghost" size="sm" onClick={() => void actions.recStatus(r.id, "DISMISSED").then(refresh)}>Dismiss</Button>
            </div>
          </div>
        ))}
      </div>

      {/* Paths */}
      {data.paths.length > 0 && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>🗺 Adaptive paths</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {data.paths.map((p, i) => (
              <Button key={p.name} size="sm" variant={i === pathIdx ? undefined : "secondary"} onClick={() => setPathIdx(i)}>{p.name}</Button>
            ))}
          </div>
          {path && (
            <div style={{ fontSize: 12 }}>
              <div style={{ color: "var(--nv-color-text-faint)" }}>Trade-off: {path.tradeOff} · ~{path.totalMinutes} min</div>
              {path.steps.map((s, i) => (
                <div key={`${s.conceptKey}-${i}`} style={{ marginTop: 4 }}>
                  <b>{i + 1}. {s.label}</b> ({s.kind}, ~{s.minutes} min)
                  <div style={{ color: "var(--nv-color-text-faint)" }}>Why: {s.reason}</div>
                </div>
              ))}
              {path.steps.length === 0 && <div style={{ color: "var(--nv-color-text-faint)" }}>No gaps on this route — you're clear.</div>}
            </div>
          )}
        </div>
      )}

      {/* Misconceptions — learner-safe language */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🔍 Interpretations to revisit ({data.misconceptions.length})</div>
        {data.misconceptions.map((m) => (
          <div key={m.id} style={{ fontSize: 12, borderTop: "1px solid var(--nv-color-border)", paddingTop: 6, marginTop: 6 }}>
            <div>“{m.statement}” — <i>{STAGE_LABEL[m.status] ?? m.status}</i> ({m.concept.label})</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
              <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input type="checkbox" checked={m.learnerAcknowledged} onChange={(e) => void actions.acknowledge(m.id, e.target.checked).then(refresh)} />
                I see why this needs a look
              </label>
            </div>
          </div>
        ))}
        {data.misconceptions.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>None active.</div>}
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <select className="nv-input" value={conceptId} onChange={(e) => setConceptId(e.target.value)} style={{ width: 200 }}>
            {concepts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <input className="nv-input" value={misText} onChange={(e) => setMisText(e.target.value)} placeholder="Describe a shaky interpretation…" style={{ flex: 1, minWidth: 160 }} />
          <Button variant="secondary" size="sm" onClick={() => {
            if (!conceptId || !misText.trim()) return;
            void actions.reportMisconception({ conceptId, statement: misText.trim() }).then(() => { setMisText(""); refresh(); });
          }}>Report</Button>
        </div>
      </div>

      {/* Decay */}
      {data.decaying.length > 0 && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>⏳ Scheduled reviews (test before teaching)</div>
          {data.decaying.map((d) => (
            <div key={d.conceptId} style={{ fontSize: 12, marginTop: 4 }}>
              <b>{d.label}</b> — recall {Math.round(d.recall * 100)}%, unchecked {d.daysSinceVerified}d, predicted {Math.round(d.predicted * 100)}%
              <div style={{ color: "var(--nv-color-text-faint)" }}>Short retrieval prompt is enough — no full lesson restart.</div>
            </div>
          ))}
        </div>
      )}

      {/* What changed */}
      {data.changed.length > 0 && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>📈 What changed (30 days)</div>
          {data.changed.slice(0, 8).map((ch) => (
            <div key={ch.conceptId} style={{ fontSize: 12, marginTop: 2 }}>
              {ch.label}: <b style={{ color: ch.direction === "improving" ? "var(--nv-color-success)" : ch.direction === "declining" ? "var(--nv-color-danger)" : undefined }}>
                {ch.direction} ({ch.delta > 0 ? "+" : ""}{ch.delta})
              </b> · {ch.observations} observations
            </div>
          ))}
        </div>
      )}

      {/* Strategies */}
      {data.strategies && data.strategies.strategies.length > 0 && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>🧪 What works for you</div>
          {data.strategies.strategies.map((s) => (
            <div key={s.strategy} style={{ fontSize: 12, marginTop: 2 }}>
              {s.strategy}: <b>{s.effectiveness}</b>{s.effectiveness !== "insufficient" && ` (${Math.round(s.rate * 100)}%)`}
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 4 }}>{data.strategies.note}</div>
        </div>
      )}

      {/* Concept detail */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🔬 Concept detail</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <select className="nv-input" value={conceptId} onChange={(e) => loadDetail(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
            {concepts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <Button variant="secondary" size="sm" onClick={() => conceptId && loadDetail(conceptId)}>{loadingDetail ? "…" : "Inspect"}</Button>
        </div>
        {detail?.history && <ConceptDetailView history={detail.history as any} cohort={detail.cohort as any} />}
      </div>

      {/* Log evidence + corrections */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>📝 Log evidence & correct assumptions</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <select className="nv-input" value={conceptId} onChange={(e) => setConceptId(e.target.value)} style={{ width: 180 }}>
            {concepts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select className="nv-input" value={obsDim} onChange={(e) => setObsDim(e.target.value)} style={{ width: 150 }}>
            {["recognition", "recall", "conceptual", "procedural", "application", "transfer", "analysis", "creation", "metacognition", "collaboration"].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <input className="nv-input" value={obsVal} onChange={(e) => setObsVal(e.target.value)} placeholder="0..1" style={{ width: 80 }} />
          <Button variant="secondary" size="sm" onClick={() => {
            const v = Number(obsVal);
            if (!conceptId || Number.isNaN(v)) return;
            void actions.observe({ conceptId, dimension: obsDim, value: Math.max(0, Math.min(1, v)), sourceType: "learner_report" }).then(refresh);
          }}>Log observation</Button>
        </div>
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 12, cursor: "pointer" }}>Correct an assumption (scoped, reversible)</summary>
          <form action={(fd) => void actions.correct(fd).then(refresh)} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <input type="hidden" name="targetType" value="mastery" />
            <input type="hidden" name="targetId" value={conceptId} />
            <input className="nv-input" name="field" placeholder="dimension (e.g. transfer)" required style={{ width: 170 }} />
            <input className="nv-input" name="newValue" placeholder="new value 0..1" required style={{ width: 130 }} />
            <select className="nv-input" name="scope" defaultValue="profile" style={{ width: 150 }}>
              <option value="profile">This profile only</option>
              <option value="course">This course</option>
              <option value="all">All learning</option>
            </select>
            <input className="nv-input" name="reason" placeholder="reason (optional)" style={{ flex: 1, minWidth: 140 }} />
            <Button size="sm" type="submit">Apply correction</Button>
          </form>
        </details>
      </div>

      {/* Export */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>📦 Portable export (no lock-in)</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Button variant="secondary" size="sm" onClick={() => downloadExport("summary")}>Summary JSON-LD</Button>
          <Button variant="secondary" size="sm" onClick={() => downloadExport("record")}>Learning record</Button>
          <Button variant="secondary" size="sm" onClick={() => downloadExport("archive")}>Full archive</Button>
          <a className="nv-link" style={{ fontSize: 12, alignSelf: "center" }} href="/api/v1/learner/graph?view=export&format=csv">Download events CSV</a>
        </div>
      </div>
    </div>
  );
}

function ConceptDetailView({ history, cohort }: { history: any; cohort: any }) {
  const m = history?.mastery;
  const dims = (m?.dimensions ?? {}) as Record<string, number>;
  const ranges = (m?.dimensionRanges ?? {}) as Record<string, { lo: number; hi: number; band: string }>;
  const observations = (history?.observations ?? []) as { dimension: string; value: number; sourceType: string; context: string; createdAt: string }[];
  const transfers = ((m?.transferContexts ?? []) as { context: string; success: boolean }[]);
  return (
    <div style={{ marginTop: 8, fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      <div><b>{history?.concept?.label}</b> — status: <b>{learnerStatusLabel((m?.status ?? "UNKNOWN") as never)}</b></div>
      {m?.stateEvidence && <div style={{ color: "var(--nv-color-text-faint)" }}>Why: {m.stateEvidence}</div>}
      {Object.entries(dims).map(([k, v]) => {
        const r = ranges[k];
        return (
          <div key={k}>
            {k}: <b>{Math.round(v * 100)}%</b>
            {r && <span style={{ color: "var(--nv-color-text-faint)" }}> (range {Math.round(r.lo * 100)}–{Math.round(r.hi * 100)}, {r.band} confidence)</span>}
            <div style={{ height: 6, background: "var(--nv-color-border)", borderRadius: 3, marginTop: 2 }}>
              <div style={{ height: "100%", background: "var(--nv-color-success)", borderRadius: 3, width: `${Math.round(v * 100)}%` }} />
            </div>
          </div>
        );
      })}
      {Object.keys(dims).length === 0 && <div style={{ color: "var(--nv-color-text-faint)" }}>No observations yet — log the first evidence above.</div>}
      {transfers.length > 0 && (
        <div>Transfer contexts: {transfers.map((t, i) => (
          <span key={i} style={{ marginRight: 8 }}>{t.success ? "✅" : "❌"} {t.context}</span>
        ))}</div>
      )}
      {observations.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer" }}>Evidence history ({observations.length})</summary>
          {observations.slice(-10).reverse().map((o, i) => (
            <div key={i} style={{ color: "var(--nv-color-text-faint)" }}>
              {new Date(o.createdAt).toLocaleDateString()} · {o.dimension} {Math.round(o.value * 100)}% via {o.sourceType}{o.context ? ` — ${o.context}` : ""}
            </div>
          ))}
        </details>
      )}
      {cohort && !cohort.suppressed && (
        <div style={{ color: "var(--nv-color-text-faint)" }}>
          Cohort (n={cohort.n}, bands vs median): recall {cohort.recall} · overall {cohort.overall} · transfer {cohort.transfer}. No peer rankings shown.
        </div>
      )}
      {cohort?.suppressed && (
        <div style={{ color: "var(--nv-color-text-faint)" }}>Cohort comparison suppressed: {cohort.reason}</div>
      )}
    </div>
  );
}
