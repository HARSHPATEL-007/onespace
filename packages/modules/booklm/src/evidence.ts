import { z } from "zod";
import { prisma } from "@n0va/db";

export const citationSchema = z.object({
  setId: z.string().optional(),
  itemId: z.string().optional(),
  claim: z.string().trim().min(1).max(2000),
  quote: z.string().max(5000).default(""),
  sourceKind: z.enum(["DOC", "VIDEO", "LINK", "NOTE"]).default("NOTE"),
  sourceTitle: z.string().max(500).default(""),
  sourceDocId: z.string().optional(),
  locatorPage: z.number().int().positive().optional(),
  locatorParagraph: z.number().int().positive().optional(),
  locatorTimestamp: z.string().max(50).default(""),
  sourceVersion: z.string().max(100).default(""),
  authority: z.number().int().min(0).max(100).default(50),
  support: z.enum(["SUPPORTS", "CONTRADICTS", "QUALIFIES"]).default("SUPPORTS"),
  confidence: z.number().min(0).max(1).default(0.5),
  provenance: z.string().max(1000).default(""),
});

export type CitationInput = z.infer<typeof citationSchema>;

export type EvidenceCoverage = {
  totalClaims: number;
  supported: number;
  contradicted: number;
  qualified: number;
  coverageScore: number; // 0-1: claims with >=1 SUPPORTS citation
  contradictionRate: number;
  avgAuthority: number;
  avgConfidence: number;
};

function slugKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "concept";
}

