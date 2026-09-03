"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";
import { materialsToMarkdown, type MaterialsKind } from "./pure";
import { classifyContradiction } from "./epistemics";

export interface CockpitData {
  goal: string; nextAction: string; nextActionReason: string; difficulty: string;
  streakDays: number; mastery: number; conceptsTracked: number; dueReviews: number;
  recentScore: { score: number; total: number } | null;
  confidenceCalibration: { correct: number; wrong: number; overconfident: boolean };
  openQuestions: number;
}

export interface ClaimGroup {
  claimKey: string; claim: string;
  supports: { id: string; sourceTitle: string; quote: string; authority: number; locatorPage: number | null; epistemicState?: string; verificationLabel?: string; contentHash?: string; sourceVersion?: string }[];
  contradicts: { id: string; sourceTitle: string; quote: string; authority: number; epistemicState?: string; contentHash?: string; sourceVersion?: string }[];
  qualifies: { id: string; sourceTitle: string; quote: string; epistemicState?: string }[];
  hasDisagreement: boolean;
}

export interface V2Claim {
  id?: string; text: string; epistemicState: string; verificationLabel: string;
  confidence: number; weight: number; adequate: boolean;
  evidenceIds: string[]; qualifierFlags: string[]; reasons: string[];
}

export interface V2Answer {
  answerId: string | null; mode: string; answer: string;
  claims?: V2Claim[]; queryType?: string; hints?: string[];
  scores?: { claimCoverage: number; entailment: number; completeness: number; diversity: number; contradictionExposure: number; provenanceIntegrity: number; conflictingDetected: boolean } | null;
  versionsUsed?: Record<string, string>;
  disagreements?: number;
  trace?: { mode: string; queryType: string; policy?: unknown; retrievalReason: string; versionsUsed?: Record<string, string>; inferenceBoundary?: string[] | string; missingEvidence?: string[]; contradictoryEvidence?: string[] };
}

export interface PolicyData {
  approvedSources: string[]; restrictedSources: string[];
  requireTwoSources: boolean; requireCurrentVersion: boolean; requireHumanReview: boolean;
  examMode: boolean; allowedInferenceLevel: string; minCoverage: number;
  minIndependentSources: number; configured: boolean;
}

export interface ChallengeRow {
  id: string; evidenceId: string; category: string; reason: string;
  learnerNote: string; status: string;
  evidence: { claim: string; quote: string; sourceTitle: string };
}

const STATE_BADGE: Record<string, string> = {
  SOURCE_FACT: "📜 fact", SOURCE_SYNTHESIS: "🧩 synthesis", MODEL_INFERENCE: "💡 inference",
  SPECULATION: "🔮 speculative", LEARNER_CONTRIBUTION: "✍️ learner",
};

const LABEL_BADGE: Record<string, string> = {
  DIRECTLY_SUPPORTED: "✅ directly supported", QUALIFIED_SUPPORT: "⚠️ qualified support",
  SYNTHESIZED: "🧩 synthesized", REASONED_INFERENCE: "💡 reasoned inference",
  UNCERTAIN: "❓ uncertain", CONFLICTING: "⚡ conflicting evidence",
  NOT_FOUND: "⛔ not in sources", REQUIRES_REVIEW: "👩‍🏫 needs review",
};

export interface ConceptRow {
  id: string; key: string; label: string; kind: string;
  mastery?: number; misconceptionFlag?: boolean; nextReviewAt?: string;
}

export interface TutorSessionRow {
  id: string; mode: string; agent: string; status: string; summary: string;
  decisions?: { id: string; detectedIssue: string; chosenStrategy: string; confidence: number; learnerOverride: string }[];
}

export interface MemoryRow { id: string; scope: string; key: string; value: string; confidence: number; provenance: string; }
export interface AssessmentRow { id: string; title: string; description: string; criteria: { id: string; label: string; maxPoints: number; weight: number }[]; }
export interface GradeRow { id: string; totalPoints: number; maxPoints: number; explanation: string; approved: boolean; assessment?: { title: string }; }

const bar = (v: number) => ({ width: `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%` });

export function LearningCockpit({ cockpit, nextAction }: { cockpit: CockpitData | null; nextAction: { action: string; reason: string; strategy: string; confidence: number } | null }) {
  if (!cockpit && !nextAction) return null;
  return (
    <div className="nv-card" style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 800, fontSize: 14 }}>🎯 Learning cockpit</div>
      {cockpit && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
          <span>Mastery <b>{Math.round(cockpit.mastery * 100)}%</b></span>
          <span>Due reviews <b>{cockpit.dueReviews}</b></span>
          <span>Streak <b>{cockpit.streakDays}d</b></span>
          <span>Level <b>{cockpit.difficulty}</b></span>
          {cockpit.recentScore && <span>Last quiz <b>{cockpit.recentScore.score}/{cockpit.recentScore.total}</b></span>}
          {cockpit.confidenceCalibration.overconfident && <span style={{ color: "var(--nv-color-danger)" }}>⚠ overconfident on wrong answers</span>}
        </div>
      )}
      {cockpit && (
        <div style={{ height: 8, background: "var(--nv-color-border)", borderRadius: 4 }}>
          <div style={{ height: "100%", background: "var(--nv-color-success)", borderRadius: 4, ...bar(cockpit.mastery) }} />
        </div>
      )}
      {nextAction && (
        <div style={{ fontSize: 13, background: "var(--nv-color-surface-2, transparent)", borderRadius: 8, padding: 8 }}>
          <b>Recommended next:</b> {nextAction.action}
          <div style={{ color: "var(--nv-color-text-faint)", fontSize: 12 }}>Why: {nextAction.reason} (conf {Math.round(nextAction.confidence * 100)}% · {nextAction.strategy})</div>
        </div>
      )}
    </div>
  );
}

