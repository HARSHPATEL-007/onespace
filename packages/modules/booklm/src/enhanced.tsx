"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@n0va/ui";

export interface CockpitData {
  goal: string; nextAction: string; nextActionReason: string; difficulty: string;
  streakDays: number; mastery: number; conceptsTracked: number; dueReviews: number;
  recentScore: { score: number; total: number } | null;
  confidenceCalibration: { correct: number; wrong: number; overconfident: boolean };
  openQuestions: number;
}

export interface ClaimGroup {
  claimKey: string; claim: string;
  supports: { id: string; sourceTitle: string; quote: string; authority: number; locatorPage: number | null }[];
  contradicts: { id: string; sourceTitle: string; quote: string; authority: number }[];
  qualifies: { id: string; sourceTitle: string; quote: string }[];
  hasDisagreement: boolean;
}

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
  coverage, claims, showDisagreementsOnly, onToggleDisagreements, onAsk, asking, answer, onAddCitation,
}: {
  coverage: { coverageScore: number; contradictionRate: number; totalClaims: number; supported: number } | null;
  claims: ClaimGroup[];
  showDisagreementsOnly: boolean;
  onToggleDisagreements: () => void;
  onAsk: (q: string) => void;
  asking: boolean;
  answer: { mode: string; answer: string; segments?: { text: string; kind: string; itemTitle?: string }[] } | null;
  onAddCitation: (fd: FormData) => void;
}) {
  const [q, setQ] = useState("");
  const visible = showDisagreementsOnly ? claims.filter((c) => c.hasDisagreement) : claims;
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
      <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) onAsk(q.trim()); }} style={{ display: "flex", gap: 8 }}>
        <input className="nv-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask with citations — e.g. What supports this claim?" style={{ flex: 1 }} />
        <Button size="sm" disabled={asking || !q.trim()} type="submit">{asking ? "…" : "Show me why"}</Button>
      </form>
      {answer && (
        <div className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{answer.mode === "refused" ? "⛔ Refused (no supporting source)" : "✅ Grounded answer"}</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{answer.answer}</div>
          {answer.segments?.map((s, i) => (
            <div key={i} style={{ fontSize: 12, color: s.kind === "source-fact" ? "var(--nv-color-success)" : "var(--nv-color-text-faint)" }}>
              [{s.kind}] {s.itemTitle ? `${s.itemTitle}: ` : ""}{s.text.slice(0, 140)}
            </div>
          ))}
        </div>
      )}
      {visible.map((c) => (
        <div key={c.claimKey} className="nv-card" style={{ fontSize: 13 }}>
          <div style={{ fontWeight: 700 }}>{c.claim} {c.hasDisagreement && <span style={{ color: "var(--nv-color-danger)" }}>⚡ disagreement</span>}</div>
          <div style={{ fontSize: 12 }}>✅ {c.supports.length} support · ⚡ {c.contradicts.length} contradict · 💬 {c.qualifies.length} qualify</div>
          {[...c.supports, ...c.contradicts].slice(0, 3).map((s) => (
            <div key={s.id} style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>“{s.quote.slice(0, 160)}” — {s.sourceTitle || "untitled"} (auth {s.authority})</div>
          ))}
        </div>
      ))}
      {visible.length === 0 && <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)" }}>No citations yet — add the first claim below.</div>}
      <details>
        <summary style={{ fontSize: 13, cursor: "pointer" }}>+ Add citation (claim, quote, page/paragraph, authority)</summary>
        <form action={onAddCitation} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <input className="nv-input" name="claim" placeholder="Claim (e.g. Spaced repetition beats re-reading)" required />
          <input className="nv-input" name="quote" placeholder="Supporting quote from source" />
          <div style={{ display: "flex", gap: 8 }}>
            <input className="nv-input" name="sourceTitle" placeholder="Source title" />
            <input className="nv-input" name="locatorPage" type="number" placeholder="Page" style={{ width: 90 }} />
            <input className="nv-input" name="authority" type="number" min={0} max={100} defaultValue={50} style={{ width: 90 }} />
            <select className="nv-input" name="support" defaultValue="SUPPORTS">
              <option value="SUPPORTS">Supports</option>
              <option value="CONTRADICTS">Contradicts</option>
              <option value="QUALIFIES">Qualifies</option>
            </select>
          </div>
          <Button size="sm" type="submit">Save citation</Button>
        </form>
      </details>
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

export function BooklmEnhancements({ setId, cockpit, nextAction, coverage, claims, concepts, modes, sessions, memories, assessments, myGrades, isInstructor, dashboard, actions }: {
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
  actions: {
    ask: (setId: string, q: string) => Promise<{ mode: string; answer: string; segments?: { text: string; kind: string; itemTitle?: string }[] }>;
    addCitation: (fd: FormData) => Promise<void>;
    seed: (fd: FormData) => Promise<void>;
    record: (fd: FormData) => Promise<void>;
    start: (fd: FormData) => Promise<void>;
    remember: (fd: FormData) => Promise<void>;
    forget: (fd: FormData) => Promise<void>;
    decide: (fd: FormData) => Promise<void>;
    createAssessment: (fd: FormData) => Promise<void>;
    grade: (fd: FormData) => Promise<void>;
    appeal: (fd: FormData) => Promise<void>;
  };
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"evidence" | "concepts" | "tutor" | "grades" | "insights">("evidence");
  const [disOnly, setDisOnly] = useState(false);
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{ mode: string; answer: string; segments?: { text: string; kind: string; itemTitle?: string }[] } | null>(null);
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
    ...(isInstructor ? [{ id: "insights" as const, label: "📊 Insights" }] : []),
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
          onAsk={(q) => { setAsking(true); void actions.ask(setId, q).then((a) => { setAnswer(a); setAsking(false); }); }}
          onAddCitation={(fd) => { fd.set("setId", setId); void actions.addCitation(fd).then(refresh); }}
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
