import { prisma } from "@n0va/db";
import type { LearningItem } from "@n0va/db";

function firstSentence(text: string): string {
  const m = text.trim().match(/^[^.!?\n]+[.!?]?/);
  return m ? m[0]!.trim() : text.trim().slice(0, 200);
}

function keywords(items: LearningItem[], limit = 20): { term: string; definition: string }[] {
  const stop = new Set(["the", "and", "for", "with", "from", "this", "that", "your", "you", "are", "was", "were", "have", "has", "will", "what", "when", "which", "about", "into", "they", "their", "there"]);
  const counts = new Map<string, { n: number; def: string }>();
  for (const it of items) {
    const words = `${it.title} ${it.notes}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4 && !stop.has(w));
    for (const w of new Set(words)) {
      const e = counts.get(w) ?? { n: 0, def: firstSentence(it.notes || it.title) };
      e.n++;
      counts.set(w, e);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, limit)
    .map(([term, v]) => ({ term, definition: v.def.slice(0, 280) }));
}

/** Deterministic study-material generation (no LLM dependency; safe offline). */
export class MaterialsService {
  constructor(private readonly workspaceId: string) {}

  private async items(setId: string) {
    return prisma.learningItem.findMany({ where: { setId, workspaceId: this.workspaceId }, orderBy: { sortOrder: "asc" } });
  }

  async summary(setId: string) {
    const items = await this.items(setId);
    const bullets = items.slice(0, 10).map((it) => `• ${it.title}: ${firstSentence(it.notes || it.title)}`);
    return { kind: "summary" as const, bullets, coverage: `${items.length} source(s) condensed to ${bullets.length} key point(s)` };
  }

  async glossary(setId: string) {
    const items = await this.items(setId);
    return { kind: "glossary" as const, terms: keywords(items) };
  }

  async flashcards(setId: string) {
    const items = await this.items(setId);
    return {
      kind: "flashcards" as const,
      cards: items.slice(0, 30).map((it) => ({ front: it.title, back: it.notes || it.title, itemId: it.id })),
    };
  }

  async practiceTest(setId: string) {
    const items = await this.items(setId);
    const pool = items.slice(0, 8);
    return {
      kind: "practice-test" as const,
      questions: pool.map((it, i) => ({
        id: `q${i + 1}`,
        type: i % 3 === 0 ? "retrieval" : i % 3 === 1 ? "application" : "transfer",
        prompt: it.title,
        referenceAnswer: firstSentence(it.notes || it.title),
        itemId: it.id,
      })),
    };
  }

  async revisionSheet(setId: string) {
    const [s, g] = await Promise.all([this.summary(setId), this.glossary(setId)]);
    return { kind: "revision-sheet" as const, summary: s, glossary: g.terms.slice(0, 10) };
  }

  async vivaQuestions(setId: string) {
    const items = await this.items(setId);
    return {
      kind: "viva" as const,
      questions: items.slice(0, 10).flatMap((it) => [
        `Explain "${it.title}" in your own words.`,
        `What would disprove or qualify "${firstSentence(it.notes || it.title).slice(0, 80)}"?`,
      ]),
    };
  }
}

export { materialsToMarkdown, type MaterialsKind } from "./pure";