export function EvidencePanel({
  coverage, claims, showDisagreementsOnly, onToggleDisagreements,
  onAskV2, asking, answer, onAddCitation, onChallenge,
}: {
  coverage: { coverageScore: number; contradictionRate: number; totalClaims: number; supported: number } | null;
  claims: ClaimGroup[];
  showDisagreementsOnly: boolean;
  onToggleDisagreements: () => void;
  onAskV2: (q: string, mode: string) => void;
  asking: boolean;
  answer: V2Answer | null;
  onAddCitation: (fd: FormData) => void;
  onChallenge: (fd: FormData) => void;
}) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("GUIDED");
  const [showTrace, setShowTrace] = useState(false);
  const visible = showDisagreementsOnly ? claims.filter((c) => c.hasDisagreement) : claims;
  const scores = answer?.scores;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {coverage && (
        <div style={{ fontSize: 13, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>Evidence coverage <b>{Math.round(coverage.coverageScore * 100)}%</b></span>
          <span>Claims <b>{coverage.totalClaims}</b> · supported <b>{coverage.supported}</b></span>
          <span>Disagreement rate <b>{Math.round(coverage.contradictionRate * 100)}%</b></span>
          <button className="nv-link" style={{ fontSize: 12 }} onClick={onToggleDisagreements}>
            {showDisagreementsOnly ? "Show all claims" : "Show me the disagreement"}
          </button>
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) onAskV2(q.trim(), mode); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="nv-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask with citations — every claim verified, or refused" style={{ flex: 1, minWidth: 200 }} />
        <select className="nv-input" value={mode} onChange={(e) => setMode(e.target.value)} title="Hallucination-resistant mode">
          <option value="STRICT">Strict</option>
          <option value="GUIDED">Guided</option>
          <option value="EXPLORATORY">Exploratory</option>
          <option value="EXAM">Exam</option>
        </select>
        <Button size="sm" type="submit">Show me why</Button>
      </form>
      {answer && <V2AnswerView answer={answer} showTrace={showTrace} onToggleTrace={() => setShowTrace((v) => !v)} onChallenge={onChallenge} />}
      {visible.map((c) => (
        <DisagreementCard key={c.claimKey} group={c} onChallenge={onChallenge} />
      ))}
      {visible.length === 0 && <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)" }}>No citations yet — add the first claim below.</div>}
      <details>
        <summary style={{ fontSize: 13, cursor: "pointer" }}>+ Add citation (claim, quote, locator, evidence type, epistemic state)</summary>
        <form action={onAddCitation} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <input className="nv-input" name="claim" placeholder="Claim (e.g. Spaced repetition beats re-reading)" required />
          <input className="nv-input" name="quote" placeholder="Exact supporting quote from source" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="nv-input" name="sourceTitle" placeholder="Source title" />
            <input className="nv-input" name="locatorHeading" placeholder="Heading/section" />
            <input className="nv-input" name="locatorPage" type="number" placeholder="Page" style={{ width: 80 }} />
            <input className="nv-input" name="authority" type="number" min={0} max={100} defaultValue={50} style={{ width: 80 }} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select className="nv-input" name="evidenceType" defaultValue="CLAIM" title="Evidence type">
              <option value="DEFINITION">Definition</option>
              <option value="OBSERVATION">Observation</option>
              <option value="STATISTIC">Statistic</option>
              <option value="PROCEDURE">Procedure</option>
              <option value="OPINION">Opinion</option>
              <option value="CLAIM">Claim</option>
              <option value="EXAMPLE">Example</option>
            </select>
            <select className="nv-input" name="support" defaultValue="SUPPORTS">
              <option value="SUPPORTS">Supports</option>
              <option value="CONTRADICTS">Contradicts</option>
              <option value="QUALIFIES">Qualifies</option>
            </select>
            <select className="nv-input" name="epistemicState" defaultValue="SOURCE_FACT" title="Epistemic state">
              <option value="SOURCE_FACT">Source fact</option>
              <option value="SOURCE_SYNTHESIS">Source synthesis</option>
              <option value="LEARNER_CONTRIBUTION">Learner contribution</option>
            </select>
            <input className="nv-input" name="sourceType" placeholder="source type (textbook…)" defaultValue="note" style={{ width: 150 }} />
          </div>
          <Button size="sm" type="submit">Save citation</Button>
        </form>
      </details>
      {scores && (
        <div className="nv-card" style={{ fontSize: 12 }}>
          <b>Evidence quality</b> (indicator, not a truth score)
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
            <span>Claim coverage <b>{Math.round(scores.claimCoverage * 100)}%</b></span>
            <span>Direct support <b>{Math.round(scores.entailment * 100)}%</b></span>
            <span>Completeness <b>{Math.round(scores.completeness * 100)}%</b></span>
            <span>Diversity <b>{Math.round(scores.diversity * 100)}%</b></span>
            <span>Provenance <b>{Math.round(scores.provenanceIntegrity * 100)}%</b></span>
            <span>Conflicting evidence: <b>{scores.conflictingDetected ? "Yes" : "No"}</b></span>
          </div>
        </div>
      )}
    </div>
  );
}

function V2AnswerView({ answer, showTrace, onToggleTrace, onChallenge }: {
  answer: V2Answer; showTrace: boolean; onToggleTrace: () => void;
  onChallenge: (fd: FormData) => void;
}) {
  if (answer.mode === "refused") {
    return (
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>⛔ Refused (below the evidence bar)</div>
        <div style={{ whiteSpace: "pre-wrap" }}>{answer.answer}</div>
        {answer.trace && (
          <button className="nv-link" style={{ fontSize: 12, marginTop: 6 }} onClick={onToggleTrace}>
            {showTrace ? "Hide trace" : "Show me why"}
          </button>
        )}
        {showTrace && answer.trace && <TraceView trace={answer.trace} />}
      </div>
    );
  }
  if (answer.mode === "exam-hints") {
    return (
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>🎓 Exam mode — retrieval practice, not answers</div>
        {(answer.hints ?? []).map((h, i) => <div key={i} style={{ marginTop: 4 }}>• {h}</div>)}
      </div>
    );
  }
  return (
    <div className="nv-card" style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontWeight: 700 }}>✅ Grounded answer <span style={{ fontWeight: 400, fontSize: 12, color: "var(--nv-color-text-faint)" }}>· {answer.queryType} · {answer.mode.toLowerCase()} mode</span></div>
      <div style={{ whiteSpace: "pre-wrap" }}>{answer.answer}</div>
      {(answer.claims ?? []).map((c, i) => (
        <div key={c.id ?? i} style={{ borderLeft: "3px solid var(--nv-color-border)", paddingLeft: 8, fontSize: 12 }}>
          <div>{c.text}</div>
          <div style={{ color: "var(--nv-color-text-faint)", marginTop: 2 }}>
            {STATE_BADGE[c.epistemicState] ?? c.epistemicState} · {LABEL_BADGE[c.verificationLabel] ?? c.verificationLabel} · conf {Math.round(c.confidence * 100)}%
            {!c.adequate && " · ⚠️ below adequacy bar"}
          </div>
          {c.qualifierFlags.length > 0 && (
            <div style={{ color: "var(--nv-color-danger)", marginTop: 2 }}>Qualifier check: {c.qualifierFlags.join(" ")}</div>
          )}
          {c.reasons.slice(0, 2).map((r, j) => (
            <div key={j} style={{ color: "var(--nv-color-text-faint)" }}>↳ {r}</div>
          ))}
        </div>
      ))}
      <div>
        <button className="nv-link" style={{ fontSize: 12 }} onClick={onToggleTrace}>
          {showTrace ? "Hide explanation trace" : "Show me why (evidence trace)"}
        </button>
      </div>
      {showTrace && answer.trace && <TraceView trace={answer.trace} />}
      <ChallengeForm evidenceId={answer.claims?.[0]?.evidenceIds?.[0]} onChallenge={onChallenge} compact />
    </div>
  );
}

