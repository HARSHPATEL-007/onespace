import { prisma } from "@n0va/db";
import { assemblePath, strategySummary, type PathPlan } from "./learner";

const ALT_REVIEW = ["Take a diagnostic quiz", "Continue without review", "Use a visual explanation"];
const ALT_PREREQ = ["Watch a worked example", "Skip with warning", "Ask the tutor for a bridge lesson"];

/** Quiz mode → study-strategy proxy (documented approximation). */
const MODE_STRATEGY: Record<string, string> = {
  PRACTICE: "retrieval practice", EXAM: "exam simulation", ORAL: "teaching / explanation",
  OPEN_BOOK: "worked examples", CLOSED_BOOK: "spaced recall",
};

export class RecommendationService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
  ) {}

  async list(setId?: string, status = "PROPOSED") {
    return prisma.recommendation.findMany({
      where: {
        workspaceId: this.workspaceId, userId: this.userId,
        ...(setId ? { setId } : {}),
        ...(status === "ALL" ? {} : { status: status as never }),
      },
      orderBy: { createdAt: "desc" }, take: 30,
    });
  }

  async setStatus(id: string, status: "ACCEPTED" | "REJECTED" | "DISMISSED") {
    if (status === "DISMISSED") {
      return prisma.recommendation.updateMany({
        where: { id, workspaceId: this.workspaceId, userId: this.userId },
        data: { status: "DISMISSED" as never },
      });
    }
    return prisma.recommendation.updateMany({
      where: { id, workspaceId: this.workspaceId, userId: this.userId, status: "PROPOSED" as never },
      data: { status: status as never },
    });
  }

  /**
   * Generate explainable recommendations. Every recommendation answers:
   * why this, what evidence, what problem, why this resource, what if skipped
   * (via alternatives + expected benefit). Old proposals expire.
   */
  async generate(setId: string) {
    await prisma.recommendation.updateMany({
      where: {
        workspaceId: this.workspaceId, userId: this.userId, setId,
        status: "PROPOSED" as never, createdAt: { lt: new Date(Date.now() - 7 * 86_400_000) },
      },
      data: { status: "EXPIRED" as never },
    });

    const [mastery, misconceptions, concepts, goals, recentErrors] = await Promise.all([
      prisma.learnerMastery.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId },
        include: { concept: { select: { id: true, key: true, label: true, setId: true } } },
        take: 500,
      }),
      prisma.misconception.findMany({
        where: {
          workspaceId: this.workspaceId, userId: this.userId,
          status: { notIn: ["RESOLVED", "DISMISSED"] as never },
        },
        include: { concept: { select: { id: true, key: true, label: true, setId: true } } },
        take: 50,
      }),
      prisma.learnerConcept.findMany({ where: { workspaceId: this.workspaceId, setId }, take: 200 }),
      prisma.learnerGoal.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId, status: "ACTIVE" as never }, take: 20,
      }),
      prisma.masteryObservation.findMany({
        where: {
          workspaceId: this.workspaceId, userId: this.userId, value: { lt: 0.4 },
          createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) },
        },
        include: { concept: { select: { id: true, label: true, setId: true } } },
        orderBy: { createdAt: "desc" }, take: 50,
      }),
    ]);

    const conceptIds = new Set(concepts.map((c) => c.id));
    const inSet = mastery.filter((m) => conceptIds.has(m.conceptId));
    const byConcept = new Map(inSet.map((m) => [m.conceptId, m]));
    const deps = await prisma.conceptDependency.findMany({
      where: { workspaceId: this.workspaceId, toId: { in: [...conceptIds] } },
      include: {
        from: { select: { id: true, key: true, label: true } },
        to: { select: { id: true, key: true, label: true } },
      },
      take: 200,
    });

    const out: {
      action: string; reasonCodes: string[]; explanation: string[];
      evidence: string[]; alternatives: string[]; expectedBenefit: string; confidence: number;
    }[] = [];

    // 1. Hard prerequisite gaps (never skip without warning).
    for (const d of deps.filter((x) => x.kind === "HARD" || x.mandatory)) {
      const pre = byConcept.get(d.fromId);
      const preMastery = pre?.mastery ?? 0;
      if (preMastery < 0.4) {
        out.push({
          action: `review_${d.from.key}`,
          reasonCodes: ["prerequisite_gap"],
          explanation: [
            `${d.from.label} is a hard prerequisite for ${d.to.label}, and your mastery is ${Math.round(preMastery * 100)}%.`,
            `A 12-minute review is sufficient before retrying ${d.to.label}.`,
          ],
          evidence: [d.id, d.from.id, d.to.id],
          alternatives: ALT_PREREQ,
          expectedBenefit: `unlock reliable progress on ${d.to.label}`,
          confidence: 0.81,
        });
      }
    }

    // 2. Active misconceptions → revisit before they spread.
    for (const m of misconceptions.filter((x) => x.concept.setId === setId).slice(0, 3)) {
      out.push({
        action: `revisit_${m.concept.key}`,
        reasonCodes: ["misconception_detected"],
        explanation: [
          `A current interpretation of ${m.concept.label} needs revisiting: "${m.statement.slice(0, 140)}".`,
          m.counterevidence.length
            ? `${m.counterevidence.length} counterexamples are ready to work through.`
            : `We'll generate a counterexample and test it in a new context.`,
        ],
        evidence: [m.id, m.concept.id, ...m.detectedFrom.slice(0, 3)],
        alternatives: ["See why it seems plausible first", "Ask the instructor", "Defer to later"],
        expectedBenefit: `stop the error pattern from spreading to ${m.affectedConceptIds.length || "related"} concepts`,
        confidence: Math.min(0.9, 0.5 + m.confidence * 0.4),
      });
    }

    // 3. Decay-due reviews.
    const due = inSet.filter((m) => new Date(m.nextReviewAt) <= new Date()).slice(0, 3);
    for (const m of due) {
      out.push({
        action: `refresh_${m.concept.key}`,
        reasonCodes: ["mastery_decay"],
        explanation: [
          `${m.concept.label} is scheduled for review because recall has not been checked since ${new Date(m.lastSeenAt).toLocaleDateString()}.`,
          `One short retrieval prompt — not a full lesson restart.`,
        ],
        evidence: [m.conceptId],
        alternatives: ["Take a 2-minute retrieval check", "Snooze 3 days", "Mark as known"],
        expectedBenefit: "protect durable retention with minimal time",
        confidence: 0.76,
      });
    }

    // 4. Goal alignment.
    for (const g of goals.slice(0, 2)) {
      const weak = g.competencyKeys
        .map((k) => concepts.find((c) => c.key === k))
        .filter((c) => c && (byConcept.get(c.id)?.mastery ?? 0) < 0.6)
        .slice(0, 3);
      for (const c of weak) {
        if (!c) continue;
        out.push({
          action: `advance_${c.key}`,
          reasonCodes: ["goal_alignment"],
          explanation: [
            `${c.label} is required for your goal "${g.title}" and is currently developing.`,
          ],
          evidence: [g.id, c.id],
          alternatives: ["Adjust the goal deadline", "Pick a different competency first", "Get a visual explanation"],
          expectedBenefit: `move "${g.title}" forward`,
          confidence: 0.72,
        });
      }
    }

    // 5. Transfer opportunities: reliable but never tried in a novel context.
    const transferReady = inSet.filter((m) =>
      ["RELIABLE", "DURABLE", "INDEPENDENT"].includes(m.status)
      && !((m.transferContexts as { success: boolean }[] | null) ?? []).some((t) => t.success),
    ).slice(0, 2);
    for (const m of transferReady) {
      out.push({
        action: `transfer_${m.concept.key}`,
        reasonCodes: ["transfer_opportunity"],
        explanation: [
          `${m.concept.label} is reliable in familiar contexts but untested in a novel one.`,
          `One unseen case study converts it into portable knowledge.`,
        ],
        evidence: [m.conceptId],
        alternatives: ["Stay with familiar exercises", "Teach it to a peer instead"],
        expectedBenefit: "transfer-capable mastery",
        confidence: 0.68,
      });
    }

    // 6. Recent struggle pattern.
    const struggleKeys = new Set(recentErrors.filter((e) => e.concept.setId === setId).map((e) => e.conceptId));
    for (const cid of [...struggleKeys].slice(0, 2)) {
      const c = concepts.find((x) => x.id === cid);
      if (!c || out.some((o) => o.action === `revisit_${c.key}`)) continue;
      out.push({
        action: `repair_${c.key}`,
        reasonCodes: ["recent_struggle"],
        explanation: [`Recent attempts on ${c.label} show an error pattern over the last 14 days.`],
        evidence: recentErrors.filter((e) => e.conceptId === cid).map((e) => e.id).slice(0, 5),
        alternatives: ALT_REVIEW,
        expectedBenefit: "break the error pattern early",
        confidence: 0.7,
      });
    }

    const created = [];
    for (const r of out.slice(0, 8)) {
      created.push(await prisma.recommendation.create({
        data: {
          workspaceId: this.workspaceId, userId: this.userId, setId,
          action: r.action, reasonCodes: r.reasonCodes, explanation: r.explanation,
          evidence: r.evidence, alternatives: r.alternatives,
          expectedBenefit: r.expectedBenefit, confidence: r.confidence,
          expiresAt: new Date(Date.now() + 7 * 86_400_000),
        },
      }));
    }
    return created;
  }

  /** Adaptive path alternatives with explicit speed/depth trade-offs. */
  async planPaths(setId: string): Promise<PathPlan[]> {
    const [mastery, misconceptions, concepts] = await Promise.all([
      prisma.learnerMastery.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId },
        include: { concept: { select: { id: true, key: true, label: true, setId: true } } },
        take: 500,
      }),
      prisma.misconception.findMany({
        where: {
          workspaceId: this.workspaceId, userId: this.userId,
          status: { notIn: ["RESOLVED", "DISMISSED"] as never },
        },
        include: { concept: { select: { id: true, key: true, label: true, setId: true } } },
        take: 50,
      }),
      prisma.learnerConcept.findMany({ where: { workspaceId: this.workspaceId, setId }, take: 200 }),
    ]);
    const conceptIds = new Set(concepts.map((c) => c.id));
    const byConcept = new Map(mastery.filter((m) => conceptIds.has(m.conceptId)).map((m) => [m.conceptId, m]));
    const deps = await prisma.conceptDependency.findMany({
      where: { workspaceId: this.workspaceId, toId: { in: [...conceptIds] }, kind: "HARD" as never },
      include: { from: { select: { id: true, key: true, label: true } } },
      take: 200,
    });

    type Gap = { conceptKey: string; label: string; kind: string; weight: number };
    const hardGaps: Gap[] = deps
      .filter((d) => (byConcept.get(d.fromId)?.mastery ?? 0) < 0.4)
      .map((d) => ({ conceptKey: d.from.key, label: d.from.label, kind: "prerequisite", weight: 1.5 }));
    const weak: Gap[] = [...byConcept.values()]
      .filter((m) => m.mastery < 0.6)
      .map((m) => ({ conceptKey: m.concept.key, label: m.concept.label, kind: "gap", weight: 1 - m.mastery }));
    const decay: Gap[] = [...byConcept.values()]
      .filter((m) => new Date(m.nextReviewAt) <= new Date())
      .map((m) => ({ conceptKey: m.concept.key, label: m.concept.label, kind: "decay", weight: 0.7 }));
    const misc: Gap[] = misconceptions.filter((m) => m.concept.setId === setId)
      .map((m) => ({ conceptKey: m.concept.key, label: m.concept.label, kind: "misconception", weight: 1.2 }));
    const transfer: Gap[] = [...byConcept.values()]
      .filter((m) => ["RELIABLE", "DURABLE"].includes(m.status))
      .map((m) => ({ conceptKey: m.concept.key, label: m.concept.label, kind: "transfer", weight: 0.6 }));

    return [
      assemblePath("Minimum viable path", "fastest to unblock; skips enrichment", hardGaps.slice(0, 5)),
      assemblePath("Recommended path", "balanced speed and durability", [...hardGaps, ...misc, ...weak.slice(0, 4), ...decay.slice(0, 2)]),
      assemblePath("Deep mastery path", "slowest; adds transfer + analysis depth", [...hardGaps, ...weak.slice(0, 5), ...transfer.slice(0, 3)]),
      assemblePath("Fast revision path", "review only; no new concepts", decay.slice(0, 6)),
      assemblePath("Remediation path", "fixes error patterns first", [...misc, ...weak.filter((w) => w.weight > 0.6).slice(0, 4)]),
    ];
  }

  /** Which study strategies actually work for this learner (per-strategy tallies). */
  async strategyEffectiveness() {
    const attempts = await prisma.quizAttempt.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      select: { mode: true, score: true, total: true },
      orderBy: { startedAt: "desc" }, take: 200,
    });
    const tallies: Record<string, { success: number; total: number }> = {};
    for (const a of attempts) {
      const key = MODE_STRATEGY[a.mode] ?? a.mode.toLowerCase();
      const t = tallies[key] ?? { success: 0, total: 0 };
      t.total++;
      if (a.total > 0 && a.score / a.total >= 0.7) t.success++;
      tallies[key] = t;
    }
    return {
      strategies: strategySummary(tallies),
      note: "Effectiveness is per strategy and context (quiz mode as proxy), never a fixed learner trait.",
    };
  }
}
