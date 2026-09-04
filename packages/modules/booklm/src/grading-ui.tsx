"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";

export interface GradeCriterion {
  id: string; label: string; maxPoints: number; weight: number;
  levels?: Record<string, string> | null;
  mustHave?: string[]; acceptableVariants?: string[]; nonEvidence?: string[];
}

export interface GradeRowFull {
  id: string; totalPoints: number; maxPoints: number;
  explanation: string; approved: boolean;
  uncertainty: number; reviewStatus: string; learner: string;
  criteria: { criterionId: string; label: string; points: number; max: number }[];
}

export interface GradingActions {
  submit: (input: {
    assessmentId: string; userId: string; explanation?: string;
    evidence: { criterionId: string; points: number; evidenceQuote?: string; reasoning?: string; location?: string; supports?: string; strength?: number; confidence?: number; errorKind?: string; diagnosis?: string }[];
  }) => Promise<{ grade: { id: string }; confidence: number; gate: { publish: boolean; reviewStatus: string; reason: string } }>;
  approveCriterion: (gradeId: string, criterionId: string, approved: boolean, points: string, note: string) => Promise<unknown>;
  grades: (assessmentId: string) => Promise<GradeRowFull[]>;
  history: (gradeId: string) => Promise<{
    total: number; max: number; approved: boolean; uncertainty: number; reviewStatus: string; assessment: string;
    evidence: { criterionId: string; label: string; points: number; max: number; quote: string; reasoning: string; location: string; supports: string; reviewStatus: string }[];
    audits: { action: string; detail: string; previousScore: number | null; newScore: number | null; reason: string; learnerNotified: boolean; actorId: string; at: string }[];
  }>;
  explain: (gradeId: string) => Promise<{ text: string; vagueFlags: string[] }>;
  freeze: (assessmentId: string, frozen: boolean) => Promise<void>;
  bumpVersion: (assessmentId: string) => Promise<void>;
  shadow: (assessmentId: string) => Promise<{ gradeId: string; userId: string; oldScore: number; newScore: number; delta: number }[]>;
  applyRegrade: (assessmentId: string, gradeIds: string[]) => Promise<{ applied: string[]; held: string[]; note: string }>;
  calibration: (assessmentId: string) => Promise<{
    examples: { id: string; response: string; instructorScores: unknown; aiScores: unknown; status: string }[];
    metrics: { examples: number; scored: number; exactAgreement: number; adjacentAgreement: number; meanAbsDifference: number; byCriterion: Record<string, { exact: number; meanAbs: number; n: number }>; instructorOverrides: number };
  }>;
  saveCalibration: (fd: FormData) => Promise<void>;
  blindQueue: () => Promise<{ gradeId: string; blindKey: string; assessment: string; stakes: string; total: number; max: number; uncertainty: number; reviewStatus: string; criteria: { criterionId: string; label: string; points: number; max: number; quote: string; reasoning: string }[] }[]>;
  dashboard: (assessmentId: string) => Promise<{ assessment: string; rubricVersion: number; frozen: boolean; stakes: string; mode: string; submissions: number; autoPublishable: number; reviewRequired: number; humanRequired: number; calibration: { agreement: number; partialAgreement: number; overrides: number; examples: number } | null; fairness: { open: number }; sourceStatus: { openChallenges: number } }>;
  fairnessList: (setId: string) => Promise<{ id: string; scope: string; dimension: string; groups: { name: string; mean: number; sd: number; n: number }[]; finding: string; action: string; status: string }[]>;
  fairnessSave: (fd: FormData) => Promise<void>;
  fairnessMetrics: (groups: { name: string; mean: number; sd: number; n: number }[]) => Promise<{ comparable: boolean; pairs: { a: string; b: string; stdDiff: number; nA: number; nB: number }[] }>;
  fairnessResolve: (id: string, status: string, action: string) => Promise<void>;
}

