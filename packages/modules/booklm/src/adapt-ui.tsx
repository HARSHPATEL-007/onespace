"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";
import type { GraphConcept } from "./graph-ui";
import { ExplanationCard, type DecisionCardData } from "./pedagogy-ui";

export interface AdaptActions {
  plan: (conceptId: string, setId: string, minutes: number) => Promise<AdaptPlan>;
  respond: (input: { loopId: string; correct: boolean; answer?: string; responseTimeMs?: number; hintsUsed?: number; confidence?: number; novelty?: number; overridden?: boolean; overrideReason?: string }) => Promise<{ gain: number; gainConfidence: number; scheduled: string }>;
  state: (conceptId: string) => Promise<AdaptState>;
  session: (setId: string, minutes: number) => Promise<{ planId: string; blocks: { name: string; minutes: number; detail: string; why: string }[]; rationale: string[] }>;
  sessionAccept: (planId: string, accepted: boolean, modification: string) => Promise<void>;
  due: () => Promise<RetrievalDue[]>;
  answerRetrieval: (itemKey: string, conceptId: string, correct: boolean) => Promise<unknown>;
  elaborate: (conceptId: string, text: string) => Promise<{ completeness: number; causalStructure: number; termUse: number; total: number }>;
  controls: () => Promise<Record<string, unknown>>;
  setControl: (control: string, value: unknown) => Promise<unknown>;
  interleave: (setId: string, level: "low" | "moderate" | "high") => Promise<{ sets: { conceptKey: string; label: string; count: number; kind: string }[]; comparisonItems: number; reason: string }>;
  override: (fd: FormData) => Promise<void>;
  decisionControl: (id: string, control: string, note: string, modifiedAction?: string) => Promise<unknown>;
  modalityEffects: (conceptId: string | null) => Promise<{ modality: string; trials: number; gainPerTrial: number; verdict: string; note: string }[]>;
  resetLevel: (conceptId: string) => Promise<{ reset: boolean; note: string }>;
  diagnose: (conceptId: string) => Promise<DiagnoseView>;
  loopHistory: (conceptId: string) => Promise<LoopRow[]>;
  diagnostic: (conceptId: string) => Promise<DiagnosticViewItem[]>;
  policy: (setId: string) => Promise<Record<string, unknown>>;
  policySave: (fd: FormData) => Promise<void>;
  overrides: (targetId?: string) => Promise<OverrideRow[]>;
  overrideDeactivate: (id: string) => Promise<void>;
}

export interface RemediationStageView { stage: string; action: string; retest: string | null }
export interface RepairOptionView { mode: string; blockers: string[]; minutes: number; tradeoff: string }

export interface AdaptPlan {
  loopId: string; decision: string; modality: string; difficultyLevel: number;
  difficultyLocked: boolean; ladder: string; evidence: string[]; alternatives: string[]; explanation: string[];
  decisionId?: string | null; decisionCard?: DecisionCardData | null;
  remediation?: RemediationStageView[] | null;
  repairOptions?: RepairOptionView[] | null;
}

export interface AdaptState {
  knowledge: Record<string, number>; behavior: Record<string, number | null | string>;
  context: Record<string, unknown>; status: string; uncertainty: number;
}

export interface RetrievalDue {
  itemKey: string; conceptId: string; format: string; stabilityDays: number; retrievability: number; nextDue: string;
}

export interface DiagnoseView {
  concept: { id: string; label: string; key: string }; status: string;
  errorType: string | null; remediation: { first: string; kind: string } | null;
  misconceptions: { id: string; statement: string; status: string }[];
  blockingPrerequisites: { id: string; label: string; mastery: number }[];
  softPrerequisites: { id: string; label: string; mastery: number | null; kind: string }[];
  transferGap: boolean;
}

export interface LoopRow {
  id: string; strategy: string; contentRef: string; evidence: string[]; alternatives: string[];
  response: unknown; learningGain: number | null; gainConfidence: number;
  overriddenById: string | null; overrideReason: string;
  modelVersion: string; policyVersion: string; createdAt: string;
}

export interface DiagnosticViewItem { kind: string; prompt: string }

export interface OverrideRow {
  id: string; kind: string; targetId: string; scope: string;
  reason: string; expiresAt: string | null; createdAt: string;
}

