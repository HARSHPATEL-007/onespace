import { prisma } from "@n0va/db";

export class LearningAnalyticsService {
  constructor(private readonly workspaceId: string) {}

  /** Instructor dashboard: confusion heatmap, misconception clusters, early warnings. */
  async instructorDashboard(setId: string) {
    const [mastery, attempts, concepts] = await Promise.all([
      prisma.learnerMastery.findMany({ where: { workspaceId: this.workspaceId }, include: { concept: true, user: { select: { id: true } } }, take: 1000 }),
      prisma.quizAttempt.findMany({ where: { workspaceId: this.workspaceId, setId }, include: { responses: true }, orderBy: { startedAt: "desc" }, take: 200 }),
      prisma.learnerConcept.findMany({ where: { workspaceId: this.workspaceId, setId } }),
    ]);

    const byConcept = new Map<string, { label: string; n: number; sum: number; misconceptions: number }>();
    for (const m of mastery) {
      if (m.concept.setId !== setId) continue;
      const e = byConcept.get(m.conceptId) ?? { label: m.concept.label, n: 0, sum: 0, misconceptions: 0 };
      e.n++; e.sum += m.mastery; if (m.misconceptionFlag) e.misconceptions++;
      byConcept.set(m.conceptId, e);
    }
    const heatmap = [...byConcept.entries()].map(([conceptId, v]) => ({
      conceptId, label: v.label, learners: v.n,
      avgMastery: v.n ? Math.round((v.sum / v.n) * 100) / 100 : 0,
      misconceptions: v.misconceptions,
      confused: v.n > 0 && v.sum / v.n < 0.5,
    })).sort((a, b) => a.avgMastery - b.avgMastery);

    // Misconception clusters from wrong answers grouped by conceptKey
    const wrongByConcept = new Map<string, number>();
    for (const a of attempts) for (const r of a.responses) {
      if (!r.correct && r.conceptKey) wrongByConcept.set(r.conceptKey, (wrongByConcept.get(r.conceptKey) ?? 0) + 1);
    }
    const misconceptionClusters = [...wrongByConcept.entries()]
      .map(([conceptKey, wrong]) => ({ conceptKey, wrong }))
      .sort((a, b) => b.wrong - a.wrong).slice(0, 10);

    // Assessment analytics: score distribution + drop-off
    const scores = attempts.map((a) => (a.total ? a.score / a.total : 0));
    const avgScore = scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : 0;
    const abandonment = attempts.filter((a) => !a.submittedAt).length;

    // Early warning: learners with avg mastery < 0.4 or 2+ misconceptions
    const byLearner = new Map<string, { sum: number; n: number; misc: number }>();
    for (const m of mastery) {
      if (m.concept.setId !== setId) continue;
      const e = byLearner.get(m.userId) ?? { sum: 0, n: 0, misc: 0 };
      e.sum += m.mastery; e.n++; if (m.misconceptionFlag) e.misc++;
      byLearner.set(m.userId, e);
    }
    const earlyWarnings = [...byLearner.entries()]
      .filter(([, v]) => (v.n > 0 && v.sum / v.n < 0.4) || v.misc >= 2)
      .map(([userId, v]) => ({
        userId, avgMastery: Math.round((v.sum / Math.max(1, v.n)) * 100) / 100,
        misconceptions: v.misc,
        reason: v.misc >= 2 ? "Multiple high-confidence errors — misconception repair needed" : "Overall mastery below 40%",
      }));

    return {
      conceptsTracked: concepts.length,
      heatmap,
      misconceptionClusters,
      attempts: attempts.length,
      avgScore: Math.round(avgScore * 100) / 100,
      abandonment,
      earlyWarnings,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Learner cockpit: goal, next action, mastery, deadlines, confidence calibration. */
  async learnerCockpit(setId: string, userId: string) {
    const [mastery, attempts, plan, annotations] = await Promise.all([
      prisma.learnerMastery.findMany({ where: { workspaceId: this.workspaceId, userId }, include: { concept: true }, take: 200 }),
      prisma.quizAttempt.findMany({ where: { workspaceId: this.workspaceId, setId, userId }, orderBy: { startedAt: "desc" }, take: 10, include: { responses: true } }),
      prisma.studyPlan.findUnique({ where: { workspaceId_setId_userId: { workspaceId: this.workspaceId, setId, userId } } }),
      prisma.learningAnnotation.findMany({ where: { workspaceId: this.workspaceId, setId, userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    ]);
    const inSet = mastery.filter((m) => m.concept.setId === setId);
    const avgMastery = inSet.length ? inSet.reduce((s, m) => s + m.mastery, 0) / inSet.length : 0;
    const due = inSet.filter((m) => new Date(m.nextReviewAt) <= new Date()).length;
    // Confidence calibration: avg confidence on correct vs wrong
    const allResp = attempts.flatMap((a) => a.responses);
    const correct = allResp.filter((r) => r.correct);
    const wrong = allResp.filter((r) => !r.correct);
    const avgConf = (rs: typeof allResp) => (rs.length ? rs.reduce((s, r) => s + r.confidence, 0) / rs.length : 0);
    return {
      goal: plan?.goal ?? "",
      nextAction: plan?.nextAction ?? "",
      nextActionReason: plan?.nextActionReason ?? "",
      difficulty: plan?.difficulty ?? "NOVICE",
      streakDays: plan?.streakDays ?? 0,
      mastery: Math.round(avgMastery * 100) / 100,
      conceptsTracked: inSet.length,
      dueReviews: due,
      recentScore: attempts[0] ? { score: attempts[0].score, total: attempts[0].total } : null,
      confidenceCalibration: {
        correct: Math.round(avgConf(correct) * 100) / 100,
        wrong: Math.round(avgConf(wrong) * 100) / 100,
        overconfident: wrong.length > 0 && avgConf(wrong) > 0.65,
      },
      openQuestions: annotations.filter((a) => !a.resolved).length,
    };
  }
}
