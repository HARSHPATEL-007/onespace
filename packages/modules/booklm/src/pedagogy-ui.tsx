"use client";

import { useState } from "react";
import { Button } from "@n0va/ui";

export interface DecisionCardData {
  id: string; status: string; title: string;
  detectedIssue: string; issueLabel: string;
  evidence: { text: string; at: string }[];
  strategy: { mode: string; action: string };
  alternatives: { strategy: string; bestIf: string; risks: string[] }[];
  expectedOutcome: { target: string; successTest: string };
  confidence: { overall: number; band: string; meaning: string; why: string };
  controls: string[];
}

export interface DecisionRow {
  id: string; trigger: string; issueType: string; issueDescription: string;
  severity: string; chosenMode: string; chosenAction: string;
  confOverall: number; status: string; createdAt: string;
  reviews: { predictedOutcome: string; observedOutcome: string; predictionError: string; effectiveness: number | null; nextAction: string }[];
}

export function ExplanationCard({ card, onControl }: {
  card: DecisionCardData;
  onControl: (control: string, note: string, modifiedAction?: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [modifyText, setModifyText] = useState("");
  const [modifying, setModifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const act = (control: string, modifiedAction = "") => {
    setBusy(true);
    void onControl(control, note, modifiedAction).then(() => setBusy(false)).catch(() => setBusy(false));
  };
  const pct = Math.round(card.confidence.overall * 100);
  return (
    <div className="nv-card" style={{ fontSize: 13 }}>
      <div style={{ fontWeight: 800 }}>### {card.title}</div>
      <div style={{ marginTop: 6 }}><b>Detected issue:</b> {card.detectedIssue}</div>
      <div style={{ marginTop: 4 }}><b>Evidence:</b>
        {card.evidence.length === 0 && <span style={{ color: "var(--nv-color-text-faint)" }}> limited — one diagnostic check first</span>}
        {card.evidence.slice(0, 5).map((e, i) => <div key={i} style={{ fontSize: 12 }}>- {e.text}</div>)}
      </div>
      <div style={{ marginTop: 4 }}><b>Recommended strategy:</b> {card.strategy.mode ? `${card.strategy.mode.toLowerCase().replace(/_/g, " ")} — ` : ""}{card.strategy.action}</div>
      {card.alternatives.length > 0 && (
        <details style={{ marginTop: 4 }}>
          <summary style={{ fontSize: 12, cursor: "pointer" }}>Other reasonable options ({card.alternatives.length})</summary>
          {card.alternatives.map((a, i) => (
            <div key={i} style={{ fontSize: 12, marginTop: 2 }}>
              <b>{i + 1}. {a.strategy.replace(/_/g, " ")}</b> — {a.bestIf}
              {a.risks.length > 0 && <span style={{ color: "var(--nv-color-text-faint)" }}> Risk: {a.risks.join("; ")}</span>}
            </div>
          ))}
        </details>
      )}
      <div style={{ marginTop: 4 }}><b>Expected outcome:</b> {card.expectedOutcome.target}</div>
      {card.expectedOutcome.successTest && (
        <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Success test: {card.expectedOutcome.successTest}</div>
      )}
      <div style={{ marginTop: 4 }}><b>Confidence:</b> {pct}% — {card.confidence.band} ({card.confidence.meaning})</div>
      <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{card.confidence.why}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <Button size="sm" disabled={busy} onClick={() => act("accept")}>Start</Button>
        <Button variant="secondary" size="sm" onClick={() => setModifying((v) => !v)}>Modify</Button>
        <Button variant="ghost" size="sm" onClick={() => act("reject", note)}>Reject</Button>
        <Button variant="ghost" size="sm" onClick={() => act("defer", note)}>Defer</Button>
        <Button variant="ghost" size="sm" onClick={() => act("ask_why")}>Ask why</Button>
        <Button variant="ghost" size="sm" onClick={() => act("ask_teacher", note)}>Ask teacher</Button>
      </div>
      <details style={{ marginTop: 6 }}>
        <summary style={{ fontSize: 12, cursor: "pointer" }}>More controls (pause, intensity, modality, corrections)</summary>
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          <Button variant="ghost" size="sm" onClick={() => act("pause_adaptation", note)}>Pause adaptation</Button>
          <Button variant="ghost" size="sm" onClick={() => act("change_intensity", note || "lower intensity")}>Lower intensity</Button>
          <Button variant="ghost" size="sm" onClick={() => act("change_modality", note || "different format")}>Change format</Button>
          <Button variant="ghost" size="sm" onClick={() => act("correct_issue", note)}>Correct the issue label</Button>
          <Button variant="ghost" size="sm" onClick={() => act("report_inaccurate", note)}>Report inaccurate explanation</Button>
          <Button variant="ghost" size="sm" onClick={() => act("dont_reuse_evidence", note)}>Don&apos;t reuse this evidence</Button>
        </div>
      </details>
      {modifying && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input className="nv-input" value={modifyText} onChange={(e) => setModifyText(e.target.value)} placeholder="Your modified strategy…" style={{ flex: 1 }} />
          <Button size="sm" onClick={() => act("modify", modifyText)}>Apply</Button>
        </div>
      )}
      <input className="nv-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for reject/defer/teacher (optional)" style={{ marginTop: 6 }} />
      <div style={{ fontSize: 11, color: "var(--nv-color-text-faint)", marginTop: 4 }}>
        Status: {card.status.toLowerCase().replace(/_/g, " ")} · rejection is preference evidence, never resistance.
      </div>
    </div>
  );
}

export function DecisionQueue({ decisions, onControl, onCard }: {
  decisions: DecisionRow[];
  onControl: (id: string, control: string, note: string) => Promise<void>;
  onCard: (id: string) => Promise<DecisionCardData>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<string, DecisionCardData>>({});
  const toggle = (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (!cards[id]) void onCard(id).then((c) => setCards((m) => ({ ...m, [id]: c }))).catch(() => undefined);
  };
  if (decisions.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)" }}>No interventions yet — every future one appears here with its evidence.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {decisions.map((d) => (
        <div key={d.id} className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span><b>{d.issueType.replace(/_/g, " ")}</b> · {d.chosenMode.toLowerCase().replace(/_/g, " ")}</span>
            <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{d.status.toLowerCase().replace(/_/g, " ")} · conf {Math.round(d.confOverall * 100)}%</span>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={() => toggle(d.id)}>{open === d.id ? "Hide" : "Explain"}</Button>
          </div>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{d.issueDescription.slice(0, 180)}</div>
          {d.reviews.length > 0 && (
            <div style={{ fontSize: 12, marginTop: 4 }}>
              Self-monitoring: predicted “{(d.reviews[d.reviews.length - 1]!.predictedOutcome || "").slice(0, 80)}” → observed “{(d.reviews[d.reviews.length - 1]!.observedOutcome || "").slice(0, 80)}”
              {d.reviews[d.reviews.length - 1]!.effectiveness != null && ` (effectiveness ${Math.round(d.reviews[d.reviews.length - 1]!.effectiveness! * 100)}%)`}
            </div>
          )}
          {open === d.id && cards[d.id] && (
            <div style={{ marginTop: 8 }}>
              <ExplanationCard card={cards[d.id]!} onControl={(c, n, m) => onControl(d.id, c, n)} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function EducatorDecisionPanel({ decision, reviews, onEducator }: {
  decision: {
    id: string; trigger: string; issueType: string; issueDescription: string; severity: string;
    evidence: { type: string; ref: string; result: string; context: string; at: string; invalid?: boolean }[];
    chosenMode: string; chosenAction: string;
    alternatives: { strategy: string; reasonNotSelected: string; risks: string[]; score?: number; factors?: { name: string; value: number }[] }[];
    expectedTarget: string; successMeasure: string;
    confOverall: number; confIssue: number; confStrategy: number; confOutcome: number;
    status: string; controlBy: string | null; controlNote: string; version: number;
    provenance: { agents?: string[]; stateSnapshot?: string; policySnapshot?: string } | null;
  };
  reviews: { predictedOutcome: string; observedOutcome: string; predictionError: string; effectiveness: number | null; nextAction: string; createdAt?: string }[];
  onEducator: (fd: FormData) => void;
}) {
  return (
    <div className="nv-card" style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontWeight: 800 }}>Decision {decision.id.slice(0, 8)} · v{decision.version} · {decision.status}</div>
      <div><b>Trigger:</b> {decision.trigger} · <b>Issue:</b> {decision.issueType.replace(/_/g, " ")} ({decision.severity})</div>
      <div>{decision.issueDescription}</div>
      <div><b>Evidence timeline:</b>
        {decision.evidence.map((e, i) => (
          <div key={i} style={{ fontSize: 12, textDecoration: e.invalid ? "line-through" : undefined }}>
            - [{e.type}] {e.ref}: {e.result} ({e.context}{e.at ? ` · ${e.at}` : ""}){e.invalid ? " — INVALID" : ""}
          </div>
        ))}
      </div>
      <div><b>Selected:</b> {decision.chosenMode} — {decision.chosenAction}</div>
      <div><b>Alternatives rejected:</b>
        {decision.alternatives.map((a, i) => (
          <div key={i} style={{ fontSize: 12 }}>
            - {a.strategy}: {a.reasonNotSelected || "no reason recorded"}
            {a.score !== undefined && ` (fit ${a.score})`}
            {a.factors && <span style={{ color: "var(--nv-color-text-faint)" }}> [{a.factors.map((f) => `${f.name} ${f.value}`).join(", ")}]</span>}
          </div>
        ))}
      </div>
      <div><b>Expected:</b> {decision.expectedTarget}</div>
      <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>Success test: {decision.successMeasure}</div>
      <div style={{ fontSize: 12 }}>Confidence: overall {Math.round(decision.confOverall * 100)}% (issue {Math.round(decision.confIssue * 100)} / strategy {Math.round(decision.confStrategy * 100)} / outcome {Math.round(decision.confOutcome * 100)})</div>
      <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
        Provenance: {(decision.provenance?.agents ?? []).join(", ")} · snapshot {decision.provenance?.stateSnapshot} · policy {decision.provenance?.policySnapshot}
      </div>
      {decision.controlBy && <div style={{ fontSize: 12 }}>Control by {decision.controlBy}: {decision.controlNote}</div>}
      {reviews.length > 0 && (
        <div><b>Self-monitoring (originals retained):</b>
          {reviews.map((r, i) => (
            <div key={i} style={{ fontSize: 12 }}>
              - predicted “{r.predictedOutcome.slice(0, 100)}” → observed “{r.observedOutcome.slice(0, 100)}”
              {r.predictionError && <span> · error: {r.predictionError}</span>}
              {r.effectiveness != null && <span> · effectiveness {Math.round(r.effectiveness * 100)}%</span>}
              {r.nextAction && <span> · next: {r.nextAction}</span>}
            </div>
          ))}
        </div>
      )}
      <form action={onEducator} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
        <input type="hidden" name="id" value={decision.id} />
        <select className="nv-input" name="control" defaultValue="approve" style={{ width: 190 }}>
          <option value="approve">Approve</option>
          <option value="reject">Reject</option>
          <option value="modify_strategy">Modify strategy</option>
          <option value="correct_issue">Correct issue</option>
          <option value="invalidate_evidence">Invalidate evidence</option>
          <option value="lock_strategy">Lock strategy</option>
          <option value="require_review">Require human review</option>
          <option value="block_inference">Block inference reuse</option>
          <option value="add_context">Add instructor context</option>
          <option value="override_progression">Override progression</option>
        </select>
        <input className="nv-input" name="note" placeholder="note (labeled with your authorship)" style={{ flex: 1, minWidth: 160 }} />
        <Button size="sm" type="submit">Apply</Button>
      </form>
    </div>
  );
}

export function DecisionMetricsView({ metrics }: {
  metrics: {
    decisions: number; completeRecordRate: number; byStatus: Record<string, number>;
    learnerControlRate: number; reviews: number; outcomeAttainment: number; avgEffectiveness: number;
  } | null;
}) {
  if (!metrics) return <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No decision data yet.</div>;
  return (
    <div style={{ fontSize: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
      <span>Decisions <b>{metrics.decisions}</b></span>
      <span>Complete records <b>{Math.round(metrics.completeRecordRate * 100)}%</b></span>
      <span>Learner-controlled <b>{Math.round(metrics.learnerControlRate * 100)}%</b></span>
      <span>Outcome attainment <b>{Math.round(metrics.outcomeAttainment * 100)}%</b></span>
      <span>Avg effectiveness <b>{Math.round(metrics.avgEffectiveness * 100)}%</b></span>
      <span>Reviews <b>{metrics.reviews}</b></span>
    </div>
  );
}

export interface GovernanceDecision {
  id: string; trigger: string; issueType: string; issueDescription: string;
  severity: string; chosenMode: string; chosenAction: string;
  confOverall: number; status: string; createdAt: string;
}

export function DecisionGovernance({ decisions, metrics, onDetail, onEducator }: {
  decisions: GovernanceDecision[];
  metrics: {
    decisions: number; completeRecordRate: number; byStatus: Record<string, number>;
    learnerControlRate: number; reviews: number; outcomeAttainment: number; avgEffectiveness: number;
  } | null;
  onDetail: (id: string) => Promise<{
    trigger: string; issueType: string; issueDescription: string; severity: string;
    evidence: { type: string; ref: string; result: string; context: string; at: string; invalid?: boolean }[];
    chosenMode: string; chosenAction: string;
    alternatives: { strategy: string; reasonNotSelected: string; risks: string[]; score?: number; factors?: { name: string; value: number }[] }[];
    expectedTarget: string; successMeasure: string;
    confOverall: number; confIssue: number; confStrategy: number; confOutcome: number;
    status: string; controlBy: string | null; controlNote: string; version: number;
    provenance: { agents?: string[]; stateSnapshot?: string; policySnapshot?: string } | null;
    reviews: { predictedOutcome: string; observedOutcome: string; predictionError: string; effectiveness: number | null; nextAction: string }[];
  }>;
  onEducator: (fd: FormData) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Parameters<typeof EducatorDecisionPanel>[0]["decision"] & { reviews: Parameters<typeof EducatorDecisionPanel>[0]["reviews"] }>>({});
  const toggle = (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (!details[id]) {
      void onDetail(id).then((d) => setDetails((m) => ({
        ...m,
        [id]: {
          id, trigger: d.trigger, issueType: d.issueType, issueDescription: d.issueDescription,
          severity: d.severity, evidence: d.evidence, chosenMode: d.chosenMode, chosenAction: d.chosenAction,
          alternatives: d.alternatives, expectedTarget: d.expectedTarget, successMeasure: d.successMeasure,
          confOverall: d.confOverall, confIssue: d.confIssue, confStrategy: d.confStrategy, confOutcome: d.confOutcome,
          status: d.status, controlBy: d.controlBy, controlNote: d.controlNote, version: d.version,
          provenance: d.provenance, reviews: d.reviews,
        },
      }))).catch(() => undefined);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <DecisionMetricsView metrics={metrics} />
      {decisions.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No pedagogical decisions recorded yet.</div>}
      {decisions.map((d) => (
        <div key={d.id} className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span><b>{d.issueType.replace(/_/g, " ")}</b> · {d.chosenMode.toLowerCase().replace(/_/g, " ")}</span>
            <span style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{d.status.toLowerCase().replace(/_/g, " ")} · conf {Math.round(d.confOverall * 100)}%</span>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={() => toggle(d.id)}>{open === d.id ? "Hide" : "Educator view"}</Button>
          </div>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{d.issueDescription.slice(0, 160)}</div>
          {open === d.id && details[d.id] && (
            <div style={{ marginTop: 8 }}>
              <EducatorDecisionPanel decision={details[d.id]!} reviews={details[d.id]!.reviews} onEducator={onEducator} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
