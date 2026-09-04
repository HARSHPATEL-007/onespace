import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@n0va/db";
import {
  decomposeClaims, detectCausalOverreach, detectQueryType, deriveVerificationLabel,
  epistemicStateFor, examHints, freshnessScore, scoreEvidenceQuality, compositeRerank, MODE_RULES,
  type AnswerMode, type QueryType, type VerificationLabel, type EpistemicState,
} from "./epistemics";
import { PolicyService } from "./policies";

export const EPISTEMIC_STATES = [
  "SOURCE_FACT", "SOURCE_SYNTHESIS", "MODEL_INFERENCE", "SPECULATION", "LEARNER_CONTRIBUTION",
] as const;

export const VERIFICATION_LABELS = [
  "DIRECTLY_SUPPORTED", "QUALIFIED_SUPPORT", "SYNTHESIZED", "REASONED_INFERENCE",
  "UNCERTAIN", "CONFLICTING", "NOT_FOUND", "REQUIRES_REVIEW",
] as const;

export const EVIDENCE_TYPES = [
  "DEFINITION", "OBSERVATION", "STATISTIC", "PROCEDURE", "OPINION", "CLAIM", "EXAMPLE",
] as const;

export const ANSWER_MODES = ["STRICT", "GUIDED", "EXPLORATORY", "EXAM"] as const;

export const CHALLENGE_CATEGORIES = [
  "NOT_SUPPORTED", "CORRELATION_NOT_CAUSATION", "LOST_QUALIFIER",
  "WRONG_DOMAIN", "EXTRACTION_ERROR", "OUTDATED_SOURCE", "OTHER",
] as const;

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
  locatorHeading: z.string().max(500).default(""),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
  sourceVersion: z.string().max(100).default(""),
  sourceType: z.string().max(100).default("note"),
  evidenceType: z.enum(EVIDENCE_TYPES).default("CLAIM"),
  authority: z.number().int().min(0).max(100).default(50),
  extractionConfidence: z.number().min(0).max(1).default(0.5),
  sourceDate: z.string().max(50).default(""),
  epistemicState: z.enum(EPISTEMIC_STATES).default("SOURCE_FACT"),
  accessScope: z.string().max(100).default("course-private"),
  language: z.string().max(50).default(""),
  license: z.string().max(500).default(""),
  support: z.enum(["SUPPORTS", "CONTRADICTS", "QUALIFIES"]).default("SUPPORTS"),
  confidence: z.number().min(0).max(1).default(0.5),
  provenance: z.string().max(1000).default(""),
});

export const challengeSchema = z.object({
  evidenceId: z.string().min(1),
  setId: z.string().optional(),
  category: z.enum(CHALLENGE_CATEGORIES).default("OTHER"),
  reason: z.string().trim().min(1).max(2000),
  learnerNote: z.string().max(2000).default(""),
});

