import { z } from "zod";
import { prisma } from "@n0va/db";
import {
  DIMENSIONS, decayRich, estimateInterval, inferStatus, nextForwardState,
  transitionRequires, cohortBand, cohortSafe, type Dimension,
} from "./learner";

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["academic", "role", "certification", "project", "language", "research", "teaching", "personal", "accessibility", "intensive"]).default("academic"),
  modalities: z.array(z.string().max(40)).max(10).default([]),
  timeCapMin: z.number().int().min(5).max(600).optional(),
  standards: z.string().max(500).default(""),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export const goalSchema = z.object({
  profileId: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(""),
  competencyKeys: z.array(z.string().max(120)).max(30).default([]),
  deadline: z.string().optional(),
});

export const observeSchema = z.object({
  conceptId: z.string().min(1),
  profileId: z.string().optional(),
  dimension: z.enum(DIMENSIONS).default("recall"),
  value: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1).default(0.5),
  sourceType: z.string().max(60).default("assessment"),
  sourceId: z.string().max(120).default(""),
  context: z.string().max(500).default(""),
  novelty: z.number().min(0).max(1).default(0),
  visibility: z.string().max(60).default("learner-and-instructor"),
});

export const correctionSchema = z.object({
  targetType: z.enum(["mastery", "goal", "profile"]),
  targetId: z.string().min(1),
  field: z.string().max(60),
  newValue: z.string().max(2000),
  reason: z.string().max(1000).default(""),
  scope: z.string().max(60).default("profile"),
});

const LAMBDA_BY_DOMAIN: Record<string, number> = { general: 0.05 };

