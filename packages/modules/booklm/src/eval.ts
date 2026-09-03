import { prisma } from "@n0va/db";

/**
 * Evaluation framework — retrieval, generation, learning, and safety metrics
 * computed from stored workspace data. Metrics without instrumentation are
 * reported under `needsInstrumentation`, never fabricated.
 */
export class EvalService {
  constructor(private readonly workspaceId: string) {}

  async workspaceEval(setId?: string) {
    const ws = { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) };
    const [
      cites, answers, claims, challenges, attempts, quarantined, grades, audits,
    ] = await Promise.all([
      prisma.evidenceCitation.findMany({ where: ws, select: { id: true, contentHash: true, locatorPage: true, locatorParagraph: true, quote: true, support: true, confidence: true, accessScope: true } }),
      prisma.answerRecord.findMany({ where: ws, select: { id: true, refused: true, mode: true, scores: true, createdAt: true } }),
      prisma.claimNode.findMany({ where: ws, select: { id: true, verificationLabel: true, epistemicState: true, confidence: true, answerId: true } }),
      prisma.evidenceChallenge.findMany({ where: { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) }, select: { id: true, status: true, evidenceId: true } }),
      prisma.quizAttempt.findMany({
        where: ws, select: { id: true, score: true, total: true, responses: { select: { correct: true, confidence: true } } },
        orderBy: { startedAt: "desc" }, take: 200,
      }),
      prisma.tutorMemory.count({ where: { workspaceId: this.workspaceId, value: { startsWith: "[quarantined" } } }),
      prisma.grade.findMany({ where: { workspaceId: this.workspaceId }, select: { id: true } }),
      prisma.gradeAudit.count({ where: { workspaceId: this.workspaceId } }),
    ]);

    // --- Retrieval ---
    const resolutionRate = cites.length ? cites.filter((c) => c.contentHash).length / cites.length : 0;
    const spanAccuracy = cites.length
      ? cites.filter((c) => c.locatorPage || c.locatorParagraph || c.quote).length / cites.length : 0;
    const scopeDist = new Map<string, number>();
    for (const c of cites) scopeDist.set(c.accessScope, (scopeDist.get(c.accessScope) ?? 0) + 1);

    // --- Generation ---
    const adequateLabels = new Set(["DIRECTLY_SUPPORTED", "QUALIFIED_SUPPORT", "SYNTHESIZED"]);
    const supported = claims.filter((c) => adequateLabels.has(c.verificationLabel)).length;
    const unsupported = claims.filter((c) => ["NOT_FOUND", "UNCERTAIN"].includes(c.verificationLabel)).length;
    const conflicting = claims.filter((c) => c.verificationLabel === "CONFLICTING").length;
    const refusals = answers.filter((a) => a.refused).length;
    const edges = await prisma.claimEdge.count({ where: ws });
    const claimSupportPrecision = claims.length ? supported / claims.length : 0;
    const unsupportedClaimRate = claims.length ? unsupported / claims.length : 0;
    const contradictionOmissionProxy = conflicting; // surfaced conflicts (omission needs human-rated ground truth)
    const citationCompleteness = claims.length ? edges / claims.length : 0;
    const refusalRate = answers.length ? refusals / answers.length : 0;

    // --- Learning ---
    const allResp = attempts.flatMap((a) => a.responses);
    const correct = allResp.filter((r) => r.correct);
    const acc = allResp.length ? correct.length / allResp.length : 0;
    const avgConf = allResp.length ? allResp.reduce((s, r) => s + r.confidence, 0) / allResp.length : 0;
    const calibrationError = allResp.length ? Math.abs(avgConf - acc) : 0;
    const openChallenges = challenges.filter((c) => c.status === "OPEN").length;
    const evidenceUseQuality = cites.length ? 1 - challenges.length / Math.max(1, cites.length) : 1;

    // --- Safety ---
    const auditCompleteness = grades.length ? Math.min(1, audits / grades.length) : 1;

    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      generatedAt: new Date().toISOString(),
      scope: setId ?? "workspace",
      retrieval: {
        citations: cites.length,
        citationResolutionRate: r2(resolutionRate),
        evidenceSpanAccuracy: r2(spanAccuracy),
        accessScopeDistribution: Object.fromEntries(scopeDist),
      },
      generation: {
        answers: answers.length, claims: claims.length, refusals,
        claimSupportPrecision: r2(claimSupportPrecision),
        unsupportedClaimRate: r2(unsupportedClaimRate),
        conflictingClaimsSurfaced: contradictionOmissionProxy,
        citationCompleteness: r2(citationCompleteness),
        refusalRate: r2(refusalRate),
      },
      learning: {
        attempts: attempts.length, accuracy: r2(acc),
        calibrationError: r2(calibrationError),
        openChallenges, totalChallenges: challenges.length,
        evidenceUseQuality: r2(evidenceUseQuality),
      },
      safety: {
        quarantinedInjections: quarantined,
        auditCompleteness: r2(auditCompleteness),
        tenantIsolation: "enforced (all queries workspace-scoped)",
      },
      needsInstrumentation: [
        "recall@k / precision@k (needs rated relevance judgments)",
        "table & formula retrieval accuracy (needs span-type ground truth)",
        "transfer performance & delayed retention (needs longitudinal assessments)",
        "misconception reduction trend (needs repeated-measure design)",
        "prompt-injection success rate (needs red-team harness)",
        "biased source ranking (needs fairness audit set)",
      ],
    };
  }
}