function TraceView({ trace }: { trace: NonNullable<V2Answer["trace"]> }) {
  const row = (label: string, value: unknown) => {
    if (value == null || (Array.isArray(value) && value.length === 0)) return null;
    const text = Array.isArray(value) ? value.join(" | ") : typeof value === "object" ? JSON.stringify(value) : String(value);
    if (!text) return null;
    return <div style={{ fontSize: 12, marginTop: 4 }}><b>{label}:</b> <span style={{ color: "var(--nv-color-text-faint)" }}>{text.slice(0, 600)}</span></div>;
  };
  return (
    <div style={{ background: "var(--nv-color-surface-2, transparent)", borderRadius: 8, padding: 8, marginTop: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 700 }}>Explanation trace (auditable, no hidden reasoning)</div>
      {row("Retrieval", trace.retrievalReason)}
      {row("Query type", trace.queryType)}
      {row("Source versions", trace.versionsUsed && Object.entries(trace.versionsUsed).map(([k, v]) => `${k}@${v}`))}
      {row("Inference boundary", trace.inferenceBoundary)}
      {row("Missing evidence", trace.missingEvidence)}
      {row("Contradictory evidence", trace.contradictoryEvidence)}
    </div>
  );
}

function ChallengeForm({ evidenceId, onChallenge, compact }: {
  evidenceId?: string; onChallenge: (fd: FormData) => void; compact?: boolean;
}) {
  if (!evidenceId) return null;
  return (
    <details style={{ marginTop: compact ? 4 : 8 }}>
      <summary style={{ fontSize: 12, cursor: "pointer" }}>Challenge this citation</summary>
      <form action={onChallenge} style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        <input type="hidden" name="evidenceId" value={evidenceId} />
        <select className="nv-input" name="category" defaultValue="NOT_SUPPORTED" style={{ width: 200 }}>
          <option value="NOT_SUPPORTED">Does not support claim</option>
          <option value="CORRELATION_NOT_CAUSATION">Correlation, not causation</option>
          <option value="LOST_QUALIFIER">Lost qualifier</option>
          <option value="WRONG_DOMAIN">Applied outside domain</option>
          <option value="EXTRACTION_ERROR">Extraction error</option>
          <option value="OUTDATED_SOURCE">Outdated source</option>
          <option value="OTHER">Other</option>
        </select>
        <input className="nv-input" name="reason" placeholder="Reason (required)" required style={{ flex: 1, minWidth: 160 }} />
        <Button size="sm" type="submit">Challenge</Button>
      </form>
    </details>
  );
}

