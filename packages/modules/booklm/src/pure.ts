/**
 * Pure, dependency-free helpers for BookLM + Education.
 * Safe to import from client components (no prisma, no node APIs).
 */

export type MaterialsKind = "summary" | "glossary" | "flashcards" | "practice-test" | "revision-sheet" | "viva";

/** Pure markdown export for any generated material (unit-testable, no I/O). */
export function materialsToMarkdown(kind: MaterialsKind, data: Record<string, any> | null): string {
  if (!data) return "";
  const lines: string[] = [`# BookLM ${kind}`, ""];
  if (kind === "summary") {
    for (const b of data.bullets ?? []) lines.push(`- ${b}`);
    lines.push("", `_${data.coverage ?? ""}_`);
  } else if (kind === "glossary") {
    lines.push("| Term | Definition |", "|---|---|");
    for (const t of data.terms ?? []) lines.push(`| ${t.term} | ${t.definition} |`);
  } else if (kind === "flashcards") {
    for (const c of data.cards ?? []) lines.push(`- **Q:** ${c.front}`, `  **A:** ${c.back}`, "");
  } else if (kind === "practice-test") {
    for (const q of data.questions ?? []) lines.push(`## ${q.id} (${q.type})`, `**${q.prompt}**`, "", `Reference: ${q.referenceAnswer}`, "");
  } else if (kind === "revision-sheet") {
    lines.push("## Summary", "");
    for (const b of data.summary?.bullets ?? []) lines.push(`- ${b}`);
    lines.push("", "## Key terms", "");
    for (const t of data.glossary ?? []) lines.push(`- **${typeof t === "string" ? t : t.term}**${typeof t === "string" ? "" : ` — ${t.definition}`}`);
  } else if (kind === "viva") {
    for (const q of data.questions ?? []) lines.push(`- ${q}`);
  }
  return lines.join("\n");
}

export type QuizAnswerEntry = { picked: string; correct: boolean; ms: number };
export type QuizQuestionLite = { prompt: string; answer: string; itemId: string };

/**
 * Pure: shape client quiz telemetry into attempt responses (unit-testable).
 * Confidence heuristic: correct recalls are owned knowledge (0.8); errors are
 * near-misses worth misconception repair (0.7) — fast + wrong + 0.7 trips the
 * misconception flag downstream in KnowledgeService.recordRetrieval.
 */
export function buildAttemptResponses(
  questions: QuizQuestionLite[],
  answers: Record<number, QuizAnswerEntry>,
) {
  return questions.map((qq, idx) => {
    const a = answers[idx];
    const correct = a?.correct ?? false;
    return {
      prompt: qq.prompt,
      answer: qq.answer,
      picked: a?.picked ?? "",
      correct,
      responseTimeMs: a?.ms ?? 0,
      confidence: correct ? 0.8 : 0.7,
      conceptKey: "",
      itemId: qq.itemId,
    };
  });
}