export class LearnerGraphService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string = "member",
  ) {}

  // -- Profiles ------------------------------------------------------------
  async listProfiles() {
    await prisma.learnerProfile.updateMany({
      where: { workspaceId: this.workspaceId, userId: this.userId, expiresAt: { lt: new Date() } },
      data: {},
    });
    return prisma.learnerProfile.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      include: { learnerGoals: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  async createProfile(input: z.infer<typeof profileSchema>) {
    const existing = await prisma.learnerProfile.count({
      where: { workspaceId: this.workspaceId, userId: this.userId },
    });
    return prisma.learnerProfile.create({
      data: {
        workspaceId: this.workspaceId, userId: this.userId,
        name: input.name, kind: input.kind, modalities: input.modalities,
        timeCapMin: input.timeCapMin ?? null, standards: input.standards,
        isDefault: existing === 0,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
      },
    });
  }

  async setDefaultProfile(id: string) {
    await prisma.learnerProfile.updateMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      data: { isDefault: false },
    });
    return prisma.learnerProfile.updateMany({
      where: { id, workspaceId: this.workspaceId, userId: this.userId },
      data: { isDefault: true },
    });
  }

  // -- Goals ----------------------------------------------------------------
  async listGoals(profileId?: string, status?: string) {
    return prisma.learnerGoal.findMany({
      where: {
        workspaceId: this.workspaceId, userId: this.userId,
        ...(profileId ? { profileId } : {}),
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { updatedAt: "desc" }, take: 50,
    });
  }

  async createGoal(input: z.infer<typeof goalSchema>) {
    return prisma.learnerGoal.create({
      data: {
        workspaceId: this.workspaceId, userId: this.userId,
        profileId: input.profileId || null, title: input.title,
        description: input.description, competencyKeys: input.competencyKeys,
        deadline: input.deadline ? new Date(input.deadline) : null,
      },
    });
  }

  async setGoalStatus(id: string, status: "ACTIVE" | "PAUSED" | "COMPLETED" | "ABANDONED", progress?: number) {
    return prisma.learnerGoal.updateMany({
      where: { id, workspaceId: this.workspaceId, userId: this.userId },
      data: { status: status as never, ...(progress !== undefined ? { progress } : {}) },
    });
  }

  // -- Observations (event-sourced learner-state updates) --------------------
  async observe(input: z.infer<typeof observeSchema>) {
    const obs = await prisma.masteryObservation.create({
      data: {
        workspaceId: this.workspaceId, conceptId: input.conceptId, userId: this.userId,
        profileId: input.profileId || null, dimension: input.dimension,
        value: input.value, confidence: input.confidence,
        sourceType: input.sourceType, sourceId: input.sourceId,
        context: input.context, novelty: input.novelty,
        modelVersion: "mastery-model-2.4",
      },
    });

    // Fold into dimensional mastery (evidence-weighted running average).
    const mastery = await prisma.learnerMastery.findUnique({
      where: { workspaceId_conceptId_userId: { workspaceId: this.workspaceId, conceptId: input.conceptId, userId: this.userId } },
    });
    const dims = ((mastery?.dimensions ?? {}) as Record<string, number>);
    const prior = dims[input.dimension] ?? 0;
    const n = (mastery?.evidenceCount ?? 0) + 1;
    const merged = (prior * (n - 1) + input.value) / n;
    dims[input.dimension] = Math.round(merged * 1000) / 1000;

    // History signals for the state machine.
    const recent = await prisma.masteryObservation.findMany({
      where: { workspaceId: this.workspaceId, conceptId: input.conceptId, userId: this.userId },
      orderBy: { createdAt: "desc" }, take: 10,
      select: { value: true, createdAt: true, novelty: true, context: true },
    });
    const correctStreak = recent.filter((r) => r.value >= 0.6).length;
    const days = new Set(recent.map((r) => new Date(r.createdAt).toDateString())).size;
    const daysSinceVerified = mastery?.lastVerifiedAt
      ? (Date.now() - new Date(mastery.lastVerifiedAt).getTime()) / 86_400_000 : 0;
    const recallDim = dims.recall ?? merged;
    const decayPred = decayRich(recallDim, daysSinceVerified, LAMBDA_BY_DOMAIN.general!, 0.3, 0.2, 0);

    const inferred = inferStatus({
      current: (mastery?.status ?? "UNKNOWN") as never,
      correct: input.value >= 0.6, repeatedSuccess: correctStreak,
      sessionsConsistent: days >= 3 && correctStreak >= 3,
      novelContext: input.novelty >= 0.6 && input.value >= 0.6,
      delayedSuccess: input.sourceType === "delayed_retrieval" && input.value >= 0.6,
      noScaffold: input.sourceType === "unscaffolded_task" && input.value >= 0.6,
      taughtAccurately: input.sourceType === "teaching" && input.value >= 0.7,
      daysSinceVerified, decayPredicted: decayPred,
      conflicting: false, misapplied: input.novelty >= 0.6 && input.value < 0.4,
      superseded: false,
    });

    const aggregate = Object.values(dims).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(dims).length);
    const ranges: Record<string, { lo: number; hi: number; band: string }> = {};
    for (const [k, v] of Object.entries(dims)) ranges[k] = estimateInterval(v, n);

    await prisma.learnerMastery.upsert({
      where: { workspaceId_conceptId_userId: { workspaceId: this.workspaceId, conceptId: input.conceptId, userId: this.userId } },
      update: {
        mastery: Math.round(aggregate * 1000) / 1000,
        confidence: input.confidence, dimensions: dims as never, dimensionRanges: ranges as never,
        status: inferred.status as never, stateEvidence: `${input.sourceType}:${input.sourceId || "direct"} — ${inferred.reason}`.slice(0, 500),
        lastSeenAt: new Date(), lastVerifiedAt: input.value >= 0.6 ? new Date() : undefined,
        evidenceCount: { increment: 1 },
        transferContexts: input.novelty >= 0.5
          ? ([...((mastery?.transferContexts as { context: string; success: boolean }[] | null) ?? []),
              { context: input.context || input.sourceType, success: input.value >= 0.6 }].slice(-20) as never)
          : undefined,
      },
      create: {
        workspaceId: this.workspaceId, conceptId: input.conceptId, userId: this.userId,
        mastery: Math.round(input.value * 1000) / 1000, confidence: input.confidence,
        dimensions: { [input.dimension]: input.value } as never,
        dimensionRanges: { [input.dimension]: estimateInterval(input.value, 1) } as never,
        status: input.value >= 0.6 ? ("EMERGING" as never) : ("EXPOSED" as never),
        stateEvidence: `${input.sourceType} — first observation`,
        lastVerifiedAt: input.value >= 0.6 ? new Date() : null,
        evidenceCount: 1,
      },
    });
    return { observation: obs, status: inferred.status, reason: inferred.reason };
  }

  /**
   * Evidence-linked mastery claim: what is asserted, what supports it,
   * what contradicts it, and the current status in plain language. No
   * leap from a single quiz score to a broad conclusion.
   */
  async masteryClaim(conceptId: string) {
    const [concept, mastery, observations, misconceptions] = await Promise.all([
      prisma.learnerConcept.findFirst({ where: { id: conceptId, workspaceId: this.workspaceId } }),
      prisma.learnerMastery.findUnique({
        where: { workspaceId_conceptId_userId: { workspaceId: this.workspaceId, conceptId, userId: this.userId } },
        include: { concept: { select: { key: true, label: true } } },
      }),
      prisma.masteryObservation.findMany({
        where: { workspaceId: this.workspaceId, conceptId, userId: this.userId },
        orderBy: { createdAt: "desc" }, take: 50,
      }),
      prisma.misconception.findMany({
        where: { workspaceId: this.workspaceId, conceptId, userId: this.userId, status: { notIn: ["RESOLVED", "DISMISSED"] as never } },
        take: 10,
      }),
    ]);
    if (!concept) throw new Error("Concept not found");
    const dims = ((mastery?.dimensions ?? {}) as Record<string, number>);
    const entries = Object.entries(dims).sort((a, b) => b[1] - a[1]);
    const supporting = observations
      .filter((o) => o.value >= 0.6)
      .slice(0, 5)
      .map((o) => ({
        dimension: o.dimension, value: o.value,
        source: `${o.sourceType}:${o.sourceId || "direct"}`,
        at: o.createdAt.toISOString(), novelty: o.novelty,
      }));
    const contradicting = [
      ...observations
        .filter((o) => o.value < 0.4)
        .slice(0, 3)
        .map((o) => ({
          kind: "low_observation" as const,
          dimension: o.dimension, value: o.value,
          source: `${o.sourceType}:${o.sourceId || "direct"}`,
          at: o.createdAt.toISOString(),
        })),
      ...misconceptions.slice(0, 3).map((m) => ({
        kind: "misconception" as const,
        dimension: "conceptual", value: null as number | null,
        source: `misconception:${m.id}`,
        at: m.createdAt.toISOString(),
      })),
    ];
    const statusSentence = !mastery
      ? "No mastery record yet — exposure only, never treated as mastery."
      : entries.length === 0
        ? `Status ${mastery.status}: evidence still thin.`
        : `${entries[0]![0]}: strong; ${entries[entries.length - 1]![0]}: developing. Status ${mastery.status}.`;
    return {
      conceptId, key: concept.key, label: concept.label,
      claim: mastery
        ? `Mastery ${Math.round(mastery.mastery * 100)}% (${mastery.status}) across ${entries.length} dimension(s), ${mastery.evidenceCount} evidence event(s)`
        : "No mastery claim — insufficient evidence",
      status: mastery?.status ?? "UNKNOWN",
      dimensions: dims,
      dimensionRanges: (mastery?.dimensionRanges ?? {}) as Record<string, { lo: number; hi: number; band: string }>,
      supporting,
      contradicting,
      statusSentence,
      lastVerifiedAt: mastery?.lastVerifiedAt?.toISOString() ?? null,
    };
  }

  /**
   * Transfer profile: where knowledge traveled and where it stalled.
   * Contexts succeeded/failed, novelty distribution, and a distance
   * summary — transfer measured in genuinely new contexts, not repeats.
   */
  async transferProfile(conceptId: string) {
    const [concept, mastery] = await Promise.all([
      prisma.learnerConcept.findFirst({ where: { id: conceptId, workspaceId: this.workspaceId } }),
      prisma.learnerMastery.findUnique({
        where: { workspaceId_conceptId_userId: { workspaceId: this.workspaceId, conceptId, userId: this.userId } },
      }),
    ]);
    if (!concept) throw new Error("Concept not found");
    const contexts = ((mastery?.transferContexts ?? []) as { context: string; success: boolean }[]).slice(-20);
    const novel = await prisma.masteryObservation.findMany({
      where: { workspaceId: this.workspaceId, conceptId, userId: this.userId, novelty: { gte: 0.5 } },
      orderBy: { createdAt: "asc" }, take: 100,
    });
    const succeeded = contexts.filter((c) => c.success).map((c) => c.context);
    const failed = contexts.filter((c) => !c.success).map((c) => c.context);
    const novelties = novel.map((o) => o.novelty);
    const avgNovelty = novelties.length ? Math.round((novelties.reduce((s, v) => s + v, 0) / novelties.length) * 100) / 100 : null;
    return {
      conceptId, key: concept.key, label: concept.label,
      succeededContexts: [...new Set(succeeded)].slice(0, 10),
      failedContexts: [...new Set(failed)].slice(0, 10),
      novelAttempts: novel.length,
      avgNovelty,
      transferDistance: avgNovelty == null
        ? "unmeasured — no novel-context attempts yet"
        : avgNovelty >= 0.8 ? "far transfer tested" : avgNovelty >= 0.6 ? "near transfer tested" : "low-novelty practice only",
      dimsTransfer: ((mastery?.dimensions ?? {}) as Record<string, number>).transfer ?? null,
    };
  }

  /**
   * Confidence map: per-concept dimensional intervals (estimate ranges,
   * not false precision) for the confidence-map graph mode.
   */
  async confidenceMap(setId?: string) {
    const rows = await prisma.learnerMastery.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      include: { concept: { select: { id: true, key: true, label: true, setId: true } } },
      take: 300,
    });
    return rows
      .filter((m) => !setId || m.concept.setId === setId)
      .map((m) => ({
        conceptId: m.conceptId, key: m.concept.key, label: m.concept.label,
        status: m.status, confidence: m.confidence, evidenceCount: m.evidenceCount,
        intervals: (m.dimensionRanges ?? {}) as Record<string, { lo: number; hi: number; band: string }>,
        lastVerifiedAt: m.lastVerifiedAt?.toISOString() ?? null,
      }));
  }

  /**
   * Cross-course competency map: shared concept keys across sets with
   * per-course status. Related but distinct contexts — never merged into
   * one number, never treated as contradictory data.
   */
  async competencyMap(setIds: string[]) {
    const concepts = await prisma.learnerConcept.findMany({
      where: { workspaceId: this.workspaceId, setId: { in: setIds.slice(0, 10) } },
      take: 500,
    });
    const mastery = await prisma.learnerMastery.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      take: 1000,
    });
    const byId = new Map(mastery.map((m) => [m.conceptId, m]));
    const byKey = new Map<string, { key: string; courses: { setId: string; conceptId: string; label: string; status: string; mastery: number | null }[] }>();
    for (const c of concepts) {
      const g = byKey.get(c.key) ?? { key: c.key, courses: [] };
      const m = byId.get(c.id);
      g.courses.push({
        setId: c.setId ?? "", conceptId: c.id, label: c.label,
        status: m?.status ?? "UNKNOWN", mastery: m?.mastery ?? null,
      });
      byKey.set(c.key, g);
    }
    return [...byKey.values()]
      .filter((g) => g.courses.length > 1)
      .map((g) => ({ ...g, shared: true as const }))
      .sort((a, b) => b.courses.length - a.courses.length)
      .slice(0, 100);
  }

  // -- Temporal queries -------------------------------------------------------
  async conceptHistory(conceptId: string, limit = 50) {
    const [concept, observations, mastery] = await Promise.all([
      prisma.learnerConcept.findFirst({ where: { id: conceptId, workspaceId: this.workspaceId } }),
      prisma.masteryObservation.findMany({
        where: { workspaceId: this.workspaceId, conceptId, userId: this.userId },
        orderBy: { createdAt: "asc" }, take: Math.min(limit, 200),
      }),
      prisma.learnerMastery.findUnique({
        where: { workspaceId_conceptId_userId: { workspaceId: this.workspaceId, conceptId, userId: this.userId } },
      }),
    ]);
    return { concept, mastery, observations };
  }

  async whatChanged(sinceDays = 30) {
    const since = new Date(Date.now() - sinceDays * 86_400_000);
    const observations = await prisma.masteryObservation.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId, createdAt: { gte: since } },
      include: { concept: { select: { id: true, label: true, key: true } } },
      orderBy: { createdAt: "desc" }, take: 200,
    });
    const byConcept = new Map<string, { label: string; first: number; last: number; n: number }>();
    for (const o of [...observations].reverse()) {
      const e = byConcept.get(o.conceptId) ?? { label: o.concept.label, first: o.value, last: o.value, n: 0 };
      e.last = o.value; e.n++;
      byConcept.set(o.conceptId, e);
    }
    return [...byConcept.entries()].map(([conceptId, v]) => ({
      conceptId, label: v.label, delta: Math.round((v.last - v.first) * 100) / 100,
      observations: v.n,
      direction: v.last > v.first + 0.05 ? "improving" : v.last < v.first - 0.05 ? "declining" : "stable",
    })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  async decayedSkills(limit = 20) {
    const rows = await prisma.learnerMastery.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      include: { concept: { select: { id: true, label: true, key: true, setId: true } } },
      take: 500,
    });
    const now = Date.now();
    return rows
      .map((m) => {
        const dims = (m.dimensions ?? {}) as Record<string, number>;
        const recall = dims.recall ?? m.mastery;
        const days = m.lastVerifiedAt ? (now - new Date(m.lastVerifiedAt).getTime()) / 86_400_000 : 999;
        const predicted = decayRich(recall, days, LAMBDA_BY_DOMAIN.general!, 0.3, 0.2, m.misconceptionFlag ? 0.5 : 0);
        return {
          conceptId: m.conceptId, label: m.concept.label, key: m.concept.key, setId: m.concept.setId,
          status: m.status, recall: Math.round(recall * 100) / 100,
          daysSinceVerified: Math.round(days), predicted,
        };
      })
      .filter((r) => r.predicted < 0.5 || r.status === "DECAYING")
      .sort((a, b) => a.predicted - b.predicted)
      .slice(0, limit);
  }

  // -- Learner-controlled corrections (first-class events, undoable) -----------
  async correctionImpactPreview(targetType: string, targetId: string) {
    const recs = await prisma.recommendation.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId, status: "PROPOSED" as never },
      select: { id: true, action: true, evidence: true },
      take: 50,
    });
    const affected = recs.filter((r) => r.evidence.some((e) => e.includes(targetId)));
    return {
      affectedRecommendations: affected.map((r) => ({ id: r.id, action: r.action })),
      note: "Applying the correction recalculates personalization; the prior state is preserved and can be restored.",
    };
  }

  async applyCorrection(input: z.infer<typeof correctionSchema>) {
    let oldValue = "";
    if (input.targetType === "mastery") {
      const m = await prisma.learnerMastery.findFirst({
        where: { conceptId: input.targetId, workspaceId: this.workspaceId, userId: this.userId },
      });
      const dims = ((m?.dimensions ?? {}) as Record<string, number>);
      oldValue = String(dims[input.field] ?? m?.mastery ?? "");
      if (input.field !== "aggregate" && !(DIMENSIONS as readonly string[]).includes(input.field)) {
        throw new Error(`Unknown dimension ${input.field}`);
      }
      const v = Math.max(0, Math.min(1, Number(input.newValue)));
      if (Number.isNaN(v)) throw new Error("newValue must be a number 0..1 for mastery corrections");
      dims[input.field === "aggregate" ? "recall" : input.field] = v;
      if (m) {
        await prisma.learnerMastery.update({
          where: { id: m.id },
          data: {
            dimensions: dims as never,
            stateEvidence: `learner correction: ${input.field} → ${v} (${input.reason || "no reason given"})`.slice(0, 500),
          },
        });
      }
      await prisma.masteryObservation.create({
        data: {
          workspaceId: this.workspaceId, conceptId: input.targetId, userId: this.userId,
          dimension: input.field, value: v, confidence: 0.9,
          sourceType: "learner_correction", sourceId: "correction",
          context: input.reason, modelVersion: "learner-override-1.0",
        },
      });
    } else if (input.targetType === "goal") {
      const g = await prisma.learnerGoal.findFirst({
        where: { id: input.targetId, workspaceId: this.workspaceId, userId: this.userId },
      });
      if (!g) throw new Error("Goal not found");
      oldValue = input.field === "progress" ? String(g.progress) : input.field === "status" ? g.status : g.title;
      await prisma.learnerGoal.update({
        where: { id: g.id },
        data: input.field === "progress"
          ? { progress: Math.max(0, Math.min(1, Number(input.newValue))) }
          : input.field === "status"
            ? { status: input.newValue as never }
            : { title: input.newValue.slice(0, 200) },
      });
    } else {
      throw new Error(`Corrections for ${input.targetType} use profile settings directly`);
    }
    return prisma.graphCorrection.create({
      data: {
        workspaceId: this.workspaceId, userId: this.userId,
        targetType: input.targetType, targetId: input.targetId, field: input.field,
        oldValue: oldValue.slice(0, 2000), newValue: input.newValue.slice(0, 2000),
        reason: input.reason, scope: input.scope,
      },
    });
  }

  async undoCorrection(id: string) {
    const c = await prisma.graphCorrection.findFirst({
      where: { id, workspaceId: this.workspaceId, userId: this.userId },
    });
    if (!c || c.undone) throw new Error("Correction not found or already undone");
    if (c.targetType === "mastery") {
      const m = await prisma.learnerMastery.findFirst({
        where: { conceptId: c.targetId, workspaceId: this.workspaceId, userId: this.userId },
      });
      if (m && c.field !== "aggregate" && (DIMENSIONS as readonly string[]).includes(c.field)) {
        const dims = ((m.dimensions ?? {}) as Record<string, number>);
        dims[c.field] = Number(c.oldValue) || 0;
        await prisma.learnerMastery.update({ where: { id: m.id }, data: { dimensions: dims as never } });
      }
    } else if (c.targetType === "goal") {
      if (c.field === "progress") {
        await prisma.learnerGoal.updateMany({
          where: { id: c.targetId, workspaceId: this.workspaceId, userId: this.userId },
          data: { progress: Number(c.oldValue) || 0 },
        });
      }
    }
    return prisma.graphCorrection.update({ where: { id }, data: { undone: true } });
  }

  async listCorrections() {
    return prisma.graphCorrection.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      orderBy: { createdAt: "desc" }, take: 50,
    });
  }

  // -- Cohort comparison (aggregate-only, suppressed when small) ---------------
  async cohortComparison(conceptId: string) {
    const rows = await prisma.learnerMastery.findMany({
      where: { workspaceId: this.workspaceId, conceptId },
      select: { mastery: true, dimensions: true },
      take: 5000,
    });
    const n = rows.length;
    if (!cohortSafe(n)) {
      return { suppressed: true as const, n, reason: `Cohort too small (n=${n}); comparisons need n≥10 to prevent re-identification.` };
    }
    const mine = await prisma.learnerMastery.findUnique({
      where: { workspaceId_conceptId_userId: { workspaceId: this.workspaceId, conceptId, userId: this.userId } },
    });
    const vals = rows.map((r) => r.mastery).sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length / 2)]!;
    const recallVals = rows.map((r) => ((r.dimensions ?? {}) as Record<string, number>).recall ?? r.mastery).sort((a, b) => a - b);
    const recallMedian = recallVals[Math.floor(recallVals.length / 2)]!;
    const myDims = ((mine?.dimensions ?? {}) as Record<string, number>);
    return {
      suppressed: false as const, n,
      recall: mine ? cohortBand(myDims.recall ?? mine.mastery, recallMedian) : "unknown",
      overall: mine ? cohortBand(mine.mastery, median) : "unknown",
      transfer: myDims.transfer !== undefined
        ? cohortBand(myDims.transfer, median) : "unknown",
      note: "Bands vs cohort median only — no peer rankings are ever displayed.",
    };
  }

  // -- Export (portable, standards-compatible shapes) --------------------------
  async exportGraph(opts?: { profileId?: string; includeConfidence?: boolean; level?: string }) {
    const level = opts?.level ?? "record";
    const includeConfidence = opts?.includeConfidence ?? true;
    const [concepts, mastery, goals, observations, misconceptions, corrections] = await Promise.all([
      prisma.learnerConcept.findMany({ where: { workspaceId: this.workspaceId }, take: 500 }),
      prisma.learnerMastery.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId },
        include: { concept: { select: { key: true, label: true } } }, take: 500,
      }),
      prisma.learnerGoal.findMany({ where: { workspaceId: this.workspaceId, userId: this.userId }, take: 100 }),
      level === "summary" ? [] : prisma.masteryObservation.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId },
        include: { concept: { select: { key: true, label: true } } },
        orderBy: { createdAt: "asc" }, take: 1000,
      }),
      prisma.misconception.findMany({ where: { workspaceId: this.workspaceId, userId: this.userId }, take: 100 }),
      level === "archive" ? this.listCorrections() : [],
    ]);
    const doc = {
      "@context": "https://n0va.ai/schemas/learner-graph/v1",
      "@type": "LearnerGraph",
      exportedAt: new Date().toISOString(),
      learner: this.userId,
      competencies: mastery.map((m) => ({
        "@type": "Competency",
        concept: m.concept.key, label: m.concept.label,
        status: m.status,
        dimensions: includeConfidence ? m.dimensions : undefined,
        mastery: m.mastery,
        lastVerified: m.lastVerifiedAt,
      })),
      goals: goals.map((g) => ({ title: g.title, status: g.status, progress: g.progress, competencies: g.competencyKeys })),
      interpretationsToRevisit: misconceptions
        .filter((m) => !["RESOLVED", "DISMISSED"].includes(m.status))
        .map((m) => ({ concept: m.conceptId, stage: m.status })),
      learningEvents: (observations as unknown as Record<string, unknown>[]).map((o) => ({
        "@type": "LearningEvent",
        concept: (o.concept as { key: string }).key,
        dimension: o.dimension, value: o.value,
        ...(includeConfidence ? { confidence: o.confidence } : {}),
        source: `${o.sourceType}:${o.sourceId}`, at: o.createdAt,
      })),
      ...(level === "archive" ? { corrections, conceptCatalog: concepts.map((c) => ({ key: c.key, label: c.label, kind: c.kind })) } : {}),
    };
    return doc;
  }

  /** CSV export for simple graph data (observations). */
  async exportCsv() {
    const observations = await prisma.masteryObservation.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      include: { concept: { select: { key: true } } },
      orderBy: { createdAt: "asc" }, take: 2000,
    });
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["concept,dimension,value,confidence,source,at"];
    for (const o of observations) {
      lines.push([o.concept.key, o.dimension, o.value, o.confidence, `${o.sourceType}:${o.sourceId}`, o.createdAt.toISOString()].map(esc).join(","));
    }
    return lines.join("\n");
  }
}

export type { Dimension };