function DisagreementCard({ group, onChallenge }: { group: ClaimGroup; onChallenge: (fd: FormData) => void }) {
  const [open, setOpen] = useState(false);
  const support = group.supports[0];
  const contra = group.contradicts[0];
  const kind = support && contra
    ? classifyContradiction(`${group.claim} ${support.quote}`, contra.quote, 0.9)
    : "unresolved";
  return (
    <div className="nv-card" style={{ fontSize: 13 }}>
      <div style={{ fontWeight: 700 }}>{group.claim} {group.hasDisagreement && <span style={{ color: "var(--nv-color-danger)" }}>⚡ disagreement ({kind.replace("_", " ")})</span>}</div>
      <div style={{ fontSize: 12 }}>✅ {group.supports.length} support · ⚡ {group.contradicts.length} contradict · 💬 {group.qualifies.length} qualify</div>
      {[...group.supports, ...group.contradicts].slice(0, 3).map((s) => (
        <div key={s.id} style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
          {(s.epistemicState && STATE_BADGE[s.epistemicState] ? `${STATE_BADGE[s.epistemicState]} ` : "")}“{s.quote.slice(0, 160)}” — {s.sourceTitle || "untitled"} (auth {s.authority})
          {s.contentHash ? " · #️⃣ hashed" : ""}
        </div>
      ))}
      {group.hasDisagreement && (
        <div style={{ marginTop: 6 }}>
          <button className="nv-link" style={{ fontSize: 12 }} onClick={() => setOpen((v) => !v)}>
            {open ? "Hide structured disagreement" : "Resolve the contradiction"}
          </button>
        </div>
      )}
      {open && group.hasDisagreement && (
        <div style={{ fontSize: 12, marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          <div><b>Issue:</b> {group.claim}</div>
          {support && <div><b>Position A:</b> {support.quote.slice(0, 200)} — {support.sourceTitle} (auth {support.authority})</div>}
          {contra && <div><b>Position B:</b> {contra.quote.slice(0, 200)} — {contra.sourceTitle} (auth {contra.authority})</div>}
          <div><b>Conditions:</b> compare population, time period, method, jurisdiction — classified as <b>{kind.replace("_", " ")}</b>, not necessarily direct contradiction.</div>
          <div><b>Learner task:</b> compare, evaluate, or defend a position using the cited spans.</div>
        </div>
      )}
      <ChallengeForm evidenceId={contra?.id ?? support?.id} onChallenge={onChallenge} />
    </div>
  );
}

export function GovernancePanel({
  policy, challenges, onUpsertPolicy, onResolveChallenge, onRunEval,
  evalResult, evalRunning,
}: {
  policy: PolicyData | null;
  challenges: ChallengeRow[];
  onUpsertPolicy: (fd: FormData) => void;
  onResolveChallenge: (fd: FormData) => void;
  onRunEval: () => void;
  evalResult: Record<string, unknown> | null;
  evalRunning: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>🏛 Source policy {policy?.configured ? "(configured)" : "(defaults — advisory)"}</div>
        <form action={onUpsertPolicy} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input className="nv-input" name="approvedSources" placeholder="Approved sources (comma-separated: textbook, instructor_notes…)" defaultValue={(policy?.approvedSources ?? []).join(", ")} />
          <input className="nv-input" name="restrictedSources" placeholder="Restricted sources (comma-separated)" defaultValue={(policy?.restrictedSources ?? []).join(", ")} />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12 }}>
            <label><input type="checkbox" name="requireTwoSources" defaultChecked={policy?.requireTwoSources} /> Require 2 independent sources</label>
            <label><input type="checkbox" name="requireCurrentVersion" defaultChecked={policy?.requireCurrentVersion} /> Require current version</label>
            <label><input type="checkbox" name="requireHumanReview" defaultChecked={policy?.requireHumanReview} /> Human review for high-stakes</label>
            <label><input type="checkbox" name="examMode" defaultChecked={policy?.examMode} /> Exam mode (hints, approved-only)</label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select className="nv-input" name="allowedInferenceLevel" defaultValue={policy?.allowedInferenceLevel ?? "marked"} title="Allowed inference level">
              <option value="none">Inference: none</option>
              <option value="marked">Inference: marked only</option>
              <option value="free">Inference: free</option>
            </select>
            <input className="nv-input" name="minCoverage" type="number" step="0.1" min={0} max={1} defaultValue={policy?.minCoverage ?? 0.5} title="Minimum claim coverage" style={{ width: 120 }} />
            <input className="nv-input" name="minIndependentSources" type="number" min={1} max={10} defaultValue={policy?.minIndependentSources ?? 1} title="Min independent sources" style={{ width: 120 }} />
          </div>
          <Button size="sm" type="submit">Save policy</Button>
        </form>
      </div>
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>⚖️ Evidence challenges ({challenges.filter((c) => c.status === "OPEN").length} open)</div>
        {challenges.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No challenges. Learners can dispute any citation.</div>}
        {challenges.slice(0, 20).map((ch) => (
          <div key={ch.id} style={{ fontSize: 12, borderTop: "1px solid var(--nv-color-border)", paddingTop: 6, marginTop: 6 }}>
            <div><b>{ch.category.replace(/_/g, " ")}</b> · {ch.status} — {ch.reason}</div>
            <div style={{ color: "var(--nv-color-text-faint)" }}>“{ch.evidence.quote.slice(0, 140)}” — {ch.evidence.sourceTitle}</div>
            {ch.learnerNote && <div style={{ color: "var(--nv-color-text-faint)" }}>Note: {ch.learnerNote}</div>}
            {ch.status === "OPEN" && (
              <form action={onResolveChallenge} style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <input type="hidden" name="challengeId" value={ch.id} />
                <Button variant="secondary" size="sm" type="submit" name="status" value="UPHELD">Uphold (citation stands)</Button>
                <Button variant="ghost" size="sm" type="submit" name="status" value="OVERTURNED">Overturn (citation falls)</Button>
              </form>
            )}
          </div>
        ))}
      </div>
      <div className="nv-card" style={{ fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>📊 Evaluation suite</div>
        <Button variant="secondary" size="sm" onClick={onRunEval} disabled={evalRunning}>{evalRunning ? "Computing…" : "Run evaluation"}</Button>
        <EvalView result={evalResult} />
      </div>
    </div>
  );
}

function EvalView({ result }: { result: Record<string, unknown> | null }) {
  const [showGaps, setShowGaps] = useState(false);
  if (!result) return <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)", marginTop: 6 }}>Retrieval, generation, learning & safety metrics computed from stored data.</div>;
  const section = (title: string, obj: unknown) => {
    const rec = obj as Record<string, number | string>;
    return (
      <div style={{ marginTop: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>{title}</div>
        {Object.entries(rec).filter(([, v]) => typeof v !== "object").map(([k, v]) => (
          <div key={k} style={{ fontSize: 12 }}>{k}: <b>{String(v)}</b></div>
        ))}
      </div>
    );
  };
  return (
    <div style={{ marginTop: 6 }}>
      {section("Retrieval", result.retrieval)}
      {section("Generation", result.generation)}
      {section("Learning", result.learning)}
      {section("Safety", result.safety)}
      <button className="nv-link" style={{ fontSize: 12, marginTop: 6 }} onClick={() => setShowGaps((v) => !v)}>
        {showGaps ? "Hide instrumentation gaps" : `Show instrumentation gaps (${((result.needsInstrumentation as string[]) ?? []).length})`}
      </button>
      {showGaps && ((result.needsInstrumentation as string[]) ?? []).map((g, i) => (
        <div key={i} style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>• {g}</div>
      ))}
    </div>
  );
}

export function ConceptsPanel({ concepts, onSeed, onRecord }: { concepts: ConceptRow[]; onSeed: () => void; onRecord: (fd: FormData) => void }) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 13, color: "var(--nv-color-text-faint)" }}>{concepts.length} concepts · misconceptions flagged first</span>
        <div style={{ flex: 1 }} />
        <Button variant="secondary" size="sm" onClick={onSeed}>⚡ Auto-seed from sources</Button>
      </div>
      {concepts.map((c) => (
        <div key={c.id} className="nv-card" style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
          <div style={{ flex: 1 }}>
            <b>{c.label}</b> <span style={{ color: "var(--nv-color-text-faint)", fontSize: 12 }}>· {c.kind.toLowerCase()} · {c.key}</span>
            {c.misconceptionFlag && <span style={{ color: "var(--nv-color-danger)" }}> ⚠ misconception</span>}
            {typeof c.mastery === "number" && (
              <div style={{ height: 6, background: "var(--nv-color-border)", borderRadius: 3, marginTop: 4 }}>
                <div style={{ height: "100%", background: c.misconceptionFlag ? "var(--nv-color-danger)" : "var(--nv-color-success)", borderRadius: 3, ...bar(c.mastery) }} />
              </div>
            )}
          </div>
          <form action={(fd) => { void onRecord(fd); }} style={{ display: "flex", gap: 4 }}>
            <input type="hidden" name="conceptId" value={c.id} />
            <Button variant="secondary" size="sm" type="submit" onClick={(e) => { const f = (e.target as HTMLElement).closest("form") as HTMLFormElement; const fd = new FormData(f); fd.set("correct", "true"); void onRecord(fd); void router.refresh(); e.preventDefault(); }}>✓</Button>
            <Button variant="ghost" size="sm" onClick={(e) => { const f = (e.target as HTMLElement).closest("form") as HTMLFormElement; const fd = new FormData(f); fd.set("correct", "false"); void onRecord(fd); void router.refresh(); e.preventDefault(); }}>✗</Button>
          </form>
        </div>
      ))}
      {concepts.length === 0 && <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)" }}>No concepts yet — seed from sources to build your knowledge graph.</div>}
    </div>
  );
}

