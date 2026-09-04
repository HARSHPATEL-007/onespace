import { NextResponse } from "next/server";
import { z } from "zod";
import {
  classifyHybridIntent,
  keywordScore,
  vectorProxyScore,
  traverseGraph,
  temporalFit,
  temporalLabel,
  tableCellScore,
  formulaScore,
  normalizeFormula,
  imageScore,
  mediaScore,
  codeScore,
  validateEvidencePackage,
  sanitizeForRender,
  passesAcl,
  DEFAULT_FUSION_WEIGHTS,
  type GraphRelation,
} from "@n0va/modules-booklm/retrieval";
import {
  applyMetadataFilters,
  mediaChapters,
  deepFilterSchema,
  geoScore,
  compareTemporalVersions,
  tableYearMax,
  tableYearDelta,
  tablePercentCells,
  codeSafetyCheck,
  mediaCitation,
  figureRole,
  rightsFor,
  buildCitationGroundedAnswer,
  evaluateRetrievalDeep,
  dedupeFederatedHits,
  tuneWeightsFromFeedback,
  globalQueryStore,
} from "@n0va/modules-booklm/retrieval-deep";
import { retrievalContext } from "@/lib/retrieval-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * N0VA BOOKLM EDUCATION — Hybrid Retrieval API.
 *
 * Implements the spec route table through one catch-all dispatcher
 * (Next.js gives static siblings precedence, so existing
 * /retrieval/redact|reauthorize|authorized-search|authorize-context
 * routes are unaffected):
 *
 *   POST /v1/retrieval/query        full pipeline (plan → fan-out → fuse)
 *   POST /v1/retrieval/plan         query-plan selection + ambiguity gate
 *   POST /v1/retrieval/keyword      field-aware lexical scoring
 *   POST /v1/retrieval/vector       semantic proxy + hierarchical note
 *   POST /v1/retrieval/graph        knowledge-graph traversal
 *   POST /v1/retrieval/temporal     temporal label / fit / version compare
 *   POST /v1/retrieval/tables       table-cell scoring + year stats
 *   POST /v1/retrieval/formulas     formula matching (original preserved)
 *   POST /v1/retrieval/images       diagram scoring + role + rights
 *   POST /v1/retrieval/media        transcript scoring + jump citation
 *   POST /v1/retrieval/code         code scoring + safety gate
 *   POST /v1/retrieval/citations    claim → evidence grounding + refusal
 *   POST /v1/retrieval/federated    registry capability + isolation report
 *   POST /v1/retrieval/eval         deep retrieval metrics (extension)
 *   GET  /v1/retrieval/{qid}/evidence
 *   GET  /v1/retrieval/{qid}/explanation
 *   POST /v1/retrieval/{qid}/feedback
 */

