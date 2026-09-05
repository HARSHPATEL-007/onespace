import { auth } from "@n0va/auth";
import { EvidenceService } from "@n0va/modules-booklm/evidence";
import { classifyContradiction } from "@n0va/modules-booklm/epistemics";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /v1/answers/[answerId]/claim-graph — answer as a graph: atomic claims,
 * claim↔evidence edges, evidence cards, and classified disagreements
 * (issue / positions / conditions / strength / agreement / unknown).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ answerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const c = await requireWorkspace().catch(() => null);
  if (!c) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { answerId } = await params;

  try {
    const ev = new EvidenceService(c.workspace.id, c.user.id, c.memberRole);
    const { answer, claims, edges, evidence } = await ev.claimGraphForAnswer(answerId);
    const byId = new Map(evidence.map((e) => [e.id, e]));

    const disagreements = edges
      .filter((e) => e.relation === "CONTRADICTS")
      .map((e) => {
        const claim = claims.find((cl) => cl.id === (e.fromType === "CLAIM" ? e.fromId : e.toId));
        const evCard = byId.get(e.fromType === "EVIDENCE" ? e.fromId : e.toId);
        const supporting = edges.filter((x) => x.relation === "SUPPORTS" && (x.fromId === claim?.id || x.toId === claim?.id));
        const supportCards = supporting.map((s) => byId.get(s.fromType === "EVIDENCE" ? s.fromId : s.toId)).filter(Boolean);
        const kind = classifyContradiction(
          claim?.text ?? "", evCard?.quote || evCard?.claim || "", evCard?.extractionConfidence ?? 1,
        );
        return {
          issue: claim?.text ?? " disputed claim",
          positionA: supportCards[0]
            ? { claim: supportCards[0]!.claim, excerpt: supportCards[0]!.quote.slice(0, 300), source: supportCards[0]!.sourceTitle, authority: supportCards[0]!.authority }
            : null,
          positionB: evCard
            ? { claim: evCard.claim, excerpt: evCard.quote.slice(0, 300), source: evCard.sourceTitle, authority: evCard.authority }
            : null,
          kind,
          conditions: "Compare population, time period, method, and jurisdiction in the evidence cards.",
          strength: { edgeStrength: e.strength, confidence: e.confidence, validation: e.validatedStatus },
          learnerTask: "Compare, evaluate, or defend a position using the cited spans.",
        };
      });

    return NextResponse.json({
      answer: { id: answer.id, question: answer.question, mode: answer.mode, queryType: answer.queryType, scores: answer.scores, versionsUsed: answer.versionsUsed, refused: answer.refused },
      claims: claims.map((cl) => ({
        id: cl.id, text: cl.text, epistemic_state: cl.epistemicState,
        verification: cl.verificationLabel, confidence: cl.confidence, weight: cl.weight,
      })),
      edges: edges.map((e) => ({
        id: e.id, from: { type: e.fromType, id: e.fromId }, to: { type: e.toType, id: e.toId },
        relation: e.relation, strength: e.strength, confidence: e.confidence,
        evidence_span: e.evidenceSpan?.slice(0, 300), model_version: e.modelVersion,
        validation: e.validatedStatus,
      })),
      evidence: evidence.map((e) => ({
        evidence_id: e.id, document_id: e.sourceDocId, document_version: e.sourceVersion,
        source_title: e.sourceTitle, source_type: e.sourceType,
        source_date: e.sourceDate?.toISOString() ?? null,
        retrieved_at: e.freshnessAt?.toISOString() ?? null,
        freshness_score: e.freshnessScore ?? null,
        locator: { page: e.locatorPage, paragraph: e.locatorParagraph, heading: e.locatorHeading || undefined },
        content_hash: e.contentHash || undefined, exact_excerpt: e.quote,
        evidence_type: e.evidenceType, language: e.language || null, license: e.license || null,
        authority_score: e.authority / 100, extraction_confidence: e.extractionConfidence,
        epistemic_state: e.epistemicState, verification_label: e.verificationLabel,
      })),
      disagreements,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.includes("not found") ? 404 : 500 });
  }
}
