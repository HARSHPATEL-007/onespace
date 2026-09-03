import { auth } from "@n0va/auth";
import { EvidenceService } from "@n0va/modules-booklm/evidence";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const searchSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  course_id: z.string().min(1).optional(),
  setId: z.string().min(1).optional(),
  source_policy: z.string().max(50).default("course-approved"),
  time_range: z.object({ from: z.string().optional(), to: z.string().optional() }).nullish(),
  include_contradictions: z.boolean().default(true),
  max_results: z.number().int().min(1).max(50).default(20),
});

/**
 * POST /v1/evidence/search — multi-stage evidence retrieval with composite
 * rerank. Body: { query, course_id|setId, source_policy, time_range,
 * include_contradictions, max_results }
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = searchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  const setId = parsed.data.setId ?? parsed.data.course_id;
  if (!setId) return NextResponse.json({ error: "course_id (setId) is required" }, { status: 400 });

  try {
    const ev = new EvidenceService(c.workspace.id, c.user.id, c.memberRole);
    const { results, queryType } = await ev.evidenceSearch(setId, parsed.data.query, {
      limit: parsed.data.max_results,
      includeContradictions: parsed.data.include_contradictions,
      approvedOnly: parsed.data.source_policy !== "all",
      timeFrom: parsed.data.time_range?.from,
      timeTo: parsed.data.time_range?.to,
    });
    return NextResponse.json({
      query: parsed.data.query, query_type: queryType,
      results: results.map((r) => ({
        evidence_id: r.citation.id,
        document_id: r.citation.sourceDocId,
        document_version: r.citation.sourceVersion,
        source_type: r.citation.sourceType,
        locator: {
          page: r.citation.locatorPage, paragraph: r.citation.locatorParagraph,
          heading: r.citation.locatorHeading || undefined,
          line_start: r.citation.lineStart, line_end: r.citation.lineEnd,
        },
        content_hash: r.citation.contentHash || undefined,
        exact_excerpt: r.citation.quote,
        normalized_claim: r.citation.claim,
        authority_score: r.citation.authority / 100,
        extraction_confidence: r.citation.extractionConfidence,
        access_scope: r.citation.accessScope,
        epistemic_state: r.citation.epistemicState,
        verification_label: r.citation.verificationLabel,
        stages: { lexical: r.lexical, semantic: r.semantic, structural: r.structural, temporal: r.temporal, authority: r.authority, coverage: r.coverage },
        score: r.score,
        policy: r.policyCheck,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Search failed" }, { status: 500 });
  }
}