export function TutorPanel({
  modes, sessions, memories, onStart, onRemember, onForget, onDecide,
}: {
  modes: string[];
  sessions: TutorSessionRow[];
  memories: MemoryRow[];
  onStart: (fd: FormData) => void;
  onRemember: (fd: FormData) => void;
  onForget: (fd: FormData) => void;
  onDecide: (fd: FormData) => void;
}) {
  const [mode, setMode] = useState("DIRECT");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <form action={onStart} style={{ display: "flex", gap: 8 }}>
        <select className="nv-input" name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          {modes.map((m) => <option key={m} value={m}>{m.toLowerCase().replace(/_/g, " ")}</option>)}
        </select>
        <Button size="sm" type="submit">Start session</Button>
      </form>
      {sessions.slice(0, 5).map((s) => (
        <div key={s.id} className="nv-card" style={{ fontSize: 13 }}>
          <b>{s.mode.toLowerCase()}</b> · {s.agent} · {s.status} — {s.summary || "no decisions yet"}
          {s.decisions?.map((d) => (
            <div key={d.id} style={{ fontSize: 12, marginTop: 4 }}>
              Issue: {d.detectedIssue} → <b>{d.chosenStrategy}</b> (conf {Math.round(d.confidence * 100)}%)
              {d.learnerOverride && <span> · override: {d.learnerOverride}</span>}
            </div>
          ))}
          <details style={{ marginTop: 4 }}>
            <summary style={{ fontSize: 12, cursor: "pointer" }}>Log pedagogical decision</summary>
            <form action={onDecide} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              <input type="hidden" name="sessionId" value={s.id} />
              <input className="nv-input" name="detectedIssue" placeholder="Detected learning issue" required />
              <input className="nv-input" name="chosenStrategy" placeholder="Chosen strategy (e.g. socratic hint, worked example)" required />
              <input className="nv-input" name="alternatives" placeholder="Alternatives considered" />
              <Button size="sm" type="submit">Log (explainable)</Button>
            </form>
          </details>
        </div>
      ))}
      <details>
        <summary style={{ fontSize: 13, cursor: "pointer" }}>🧠 Memory ({memories.length}) — inspect, correct, delete</summary>
        <form action={onRemember} style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input className="nv-input" name="key" placeholder="key" required style={{ width: 140 }} />
          <input className="nv-input" name="value" placeholder="value" required style={{ flex: 1 }} />
          <Button size="sm" type="submit">Remember</Button>
        </form>
        {memories.map((m) => (
          <div key={m.id} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <span>[{m.scope}] <b>{m.key}</b> = {m.value.slice(0, 120)} (conf {m.confidence})</span>
            <div style={{ flex: 1 }} />
            <form action={onForget}><input type="hidden" name="id" value={m.id} /><button className="nv-link" style={{ fontSize: 12, color: "var(--nv-color-danger)" }} type="submit">forget</button></form>
          </div>
        ))}
      </details>
    </div>
  );
}