/** Canonical content hash: sha256 over the exact excerpt + locator. */
export function evidenceContentHash(quote: string, sourceTitle: string, locator: string): string {
  return `sha256:${createHash("sha256").update(`${quote}|${sourceTitle}|${locator}`).digest("hex")}`;
}

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
    private readonly role: string = "member",
  ) {}

  private policies() {
    return new PolicyService(this.workspaceId, this.userId, this.role);
  }

  async listCitations(setId?: string) {
    return prisma.evidenceCitation.findMany({
      where: { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async addCitation(input: CitationInput) {
    const locator = `${input.locatorPage ?? ""}:${input.locatorParagraph ?? ""}:${input.locatorHeading}:${input.locatorTimestamp}`;
    const sourceDate = input.sourceDate ? new Date(input.sourceDate) : null;
    const validDate = sourceDate && !Number.isNaN(sourceDate.getTime()) ? sourceDate : null;
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
        locatorHeading: input.locatorHeading,
        lineStart: input.lineStart ?? null,
        lineEnd: input.lineEnd ?? null,
        sourceVersion: input.sourceVersion,
        sourceType: input.sourceType,
        evidenceType: input.evidenceType as never,
        authority: input.authority,
        extractionConfidence: input.extractionConfidence,
        sourceDate: validDate,
        freshnessScore: freshnessScore(validDate, new Date()),
        freshnessAt: new Date(),
        epistemicState: input.epistemicState as never,
        verificationLabel: "DIRECTLY_SUPPORTED" as never,
        accessScope: input.accessScope,
        language: input.language,
        license: input.license,
        contentHash: input.quote
          ? evidenceContentHash(input.quote, input.sourceTitle, locator)
          : "",
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

  // -------------------------------------------------------------------------
  // Multi-stage evidence retrieval (epistemics): lexical, semantic-proxy,
  // structural, temporal, authority, coverage — composite rerank with
  // course-configurable weights. Access-control filtering before generation.
  // -------------------------------------------------------------------------

  async evidenceSearch(
    setId: string,
    query: string,
    opts?: {
      limit?: number; includeContradictions?: boolean; sourceKind?: string;
      timeFrom?: string; timeTo?: string; approvedOnly?: boolean;
      allowedScopes?: string[]; persist?: boolean;
    },
  ) {
    const limit = Math.min(opts?.limit ?? 20, 50);
    const policy = await this.policies().effectivePolicy(setId);
    const queryType = detectQueryType(query);
    const [cites, challenges] = await Promise.all([
      prisma.evidenceCitation.findMany({ where: { workspaceId: this.workspaceId, setId } }),
      prisma.evidenceChallenge.findMany({ where: { workspaceId: this.workspaceId, status: "OPEN" as never } }),
    ]);
    const challengedIds = new Set(challenges.map((c) => c.evidenceId));
    const qTokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);

    // Latest version per document group (for requireCurrentVersion + temporal stage).
    const docGroups = new Map<string, typeof cites>();
    for (const c of cites) {
      const key = (c.sourceDocId || c.sourceTitle || c.id).toLowerCase();
      const arr = docGroups.get(key) ?? [];
      arr.push(c);
      docGroups.set(key, arr);
    }
    const latestVersion = new Map<string, string>();
    for (const [key, arr] of docGroups) {
      const sorted = [...arr].sort((a, b) =>
        +new Date(b.sourceDate ?? b.freshnessAt ?? b.createdAt) - +new Date(a.sourceDate ?? a.freshnessAt ?? a.createdAt));
      latestVersion.set(key, sorted[0]?.sourceVersion ?? "");
    }

    const from = opts?.timeFrom ? new Date(opts.timeFrom).getTime() : -Infinity;
    const to = opts?.timeTo ? new Date(opts.timeTo).getTime() : Infinity;

    const results = cites
      .filter((c) => !opts?.sourceKind || c.sourceKind === opts.sourceKind)
      .filter((c) => !opts?.allowedScopes || opts.allowedScopes.includes(c.accessScope))
      .filter((c) => {
        if (!opts?.includeContradictions && c.support === "CONTRADICTS") return false;
        const t = +new Date(c.sourceDate ?? c.freshnessAt ?? c.createdAt);
        return t >= from && t <= to;
      })
      .map((c) => {
        const hay = `${c.claim} ${c.quote} ${c.sourceTitle} ${c.locatorHeading}`.toLowerCase();
        let hits = 0;
        for (const t of qTokens) if (hay.includes(t)) hits += t.length > 4 ? 2 : 1;
        const lexical = qTokens.length ? Math.min(1, hits / (qTokens.length * 2)) : 0;
        // Semantic proxy: token-set overlap (honest stand-in until vector index lands).
        const haySet = new Set(hay.split(/[^a-z0-9]+/).filter((t) => t.length > 2));
        const qSet = new Set(qTokens);
        let inter = 0;
        for (const t of qSet) if (haySet.has(t)) inter++;
        const semantic = qSet.size ? inter / qSet.size : 0;
        const structural = c.locatorHeading && qTokens.some((t) => c.locatorHeading.toLowerCase().includes(t)) ? 1 : 0;
        const temporal = c.sourceDate ? (c.freshnessScore ?? 0.5) : 0.5;
        const authority = c.authority / 100;
        const coverage = ((c.locatorPage ? 0.4 : 0) + (c.quote ? 0.3 : 0) + (c.contentHash ? 0.3 : 0));
        const contradiction = challengedIds.has(c.id) || c.support === "CONTRADICTS" ? 1 : 0;
        const supportN = c.support === "SUPPORTS" ? 1 : c.support === "QUALIFIES" ? 0.6 : 0.2;
        // Uncertain extraction propagates: low-confidence spans rank lower and
        // surface an explicit verification flag downstream — never silently.
        const extraction = 0.75 + 0.25 * (c.extractionConfidence ?? 0.5);
        const score = compositeRerank({ semantic, lexical, authority, freshness: temporal, coverage, temporal, contradiction, duplicate: 0 }, policy.weights) * (0.7 + 0.3 * supportN) * extraction;
        const check = this.policies().checkSource(policy, c, { approvedOnly: opts?.approvedOnly });
        const docKey = (c.sourceDocId || c.sourceTitle || c.id).toLowerCase();
        const isCurrent = !c.sourceVersion || latestVersion.get(docKey) === c.sourceVersion;
        return {
          citation: c, lexical, semantic, structural, temporal, authority, coverage,
          contradiction, isCurrent, policyCheck: check,
          score: Math.round(score * 1000) / 1000,
        };
      })
      .filter((r) => {
        // Hard policy gates: restricted sources excluded; exam/approved-only enforced.
        if (r.policyCheck.reason.startsWith("Source matches restricted")) return false;
        if (r.policyCheck.reason.startsWith("Not on the course")) return false;
        if (policy.examMode && !policy.examExternalSources && r.citation.sourceKind === "LINK" && !r.citation.sourceDocId) return false;
        return r.lexical > 0 || r.semantic > 0 || query.trim() === "";
      })
      .sort((a, b) => b.score - a.score);

    // Duplicate penalty: same content hash appearing twice.
    const seen = new Set<string>();
    for (const r of results) {
      if (r.citation.contentHash && seen.has(r.citation.contentHash)) {
        r.score = Math.round(r.score * (1 - policy.weights.wd) * 1000) / 1000;
      } else if (r.citation.contentHash) seen.add(r.citation.contentHash);
    }
    results.sort((a, b) => b.score - a.score);
    return { results: results.slice(0, limit), queryType, policy };
  }

  // -------------------------------------------------------------------------
  // Citation-first grounded answers: decompose → verify → compose → audit.
  // Every claim carries epistemic state + verification label, persisted as
  // ClaimNode/ClaimEdge rows on an auditable AnswerRecord.
  // -------------------------------------------------------------------------

  async groundedAnswerV2(
    setId: string,
    question: string,
    opts?: { mode?: AnswerMode; persist?: boolean; evidenceIds?: string[] },
  ) {
    const queryType: QueryType = detectQueryType(question);
    const policy = await this.policies().effectivePolicy(setId);
    const mode: AnswerMode = opts?.mode ?? (policy.examMode ? "EXAM" : "GUIDED");
    const rules = MODE_RULES[mode];
    const persist = opts?.persist ?? true;
    const now = new Date();

    // EXAM mode: retrieval practice instead of answers (assistance is logged).
    if (mode === "EXAM" && rules.hintsInsteadOfAnswers) {
      const { results } = await this.evidenceSearch(setId, question, { limit: 8, approvedOnly: true });
      const atoms = decomposeClaims(results.map((r) => r.citation.quote || r.citation.claim).join(" ").slice(0, 2000));
      const hints = examHints(question, atoms);
      let answerId: string | null = null;
      if (persist) {
        const rec = await prisma.answerRecord.create({
          data: {
            workspaceId: this.workspaceId, setId, question: question.slice(0, 2000),
            mode: "EXAM" as never, queryType, answer: "",
            scores: { hints } as never, versionsUsed: {} as never,
            modelVersion: "extractive/v2", retrievalVersion: "rerank/v1",
            refused: false, createdById: this.userId,
          },
        });
        answerId = rec.id;
      }
      return {
        answerId, mode: "exam-hints" as const, answer: "", hints, queryType,
        trace: { mode, queryType, policy: policySummary(policy), retrievalReason: "exam-approved-only", versionsUsed: {} },
      };
    }

    const { results: rawResults } = await this.evidenceSearch(setId, question, {
      limit: 12, includeContradictions: true,
      approvedOnly: rules.requireApprovedOnly || queryType === "exam",
    });
    // Caller-supplied evidence set (e.g. instructor-curated spans) constrains retrieval.
    const results = opts?.evidenceIds?.length
      ? rawResults.filter((r) => opts.evidenceIds!.includes(r.citation.id))
      : rawResults;

    if (results.length === 0) {
      let answerId: string | null = null;
      if (persist) {
        const rec = await prisma.answerRecord.create({
          data: {
            workspaceId: this.workspaceId, setId, question: question.slice(0, 2000),
            mode: mode as never, queryType, answer: "",
            scores: { claimCoverage: 0 } as never, versionsUsed: {} as never,
            modelVersion: "extractive/v2", retrievalVersion: "rerank/v1",
            refused: true, createdById: this.userId,
          },
        });
        answerId = rec.id;
      }
      return {
        answerId, mode: "refused" as const,
        answer: mode === "STRICT"
          ? "No approved source in this set supports an answer. I won't guess — add a course source or ask an instructor."
          : "I don't have a source in this set that supports an answer. Add a doc, note, or citation first — I won't guess.",
        claims: [] as GroundedClaim[], queryType,
        scores: null, versionsUsed: {}, disagreements: 0,
        coverage: await this.coverage(setId),
        trace: { mode, queryType, policy: policySummary(policy), retrievalReason: "no candidates passed policy gates", versionsUsed: {} },
      };
    }

    // Compose segments from top results, then decompose into atomic claims.
    const segments = results.slice(0, 5).map((r) => ({
      text: (r.citation.quote.trim() || r.citation.claim).split(/(?<=[.!?])\s/)[0]!.slice(0, 500),
      citation: r.citation, retrievalScore: r.score,
    }));
    const docKeyOf = (c: { sourceDocId: string | null; sourceTitle: string }) =>
      (c.sourceDocId || c.sourceTitle || "unknown").toLowerCase();
    const versionsUsed: Record<string, string> = {};
    for (const s of segments) versionsUsed[docKeyOf(s.citation)] = s.citation.sourceVersion || "unversioned";

    // Current-version map for requireCurrentVersion.
    const latestByDoc = new Map<string, string>();
    for (const r of results) {
      const k = docKeyOf(r.citation);
      if (!latestByDoc.has(k) && r.citation.sourceVersion) latestByDoc.set(k, r.citation.sourceVersion);
    }

    const claims: GroundedClaim[] = [];
    const seenKeys = new Set<string>();
    for (const seg of segments) {
      for (const atom of decomposeClaims(seg.text)) {
        if (seenKeys.has(atom.normalizedKey)) continue;
        seenKeys.add(atom.normalizedKey);
        // Match citations to this atomic claim.
        const matched = results.filter((r) => {
          const hay = `${r.citation.claim} ${r.citation.quote}`.toLowerCase();
          const ct = atom.text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 3);
          if (!ct.length) return false;
          const hits = ct.filter((t) => hay.includes(t)).length;
          return hits / ct.length >= 0.3 || r.citation.id === seg.citation.id;
        });
        const supports = matched.filter((m) => m.citation.support === "SUPPORTS");
        const qualifies = matched.filter((m) => m.citation.support === "QUALIFIES");
        const contradicts = matched.filter((m) => m.citation.support === "CONTRADICTS");
        // Policy: two independent sources.
        const independentSources = new Set(supports.map((m) => docKeyOf(m.citation)));
        // Policy: current version.
        const currentSupports = policy.requireCurrentVersion
          ? supports.filter((m) => {
              const latest = latestByDoc.get(docKeyOf(m.citation));
              return m.citation.sourceVersion && latest && m.citation.sourceVersion === latest;
            })
          : supports;
        const effectiveSupports = policy.requireCurrentVersion ? currentSupports : supports;
        const twoOk = !policy.requireTwoSources || independentSources.size >= 2;
        const adequate = effectiveSupports.length > 0 && twoOk;

        // Qualifier preservation per supporting span.
        const qualifierFlags = effectiveSupports
          .map((m) => detectCausalOverreach(atom.text, m.citation.quote || m.citation.claim))
          .filter((o) => o.overreach)
          .flatMap((o) => o.reasons);

        const isInference = effectiveSupports.length === 0;
        const synthesized = effectiveSupports.length >= 2 && independentSources.size >= 2;
        const label = deriveVerificationLabel({
          directSupport: effectiveSupports.length, qualifiedSupport: qualifies.length,
          contradicting: contradicts.length, synthesized, isInference, foundNothing: false,
        });
        const finalLabel: VerificationLabel =
          qualifierFlags.length > 0 && label === "DIRECTLY_SUPPORTED" ? "QUALIFIED_SUPPORT" : label;
        const state: EpistemicState = isInference
          ? epistemicStateFor({ inference: true })
          : epistemicStateFor({ multiSource: synthesized });

        // Mode gates: STRICT/EXAM drop inference; exploratory may keep labeled speculation.
        if (isInference && !rules.allowInference) continue;

        const entailment = effectiveSupports.length > 0
          ? Math.min(1, 0.55 + 0.15 * effectiveSupports.length + (qualifierFlags.length ? -0.15 : 0.1))
          : 0.25;
        claims.push({
          text: atom.text, normalizedKey: atom.normalizedKey, weight: atom.weight,
          epistemicState: state, verificationLabel: finalLabel,
          confidence: Math.round(Math.max(0.1, Math.min(0.95, entailment)) * 100) / 100,
          adequate,
          evidenceIds: matched.map((m) => m.citation.id),
          sourceIds: [...independentSources],
          qualifierFlags,
          hasHash: matched.some((m) => m.citation.contentHash),
          hasVersion: matched.some((m) => m.citation.sourceVersion),
          reasons: [
            ...effectiveSupports.slice(0, 3).map((m) => `Supported by "${m.citation.sourceTitle || "untitled"}" (authority ${m.citation.authority}, retrieval ${m.score}).`),
            ...qualifies.slice(0, 2).map((m) => `Qualified by "${m.citation.sourceTitle || "untitled"}".`),
            ...contradicts.slice(0, 2).map((m) => `Contradicted by "${m.citation.sourceTitle || "untitled"}" — see disagreement view.`),
            ...(policy.requireTwoSources && !twoOk ? ["Below two-independent-source threshold."] : []),
            ...(policy.requireCurrentVersion && supports.length !== currentSupports.length ? ["Superseded version excluded by current-version policy."] : []),
          ],
        });
        if (claims.length >= 12) break;
      }
      if (claims.length >= 12) break;
    }

    const contradictionsPresent = (await this.claimGraph(setId)).filter((g) => g.hasDisagreement).length;
    const scores = scoreEvidenceQuality(
      claims.map((c) => ({
        weight: c.weight, adequate: c.adequate, entailment: c.confidence,
        sourceIds: c.sourceIds, hasHash: c.hasHash, hasVersion: c.hasVersion,
      })),
      { totalClaims: claims.length, contradictionsConsidered: claims.filter((c) => c.evidenceIds.length > 0).length, contradictionsPresent },
    );

    // Refusal when evidence quality is below the mode/policy bar.
    const bar = Math.max(rules.refuseBelowCoverage, policy.configured ? policy.minCoverage : 0);
    if (claims.length === 0 || scores.claimCoverage < bar) {
      let answerId: string | null = null;
      if (persist) {
        const rec = await prisma.answerRecord.create({
          data: {
            workspaceId: this.workspaceId, setId, question: question.slice(0, 2000),
            mode: mode as never, queryType, answer: "",
            scores: scores as never, versionsUsed: versionsUsed as never,
            modelVersion: "extractive/v2", retrievalVersion: "rerank/v1",
            refused: true, createdById: this.userId,
          },
        });
        answerId = rec.id;
      }
      return {
        answerId, mode: "refused" as const,
        answer: `Evidence quality is below the bar for this mode (claim coverage ${Math.round(scores.claimCoverage * 100)}% < ${Math.round(bar * 100)}%). Add stronger sources or switch to exploratory mode.`,
        claims, queryType, scores, versionsUsed, disagreements: contradictionsPresent,
        coverage: await this.coverage(setId),
        trace: {
          mode, queryType, policy: policySummary(policy),
          retrievalReason: `top-${results.length} reranked candidates; coverage gate ${bar}`,
          versionsUsed,
          inferenceBoundary: "no unverified claims emitted",
          missingEvidence: claims.filter((c) => !c.adequate).map((c) => c.text),
        },
      };
    }

    const answer = claims.filter((c) => c.adequate || rules.allowInference).map((c) => c.text).join(" ");

    // Persist the auditable answer: record + atomic claims + edges.
    let answerId: string | null = null;
    if (persist) {
      const rec = await prisma.answerRecord.create({
        data: {
          workspaceId: this.workspaceId, setId, question: question.slice(0, 2000),
          mode: mode as never, queryType, answer: answer.slice(0, 8000),
          scores: scores as never, versionsUsed: versionsUsed as never,
          modelVersion: "extractive/v2", retrievalVersion: "rerank/v1",
          refused: false, createdById: this.userId,
        },
      });
      answerId = rec.id;
      for (let i = 0; i < claims.length; i++) {
        const c = claims[i]!;
        const node = await prisma.claimNode.create({
          data: {
            workspaceId: this.workspaceId, setId, answerId,
            text: c.text.slice(0, 2000), normalizedKey: c.normalizedKey, position: i,
            epistemicState: c.epistemicState as never, verificationLabel: c.verificationLabel as never,
            confidence: c.confidence, weight: c.weight, createdById: this.userId,
          },
        });
        c.id = node.id;
        for (const eid of c.evidenceIds.slice(0, 6)) {
          const cite = results.find((r) => r.citation.id === eid)?.citation;
          await prisma.claimEdge.create({
            data: {
              workspaceId: this.workspaceId, setId, answerId,
              fromType: "CLAIM", fromId: node.id, toType: "EVIDENCE", toId: eid,
              relation: (cite?.support === "CONTRADICTS" ? "CONTRADICTS"
                : cite?.support === "QUALIFIES" ? "QUALIFIES" : "SUPPORTS") as never,
              strength: cite ? cite.confidence : 0.3, confidence: c.confidence,
              evidenceSpan: (cite?.quote || "").slice(0, 500),
              modelVersion: "extractive/v2",
            },
          });
        }
      }
      // Inference derivation edges: inference claims derive from adequate ones.
      const adequateIds = claims.filter((c) => c.adequate && c.id).map((c) => c.id!);
      for (const c of claims.filter((c) => c.epistemicState === "MODEL_INFERENCE" && c.id)) {
        for (const src of adequateIds.slice(0, 3)) {
          await prisma.claimEdge.create({
            data: {
              workspaceId: this.workspaceId, setId, answerId,
              fromType: "CLAIM", fromId: c.id!, toType: "CLAIM", toId: src,
              relation: "DERIVED_FROM" as never, strength: 0.4, confidence: c.confidence,
              modelVersion: "extractive/v2",
            },
          });
        }
      }
    }

    return {
      answerId, mode: "grounded" as const, answer, claims, queryType, scores, versionsUsed,
      disagreements: contradictionsPresent,
      coverage: await this.coverage(setId),
      conceptHint: slugKey(question.split(" ").slice(0, 4).join(" ")),
      trace: {
        mode, queryType, policy: policySummary(policy),
        retrievalReason: `lexical+semantic-proxy+structural+temporal+authority rerank (rerank/v1), top-${segments.length} segments`,
        versionsUsed,
        inferenceBoundary: claims.filter((c) => c.epistemicState === "MODEL_INFERENCE").map((c) => c.text),
        missingEvidence: claims.filter((c) => !c.adequate).map((c) => c.text),
        contradictoryEvidence: claims.filter((c) => c.verificationLabel === "CONFLICTING").map((c) => c.text),
      },
    };
  }

  /** Claim-graph for a persisted answer: claims, edges, evidence cards. */
  async claimGraphForAnswer(answerId: string) {
    const [answer, nodes, edges] = await Promise.all([
      prisma.answerRecord.findFirst({ where: { id: answerId, workspaceId: this.workspaceId } }),
      prisma.claimNode.findMany({ where: { answerId, workspaceId: this.workspaceId }, orderBy: { position: "asc" } }),
      prisma.claimEdge.findMany({ where: { answerId, workspaceId: this.workspaceId } }),
    ]);
    if (!answer) throw new Error("Answer not found");
    const evidenceIds = [...new Set(edges.filter((e) => e.toType === "EVIDENCE").map((e) => e.toId))];
    const evidence = evidenceIds.length
      ? await prisma.evidenceCitation.findMany({ where: { id: { in: evidenceIds }, workspaceId: this.workspaceId } })
      : [];
    return { answer, claims: nodes, edges, evidence };
  }

  // -------------------------------------------------------------------------
  // Evidence challenges: learners/instructors dispute citations with reason.
  // -------------------------------------------------------------------------

  async challengeEvidence(input: z.infer<typeof challengeSchema>) {
    const cite = await prisma.evidenceCitation.findFirst({
      where: { id: input.evidenceId, workspaceId: this.workspaceId },
    });
    if (!cite) throw new Error("Evidence not found");
    return prisma.evidenceChallenge.create({
      data: {
        workspaceId: this.workspaceId, evidenceId: input.evidenceId,
        setId: input.setId || cite.setId,
        category: input.category as never,
        reason: input.reason, learnerNote: input.learnerNote,
        userId: this.userId,
      },
    });
  }

  async listChallenges(setId?: string, status?: string) {
    return prisma.evidenceChallenge.findMany({
      where: {
        workspaceId: this.workspaceId,
        ...(setId ? { setId } : {}),
        ...(status ? { status: status as never } : {}),
      },
      include: { evidence: { select: { id: true, claim: true, quote: true, sourceTitle: true } } },
      orderBy: { createdAt: "desc" }, take: 100,
    });
  }

  async resolveChallenge(id: string, status: "UPHELD" | "OVERTURNED") {
    if (!["admin", "owner", "teacher"].includes(this.role)) throw new Error("Forbidden: instructor role required");
    return prisma.evidenceChallenge.update({
      where: { id },
      data: { status: status as never, resolvedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------------
  // Source update impact: what breaks when a document changes.
  // -------------------------------------------------------------------------

  async sourceImpact(documentId: string) {
    const cites = await prisma.evidenceCitation.findMany({
      where: { workspaceId: this.workspaceId, sourceDocId: documentId },
      select: { id: true, setId: true, claim: true, sourceVersion: true },
    });
    const citeIds = cites.map((c) => c.id);
    const setIds = [...new Set(cites.map((c) => c.setId).filter(Boolean) as string[])];
    const [edges, answers, items, annotations, attempts] = await Promise.all([
      citeIds.length ? prisma.claimEdge.findMany({ where: { workspaceId: this.workspaceId, toId: { in: citeIds } }, select: { answerId: true, fromId: true } }) : [],
      citeIds.length ? prisma.answerRecord.findMany({ where: { workspaceId: this.workspaceId }, select: { id: true, question: true, versionsUsed: true, createdAt: true }, take: 200 }) : [],
      prisma.learningItem.findMany({ where: { workspaceId: this.workspaceId, refId: documentId }, select: { id: true, setId: true, title: true } }),
      setIds.length ? prisma.learningAnnotation.count({ where: { workspaceId: this.workspaceId, setId: { in: setIds } } }) : 0,
      setIds.length ? prisma.quizAttempt.count({ where: { workspaceId: this.workspaceId, setId: { in: setIds } } }) : 0,
    ]);
    const affectedAnswerIds = new Set(edges.map((e) => e.answerId).filter(Boolean) as string[]);
    return {
      documentId,
      citations: cites.length,
      sets: setIds,
      affectedAnswers: answers.filter((a) => affectedAnswerIds.has(a.id)).map((a) => ({ id: a.id, question: a.question })),
      affectedClaims: edges.length,
      lessons: items,
      learnerNotes: annotations,
      quizAttempts: attempts,
      note: "Derived study materials (summaries, flashcards) regenerate from citations — regenerate after updating the source.",
    };
  }
}

export interface GroundedClaim {
  id?: string; text: string; normalizedKey: string; weight: number;
  epistemicState: EpistemicState; verificationLabel: VerificationLabel;
  confidence: number; adequate: boolean;
  evidenceIds: string[]; sourceIds: string[];
  qualifierFlags: string[]; hasHash: boolean; hasVersion: boolean;
  reasons: string[];
}

function policySummary(p: {
  approvedSources: string[]; restrictedSources: string[]; requireTwoSources: boolean;
  requireCurrentVersion: boolean; examMode: boolean; allowedInferenceLevel: string;
  minCoverage: number; configured: boolean;
}) {
  return {
    configured: p.configured, approvedSources: p.approvedSources,
    restrictedSources: p.restrictedSources, requireTwoSources: p.requireTwoSources,
    requireCurrentVersion: p.requireCurrentVersion, examMode: p.examMode,
    allowedInferenceLevel: p.allowedInferenceLevel, minCoverage: p.minCoverage,
  };
}