async function bodyOf(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

const CHANNELS = new Set([
  "query",
  "plan",
  "keyword",
  "vector",
  "graph",
  "temporal",
  "tables",
  "formulas",
  "images",
  "media",
  "code",
  "citations",
  "federated",
  "eval",
]);

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const authed = await retrievalContext();
  if ("error" in authed) return NextResponse.json({ error: authed.error }, { status: authed.status });
  const body = await bodyOf(req);

  // POST /v1/retrieval/{query_id}/feedback
  if (path.length === 2 && path[1] === "feedback") {
    const queryId = path[0]!;
    const parsed = z
      .object({ unit_id: z.string().min(1), verdict: z.enum(["correct", "incorrect"]), note: z.string().max(1000).default("") })
      .safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
    const stored = globalQueryStore.addFeedback(queryId, parsed.data.unit_id, parsed.data.verdict, parsed.data.note);
    if (!stored) return NextResponse.json({ error: "Unknown query_id" }, { status: 404 });
    // Learning-to-rank loop: aggregate this query's feedback into per-chunk
    // tallies and suggest conservative weight nudges (bounded ±0.05).
    const tallyByChunk = new Map<string, { correct: number; incorrect: number }>();
    for (const f of stored.feedback) {
      const t = tallyByChunk.get(f.unitId) ?? { correct: 0, incorrect: 0 };
      if (f.verdict === "correct") t.correct++;
      else t.incorrect++;
      tallyByChunk.set(f.unitId, t);
    }
    const suggested_weights = tuneWeightsFromFeedback(
      DEFAULT_FUSION_WEIGHTS,
      [...tallyByChunk.entries()].map(([chunkId, t]) => ({ chunkId, ...t })),
    );
    return NextResponse.json({ query_id: queryId, recorded: true, feedback_count: stored.feedback.length, suggested_weights });
  }

  const [channel] = path;
  if (!channel || !CHANNELS.has(channel)) return NextResponse.json({ error: "Unknown retrieval route" }, { status: 404 });

  try {
    switch (channel) {
      case "query": {
        const result = await authed.svc.query(body ?? {}, authed.acl);
        globalQueryStore.save({
          queryId: result.query_id,
          workspaceId: authed.ctx.workspaceId,
          query: typeof (body as { query?: unknown })?.query === "string" ? String((body as { query: string }).query) : "",
          cards: result.results,
          explanation: result.explanation,
          federatedUnavailable: result.federated_unavailable,
          // ACL binding: units travel with the stored query so GET
          // /evidence|explanation re-checks against the live caller context.
          acl: {
            userId: authed.acl.userId,
            enrollments: authed.acl.enrollments,
            institutionId: authed.acl.institutionId,
            role: authed.acl.role,
          },
          units: result.units,
        });
        return NextResponse.json(result);
      }
      case "plan": {
        const parsed = z.object({ query: z.string().trim().min(1).max(2000) }).safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json({ plan: classifyHybridIntent(parsed.data.query) });
      }
      case "keyword": {
        const parsed = z
          .object({
            query: z.string().min(1).max(2000),
            docs: z.array(z.object({ title: z.string().default(""), heading: z.string().default(""), body: z.string().default(""), caption: z.string().default("") })).default([]),
            fields: z.array(z.string()).default(["title", "heading", "body", "caption"]),
            phrase_boost: z.number().default(4.0),
            ocr_fuzzy_tolerance: z.number().int().min(0).max(2).default(1),
          })
          .safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        const ranked = parsed.data.docs
          .map((d, i) => ({ id: i, ...keywordScore({ text: parsed.data.query, fields: parsed.data.fields, phrase_boost: parsed.data.phrase_boost, ocr_fuzzy_tolerance: parsed.data.ocr_fuzzy_tolerance }, d) }))
          .sort((a, b) => b.score - a.score);
        return NextResponse.json({ query: parsed.data.query, results: ranked });
      }
      case "vector": {
        const parsed = z.object({ query: z.string().min(1).max(2000), texts: z.array(z.string()).default([]) }).safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        const ranked = parsed.data.texts
          .map((t, i) => ({ id: i, score: vectorProxyScore(parsed.data.query, t), granularity: "sentence" as const }))
          .sort((a, b) => b.score - a.score);
        return NextResponse.json({
          query: parsed.data.query,
          results: ranked,
          note: "Token-overlap proxy; descend document → section → paragraph → sentence → span and cite the smallest supporting span.",
        });
      }
      case "graph": {
        const parsed = z
          .object({
            nodes: z.array(z.object({ id: z.string(), label: z.string(), kind: z.string().default("concept") })),
            edges: z.array(z.object({ from: z.string(), to: z.string(), relation: z.string(), confidence: z.number().min(0).max(1).default(0.8), source: z.string().default("") })),
            from: z.string(),
            to: z.string(),
          })
          .safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        const nodes = new Map(parsed.data.nodes.map((n) => [n.id, n]));
        const path = traverseGraph(
          nodes,
          parsed.data.edges.map((e) => ({ ...e, relation: e.relation as GraphRelation })),
          parsed.data.from,
          parsed.data.to,
        );
        if (!path) return NextResponse.json({ path: null, note: "No path within depth 4 — do not infer causality from proximity." });
        return NextResponse.json({ path });
      }
      case "temporal": {
        const parsed = z
          .object({
            bounds: z.object({ validFrom: z.string().nullable().default(null), validUntil: z.string().nullable().default(null), publishedAt: z.string().nullable().default(null), isLatest: z.boolean().optional() }).optional(),
            fit: z.object({ valid_at: z.string().optional(), published_before: z.string().optional(), include_superseded: z.boolean().default(false) }).optional(),
            doc: z.object({ validFrom: z.string().nullable().default(null), validUntil: z.string().nullable().default(null), publishedAt: z.string().nullable().default(null), isLatest: z.boolean().optional() }).optional(),
            compare: z.object({ old: z.object({ id: z.string(), version: z.string(), text: z.string() }), next: z.object({ id: z.string(), version: z.string(), text: z.string() }) }).optional(),
            filters: deepFilterSchema.partial().optional(),
            meta: z.record(z.string(), z.string()).optional(),
            anchor: z.object({ lat: z.number(), lon: z.number() }).optional(),
            point: z.object({ lat: z.number(), lon: z.number() }).nullable().optional(),
          })
          .safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        const d = parsed.data;
        return NextResponse.json({
          label: d.bounds ? temporalLabel({ validFrom: d.bounds.validFrom, validUntil: d.bounds.validUntil, publishedAt: d.bounds.publishedAt, version: undefined, isLatest: d.bounds.isLatest }) : undefined,
          fit: d.fit && d.doc ? temporalFit(d.fit, { validFrom: d.doc.validFrom, validUntil: d.doc.validUntil, publishedAt: d.doc.publishedAt, isLatest: d.doc.isLatest }) : undefined,
          comparison: d.compare ? compareTemporalVersions({ ...d.compare.old, text: d.compare.old.text }, { ...d.compare.next, text: d.compare.next.text }) : undefined,
          metadata_prefilter: d.filters && d.meta ? applyMetadataFilters(d.meta, deepFilterSchema.parse({ ...d.filters })) : undefined,
          geo: d.anchor ? geoScore(d.anchor, d.point ?? null) : undefined,
        });
      }
      case "tables": {
        const parsed = z
          .object({
            query: z.string().min(1),
            cells: z.array(z.object({ rowHeader: z.string(), colHeader: z.string(), value: z.number(), unit: z.string().default(""), location: z.string().default(""), source: z.string().default("") })).default([]),
            compare_years: z.tuple([z.string(), z.string()]).optional(),
          })
          .safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        const simple = parsed.data.cells.map((c) => ({ rowHeader: c.rowHeader, colHeader: c.colHeader, value: String(c.value) }));
        return NextResponse.json({
          score: tableCellScore(parsed.data.query, simple),
          year_max: tableYearMax(parsed.data.cells),
          percent_cells: tablePercentCells(parsed.data.cells),
          delta: parsed.data.compare_years ? tableYearDelta(parsed.data.cells, parsed.data.compare_years[0], parsed.data.compare_years[1]) : undefined,
          note: "Cite the exact cell range and show the calculation for numerical answers.",
        });
      }
      case "formulas": {
        const parsed = z
          .object({
            query: z.string().min(1),
            formulas: z.array(z.object({ latex: z.string(), normalized: z.string().default(""), variables: z.array(z.string()).default([]), concepts: z.array(z.string()).default([]), location: z.string().default("") })),
          })
          .safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json({
          results: parsed.data.formulas
            .map((f) => {
              const rec = { ...f, normalized: f.normalized || normalizeFormula(f.latex) };
              const { score, matchedAs } = formulaScore(parsed.data.query, rec);
              return { latex: f.latex, interpreted: rec.normalized, location: f.location, score, matchedAs };
            })
            .sort((a, b) => b.score - a.score),
          note: "Original notation is preserved; the interpreted form is shown separately.",
        });
      }
      case "images": {
        const parsed = z
          .object({
            query: z.string().min(1),
            figures: z.array(z.object({ caption: z.string(), labels: z.array(z.string()).default([]), topic: z.string().default(""), figureType: z.string().default(""), rights: z.string().default("unknown"), hasAxes: z.boolean().default(false) })),
          })
          .safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json({
          results: parsed.data.figures
            .map((f) => ({ caption: f.caption, score: imageScore(parsed.data.query, f), role: figureRole(f.caption, f.labels.length, f.hasAxes), rights: rightsFor(f.rights) }))
            .sort((a, b) => b.score - a.score),
        });
      }
      case "media": {
        const parsed = z
          .object({
            query: z.string().min(1),
            segments: z.array(z.object({ video_id: z.string(), start: z.number().min(0), end: z.number().min(0), transcript: z.string(), slide: z.string().default("") })),
          })
          .safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json({
          results: parsed.data.segments
            .map((s) => ({ ...mediaCitation(s.video_id, s.start, s.end), score: mediaScore(parsed.data.query, { transcript: s.transcript, slide: s.slide }), slide: s.slide }))
            .sort((a, b) => b.score - a.score),
          chapters: mediaChapters(parsed.data.segments),
        });
      }
      case "code": {
        const parsed = z
          .object({
            query: z.string().min(1),
            snippets: z.array(z.object({ symbol: z.string(), calls: z.array(z.string()).default([]), comments: z.string().default(""), language: z.string().default(""), content: z.string().default(""), license: z.string().default("unknown"), isHiddenSolution: z.boolean().default(false) })),
            requesterRole: z.string().default("learner"),
          })
          .safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json({
          results: parsed.data.snippets.map((s) => {
            const safety = codeSafetyCheck({ content: s.content, license: s.license, isHiddenSolution: s.isHiddenSolution, requesterRole: parsed.data.requesterRole });
            const rendered = sanitizeForRender({ title: s.symbol, text: safety.ok ? s.content.slice(0, 500) : "" }, safety.ok);
            return { symbol: s.symbol, language: s.language, score: safety.ok ? codeScore(parsed.data.query, s) : 0, safety, rendered };
          }),
        });
      }
      case "citations": {
        const parsed = z
          .object({
            claims: z.array(z.object({ claim: z.string().min(1), evidenceId: z.string().nullable().default(null) })),
            evidence: z.array(z.object({ id: z.string(), quote: z.string(), sourceTitle: z.string().default(""), location: z.string().default(""), version: z.string().default("v1"), accessOk: z.boolean().default(true) })),
          })
          .safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        const byId = new Map(parsed.data.evidence.map((e) => [e.id, e]));
        const answer = buildCitationGroundedAnswer(parsed.data.claims, byId);
        return NextResponse.json({ ...answer, validation: validateEvidencePackage(answer.claims.map((c) => ({ title: c.claim, source: c.sourceTitle, match: "Citation support", location: c.location, validity: "current" as const, rights: "course-private", accessibility: ["HTML"], evidence: c.quote, relatedConcepts: [], contradictions: "None flagged", score: 1, why: ["Directly supports the question"], actions: [], citation: { id: c.evidenceId, resolver: "" } }))) });
      }
      case "federated": {
        const parsed = z.object({ query: z.string().min(1), repositories: z.array(z.string()).default([]) }).safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        // No remote connectors are configured in-repo: report the gap instead
        // of implying complete coverage (spec requirement).
        return NextResponse.json({
          query: parsed.data.query,
          hits: [],
          unavailable: parsed.data.repositories,
          capabilities: {},
          note: parsed.data.repositories.length > 0 ? `Not searched (no connector configured): ${parsed.data.repositories.join(", ")} — coverage is partial.` : "No repositories requested.",
        });
      }
      case "eval": {
        const probe = z.number().min(0).max(1).optional();
        const parsed = z
          .object({
            relevant: z.array(z.string()),
            retrieved: z.array(z.string()),
            k: z.number().int().min(1).max(50).optional(),
            cited_ids: z.array(z.string()).default([]),
            permission_leaks: z.number().int().min(0).default(0),
            stale_count: z.number().int().min(0).default(0),
            duplicate_count: z.number().int().min(0).default(0),
            table_cell_accuracy: probe,
            formula_match_accuracy: probe,
            timestamp_accuracy: probe,
            diagram_label_accuracy: probe,
            code_symbol_accuracy: probe,
            cross_language_quality: probe,
            federated_coverage: probe,
            personalization_benefit: probe,
            personalization_harm: probe,
          })
          .safeParse(body);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(
          evaluateRetrievalDeep({
            relevant: new Set(parsed.data.relevant),
            retrieved: parsed.data.retrieved,
            k: parsed.data.k,
            citedIds: new Set(parsed.data.cited_ids),
            permissionLeaks: parsed.data.permission_leaks,
            staleCount: parsed.data.stale_count,
            duplicateCount: parsed.data.duplicate_count,
            tableCellAccuracy: parsed.data.table_cell_accuracy,
            formulaMatchAccuracy: parsed.data.formula_match_accuracy,
            timestampAccuracy: parsed.data.timestamp_accuracy,
            diagramLabelAccuracy: parsed.data.diagram_label_accuracy,
            codeSymbolAccuracy: parsed.data.code_symbol_accuracy,
            crossLanguageQuality: parsed.data.cross_language_quality,
            federatedCoverage: parsed.data.federated_coverage,
            personalizationBenefit: parsed.data.personalization_benefit,
            personalizationHarm: parsed.data.personalization_harm,
          }),
        );
      }
      default:
        return NextResponse.json({ error: "Unknown retrieval route" }, { status: 404 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Retrieval failed" }, { status: 500 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const authed = await retrievalContext();
  if ("error" in authed) return NextResponse.json({ error: authed.error }, { status: authed.status });

  // GET /v1/retrieval/{query_id}/evidence | .../explanation
  if (path.length === 2 && (path[1] === "evidence" || path[1] === "explanation")) {
    const stored = globalQueryStore.get(path[0]!);
    if (!stored || stored.workspaceId !== authed.ctx.workspaceId) {
      return NextResponse.json({ error: "Unknown query_id" }, { status: 404 });
    }
    // Render-time permission re-check against the LIVE caller context: each
    // stored unit is re-authorized, so enrollments revoked after serve time
    // still hide the passage (and its title/metadata) at render time.
    const bound = stored.units && stored.units.length === stored.cards.length;
    let renderFiltered = 0;
    const visible = stored.cards.filter((c, i) => {
      if (bound) {
        const allowed = passesAcl(stored.units![i]!, authed.acl);
        if (!allowed) {
          renderFiltered++;
          return false;
        }
      }
      const check = sanitizeForRender({ title: c.title, text: c.evidence }, true);
      return !("restricted" in check);
    });
    if (path[1] === "evidence") {
      return NextResponse.json({
        query_id: stored.queryId, query: stored.query, results: visible,
        validation: validateEvidencePackage(visible),
        federated_unavailable: stored.federatedUnavailable,
        render_filtered: renderFiltered,
        acl_bound: bound ?? false,
      });
    }
    return NextResponse.json({ query_id: stored.queryId, query: stored.query, explanation: stored.explanation, federated_unavailable: stored.federatedUnavailable, feedback_count: stored.feedback.length, render_filtered: renderFiltered, acl_bound: bound ?? false });
  }
  return NextResponse.json({ error: "Unknown retrieval route" }, { status: 404 });
}
