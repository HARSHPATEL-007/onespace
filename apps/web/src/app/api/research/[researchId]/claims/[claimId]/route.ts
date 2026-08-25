import { actionContext, UnauthorizedError } from "@/lib/action-context";
import { globalResearchOrchestrator } from "@n0va/modules-ani/research-orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ researchId: string; claimId: string }> },
) {
  try {
    await actionContext();
  } catch (err) {
    if (err instanceof UnauthorizedError) return Response.json({ error: "Unauthorized" }, { status: 401 });
    throw err;
  }
  const { researchId, claimId } = await params;
  const job = globalResearchOrchestrator.getJob(researchId);
  if (!job) return Response.json({ error: "Research not found" }, { status: 404 });
  const claim = job.claims.find((c: any) => c.claim_id === claimId);
  if (!claim) return Response.json({ error: "Claim not found" }, { status: 404 });

  const supporting = job.evidence.filter((e: any) => claim.supporting_evidence.includes(e.evidence_id));
  const contradicting = job.evidence.filter((e: any) => claim.contradicting_evidence.includes(e.evidence_id));
  const source = job.sources.find((s: any) => supporting[0]?.source_id === s.source_id) ?? null;

  return Response.json({
    claim,
    supporting_evidence: supporting,
    contradicting_evidence: contradicting,
    source_quality: source ? { authority: source.authority_score, methodology: source.methodology_quality } : null,
    freshness: { last_verified_at: new Date().toISOString(), freshness_class: "dynamic", recommended_recheck: new Date(Date.now() + 6 * 3600000).toISOString() },
    confidence: claim.confidence,
    scope: { time: claim.time_scope, geography: claim.geography },
    review_history: [],
  });
}