export function GradingPanel({ setId, assessments, actions, isInstructor }: {
  setId: string;
  assessments: { id: string; title: string; description: string; criteria: GradeCriterion[] }[];
  actions: GradingActions;
  isInstructor: boolean;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [assessmentId, setAssessmentId] = useState(assessments[0]?.id ?? "");
  const [grades, setGrades] = useState<GradeRowFull[] | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<GradingActions["history"]>> | null>(null);
  const [explanation, setExplanation] = useState<{ text: string; vagueFlags: string[] } | null>(null);
  const [dash, setDash] = useState<Awaited<ReturnType<GradingActions["dashboard"]>> | null>(null);
  const [cal, setCal] = useState<Awaited<ReturnType<GradingActions["calibration"]>> | null>(null);
  const [blind, setBlind] = useState<Awaited<ReturnType<GradingActions["blindQueue"]>> | null>(null);
  const [fair, setFair] = useState<Awaited<ReturnType<GradingActions["fairnessList"]>> | null>(null);
  const [shadow, setShadow] = useState<Awaited<ReturnType<GradingActions["shadow"]>> | null>(null);
  const [note, setNote] = useState("");
  const assessment = assessments.find((a) => a.id === assessmentId);

  const loadGrades = (id: string) => {
    setAssessmentId(id);
    setHistory(null); setExplanation(null);
    void actions.grades(id).then((g) => setGrades(g)).catch(() => undefined);
    if (isInstructor) void actions.dashboard(id).then((d) => setDash(d)).catch(() => undefined);
  };
  if (grades === null && assessmentId) loadGrades(assessmentId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontWeight: 800, fontSize: 13 }}>⚖️ Evidence-based grading</span>
        <select className="nv-input" value={assessmentId} onChange={(e) => loadGrades(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
          {assessments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
      </div>

      {/* Rubric contract */}
      {assessment && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 800 }}>Rubric contract (frozen on open; changes need approval)</div>
          {assessment.criteria.map((c) => (
            <div key={c.id} style={{ fontSize: 12, marginTop: 6 }}>
              <b>{c.label}</b> — {c.maxPoints} pts ×{c.weight}
              {c.levels && Object.keys(c.levels).length > 0 && (
                <div style={{ color: "var(--nv-color-text-faint)" }}>
                  Levels: {Object.entries(c.levels).map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`).join(" · ")}
                </div>
              )}
              {(c.mustHave ?? []).length > 0 && <div>Must have: {c.mustHave!.join("; ")}</div>}
              {(c.acceptableVariants ?? []).length > 0 && <div>Accepted variants: {c.acceptableVariants!.join("; ")}</div>}
              {(c.nonEvidence ?? []).length > 0 && (
                <div style={{ color: "var(--nv-color-text-faint)" }}>Never scored here: {c.nonEvidence!.join(", ")}</div>
              )}
            </div>
          ))}
          {isInstructor && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <Button variant="secondary" size="sm" onClick={() => void actions.freeze(assessmentId, true).then(refresh)}>Freeze rubric</Button>
              <Button variant="ghost" size="sm" onClick={() => void actions.bumpVersion(assessmentId).then(refresh)}>New version</Button>
            </div>
          )}
        </div>
      )}

      {/* Dashboard */}
      {isInstructor && dash && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 800 }}>{dash.assessment} · rubric v{dash.rubricVersion}{dash.frozen ? " (frozen)" : ""} · {dash.stakes} stakes · {dash.mode}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            Submissions {dash.submissions} · auto-publishable {dash.autoPublishable} · review required {dash.reviewRequired} · human required {dash.humanRequired}
          </div>
          {dash.calibration && (
            <div style={{ fontSize: 12 }}>
              Calibration: agreement {Math.round(dash.calibration.agreement * 100)}% · partial {Math.round(dash.calibration.partialAgreement * 100)}% ·
              overrides {dash.calibration.overrides} · examples {dash.calibration.examples}
            </div>
          )}
          <div style={{ fontSize: 12 }}>Fairness open: {dash.fairness.open} · source challenges open: {dash.sourceStatus.openChallenges}</div>
        </div>
      )}

      {/* Grades + criterion approval */}
      {(grades ?? []).map((g) => (
        <div key={g.id} className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span><b>{g.learner}</b>: {g.totalPoints}/{g.maxPoints}</span>
            <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
              {g.approved ? "✅ approved" : `⏳ ${g.reviewStatus.replace(/_/g, " ") || "pending"}`} · uncertainty {Math.round(g.uncertainty * 100)}%
            </span>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={() => void actions.history(g.id).then((h) => { setHistory(h); setExplanation(null); })}>History</Button>
            <Button variant="ghost" size="sm" onClick={() => void actions.explain(g.id).then((e) => { setExplanation(e); setHistory(null); })}>Explain</Button>
          </div>
          {g.criteria.map((c) => (
            <div key={c.criterionId} style={{ fontSize: 12, marginTop: 4 }}>
              {c.label}: <b>{c.points}/{c.max}</b>
              {isInstructor && (
                <span style={{ marginLeft: 8 }}>
                  <input className="nv-input" id={`pts-${g.id}-${c.criterionId}`} placeholder="pts" style={{ width: 60 }} />
                  <Button variant="secondary" size="sm" onClick={() => {
                    const el = document.getElementById(`pts-${g.id}-${c.criterionId}`) as HTMLInputElement | null;
                    void actions.approveCriterion(g.id, c.criterionId, true, el?.value ?? "", note).then(() => loadGrades(assessmentId));
                  }}>Approve</Button>{" "}
                  <Button variant="ghost" size="sm" onClick={() => {
                    const el = document.getElementById(`pts-${g.id}-${c.criterionId}`) as HTMLInputElement | null;
                    void actions.approveCriterion(g.id, c.criterionId, false, el?.value ?? "", note).then(() => loadGrades(assessmentId));
                  }}>Revise</Button>
                </span>
              )}
            </div>
          ))}
        </div>
      ))}
      {isInstructor && (
        <input className="nv-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reviewer note applied to approvals/revisions…" />
      )}

      {/* History (append-only) */}
      {history && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 800 }}>Grade history — {history.assessment}: {history.total}/{history.max} {history.approved ? "✅" : "⏳"}</div>
          {history.evidence.map((e) => (
            <div key={e.criterionId} style={{ fontSize: 12, marginTop: 4 }}>
              <b>{e.label}</b> {e.points}/{e.max} · {e.reviewStatus.replace(/_/g, " ")}
              {e.location && <span> · at {e.location}</span>}
              {e.quote && <div style={{ color: "var(--nv-color-text-faint)" }}>“{e.quote.slice(0, 160)}” — {e.supports.slice(0, 120)}</div>}
              {e.reasoning && <div style={{ color: "var(--nv-color-text-faint)" }}>{e.reasoning.slice(0, 160)}</div>}
            </div>
          ))}
          <div style={{ marginTop: 6 }}><b>Audit trail:</b>
            {history.audits.map((a, i) => (
              <div key={i} style={{ fontSize: 12 }}>
                {a.action}: {a.previousScore ?? "—"} → {a.newScore ?? "—"} · {a.reason} · {a.actorId.slice(0, 8)} · notified {a.learnerNotified ? "yes" : "no"}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Learner explanation */}
      {explanation && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ whiteSpace: "pre-wrap" }}>{explanation.text}</div>
          {explanation.vagueFlags.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--nv-color-danger)" }}>Vague language flagged: {explanation.vagueFlags.join("; ")}</div>
          )}
        </div>
      )}

      {isInstructor && (
        <>
          {/* Blind queue */}
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 800 }}>🙈 Blind review queue (identity stripped)</span>
              <div style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => void actions.blindQueue().then((b) => setBlind(b))}>Load</Button>
            </div>
            {(blind ?? []).map((b) => (
              <div key={b.gradeId} style={{ fontSize: 12, marginTop: 4 }}>
                <b>{b.blindKey}</b> · {b.assessment} · {b.total}/{b.max} · uncertainty {Math.round(b.uncertainty * 100)}%
                {b.criteria.map((c) => <div key={c.criterionId} style={{ color: "var(--nv-color-text-faint)" }}>{c.label}: {c.points}/{c.max} — “{c.quote.slice(0, 100)}”</div>)}
              </div>
            ))}
          </div>

          {/* Calibration */}
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 800 }}>🎯 Calibration (criterion-level agreement)</span>
              <div style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => assessmentId && void actions.calibration(assessmentId).then((c) => setCal(c))}>Load</Button>
            </div>
            {cal && (
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Examples {cal.metrics.examples} (scored {cal.metrics.scored}) · exact {Math.round(cal.metrics.exactAgreement * 100)}% ·
                adjacent {Math.round(cal.metrics.adjacentAgreement * 100)}% · MAE {cal.metrics.meanAbsDifference} · overrides {cal.metrics.instructorOverrides}
                {Object.entries(cal.metrics.byCriterion).map(([k, v]) => (
                  <div key={k}>{k}: exact {Math.round(v.exact * 100)}% · MAE {v.meanAbs} (n={v.n})</div>
                ))}
                {cal.examples.slice(0, 5).map((e) => (
                  <div key={e.id} style={{ color: "var(--nv-color-text-faint)" }}>“{e.response.slice(0, 120)}” — {e.status}</div>
                ))}
              </div>
            )}
            <CalibrationForm assessmentId={assessmentId} criteria={assessment?.criteria ?? []} onSave={(fd) => void actions.saveCalibration(fd).then(() => { setCal(null); refresh(); })} />
          </div>

          {/* Regrade */}
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ fontWeight: 800 }}>🔁 Shadow regrade (compute first; decreases always need review)</div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <Button variant="secondary" size="sm" onClick={() => assessmentId && void actions.shadow(assessmentId).then((d) => setShadow(d))}>Run shadow</Button>
              {shadow && shadow.some((d) => d.delta > 0) && (
                <Button size="sm" onClick={() => assessmentId && void actions.applyRegrade(assessmentId, shadow.filter((d) => d.delta > 0).map((d) => d.gradeId)).then(() => { setShadow(null); loadGrades(assessmentId); })}>
                  Apply increases ({shadow.filter((d) => d.delta > 0).length})
                </Button>
              )}
            </div>
            {(shadow ?? []).filter((d) => d.delta !== 0).slice(0, 20).map((d) => (
              <div key={d.gradeId} style={{ fontSize: 12, marginTop: 2 }}>
                {d.userId.slice(0, 8)}: {d.oldScore} → <b>{d.newScore}</b> ({d.delta > 0 ? "+" : ""}{d.delta})
                {d.delta < 0 && <span style={{ color: "var(--nv-color-danger)" }}> — held for review</span>}
              </div>
            ))}
            {(shadow ?? []).length > 0 && shadow!.every((d) => d.delta === 0) && (
              <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No differences — rubric change affects nothing.</div>
            )}
          </div>

          {/* Fairness */}
          <div className="nv-card" style={{ fontSize: 13 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 800 }}>⚖️ Fairness audits (aggregate-only)</span>
              <div style={{ flex: 1 }} />
              <Button variant="secondary" size="sm" onClick={() => void actions.fairnessList(setId).then((f) => setFair(f))}>Load</Button>
            </div>
            {(fair ?? []).map((f) => (
              <div key={f.id} style={{ fontSize: 12, marginTop: 4 }}>
                <b>{f.dimension || f.scope}</b> · {f.status} — {f.finding.slice(0, 140)}
                <div style={{ color: "var(--nv-color-text-faint)" }}>
                  {f.groups.map((g) => `${g.name} n=${g.n}`).join(" · ")}
                </div>
                {f.status === "open" && (
                  <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                    <input className="nv-input" id={`fa-${f.id}`} placeholder="resolution action…" style={{ flex: 1 }} />
                    <Button variant="ghost" size="sm" onClick={() => {
                      const el = document.getElementById(`fa-${f.id}`) as HTMLInputElement | null;
                      void actions.fairnessResolve(f.id, "closed", el?.value ?? "").then(() => setFair(null));
                    }}>Resolve</Button>
                  </div>
                )}
              </div>
            ))}
            <details style={{ marginTop: 6 }}>
              <summary style={{ fontSize: 12, cursor: "pointer" }}>+ New fairness audit (pre-aggregated group stats only)</summary>
              <form action={(fd) => void actions.fairnessSave(fd).then(() => { setFair(null); refresh(); })} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", flexDirection: "column" }}>
                <input type="hidden" name="setId" value={setId} />
                <input className="nv-input" name="scope" placeholder="scope (e.g. oral explanation, response-language pathway)" required />
                <input className="nv-input" name="dimension" placeholder="criterion dimension" />
                <input className="nv-input" name="groups" placeholder='groups JSON: [{"name":"A","mean":0.7,"sd":0.1,"n":40},…] (n≥10 each)' required />
                <input className="nv-input" name="finding" placeholder="finding" />
                <Button size="sm" type="submit">Save audit</Button>
              </form>
            </details>
          </div>
        </>
      )}
    </div>
  );
}

function CalibrationForm({ assessmentId, criteria, onSave }: {
  assessmentId: string;
  criteria: { id: string; label: string }[];
  onSave: (fd: FormData) => void;
}) {
  return (
    <form action={onSave} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      <input type="hidden" name="assessmentId" value={assessmentId} />
      <textarea className="nv-input" name="response" rows={2} placeholder="Example learner response (include borderline/accessible variants)…" required />
      {criteria.map((c) => (
        <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
          <span style={{ width: 200 }}>{c.label}</span>
          <input className="nv-input" name={`s_${c.id}`} placeholder="instructor pts" style={{ width: 120 }} />
        </div>
      ))}
      <Button size="sm" type="submit">Save calibration example</Button>
    </form>
  );
}