export function BooklmEnhancements({ setId, cockpit, nextAction, coverage, claims, concepts, modes, sessions, memories, assessments, myGrades, isInstructor, dashboard, policy, challenges, actions }: {
  setId: string;
  cockpit: CockpitData | null;
  nextAction: { action: string; reason: string; strategy: string; confidence: number } | null;
  coverage: { coverageScore: number; contradictionRate: number; totalClaims: number; supported: number } | null;
  claims: ClaimGroup[];
  concepts: ConceptRow[];
  modes: string[];
  sessions: TutorSessionRow[];
  memories: MemoryRow[];
  assessments: AssessmentRow[];
  myGrades: GradeRow[];
  isInstructor: boolean;
  dashboard: { heatmap: { conceptId: string; label: string; avgMastery: number; learners: number; misconceptions: number; confused: boolean }[]; misconceptionClusters: { conceptKey: string; wrong: number }[]; attempts: number; avgScore: number; earlyWarnings: { userId: string; avgMastery: number; reason: string }[] } | null;
  policy: PolicyData | null;
  challenges: ChallengeRow[];
  actions: {
    ask: (setId: string, q: string) => Promise<{ mode: string; answer: string; segments?: { text: string; kind: string; itemTitle?: string }[] }>;
    askV2: (setId: string, q: string, mode: string) => Promise<unknown>;
    addCitation: (fd: FormData) => Promise<void>;
    challenge: (fd: FormData) => Promise<void>;
    resolveChallenge: (fd: FormData) => Promise<void>;
    upsertPolicy: (fd: FormData) => Promise<void>;
    getEval: (setId: string) => Promise<Record<string, unknown>>;
    seed: (fd: FormData) => Promise<void>;
    record: (fd: FormData) => Promise<void>;
    start: (fd: FormData) => Promise<void>;
    remember: (fd: FormData) => Promise<void>;
    forget: (fd: FormData) => Promise<void>;
    decide: (fd: FormData) => Promise<void>;
    createAssessment: (fd: FormData) => Promise<void>;
    grade: (fd: FormData) => Promise<void>;
    appeal: (fd: FormData) => Promise<void>;
    materials: (setId: string, kind: MaterialsKind) => Promise<unknown>;
  };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"evidence" | "concepts" | "tutor" | "grades" | "materials" | "insights" | "governance">("evidence");
  const [disOnly, setDisOnly] = useState(false);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<V2Answer | null>(null);
  const [evalResult, setEvalResult] = useState<Record<string, unknown> | null>(null);
  const [evalRunning, setEvalRunning] = useState(false);
  const fd2 = (extra?: Record<string, string>) => {
    const fd = new FormData();
    fd.set("setId", setId);
    if (extra) for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return fd;
  };
  const refresh = () => router.refresh();
  const tabs: { id: typeof tab; label: string }[] = [
    { id: "evidence", label: "📖 Evidence" },
    { id: "concepts", label: "🕸 Concepts" },
    { id: "tutor", label: "🤖 Tutor" },
    { id: "grades", label: "📝 Grades" },
    { id: "materials", label: "📦 Materials" },
    ...(isInstructor ? [{ id: "insights" as const, label: "📊 Insights" }] : []),
    ...(isInstructor ? [{ id: "governance" as const, label: "🏛 Governance" }] : []),
  ];
  return (
    <div style={{ maxWidth: 860, margin: "24px auto 0" }}>
      <LearningCockpit cockpit={cockpit} nextAction={nextAction} />
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <Button key={t.id} size="sm" variant={tab === t.id ? undefined : "secondary"} onClick={() => setTab(t.id)}>{t.label}</Button>
        ))}
      </div>
      {tab === "evidence" && (
        <EvidencePanel
          coverage={coverage} claims={claims}
          showDisagreementsOnly={disOnly} onToggleDisagreements={() => setDisOnly((v) => !v)}
          asking={asking} answer={answer}
          onAskV2={(q, m) => {
            setAsking(true);
            void actions.askV2(setId, q, m).then((a) => { setAnswer(a as V2Answer); setAsking(false); refresh(); })
              .catch(() => setAsking(false));
          }}
          onAddCitation={(fd) => { fd.set("setId", setId); void actions.addCitation(fd).then(refresh); }}
          onChallenge={(fd) => { fd.set("setId", setId); void actions.challenge(fd).then(refresh); }}
        />
      )}
      {tab === "governance" && isInstructor && (
        <GovernancePanel
          policy={policy} challenges={challenges}
          onUpsertPolicy={(fd) => { fd.set("setId", setId); void actions.upsertPolicy(fd).then(refresh); }}
          onResolveChallenge={(fd) => void actions.resolveChallenge(fd).then(refresh)}
          onRunEval={() => {
            setEvalRunning(true);
            void actions.getEval(setId).then((r) => { setEvalResult(r); setEvalRunning(false); })
              .catch(() => setEvalRunning(false));
          }}
          evalResult={evalResult} evalRunning={evalRunning}
        />
      )}
      {tab === "concepts" && (
        <ConceptsPanel concepts={concepts}
          onSeed={() => void actions.seed(fd2()).then(refresh)}
          onRecord={(fd) => { void actions.record(fd).then(refresh); }} />
      )}
      {tab === "tutor" && (
        <TutorPanel modes={modes} sessions={sessions} memories={memories}
          onStart={(fd) => { fd.set("setId", setId); void actions.start(fd).then(refresh); }}
          onRemember={(fd) => void actions.remember(fd).then(refresh)}
          onForget={(fd) => void actions.forget(fd).then(refresh)}
          onDecide={(fd) => void actions.decide(fd).then(refresh)} />
      )}
      {tab === "grades" && (
        <GradesPanel assessments={assessments} myGrades={myGrades} isInstructor={isInstructor}
          onCreateAssessment={(fd) => { fd.set("setId", setId); void actions.createAssessment(fd).then(refresh); }}
          onGrade={(fd) => void actions.grade(fd).then(refresh)}
          onAppeal={(fd) => void actions.appeal(fd).then(refresh)} />
      )}
      {tab === "materials" && (
        <MaterialsPanel setId={setId} onGenerate={actions.materials} />
      )}
      {tab === "insights" && dashboard && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
          <div>Attempts <b>{dashboard.attempts}</b> · avg score <b>{Math.round(dashboard.avgScore * 100)}%</b></div>
          {dashboard.heatmap.map((h) => (
            <div key={h.conceptId} className="nv-card" style={{ fontSize: 13 }}>
              <b>{h.label}</b> — mastery {Math.round(h.avgMastery * 100)}% · {h.learners} learners
              {h.confused && <span style={{ color: "var(--nv-color-danger)" }}> · confused</span>}
              {h.misconceptions > 0 && <span> · ⚠ {h.misconceptions} misconceptions</span>}
            </div>
          ))}
          {dashboard.misconceptionClusters.length > 0 && (
            <div className="nv-card" style={{ fontSize: 13 }}>
              <b>Misconception clusters</b>
              {dashboard.misconceptionClusters.map((m) => <div key={m.conceptKey} style={{ fontSize: 12 }}>{m.conceptKey}: {m.wrong} wrong answers</div>)}
            </div>
          )}
          {dashboard.earlyWarnings.map((w) => (
            <div key={w.userId} className="nv-card" style={{ fontSize: 13, borderColor: "var(--nv-color-danger)" }}>
              ⚠ Learner <code>{w.userId.slice(0, 8)}</code>: mastery {Math.round(w.avgMastery * 100)}% — {w.reason}
            </div>
          ))}
          {dashboard.earlyWarnings.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No early warnings. All tracked learners above thresholds.</div>}
        </div>
      )}
    </div>
  );
}
export type { MaterialsKind };