const CONTROLS: { id: string; label: string; hint: string }[] = [
  { id: "challenge", label: "Challenge me", hint: "more novelty, ambiguity, transfer distance" },
  { id: "explainSimply", label: "Explain simply", hint: "less jargon, shorter steps" },
  { id: "expertVersion", label: "Expert version", hint: "formalism, edge cases, disagreement" },
  { id: "tryFirst", label: "Let me try first", hint: "hide explanation until after an attempt" },
  { id: "noHints", label: "No hints", hint: "measure independent performance" },
  { id: "examFocus", label: "Focus on exam", hint: "optimize for approved outcomes + deadline" },
  { id: "masteryFocus", label: "Focus on mastery", hint: "prioritize retention and transfer" },
];

export function AdaptivePanel({ setId, concepts, actions, isInstructor }: {
  setId: string; concepts: GraphConcept[]; actions: AdaptActions; isInstructor: boolean;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const [conceptId, setConceptId] = useState(concepts[0]?.id ?? "");
  const [state, setState] = useState<AdaptState | null>(null);
  const [plan, setPlan] = useState<AdaptPlan | null>(null);
  const [gain, setGain] = useState<{ gain: number; gainConfidence: number; scheduled: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // respond form
  const [correct, setCorrect] = useState(true);
  const [answer, setAnswer] = useState("");
  const [hints, setHints] = useState("0");
  const [conf, setConf] = useState("0.7");
  const [overrideReason, setOverrideReason] = useState("");
  // session
  const [minutes, setMinutes] = useState("25");
  const [session, setSession] = useState<{ planId: string; blocks: { name: string; minutes: number; detail: string; why: string }[]; rationale: string[] } | null>(null);
  const [modification, setModification] = useState("");
  // retrieval
  const [due, setDue] = useState<RetrievalDue[] | null>(null);
  // elaboration
  const [elab, setElab] = useState("");
  const [elabScore, setElabScore] = useState<{ completeness: number; causalStructure: number; termUse: number; total: number } | null>(null);
  // controls
  const [prefs, setPrefs] = useState<Record<string, unknown> | null>(null);
  // interleave
  const [ilevel, setIlevel] = useState<"low" | "moderate" | "high">("moderate");
  const [iset, setIset] = useState<{ sets: { conceptKey: string; label: string; count: number; kind: string }[]; comparisonItems: number; reason: string } | null>(null);
  // modality effectiveness
  const [effects, setEffects] = useState<{ modality: string; trials: number; gainPerTrial: number; verdict: string; note: string }[] | null>(null);
  // diagnosis + diagnostic placement + loop audit
  const [diagnosis, setDiagnosis] = useState<DiagnoseView | null>(null);
  const [diagItems, setDiagItems] = useState<DiagnosticViewItem[] | null>(null);
  const [history, setHistory] = useState<LoopRow[] | null>(null);
  // instructor policy + overrides
  const [policy, setPolicy] = useState<Record<string, unknown> | null>(null);
  const [overrideRows, setOverrideRows] = useState<OverrideRow[] | null>(null);

  const loadState = (id: string) => {
    setConceptId(id);
    setPlan(null); setGain(null);
    setBusy(true);
    void actions.state(id).then((s) => { setState(s); setBusy(false); }).catch(() => setBusy(false));
  };

  const loadControls = () => {
    void actions.controls().then((p) => setPrefs(p)).catch(() => undefined);
  };
  if (prefs === null) loadControls();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* State vector */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🎛 Adaptive loop (observe → diagnose → intervene → measure)</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <select className="nv-input" value={conceptId} onChange={(e) => loadState(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
            {concepts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <Button variant="secondary" size="sm" onClick={() => conceptId && loadState(conceptId)}>{busy ? "…" : "Observe state"}</Button>
          <Button size="sm" onClick={() => {
            if (!conceptId) return;
            setBusy(true);
            void actions.plan(conceptId, setId, 25).then((p) => { setPlan(p); setGain(null); setBusy(false); }).catch(() => setBusy(false));
          }}>Plan intervention</Button>
        </div>
        {state && (
          <div style={{ marginTop: 8, fontSize: 12 }}>
            <div>Status <b>{state.status.toLowerCase().replace(/_/g, " ")}</b> · uncertainty {Math.round(state.uncertainty * 100)}% <span style={{ color: "var(--nv-color-text-faint)" }}>(estimates, not verdicts)</span></div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              {Object.entries(state.knowledge).map(([k, v]) => (
                <span key={k}>{k} <b>{Math.round((v as number) * 100)}%</b></span>
              ))}
            </div>
            <div style={{ color: "var(--nv-color-text-faint)", marginTop: 2 }}>
              accuracy {String(state.behavior.recentAccuracy)} · calibration error {String(state.behavior.confidenceCalibrationError)} · responses {String(state.behavior.evidenceResponses)}
              {typeof state.behavior.hintDependence === "number" ? ` · hints ${Math.round(state.behavior.hintDependence * 100)}%` : " · hints unmeasured"}
            </div>
            <div style={{ marginTop: 4 }}>
              <Button variant="ghost" size="sm" onClick={() => {
                if (!conceptId) return;
                if (!confirm("Clear the adaptive estimate for this topic? Diagnosis restarts clean.")) return;
                void actions.resetLevel(conceptId).then(() => loadState(conceptId));
              }}>Reset my level</Button>
            </div>
          </div>
        )}
      </div>

      {/* Decision explainer */}
      {plan && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 800 }}>Decision: {plan.decision}</div>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
            {plan.ladder} (level {plan.difficultyLevel}){plan.difficultyLocked ? " · locked by instructor" : ""} · via {plan.modality}
          </div>
          {plan.explanation.map((e, i) => <div key={i} style={{ fontSize: 12, marginTop: 2 }}>• {e}</div>)}
          <div style={{ fontSize: 12, marginTop: 4, color: "var(--nv-color-text-faint)" }}>
            Evidence: {plan.evidence.join(" · ") || "initial state"}
          </div>
          {plan.decisionCard && (
            <div style={{ marginTop: 8 }}>
              <ExplanationCard
                card={plan.decisionCard}
                onControl={(c, n, m) => actions.decisionControl(plan.decisionId!, c, n, m).then(() => refresh())}
              />
            </div>
          )}
          {plan.remediation && plan.remediation.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <b>Remediation path</b> (mechanism first, repetition never):
              {plan.remediation.map((s, i) => (
                <div key={i} style={{ marginTop: 2 }}>{i + 1}. <b>{s.stage.replace(/_/g, " ")}</b> — {s.action}{s.retest ? ` → re-test: ${s.retest.replace(/_/g, " ")}` : ""}</div>
              ))}
            </div>
          )}
          {plan.repairOptions && plan.repairOptions.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <b>Repair paths</b> (speed vs depth — your choice):
              {plan.repairOptions.map((r, i) => (
                <div key={i} style={{ marginTop: 2 }}>• <b>{r.mode.replace(/_/g, " ")}</b> — ~{r.minutes} min · {r.blockers.join(", ") || "no blockers"} · <i>{r.tradeoff}</i></div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}>
              <input type="checkbox" checked={correct} onChange={(e) => setCorrect(e.target.checked)} /> Correct response
            </label>
            <input className="nv-input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="answer / reasoning (for error diagnosis)" style={{ flex: 1, minWidth: 160 }} />
            <input className="nv-input" value={hints} onChange={(e) => setHints(e.target.value)} placeholder="hints" style={{ width: 70 }} />
            <input className="nv-input" value={conf} onChange={(e) => setConf(e.target.value)} placeholder="conf" style={{ width: 70 }} />
            <Button size="sm" onClick={() => {
              setBusy(true);
              void actions.respond({
                loopId: plan.loopId, correct, answer,
                hintsUsed: Number(hints) || 0, confidence: Number(conf) || 0.5,
                overridden: overrideReason.trim().length > 0, overrideReason: overrideReason.trim(),
              }).then((g) => { setGain(g); setBusy(false); refresh(); }).catch(() => setBusy(false));
            }}>Measure response</Button>
          </div>
          <input className="nv-input" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Override reason (optional — decisions stay reversible)" style={{ marginTop: 6 }} />
          {gain && (
            <div style={{ fontSize: 12, marginTop: 6 }}>
              Estimated gain <b>{gain.gain > 0 ? "+" : ""}{gain.gain}</b> (conf {Math.round(gain.gainConfidence * 100)}%) · {gain.scheduled}
            </div>
          )}
        </div>
      )}

      {/* Session planner */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>📋 Transparent session plan</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input className="nv-input" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="minutes" style={{ width: 90 }} />
          <Button variant="secondary" size="sm" onClick={() => {
            void actions.session(setId, Number(minutes) || 25).then((s) => setSession(s));
          }}>Generate plan</Button>
        </div>
        {session && (
          <div style={{ marginTop: 8, fontSize: 12 }}>
            {session.blocks.map((b, i) => (
              <div key={i} style={{ marginTop: 4 }}><b>{b.name} — {b.minutes} min</b><div>{b.detail}</div>
                <div style={{ color: "var(--nv-color-text-faint)" }}>Why: {b.why}</div></div>
            ))}
            <div style={{ color: "var(--nv-color-text-faint)", marginTop: 4 }}>Why this plan: {session.rationale.join(" ")}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <input className="nv-input" value={modification} onChange={(e) => setModification(e.target.value)} placeholder="Modify before starting (optional)" style={{ flex: 1, minWidth: 160 }} />
              <Button size="sm" onClick={() => void actions.sessionAccept(session.planId, true, modification).then(refresh)}>Accept</Button>
              <Button variant="ghost" size="sm" onClick={() => void actions.sessionAccept(session.planId, false, modification).then(refresh)}>Decline</Button>
            </div>
          </div>
        )}
      </div>

      {/* Retrieval due */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontWeight: 800 }}>🔁 Retrieval due</span>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" onClick={() => void actions.due().then((d) => setDue(d))}>Load due</Button>
        </div>
        {due && due.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Nothing due — retention on track.</div>}
        {due?.map((d) => (
          <div key={d.itemKey} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
            <span><b>{d.itemKey}</b> · {d.format} · stability {d.stabilityDays}d · retrievability {Math.round(d.retrievability * 100)}%</span>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" onClick={() => void actions.answerRetrieval(d.itemKey, d.conceptId, true).then(() => void actions.due().then(setDue))}>✓ recalled</Button>
            <Button variant="ghost" size="sm" onClick={() => void actions.answerRetrieval(d.itemKey, d.conceptId, false).then(() => void actions.due().then(setDue))}>✗ missed</Button>
          </div>
        ))}
      </div>

      {/* Elaboration */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>💬 Self-explanation (scored, not graded on style)</div>
        <textarea className="nv-input" value={elab} onChange={(e) => setElab(e.target.value)} rows={3} placeholder="Why does this work? What would change the result?" style={{ resize: "vertical" }} />
        <div style={{ marginTop: 6 }}>
          <Button variant="secondary" size="sm" onClick={() => {
            if (!conceptId || !elab.trim()) return;
            void actions.elaborate(conceptId, elab.trim()).then((s) => setElabScore(s));
          }}>Score explanation</Button>
        </div>
        {elabScore && (
          <div style={{ fontSize: 12, marginTop: 4 }}>
            completeness {Math.round(elabScore.completeness * 100)}% · causal structure {Math.round(elabScore.causalStructure * 100)}% · term use {Math.round(elabScore.termUse * 100)}% · <b>total {Math.round(elabScore.total * 100)}%</b>
          </div>
        )}
      </div>

      {/* Interleaving */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🔀 Purposeful interleaving</div>
        <div style={{ display: "flex", gap: 6 }}>
          <select className="nv-input" value={ilevel} onChange={(e) => setIlevel(e.target.value as "low" | "moderate" | "high")}>
            <option value="low">Low (acquisition)</option>
            <option value="moderate">Moderate (practice)</option>
            <option value="high">High (exam / transfer)</option>
          </select>
          <Button variant="secondary" size="sm" onClick={() => void actions.interleave(setId, ilevel).then((s) => setIset(s))}>Build set</Button>
        </div>
        {iset && (
          <div style={{ fontSize: 12, marginTop: 6 }}>
            <div style={{ color: "var(--nv-color-text-faint)" }}>{iset.reason}</div>
            {iset.sets.map((s, i) => <div key={i}>• {s.count}× {s.label} ({s.kind})</div>)}
            {iset.comparisonItems > 0 && <div>• 1× comparison question (confusable pair)</div>}
          </div>
        )}
      </div>

      {/* Diagnostic placement + error-mechanism diagnosis */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 800 }}>🩺 Diagnose first (mechanism before material)</span>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" onClick={() => {
            if (!conceptId) return;
            void actions.diagnostic(conceptId).then(setDiagItems).catch(() => undefined);
          }}>Placement items</Button>
          <Button variant="secondary" size="sm" onClick={() => {
            if (!conceptId) return;
            void actions.diagnose(conceptId).then(setDiagnosis).catch(() => undefined);
          }}>Diagnose</Button>
        </div>
        {diagItems && (
          <div style={{ fontSize: 12, marginTop: 4 }}>
            <div style={{ color: "var(--nv-color-text-faint)" }}>Short diagnostic — no penalty, establishes level + calibration:</div>
            {diagItems.map((d, i) => <div key={i} style={{ marginTop: 2 }}><b>{i + 1}. [{d.kind}]</b> {d.prompt}</div>)}
          </div>
        )}
        {diagnosis && (
          <div style={{ fontSize: 12, marginTop: 6 }}>
            <div>Status <b>{diagnosis.status.toLowerCase().replace(/_/g, " ")}</b>
              {diagnosis.errorType && <> · error mechanism: <b>{diagnosis.errorType}</b> → {diagnosis.remediation?.first}</>}
              {diagnosis.transferGap && <> · <b>transfer gap</b>: familiar items pass, novel contexts fail</>}
            </div>
            {diagnosis.blockingPrerequisites.length > 0 && (
              <div style={{ color: "var(--nv-color-danger)" }}>Hard blockers: {diagnosis.blockingPrerequisites.map((b) => `${b.label} (${Math.round(b.mastery * 100)}%)`).join(", ")}</div>
            )}
            {diagnosis.softPrerequisites.length > 0 && (
              <div style={{ color: "var(--nv-color-text-faint)" }}>Helpful context: {diagnosis.softPrerequisites.map((b) => b.label).join(", ")}</div>
            )}
            {diagnosis.misconceptions.length > 0 && (
              <div style={{ color: "var(--nv-color-text-faint)" }}>Active interpretations: {diagnosis.misconceptions.map((m) => `“${m.statement.slice(0, 80)}”`).join(" · ")}</div>
            )}
          </div>
        )}
      </div>

      {/* Loop audit trail */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontWeight: 800 }}>📜 Loop history (every intervention audited)</span>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" onClick={() => {
            if (!conceptId) return;
            void actions.loopHistory(conceptId).then(setHistory).catch(() => undefined);
          }}>Load</Button>
        </div>
        {(history ?? []).slice(0, 8).map((l) => (
          <div key={l.id} style={{ fontSize: 12, marginTop: 4, borderTop: "1px solid var(--nv-color-border)", paddingTop: 4 }}>
            <div><b>{l.strategy}</b> · gain {l.learningGain === null ? "pending" : `${l.learningGain > 0 ? "+" : ""}${l.learningGain} (conf ${Math.round(l.gainConfidence * 100)}%)`}</div>
            <div style={{ color: "var(--nv-color-text-faint)" }}>
              {new Date(l.createdAt).toLocaleString()} · {l.modelVersion} · {l.policyVersion}
              {l.overriddenById ? ` · overridden: ${l.overrideReason || "no reason given"}` : ""}
            </div>
          </div>
        ))}
        {history !== null && history.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No loops yet for this concept.</div>
        )}
      </div>

      {/* Strategy effectiveness */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontWeight: 800 }}>🧪 What works here (per concept, not a trait)</span>
          <div style={{ flex: 1 }} />
          <Button variant="secondary" size="sm" onClick={() => void actions.modalityEffects(conceptId || null).then(setEffects).catch(() => undefined)}>Load</Button>
        </div>
        {(effects ?? []).map((e) => (
          <div key={e.modality} style={{ fontSize: 12, marginTop: 2 }}>
            <b>{e.modality}</b> · {e.verdict} · gain/trial {e.gainPerTrial} · {e.trials} trial(s)
            <span style={{ color: "var(--nv-color-text-faint)" }}> — {e.note}</span>
          </div>
        ))}
        {effects !== null && effects.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No tracked trials yet — effects appear after repeated use.</div>
        )}
      </div>

      {/* Learner controls */}
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🎚 Your controls (every change reversible)</div>
        {CONTROLS.map((c) => (
          <label key={c.id} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
            <input type="checkbox" checked={!!prefs?.[c.id]} onChange={(e) => {
              void actions.setControl(c.id, e.target.checked).then(() => void actions.controls().then(setPrefs));
            }} />
            <span><b>{c.label}</b> <span style={{ color: "var(--nv-color-text-faint)" }}>— {c.hint}</span></span>
          </label>
        ))}
      </div>

      {/* Instructor overrides */}
      {isInstructor && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>👩‍🏫 Instructor override (reason + expiry recorded)</div>
          <form action={(fd) => void actions.override(fd).then(refresh)} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input type="hidden" name="setId" value={setId} />
            <input type="hidden" name="targetType" value="concept" />
            <input type="hidden" name="targetId" value={conceptId} />
            <select className="nv-input" name="kind" defaultValue="SET_LEVEL" style={{ width: 200 }}>
              <option value="SET_LEVEL">Set level</option>
              <option value="LOCK_DIFFICULTY">Lock difficulty</option>
              <option value="ASSIGN_REPAIR_PATH">Assign repair path</option>
              <option value="EXEMPT_CONCEPT">Exempt concept</option>
              <option value="FORCE_MODALITY">Force modality</option>
              <option value="PAUSE_PERSONALIZATION">Pause personalization</option>
              <option value="MARK_VERIFIED">Mark verified</option>
            </select>
            <input className="nv-input" name="reason" placeholder="reason (required)" required style={{ flex: 1, minWidth: 160 }} />
            <input className="nv-input" name="expiresInDays" placeholder="expires days" style={{ width: 110 }} />
            <Button size="sm" type="submit">Apply</Button>
          </form>
          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>Active overrides</span>
            <Button variant="secondary" size="sm" onClick={() => {
              void actions.overrides(conceptId || undefined).then(setOverrideRows).catch(() => undefined);
            }}>Refresh</Button>
          </div>
          {(overrideRows ?? []).map((o) => (
            <div key={o.id} style={{ fontSize: 12, marginTop: 4, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span><b>{o.kind.replace(/_/g, " ")}</b> · {o.scope.toLowerCase()} · {o.reason.slice(0, 80)}{o.expiresAt ? ` · expires ${new Date(o.expiresAt).toLocaleDateString()}` : " · no expiry"}</span>
              <div style={{ flex: 1 }} />
              <Button variant="ghost" size="sm" onClick={() => void actions.overrideDeactivate(o.id).then(() => void actions.overrides(conceptId || undefined).then(setOverrideRows))}>Revoke</Button>
            </div>
          ))}
          {overrideRows !== null && overrideRows.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginTop: 4 }}>No active overrides.</div>
          )}
        </div>
      )}

      {/* Instructor adaptive policy */}
      {isInstructor && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontWeight: 800 }}>📏 Adaptive policy (difficulty, hints, escalation)</span>
            <div style={{ flex: 1 }} />
            <Button variant="secondary" size="sm" onClick={() => void actions.policy(setId).then(setPolicy).catch(() => undefined)}>Load current</Button>
          </div>
          {policy && (
            <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
              difficulty {String(policy.difficultyMin)}–{String(policy.difficultyMax)} · prereq ≥ {String(policy.prereqThreshold)} ·
              hints ≤ {String(policy.hintLimit)} · target {Math.round(Number(policy.targetBand) * 100)}% ·
              escalation ≥ {String(policy.escalationThreshold)} · external {policy.externalAllowed ? "allowed" : "blocked"} ·
              high-stakes review {policy.highStakesReview ? "on" : "off"} · v{String(policy.version)}
            </div>
          )}
          <form action={(fd) => void actions.policySave(fd).then(() => void actions.policy(setId).then(setPolicy)).catch(() => undefined)} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <input type="hidden" name="setId" value={setId} />
            <label style={{ fontSize: 12 }}>Min <input className="nv-input" name="difficultyMin" defaultValue={String(policy?.difficultyMin ?? 0)} style={{ width: 60 }} /></label>
            <label style={{ fontSize: 12 }}>Max <input className="nv-input" name="difficultyMax" defaultValue={String(policy?.difficultyMax ?? 9)} style={{ width: 60 }} /></label>
            <label style={{ fontSize: 12 }}>Prereq <input className="nv-input" name="prereqThreshold" defaultValue={String(policy?.prereqThreshold ?? 0.4)} style={{ width: 70 }} /></label>
            <label style={{ fontSize: 12 }}>Hints <input className="nv-input" name="hintLimit" defaultValue={String(policy?.hintLimit ?? 3)} style={{ width: 60 }} /></label>
            <label style={{ fontSize: 12 }}>Target <input className="nv-input" name="targetBand" defaultValue={String(policy?.targetBand ?? 0.75)} style={{ width: 70 }} /></label>
            <label style={{ fontSize: 12 }}>Escalate ≥ <input className="nv-input" name="escalationThreshold" defaultValue={String(policy?.escalationThreshold ?? 3)} style={{ width: 60 }} /></label>
            <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" name="transferRequired" defaultChecked={policy?.transferRequired !== false} /> Transfer required</label>
            <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" name="externalAllowed" defaultChecked={policy?.externalAllowed !== false} /> External allowed</label>
            <label style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" name="highStakesReview" defaultChecked={policy?.highStakesReview === true} /> High-stakes review</label>
            <Button size="sm" type="submit">Save policy</Button>
          </form>
        </div>
      )}
    </div>
  );
}