export class EvidenceService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
  ) {}

  async listCitations(setId?: string) {
    return prisma.evidenceCitation.findMany({
      where: { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async addCitation(input: CitationInput) {
    return prisma.evidenceCitation.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        setId: input.setId || null,
        itemId: input.itemId || null,
        claim: input.claim,
        quote: input.quote,
        sourceKind: input.sourceKind as never,
        sourceTitle: input.sourceTitle,
        sourceDocId: input.sourceDocId || null,
        locatorPage: input.locatorPage ?? null,
        locatorParagraph: input.locatorParagraph ?? null,
        locatorTimestamp: input.locatorTimestamp,
        sourceVersion: input.sourceVersion,
        authority: input.authority,
        freshnessAt: new Date(),
        support: input.support as never,
        confidence: input.confidence,
        provenance: input.provenance || `manual:${this.userId}`,
      },
    });
  }

  async removeCitation(id: string) {
    await prisma.evidenceCitation.deleteMany({ where: { id, workspaceId: this.workspaceId } });
  }

  /** Claim-level evidence graph: group citations by normalized claim. */
  async claimGraph(setId?: string) {
    const cites = await this.listCitations(setId);
    const map = new Map<string, typeof cites>();
    for (const c of cites) {
      const k = c.claim.trim().toLowerCase();
      const arr = map.get(k) ?? [];
      arr.push(c);
      map.set(k, arr);
    }
    return [...map.entries()].map(([claimKey, items]) => ({
      claimKey,
      claim: items[0]!.claim,
      supports: items.filter((i) => i.support === "SUPPORTS"),
      contradicts: items.filter((i) => i.support === "CONTRADICTS"),
      qualifies: items.filter((i) => i.support === "QUALIFIES"),
      hasDisagreement: items.some((i) => i.support === "CONTRADICTS") && items.some((i) => i.support === "SUPPORTS"),
    }));
  }

  async coverage(setId?: string): Promise<EvidenceCoverage> {
    const graph = await this.claimGraph(setId);
    const totalClaims = graph.length;
    const supported = graph.filter((g) => g.supports.length > 0).length;
    const contradicted = graph.filter((g) => g.hasDisagreement).length;
    const qualified = graph.filter((g) => g.qualifies.length > 0).length;
    const all = (await this.listCitations(setId));
    const avgAuthority = all.length ? all.reduce((s, c) => s + c.authority, 0) / all.length / 100 : 0;
    const avgConfidence = all.length ? all.reduce((s, c) => s + c.confidence, 0) / all.length : 0;
    return {
      totalClaims,
      supported,
      contradicted,
      qualified,
      coverageScore: totalClaims ? supported / totalClaims : 0,
      contradictionRate: totalClaims ? contradicted / totalClaims : 0,
      avgAuthority,
      avgConfidence,
    };
  }

  /**
   * Hallucination-resistant grounded answer: extractive-only over items + citations.
   * Never invents page numbers. Refuses unsupported conclusions.
   * Returns answer segments each bound to a citation or explicitly marked as inference.
   */
  async groundedAnswer(setId: string, question: string) {
    const [items, cites] = await Promise.all([
      prisma.learningItem.findMany({ where: { setId, workspaceId: this.workspaceId }, orderBy: { sortOrder: "asc" } }),
      prisma.evidenceCitation.findMany({ where: { workspaceId: this.workspaceId, setId } }),
    ]);
    const qTokens = new Set(question.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
    const scored = items
      .map((it) => {
        const hay = `${it.title} ${it.notes}`.toLowerCase();
        let hits = 0;
        for (const t of qTokens) if (hay.includes(t)) hits++;
        return { it, hits };
      })
      .filter((s) => s.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5);

    if (scored.length === 0) {
      return {
        mode: "refused" as const,
        answer: "I don't have a source in this set that supports an answer. Add a doc, note, or citation first — I won't guess.",
        segments: [] as { text: string; kind: string; citationId?: string }[],
        coverage: await this.coverage(setId),
      };
    }

    const segments = scored.map(({ it }) => {
      const cite = cites.find((c) => c.itemId === it.id)
        ?? cites.find((c) => c.sourceTitle && it.title.includes(c.sourceTitle))
        ?? null;
      const first = (it.notes.trim() || it.title.trim()).split(/(?<=[.!?])\s/)[0]!.slice(0, 400);
      return {
        text: first,
        kind: cite ? "source-fact" : "model-inference",
        citationId: cite?.id,
        itemId: it.id,
        itemTitle: it.title,
        locator: cite
          ? { page: cite.locatorPage, paragraph: cite.locatorParagraph, timestamp: cite.locatorTimestamp }
          : null,
      };
    });

    const disagreements = (await this.claimGraph(setId)).filter((g) => g.hasDisagreement).length;
    return {
      mode: "grounded" as const,
      answer: segments.map((s) => s.text).join(" "),
      segments,
      disagreements,
      coverage: await this.coverage(setId),
      conceptHint: slugKey(question.split(" ").slice(0, 4).join(" ")),
    };
  }

  /** Hybrid retrieval: keyword + citation-authority + history-aware (recent item boost). */
  async hybridSearch(setId: string, query: string, opts?: { sourceKind?: string; limit?: number }) {
    const limit = Math.min(opts?.limit ?? 20, 50);
    const items = await prisma.learningItem.findMany({ where: { setId, workspaceId: this.workspaceId } });
    const cites = await prisma.evidenceCitation.findMany({ where: { workspaceId: this.workspaceId, setId } });
    const authByItem = new Map<string, number>();
    for (const c of cites) {
      if (!c.itemId) continue;
      authByItem.set(c.itemId, Math.max(authByItem.get(c.itemId) ?? 0, c.authority));
    }
    const q = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
    return items
      .filter((it) => !opts?.sourceKind || it.kind === opts.sourceKind)
      .map((it) => {
        const hay = `${it.title} ${it.notes}`.toLowerCase();
        let keyword = 0;
        for (const t of q) if (hay.includes(t)) keyword += t.length > 4 ? 2 : 1;
        const authority = (authByItem.get(it.id) ?? 50) / 100;
        const recency = 1 / (1 + (Date.now() - new Date(it.createdAt).getTime()) / 86_400_000 / 30);
        const dense = keyword > 0 ? Math.min(1, keyword / 6) : 0;
        const score = 0.55 * dense + 0.3 * authority + 0.15 * recency;
        return { item: it, score: Math.round(score * 1000) / 1000, authority, keywordHits: keyword };
      })
      .filter((r) => r.keywordHits > 0 || query.trim() === "")
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