/** Study-material export: deterministic generation (no LLM) + markdown download. */
export function MaterialsPanel({
  setId, onGenerate,
}: {
  setId: string;
  onGenerate: (setId: string, kind: MaterialsKind) => Promise<unknown>;
}) {
  const [kind, setKind] = useState<MaterialsKind>("summary");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [copied, setCopied] = useState(false);

  const gen = (k: MaterialsKind) => {
    setKind(k);
    setLoading(true);
    setCopied(false);
    void onGenerate(setId, k)
      .then((d) => { setData(d as Record<string, any>); setLoading(false); })
      .catch(() => setLoading(false));
  };

  const md = useMemo(() => materialsToMarkdown(kind, data), [kind, data]);

  const download = () => {
    if (!md) return;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `booklm-${kind}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = () => {
    if (!md) return;
    void navigator.clipboard?.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => undefined);
  };

  const kinds: { id: MaterialsKind; label: string }[] = [
    { id: "summary", label: "📄 Summary" },
    { id: "glossary", label: "📖 Glossary" },
    { id: "flashcards", label: "🎴 Flashcards" },
    { id: "practice-test", label: "✏️ Practice test" },
    { id: "revision-sheet", label: "🗂 Revision sheet" },
    { id: "viva", label: "🎤 Viva questions" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {kinds.map((k) => (
          <Button key={k.id} size="sm" variant={kind === k.id && data ? undefined : "secondary"} onClick={() => gen(k.id)}>
            {k.label}
          </Button>
        ))}
      </div>
      {loading && <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)" }}>Generating from your sources…</div>}
      {!loading && !data && (
        <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)" }}>
          Generate study materials from this set's sources — summaries, glossaries, flashcards, practice tests, revision sheets, viva questions. Deterministic, works offline.
        </div>
      )}
      {!loading && data && (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={download}>⬇ Export .md</Button>
            <Button variant="ghost" size="sm" onClick={copy}>{copied ? "✓ Copied" : "⧉ Copy markdown"}</Button>
          </div>
          <MaterialsView kind={kind} data={data} />
        </>
      )}
    </div>
  );
}

function MaterialsView({ kind, data }: { kind: MaterialsKind; data: Record<string, any> }) {
  const font = { fontSize: 13, lineHeight: 1.6 } as const;
  if (kind === "summary") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(data.bullets ?? []).map((b: string, i: number) => (
          <div key={i} className="nv-card" style={font}>• {b}</div>
        ))}
        {data.coverage && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{data.coverage}</div>}
      </div>
    );
  }
  if (kind === "glossary") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(data.terms ?? []).map((t: { term: string; definition: string }) => (
          <div key={t.term} className="nv-card" style={font}><b>{t.term}</b> — {t.definition}</div>
        ))}
      </div>
    );
  }
  if (kind === "flashcards") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
        {(data.cards ?? []).map((c: { front: string; back: string; itemId: string }) => (
          <details key={c.itemId} className="nv-card" style={font}>
            <summary style={{ fontWeight: 700, cursor: "pointer" }}>{c.front}</summary>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{c.back}</div>
          </details>
        ))}
      </div>
    );
  }
  if (kind === "practice-test") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(data.questions ?? []).map((q: { id: string; type: string; prompt: string; referenceAnswer: string }) => (
          <div key={q.id} className="nv-card" style={font}>
            <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{q.id} · {q.type}</div>
            <div style={{ fontWeight: 700 }}>{q.prompt}</div>
            <details style={{ marginTop: 4 }}>
              <summary style={{ fontSize: 12, cursor: "pointer" }}>Reference answer</summary>
              <div style={{ fontSize: 12, marginTop: 4 }}>{q.referenceAnswer}</div>
            </details>
          </div>
        ))}
      </div>
    );
  }
  if (kind === "revision-sheet") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontWeight: 800, fontSize: 13 }}>Summary</div>
        {(data.summary?.bullets ?? []).map((b: string, i: number) => (
          <div key={i} className="nv-card" style={font}>• {b}</div>
        ))}
        <div style={{ fontWeight: 800, fontSize: 13, marginTop: 8 }}>Key terms</div>
        {(data.glossary ?? []).map((t: any, i: number) => (
          <div key={i} className="nv-card" style={font}>
            <b>{typeof t === "string" ? t : t.term}</b>{typeof t === "string" ? "" : ` — ${t.definition}`}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {(data.questions ?? []).map((q: string, i: number) => (
        <div key={i} className="nv-card" style={font}>🎤 {q}</div>
      ))}
    </div>
  );
}

export function GradesPanel({
  assessments, myGrades, isInstructor, onCreateAssessment, onGrade, onAppeal,
}: {
  assessments: AssessmentRow[];
  myGrades: GradeRow[];
  isInstructor: boolean;
  onCreateAssessment: (fd: FormData) => void;
  onGrade: (fd: FormData) => void;
  onAppeal: (fd: FormData) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {isInstructor && (
        <details>
          <summary style={{ fontSize: 13, cursor: "pointer" }}>+ New rubric assessment</summary>
          <form action={onCreateAssessment} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
            <input className="nv-input" name="title" placeholder="Assessment title" required />
            <input className="nv-input" name="criteria" placeholder="Criteria as label:maxPoints, e.g. Accuracy:10, Reasoning:10" required />
            <Button size="sm" type="submit">Create</Button>
          </form>
        </details>
      )}
      {assessments.map((a) => (
        <div key={a.id} className="nv-card" style={{ fontSize: 13 }}>
          <b>{a.title}</b>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{a.criteria.map((c) => `${c.label} (${c.maxPoints})`).join(" · ")}</div>
          {isInstructor && (
            <form action={onGrade} style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input type="hidden" name="assessmentId" value={a.id} />
              <input type="hidden" name="criterionId" value={a.criteria[0]?.id ?? ""} />
              <input className="nv-input" name="studentId" placeholder="student user id" required style={{ width: 160 }} />
              <input className="nv-input" name="points" type="number" step="0.5" placeholder="pts" required style={{ width: 80 }} />
              <input className="nv-input" name="reasoning" placeholder="criterion-level reasoning + quote" style={{ flex: 1 }} />
              <Button size="sm" type="submit">Grade</Button>
            </form>
          )}
        </div>
      ))}
      <div style={{ fontWeight: 700, fontSize: 13 }}>My grades</div>
      {myGrades.map((g) => (
        <div key={g.id} className="nv-card" style={{ fontSize: 13 }}>
          <b>{g.assessment?.title ?? "Assessment"}</b>: {g.totalPoints}/{g.maxPoints} {g.approved ? "✅ approved" : "⏳ pending review"}
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>{g.explanation}</div>
          <form action={onAppeal} style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <input type="hidden" name="gradeId" value={g.id} />
            <input className="nv-input" name="reason" placeholder="Appeal reason (transparent review)" style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" type="submit">Appeal</Button>
          </form>
        </div>
      ))}
      {myGrades.length === 0 && <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>No grades yet.</div>}
    </div>
  );
}
