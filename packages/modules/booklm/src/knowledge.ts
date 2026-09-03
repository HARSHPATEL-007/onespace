import { z } from "zod";
import { prisma } from "@n0va/db";

export const conceptSchema = z.object({
  setId: z.string().optional(),
  key: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  kind: z.enum(["CONCEPT", "SKILL", "MISCONCEPTION", "PREREQ", "GOAL", "INTEREST"]).default("CONCEPT"),
  description: z.string().max(2000).default(""),
});

export const edgeSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  relation: z.enum(["PREREQUISITE", "RELATED", "CONTRADICTS", "PART_OF", "UNLOCKS"]).default("RELATED"),
  weight: z.number().min(0).max(5).default(1),
});

function slugKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "concept";
}

export class KnowledgeService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
  ) {}

  async ensureConcept(input: z.infer<typeof conceptSchema>) {
    const key = slugKey(input.key);
    return prisma.learnerConcept.upsert({
      where: { workspaceId_setId_key: { workspaceId: this.workspaceId, setId: input.setId ?? null as never, key } },
      update: { label: input.label, kind: input.kind as never, description: input.description },
      create: {
        workspaceId: this.workspaceId,
        setId: input.setId || null,
        key,
        label: input.label,
        kind: input.kind as never,
        description: input.description,
      },
    });
  }

  async addEdge(input: z.infer<typeof edgeSchema>) {
    return prisma.conceptEdge.create({
      data: { workspaceId: this.workspaceId, fromId: input.fromId, toId: input.toId, relation: input.relation as never, weight: input.weight },
    });
  }

  async graph(setId?: string) {
    const [concepts, edges] = await Promise.all([
      prisma.learnerConcept.findMany({ where: { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) }, take: 200 }),
      prisma.conceptEdge.findMany({ where: { workspaceId: this.workspaceId }, take: 500 }),
    ]);
    const ids = new Set(concepts.map((c) => c.id));
    return { concepts, edges: edges.filter((e) => ids.has(e.fromId) && ids.has(e.toId)) };
  }

  async masteryForUser(setId?: string) {
    return prisma.learnerMastery.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      include: { concept: true },
      orderBy: { nextReviewAt: "asc" },
      take: 200,
    });
  }

  /** SM-2 lite + decay: record a retrieval outcome and reschedule. */
  async recordRetrieval(conceptId: string, correct: boolean, confidence = 0.5, responseTimeMs = 0) {
    const existing = await prisma.learnerMastery.findUnique({
      where: { workspaceId_conceptId_userId: { workspaceId: this.workspaceId, conceptId, userId: this.userId } },
    });
    const now = new Date();
    let ease = existing?.easeFactor ?? 2.5;
    let interval = existing?.intervalDays ?? 1;
    let mastery = existing?.mastery ?? 0;

    // Misconception-first signal: fast wrong answer with high confidence => misconception flag
    const misconceptionFlag = !correct && confidence >= 0.7 && responseTimeMs > 0 && responseTimeMs < 8000;

    if (correct) {
      const quality = confidence >= 0.7 ? 5 : confidence >= 0.4 ? 4 : 3;
      ease = Math.max(1.3, ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
      interval = existing == null ? 1 : interval * ease;
      mastery = Math.min(1, mastery + (1 - mastery) * (0.25 + confidence * 0.25));
    } else {
      ease = Math.max(1.3, ease - 0.2);
      interval = 1;
      mastery = Math.max(0, mastery - 0.15);
    }

    // Decay since last seen
    if (existing) {
      const days = Math.max(0, (now.getTime() - new Date(existing.lastSeenAt).getTime()) / 86_400_000);
      mastery = Math.max(0, mastery * Math.exp(-(existing.decayRate ?? 0.05) * days));
    }

    const nextReviewAt = new Date(now.getTime() + interval * 86_400_000);
    return prisma.learnerMastery.upsert({
      where: { workspaceId_conceptId_userId: { workspaceId: this.workspaceId, conceptId, userId: this.userId } },
      update: {
        mastery, confidence, easeFactor: ease, intervalDays: interval,
        lastSeenAt: now, nextReviewAt, misconceptionFlag,
        evidenceCount: { increment: 1 },
      },
      create: {
        workspaceId: this.workspaceId, conceptId, userId: this.userId,
        mastery, confidence, easeFactor: ease, intervalDays: interval,
        lastSeenAt: now, nextReviewAt, misconceptionFlag, evidenceCount: 1,
      },
    });
  }

  /** Explainable recommendation: "You are seeing this because…" */
  async nextAction(setId: string) {
    const [due, allMastery, concepts] = await Promise.all([
      prisma.learnerMastery.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId, nextReviewAt: { lte: new Date() } },
        include: { concept: true }, orderBy: { nextReviewAt: "asc" }, take: 10,
      }),
      prisma.learnerMastery.findMany({ where: { workspaceId: this.workspaceId, userId: this.userId }, include: { concept: true } }),
      prisma.learnerConcept.findMany({ where: { workspaceId: this.workspaceId, setId } }),
    ]);

    const misconceptions = allMastery.filter((m) => m.misconceptionFlag);
    if (misconceptions.length > 0) {
      const m = misconceptions[0]!;
      return {
        action: `Repair misconception: ${m.concept.label}`,
        reason: `You answered a "${m.concept.label}" question incorrectly with high confidence. Misconception-first remediation beats re-reading.`,
        conceptId: m.conceptId, conceptKey: m.concept.key, strategy: "misconception-repair" as const,
        alternatives: ["re-read notes", "new flashcards"],
        confidence: 0.82,
      };
    }
    if (due.length > 0) {
      const d = due[0]!;
      return {
        action: `Spaced review: ${d.concept.label}`,
        reason: `Scheduled by SM-2 (interval ${d.intervalDays.toFixed(1)}d, ease ${d.easeFactor.toFixed(2)}). Retrieval now beats re-study later.`,
        conceptId: d.conceptId, conceptKey: d.concept.key, strategy: "spaced-retrieval" as const,
        alternatives: ["interleaved practice", "teach-back"],
        confidence: 0.78,
      };
    }
    const weak = [...allMastery].sort((a, b) => a.mastery - b.mastery)[0];
    if (weak && weak.mastery < 0.6) {
      return {
        action: `Strengthen: ${weak.concept.label} (mastery ${Math.round(weak.mastery * 100)}%)`,
        reason: `Lowest mastery in your graph. Prerequisite repair first, then interleaved application.`,
        conceptId: weak.conceptId, conceptKey: weak.concept.key, strategy: "prerequisite-repair" as const,
        alternatives: ["worked example", "peer explanation"],
        confidence: 0.71,
      };
    }
    const unseen = concepts.find((c) => !allMastery.some((m) => m.conceptId === c.id));
    if (unseen) {
      return {
        action: `Learn next: ${unseen.label}`,
        reason: `No evidence yet for this concept. First exposure via worked example, then retrieval.`,
        conceptId: unseen.id, conceptKey: unseen.key, strategy: "new-concept" as const,
        alternatives: ["socratic preview"],
        confidence: 0.6,
      };
    }
    return {
      action: "Teach-back challenge",
      reason: "All tracked concepts are due-free and above 60%. Teaching back produces the strongest transfer signal.",
      conceptId: null, conceptKey: null, strategy: "teach-back" as const,
      alternatives: ["novel-case transfer", "debate mode"],
      confidence: 0.65,
    };
  }

  async exportGraph(setId?: string) {
    const g = await this.graph(setId);
    return {
      format: "booklm-knowledge-graph/v1",
      exportedAt: new Date().toISOString(),
      concepts: g.concepts.map((c) => ({ key: c.key, label: c.label, kind: c.kind, description: c.description })),
      edges: g.edges.map((e) => {
        const from = g.concepts.find((c) => c.id === e.fromId);
        const to = g.concepts.find((c) => c.id === e.toId);
        return { from: from?.key, to: to?.key, relation: e.relation, weight: e.weight };
      }),
    };
  }

  /** Auto-seed concepts from learning items (deterministic, no LLM needed). */
  async seedFromSet(setId: string) {
    const items = await prisma.learningItem.findMany({ where: { setId, workspaceId: this.workspaceId } });
    const stop = new Set(["the", "and", "for", "with", "from", "this", "that", "your", "you", "are", "was", "were", "have", "has", "will", "what", "when", "which", "about", "into"]);
    const counts = new Map<string, { label: string; n: number }>();
    for (const it of items) {
      const words = `${it.title} ${it.notes}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4 && !stop.has(w));
      for (const w of new Set(words)) {
        const e = counts.get(w) ?? { label: w, n: 0 };
        e.n++;
        counts.set(w, e);
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12);
    const created = [];
    for (const [key, v] of top) {
      created.push(await this.ensureConcept({ setId, key, label: v.label.replace(/-/g, " "), kind: "CONCEPT", description: `Mentioned in ${v.n} source(s)` }));
    }
    // Chain prerequisites in frequency order
    for (let i = 1; i < created.length; i++) {
      try {
        await this.addEdge({ fromId: created[i - 1]!.id, toId: created[i]!.id, relation: "PREREQUISITE", weight: 0.5 });
      } catch { /* ignore dupes */ }
    }
    return created;
  }
}
