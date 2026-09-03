"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, Dropdown, MenuItem } from "@n0va/ui";
import type { LearningItem } from "@n0va/db";
import type { LearningSetWithItems, SourcePick } from "./server";
import { buildAttemptResponses } from "./pure";

export interface QuizAttemptInput {
  setId: string;
  mode?: "PRACTICE" | "EXAM" | "OPEN_BOOK" | "CLOSED_BOOK" | "ORAL";
  responses: { prompt: string; answer: string; picked: string; correct: boolean; responseTimeMs: number; confidence: number; conceptKey: string; itemId?: string }[];
  durationSec: number;
}

export interface LearningActions {
  create?: (formData: FormData) => Promise<string | void>;
  updateMeta: (formData: FormData) => Promise<void>;
  remove?: (formData: FormData) => Promise<void>;
  addItem: (formData: FormData) => Promise<void>;
  removeItem: (formData: FormData) => Promise<void>;
  moveItem: (formData: FormData) => Promise<void>;
  /** Persist a finished quiz attempt (feeds grades, spaced repetition, streaks). */
  recordAttempt?: (input: QuizAttemptInput) => Promise<{ score: number; total: number } | void>;
}

export function LearningSets({ sets, actions }: { sets: LearningSetWithItems[]; actions: LearningActions }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "var(--nv-space-5)" }}>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>BOOKLM EDUCATION</h1>
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => setCreating(true)}>+ New set</Button>
      </div>

      {sets.length === 0 ? (
        <div className="nv-empty" style={{ minHeight: 280 }}>
          <div>No learning sets yet</div>
          <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>Create one</Button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "var(--nv-space-3)" }}>
          {sets.map((s) => (
            <div key={s.id} className="nv-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <span style={{ fontWeight: 800 }}>📚 {s.title}</span>
              <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)", minHeight: 34 }}>{s.description || "No description"}</div>
              <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
                {s.items.length} source{s.items.length === 1 ? "" : "s"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={`/m/booklm/${s.id}`} style={{ textDecoration: "none", flex: 1 }}>
                  <Button style={{ width: "100%" }}>Open</Button>
                </a>
                <Dropdown
                  trigger={
                    <Button variant="ghost" size="sm">⋯</Button>
                  }
                >
                  <MenuItem
                    danger
                    onSelect={() => {
                      const fd = new FormData();
                      fd.set("setId", s.id);
                      void actions.remove?.(fd).then(() => router.refresh());
                    }}
                  >
                    Delete set
                  </MenuItem>
                </Dropdown>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="New learning set"
        actions={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" form="create-set-form">Create</Button>
          </>
        }
      >
        <form
          id="create-set-form"
          action={(fd) => {
            void actions.create?.(fd).then((id) => {
              setCreating(false);
              if (id) router.push(`/m/booklm/${id}`);
            });
          }}
          style={{ minWidth: 320, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input className="nv-input" name="title" placeholder="e.g. Algebra basics" autoFocus required />
          <input className="nv-input" name="description" placeholder="What will you learn? (optional)" />
        </form>
      </Dialog>
    </div>
  );
}

const KIND_ICON: Record<LearningItem["kind"], string> = { DOC: "📄", VIDEO: "🎬", LINK: "🔗", NOTE: "📝" };

type QuizQuestion = {
  prompt: string;
  answer: string;
  options: string[];
  itemId: string;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function firstSentence(text: string): string {
  const match = text.trim().match(/^[^.!?\n]+[.!?]?/);
  return match ? match[0]! : text.trim();
}

function answerFor(item: LearningItem): string {
  const t = item.notes.trim() ? firstSentence(item.notes) : item.title.trim();
  return t.length > 160 ? `${t.slice(0, 160).trimEnd()}…` : t;
}

function questionPrompt(item: LearningItem): string {
  const title = item.title.trim();
  const generic =
    title.length < 8 || (item.source !== "" && title === item.source);
  if (generic && item.notes.trim()) return firstSentence(item.notes);
  return title;
}

function buildQuiz(items: LearningItem[]): QuizQuestion[] {
  const pool = items.slice(0, 8);
  return pool.map((item) => {
    const answer = answerFor(item);
    const distractors: string[] = [];
    for (const other of shuffle(pool.filter((o) => o.id !== item.id))) {
      if (distractors.length === 3) break;
      const cand = answerFor(other);
      if (cand === answer || distractors.includes(cand)) continue;
      distractors.push(cand);
    }
    return { prompt: questionPrompt(item), answer, options: shuffle([answer, ...distractors]), itemId: item.id };
  });
}

export function LearningSetView({
  set,
  docPicks,
  videoPicks,
  actions,
}: {
  set: LearningSetWithItems;
  docPicks: SourcePick[];
  videoPicks: SourcePick[];
  actions: LearningActions;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<LearningItem["kind"]>("LINK");
  const [study, setStudy] = useState(false);
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [quizIndex, setQuizIndex] = useState(0);
  const [pick, setPick] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [quizResult, setQuizResult] = useState(false);
  const [quizNotice, setQuizNotice] = useState(false);
  // Attempt telemetry: per-question timing + answers, persisted on completion
  // so grades, spaced repetition, and streaks update even for self-study quizzes.
  const quizMeta = useRef<{
    startedAt: number; qStart: number;
    answers: Record<number, { picked: string; correct: boolean; ms: number }>;
  }>({ startedAt: 0, qStart: 0, answers: {} });

  const addForm = useMemo(() => {
    if (adding) {
      return (
        <form
          id="add-item-form"
          action={(fd) => {
            void actions.addItem(fd).then(() => {
              setAdding(false);
              router.refresh();
            });
          }}
          style={{ minWidth: 360, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input type="hidden" name="setId" value={set.id} />
          <select className="nv-input" name="kind" value={kind} onChange={(e) => setKind(e.target.value as LearningItem["kind"])}>
            <option value="LINK">Link</option>
            <option value="DOC">From a doc</option>
            <option value="VIDEO">From a video</option>
            <option value="NOTE">Note</option>
          </select>
          {kind === "DOC" && (
            <select className="nv-input" name="refId" defaultValue="">
              <option value="" disabled>Pick a doc…</option>
              {docPicks.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          )}
          {kind === "VIDEO" && (
            <select className="nv-input" name="refId" defaultValue="">
              <option value="" disabled>Pick a video…</option>
              {videoPicks.map((v) => (
                <option key={v.id} value={v.id}>{v.title}</option>
              ))}
            </select>
          )}
          <input className="nv-input" name="title" placeholder="Title" required />
          {kind === "LINK" && <input className="nv-input" name="source" placeholder="https://…" />}
          <textarea className="nv-input" name="notes" rows={3} placeholder="What should you remember?" style={{ resize: "vertical" }} />
        </form>
      );
    }
    return null;
  }, [adding, kind, set.id, docPicks, videoPicks, actions]); // eslint-disable-line react-hooks/exhaustive-deps

  const studyDeck = set.items.filter((i) => i.title || i.notes);
  const card = studyDeck[cardIndex];
  const q = quiz ? quiz[quizIndex] : undefined;
  const quizAnswered = pick !== null;
  const quizCorrectIdx = quizAnswered && q ? q.options.indexOf(q.answer) : -1;

  const exitQuiz = () => {
    setQuiz(null);
    setQuizIndex(0);
    setPick(null);
    setQuizScore(0);
    setQuizResult(false);
    setQuizNotice(false);
  };

  const beginQuiz = (questions: QuizQuestion[]) => {
    quizMeta.current = { startedAt: Date.now(), qStart: Date.now(), answers: {} };
    setQuiz(questions);
    setQuizIndex(0);
    setPick(null);
    setQuizScore(0);
    setQuizResult(false);
    setQuizNotice(false);
  };

  const answerCurrent = (optIdx: number) => {
    if (!q) return;
    const ms = Date.now() - quizMeta.current.qStart;
    const correct = optIdx === q.options.indexOf(q.answer);
    quizMeta.current.answers[quizIndex] = { picked: q.options[optIdx] ?? "", correct, ms };
    setPick(optIdx);
    if (correct) setQuizScore((s) => s + 1);
  };

  const advanceQuiz = () => {
    if (!quiz) return;
    if (quizIndex >= quiz.length - 1) {
      // Persist the attempt: feeds assessment history, SM-2 scheduling, streaks.
      const meta = quizMeta.current;
      const durationSec = Math.max(0, Math.round((Date.now() - meta.startedAt) / 1000));
      const responses = buildAttemptResponses(quiz, meta.answers);
      if (actions.recordAttempt) {
        void actions.recordAttempt({ setId: set.id, mode: "PRACTICE", responses, durationSec })
          .then(() => router.refresh())
          .catch(() => undefined);
      }
      setQuizResult(true);
    } else {
      setQuizIndex((i) => i + 1);
      setPick(null);
      quizMeta.current.qStart = Date.now();
    }
  };

  const retryQuiz = () => {
    const cur = quiz;
    quizMeta.current = { startedAt: Date.now(), qStart: Date.now(), answers: {} };
    setQuiz((cur2) => (cur2 ? shuffle(cur2.map((x) => ({ ...x, options: shuffle(x.options) }))) : cur2));
    void cur;
    setQuizIndex(0);
    setPick(null);
    setQuizScore(0);
    setQuizResult(false);
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--nv-space-4)", flexWrap: "wrap" }}>
        <a href="/m/booklm" className="nv-link" style={{ fontSize: "var(--nv-font-sm)" }}>← All sets</a>
        <h1 style={{ fontSize: "var(--nv-font-xl)", fontWeight: 800 }}>{set.title}</h1>
        <div style={{ flex: 1 }} />
        {studyDeck.length > 1 && (
          <Button variant="secondary" size="sm" onClick={() => { setStudy(true); setCardIndex(0); setFlipped(false); setQuiz(null); setQuizNotice(false); }}>
            🎴 Study mode
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => {
          setStudy(false);
          if (set.items.length < 4) {
            setQuiz(null);
            setQuizNotice(true);
            return;
          }
          beginQuiz(buildQuiz(set.items));
        }}>
          🧠 Quiz
        </Button>
        <Button size="sm" onClick={() => setAdding(true)}>+ Add source</Button>
      </div>
      <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)", marginBottom: "var(--nv-space-4)" }}>{set.description}</div>

      {study ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--nv-space-4)", minHeight: 380 }}>
          <div
            onClick={() => setFlipped((f) => !f)}
            style={{
              width: 420,
              minHeight: 240,
              maxWidth: "100%",
              background: "var(--nv-color-surface)",
              border: "1px solid var(--nv-color-border)",
              borderRadius: "var(--nv-radius-lg)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              fontSize: 18,
              textAlign: "center",
              fontWeight: flipped ? 400 : 700,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {flipped ? card?.notes || "No notes on the back — flip again!" : card?.title}
          </div>
          <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
            {cardIndex + 1} / {studyDeck.length} · click the card to flip
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="secondary" size="sm" disabled={cardIndex === 0} onClick={() => { setCardIndex((i) => i - 1); setFlipped(false); }}>← Previous</Button>
            <Button variant="ghost" size="sm" onClick={() => { setStudy(false); setFlipped(false); }}>Exit</Button>
            <Button variant="secondary" size="sm" disabled={cardIndex >= studyDeck.length - 1} onClick={() => { setCardIndex((i) => i + 1); setFlipped(false); }}>Next →</Button>
          </div>
        </div>
      ) : quizNotice ? (
        <div className="nv-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 48, minHeight: 380 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Add at least 4 items to take a quiz.</div>
          <Button variant="ghost" size="sm" onClick={() => setQuizNotice(false)}>Exit</Button>
        </div>
      ) : quiz && q ? (
        quizResult ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "var(--nv-space-3)", minHeight: 380 }}>
            <div style={{ fontSize: 32, fontWeight: 900 }}>{quizScore} / {quiz.length}</div>
            <div style={{ fontSize: 15, color: "var(--nv-color-text-faint)" }}>
              {Math.round((quizScore / quiz.length) * 100)}% ·{" "}
              {quizScore / quiz.length >= 0.7 ? "Nice work!" : quizScore / quiz.length >= 0.4 ? "Keep practicing." : "Review the set and try again."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="secondary" size="sm" onClick={retryQuiz}>↻ Retry</Button>
              <Button variant="ghost" size="sm" onClick={exitQuiz}>Exit</Button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--nv-space-4)", minHeight: 380 }}>
            <div style={{ fontSize: 12, color: "var(--nv-color-text-faint)" }}>
              Question {quizIndex + 1} / {quiz.length} · Score {quizScore}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{q.prompt}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {q.options.map((opt, i) => {
                const isCorrect = i === quizCorrectIdx;
                const isPicked = i === pick;
                return (
                  <button
                    key={opt}
                    disabled={quizAnswered}
                    onClick={() => {
                      if (pick !== null) return;
                      answerCurrent(i);
                    }}
                    style={{
                      textAlign: "left",
                      padding: "12px 16px",
                      borderRadius: "var(--nv-radius-md)",
                      border: quizAnswered
                        ? `2px solid ${isCorrect ? "var(--nv-color-success)" : isPicked ? "var(--nv-color-danger)" : "var(--nv-color-border)"}`
                        : "1px solid var(--nv-color-border)",
                      background: "var(--nv-color-surface)",
                      cursor: quizAnswered ? "default" : "pointer",
                      fontSize: 14,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      opacity: quizAnswered && !isCorrect && !isPicked ? 0.45 : 1,
                      color: quizAnswered && (isCorrect || isPicked) ? (isCorrect ? "var(--nv-color-success)" : "var(--nv-color-danger)") : undefined,
                      fontWeight: quizAnswered && (isCorrect || isPicked) ? 700 : 400,
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {quizAnswered && (
              <div style={{ fontSize: 13 }}>
                {pick === quizCorrectIdx ? (
                  <span style={{ color: "var(--nv-color-success)", fontWeight: 600 }}>Correct!</span>
                ) : (
                  <span style={{ color: "var(--nv-color-danger)", fontWeight: 600 }}>Not quite — the answer is “{q.answer}”</span>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <Button variant="ghost" size="sm" onClick={exitQuiz}>Exit</Button>
              {quizAnswered && (
                <Button variant="secondary" size="sm" onClick={advanceQuiz}>
                  {quizIndex >= quiz.length - 1 ? "See results" : "Next →"}
                </Button>
              )}
            </div>
          </div>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {set.items.length === 0 && <div className="nv-empty" style={{ minHeight: 200 }}><div>No sources yet — add a doc, video, link or note.</div></div>}
          {set.items.map((item, idx) => (
            <div key={item.id} className="nv-card" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 20 }}>{KIND_ICON[item.kind]}</span>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ fontWeight: 700 }}>
                  {item.kind === "DOC" && item.refId ? (
                    <a className="nv-link" href={`/m/docs/${item.refId}`}>{item.title}</a>
                  ) : item.kind === "VIDEO" && item.refId ? (
                    <a className="nv-link" href={`/m/videos/${item.refId}`}>{item.title}</a>
                  ) : item.kind === "LINK" && item.source ? (
                    <a className="nv-link" href={item.source} target="_blank" rel="noreferrer">{item.title} ↗</a>
                  ) : (
                    item.title
                  )}
                </div>
                {item.notes && <div style={{ fontSize: 13, color: "var(--nv-color-text-faint)", whiteSpace: "pre-wrap" }}>{item.notes}</div>}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="nv-link" style={{ fontSize: 12 }} disabled={idx === 0} onClick={() => { const fd = new FormData(); fd.set("setId", set.id); fd.set("itemId", item.id); fd.set("dir", "up"); void actions.moveItem(fd).then(() => router.refresh()); }}>↑</button>
                <button className="nv-link" style={{ fontSize: 12 }} disabled={idx === set.items.length - 1} onClick={() => { const fd = new FormData(); fd.set("setId", set.id); fd.set("itemId", item.id); fd.set("dir", "down"); void actions.moveItem(fd).then(() => router.refresh()); }}>↓</button>
                <button className="nv-link" style={{ fontSize: 12, color: "var(--nv-color-danger)" }} onClick={() => { const fd = new FormData(); fd.set("setId", set.id); fd.set("itemId", item.id); void actions.removeItem(fd).then(() => router.refresh()); }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add learning source"
        actions={<>
          <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          <Button type="submit" form="add-item-form">Add</Button>
        </>}
      >
        {addForm}
      </Dialog>
    </div>
  );
}
