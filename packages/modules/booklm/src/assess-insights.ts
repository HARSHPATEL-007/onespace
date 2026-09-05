import { z } from "zod";
import { prisma } from "@n0va/db";
import {
  envelope, wilson, meanCI, difficulty, difficultyBand, discrimination,
  pointBiserial, discriminationDiagnosis, absoluteGain, normalizedGain,
  meanCalibrationError, calibrationPattern, funnel, ABANDON_REASONS,
  suppressible, meetsMastery, evaluateWarnings, warningDisclaimer,
  stratifiedRate, classifyClusterType, assignIntervention, distractorAnalysis,
  timeVariance, readingBurden,
  METRIC_DEFS, COHORT_MIN_CELL,
} from "./assess-analytics";

export const windowSchema = z.object({
  setId: z.string().optional(),
  setA: z.string().optional(),
  setB: z.string().optional(),
  conceptKey: z.string().optional(),
  windowDays: z.number().int().min(1).max(365).default(90),
});

function windowSince(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

export class AssessInsightsService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string = "member",
  ) {}

  private scopeUser(userId?: string): string {
    if (this.role === "member") return this.userId;
    return userId ?? this.userId;
  }

  // -- Item difficulty + discrimination (population × condition) ----------------------
  async itemAnalysis(setId: string, windowDays = 90, minN = 5) {
    const since = windowSince(windowDays);
    const attempts = await prisma.quizAttempt.findMany({
      where: { workspaceId: this.workspaceId, setId, startedAt: { gte: since } },
      include: { responses: true },
      take: 2000,
    });
    // Per-user totals for ability grouping.
    const userTotals = new Map<string, { correct: number; total: number }>();
    for (const a of attempts) {
      const t = userTotals.get(a.userId) ?? { correct: 0, total: 0 };
      for (const r of a.responses) { t.total++; if (r.correct) t.correct++; }
      userTotals.set(a.userId, t);
    }
    const acc = [...userTotals.entries()].map(([u, t]) => ({ u, acc: t.total ? t.correct / t.total : 0 }))
      .sort((a, b) => a.acc - b.acc);
    const third = Math.max(1, Math.floor(acc.length / 3));
    const low = new Set(acc.slice(0, third).map((x) => x.u));
    const high = new Set(acc.slice(-third).map((x) => x.u));
    const totalsByUser = new Map([...userTotals.entries()].map(([u, t]) => [u, t.total ? t.correct / t.total : 0]));

    // Group responses by prompt text (item proxy; limitation documented).
    const groups = new Map<string, {
      prompt: string; conceptKey: string; condition: string;
      rows: { correct: boolean; userId: string; picked: string; responseTimeMs: number; condition: string }[];
    }>();
    for (const a of attempts) {
      for (const r of a.responses) {
        const key = r.prompt.slice(0, 300);
        const g = groups.get(key) ?? { prompt: key, conceptKey: r.conceptKey, condition: r.conditionLabel || "unspecified", rows: [] };
        g.rows.push({ correct: r.correct, userId: a.userId, picked: r.picked ?? "", responseTimeMs: r.responseTimeMs ?? 0, condition: r.conditionLabel || "unspecified" });
        groups.set(key, g);
      }
    }
    const items = [...groups.values()]
      .filter((g) => g.rows.length >= minN)
      .map((g) => {
        const correct = g.rows.filter((r) => r.correct).length;
        const p = difficulty(correct, g.rows.length);
        const hi = g.rows.filter((r) => high.has(r.userId));
        const lo = g.rows.filter((r) => low.has(r.userId));
        const d = discrimination(hi.filter((r) => r.correct).length, hi.length, lo.filter((r) => r.correct).length, lo.length);
        const pb = pointBiserial(
          g.rows.map((r) => r.correct),
          g.rows.map((r) => totalsByUser.get(r.userId) ?? 0),
        );
        // Condition slices: same item under open- vs closed-book etc.
        const byCondition = stratifiedRate(g.rows.map((r) => ({ correct: r.correct, slice: r.condition })));
        // Distractor forensics: picks + high-group overlap (key-error review, never auto-delete).
        const hiIdx = new Set(g.rows.map((r, i) => (high.has(r.userId) ? i : -1)).filter((i) => i >= 0));
        const correctPick = g.rows.find((r) => r.correct)?.picked ?? "";
        const distractors = distractorAnalysis(g.rows.map((r) => r.picked), correctPick, hiIdx);
        const time = timeVariance(g.rows.map((r) => r.responseTimeMs));
        const reading = readingBurden(g.prompt);
        const extraFlags: string[] = [];
        if (distractors.highGroupTopDistractor) extraFlags.push("distractor_by_high_performers");
        if (time.flag) extraFlags.push("unusual_time_variance");
        if (reading.flag) extraFlags.push("excessive_reading_burden");
        return {
          prompt: g.prompt.slice(0, 120), conceptKey: g.conceptKey, condition: g.condition,
          n: g.rows.length, p,
          interval: wilson(p, g.rows.length),
          band: difficultyBand(p),
          discrimination: d, pointBiserial: pb,
          byCondition,
          distractors,
          timeVariance: time,
          reading,
          flag: d < 0 ? "negative_discrimination" : Math.abs(d) < 0.1 ? "low_discrimination" : extraFlags[0] ?? null,
          causes: [...discriminationDiagnosis(d, p), ...extraFlags.map((f) => f.replace(/_/g, " "))],
          action: d < 0 || Math.abs(d) < 0.1 || extraFlags.length > 0 ? "Hold item, inspect responses, require instructor review — never auto-delete." : null,
        };
      })
      .sort((a, b) => a.discrimination - b.discrimination);
    return {
      items: items.slice(0, 100),
      window: `${windowDays}d`, limitation: "item identity = prompt text (no stable item ids on quiz responses)",
    };
  }

  // -- Misconception clusters (patterns, anonymized exemplars) --------------------------
  async misconceptionClusters(setId?: string) {
    const rows = await prisma.misconception.findMany({
      where: {
        workspaceId: this.workspaceId,
        status: { notIn: ["RESOLVED", "DISMISSED"] as never },
      },
      include: { concept: { select: { id: true, key: true, label: true, setId: true } } },
      take: 500,
    });
    const inSet = setId ? rows.filter((r) => r.concept.setId === setId) : rows;
    const clusters = new Map<string, typeof inSet>();
    for (const m of inSet) {
      const key = `${m.conceptId}::${m.statement.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80)}`;
      const arr = clusters.get(key) ?? [];
      arr.push(m);
      clusters.set(key, arr);
    }
    return [...clusters.values()].map((members) => {
      const first = members[0]!;
      const learners = new Set(members.map((m) => m.userId)).size;
      const conf = members.reduce((s, m) => s + m.confidence, 0) / members.length;
      const pattern = [
        ...new Set(members.flatMap((m) => m.detectedFrom).slice(0, 6)),
        `${members.length} report(s)`,
      ];
      const clusterType = classifyClusterType(first.statement, pattern);
      const assigned = assignIntervention({ clusterType });
      return {
        concept: first.concept.label, conceptKey: first.concept.key,
        label: first.statement.slice(0, 160),
        evidencePattern: pattern,
        clusterType,
        learnersAffected: learners,
        severity: members.some((m) => m.severity === "high") ? "high" : "medium",
        confidence: Math.round(conf * 100) / 100,
        exemplar: first.statement.slice(0, 200), // statement text only — never learner identity
        recommendedIntervention: {
          type: assigned.type,
          activity: assigned.activity,
          followUp: assigned.followUp,
          rationale: assigned.rationale,
        },
      };
    }).sort((a, b) => b.learnersAffected - a.learnersAffected).slice(0, 50);
  }

  // -- Learning gain per concept -----------------------------------------------------------
  async gainByConcept(setId: string, windowDays = 90, userId?: string) {
    const since = windowSince(windowDays);
    const target = this.role === "member" ? this.userId : (userId ?? undefined);
    const obs = await prisma.masteryObservation.findMany({
      where: {
        workspaceId: this.workspaceId,
        ...(target ? { userId: target } : {}),
        createdAt: { gte: since },
        concept: { setId },
      },
      include: { concept: { select: { id: true, key: true, label: true } } },
      orderBy: { createdAt: "asc" }, take: 5000,
    });
    const byConcept = new Map<string, typeof obs>();
    for (const o of obs) {
      const arr = byConcept.get(o.conceptId) ?? [];
      arr.push(o);
      byConcept.set(o.conceptId, arr);
    }
    const resp = await prisma.quizAttempt.findMany({
      where: {
        workspaceId: this.workspaceId, setId,
        ...(target ? { userId: target } : {}),
        startedAt: { gte: since },
      },
      include: { responses: { select: { correct: true, confidence: true } } },
      take: 500,
    });
    const allResp = resp.flatMap((a) => a.responses);
    const cal = meanCalibrationError(allResp.map((r) => ({ confidence: r.confidence, correct: r.correct })));
    return [...byConcept.entries()].map(([conceptId, rows]) => {
      const pre = rows[0]!.value, post = rows[rows.length - 1]!.value;
      const novel = rows.filter((r) => r.novelty >= 0.5);
      const tPre = novel.length > 0 ? novel[0]!.value : null;
      const tPost = novel.length > 0 ? novel[novel.length - 1]!.value : null;
      const retained = rows.filter((r) => {
        const lastSuccess = [...rows].reverse().find((x) => x.value >= 0.6);
        return lastSuccess && r.createdAt.getTime() - lastSuccess.createdAt.getTime() >= 21 * 86_400_000 && r.value >= 0.6;
      });
      return {
        conceptId, key: rows[0]!.concept.key, label: rows[0]!.concept.label,
        preScore: pre, postScore: post,
        absoluteGain: absoluteGain(pre, post),
        normalizedGain: normalizedGain(pre, post),
        transferGain: tPre !== null && tPost !== null ? absoluteGain(tPre, tPost) : null,
        retention21d: retained.length > 0 ? retained[retained.length - 1]!.value : null,
        calibrationError: cal, n: rows.length,
        interpretation: post - pre >= 0.2 ? "strong immediate gain" : post - pre >= 0.05 ? "modest gain" : "flat — investigate",
      };
    }).sort((a, b) => (b.postScore - (b.preScore)) - (a.postScore - a.preScore));
  }

  /**
   * Concept mastery as a full metric envelope: value, window, sample size,
   * confidence interval, evidence sources, limitations. No bare numbers —
   * every figure carries its uncertainty and provenance.
   */
  async conceptMastery(setId: string, conceptKey: string, windowDays = 90, userId?: string) {
    const since = windowSince(windowDays);
    const target = this.role === "member" ? this.userId : (userId ?? undefined);
    const obs = await prisma.masteryObservation.findMany({
      where: {
        workspaceId: this.workspaceId,
        ...(target ? { userId: target } : {}),
        createdAt: { gte: since },
        concept: { setId, key: conceptKey },
      },
      include: { concept: { select: { id: true, key: true, label: true } } },
      orderBy: { createdAt: "asc" }, take: 5000,
    });
    if (obs.length === 0) {
      return envelope<number | null>({
        metric: "concept_mastery", value: null,
        timeWindow: `${since.toISOString().slice(0, 10)}/${new Date().toISOString().slice(0, 10)}`,
        sampleSize: 0, evidenceSources: [],
        limitations: ["no observations in window"],
      });
    }
    const values = obs.map((o) => o.value);
    const { mean, ci, n } = meanCI(values);
    const hasTransfer = obs.some((o) => o.novelty >= 0.5);
    const sources = ["retrieval", "application", ...(hasTransfer ? ["novel_transfer"] : [])];
    const limitations = [
      ...(n < 10 ? ["small sample — interpret cautiously"] : []),
      ...(!hasTransfer ? ["few transfer items — transfer claim weak"] : []),
      "practice exposure varies across learners",
    ];
    return {
      ...envelope({
        metric: "concept_mastery", value: mean,
        timeWindow: `${since.toISOString().slice(0, 10)}/${new Date().toISOString().slice(0, 10)}`,
        sampleSize: n, confidenceInterval: ci ?? undefined,
        evidenceSources: sources, limitations,
      }),
      conceptKey,
      label: obs[0]!.concept.label,
    };
  }

  // -- Time to mastery --------------------------------------------------------------------------
  async timeToMastery(setId: string, conceptKey?: string, userId?: string) {
    const target = this.scopeUser(userId);
    const concepts = await prisma.learnerConcept.findMany({
      where: { workspaceId: this.workspaceId, setId, ...(conceptKey ? { key: conceptKey } : {}) },
      take: 100,
    });
    const out = [];
    for (const c of concepts) {
      const [obs, mastery, misc, attempts, loops] = await Promise.all([
        prisma.masteryObservation.findMany({
          where: { workspaceId: this.workspaceId, conceptId: c.id, userId: target },
          orderBy: { createdAt: "asc" }, take: 500,
        }),
        prisma.learnerMastery.findUnique({
          where: { workspaceId_conceptId_userId: { workspaceId: this.workspaceId, conceptId: c.id, userId: target } },
        }),
        prisma.misconception.findMany({
          where: {
            workspaceId: this.workspaceId, conceptId: c.id, userId: target,
            status: { notIn: ["RESOLVED", "DISMISSED"] as never },
          },
          take: 10,
        }),
        prisma.quizAttempt.findMany({
          where: { workspaceId: this.workspaceId, setId, userId: target },
          select: { durationSec: true, score: true, total: true, startedAt: true },
          take: 200,
        }),
        prisma.adaptiveLoop.findMany({
          where: { workspaceId: this.workspaceId, conceptId: c.id, userId: target },
          select: { createdAt: true, strategy: true }, take: 100,
        }).catch(() => [] as { createdAt: Date; strategy: string }[]),
      ]);
      if (obs.length === 0) continue;
      const firstDate = obs[0]!.createdAt;
      const first = firstDate.toISOString().split("T")[0] ?? "";
      const recent = obs.slice(-5).map((o) => o.value);
      const novelSuccess = obs.some((o) => o.novelty >= 0.5 && o.value >= 0.6);
      const delayed = obs.find((o) => {
        const last = [...obs].reverse().find((x) => x.value >= 0.6);
        return last && o.createdAt.getTime() - last.createdAt.getTime() >= 21 * 86_400_000 && o.value >= 0.6;
      });
      const { met } = meetsMastery({
        recentScores: recent, occasions: recent.filter((v) => v >= 0.8).length,
        criticalMisconception: misc.some((m) => m.severity === "high"),
        transferSuccess: novelSuccess,
        retention: delayed ? delayed.value : null,
        calibrationError: null,
      });
      const masteredAt = met ? obs[obs.length - 1]!.createdAt : null;
      // Remediation cycles: intervention loops before (or without) mastery.
      const remediationCycles = loops.filter((l) => !masteredAt || l.createdAt <= masteredAt).length;
      // Median hours between attempts (spacing signal, not effort judgment).
      const starts = attempts.map((a) => new Date(a.startedAt).getTime()).sort((x, y) => x - y);
      const gapsHrs = starts.slice(1).map((t, i) => (t - starts[i]!) / 3_600_000);
      const medianGapHrs = gapsHrs.length > 0
        ? Math.round([...gapsHrs].sort((x, y) => x - y)[Math.floor(gapsHrs.length / 2)]! * 10) / 10
        : null;
      out.push({
        conceptId: c.id, key: c.key, label: c.label,
        firstExposure: first,
        stableMastery: masteredAt?.toISOString().split("T")[0] ?? null,
        calendarDays: masteredAt ? Math.round((masteredAt.getTime() - firstDate.getTime()) / 86_400_000) : null,
        activeMinutes: attempts.reduce((s, a) => s + a.durationSec, 0) / 60 > 0
          ? Math.round(attempts.reduce((s, a) => s + a.durationSec, 0) / 60) : null,
        attempts: attempts.length,
        hintsUsed: null as number | null,
        remediationCycles,
        medianHoursBetweenAttempts: medianGapHrs,
        transferStatus: novelSuccess ? "achieved" : "partial",
        met,
        note: "Hints untracked at response level; time excludes accessibility pacing by design. Longer time is not lower ability.",
      });
    }
    return out;
  }

  // -- Calibration analytics -------------------------------------------------------------------------
  async calibration(setId: string, conceptKey?: string, userId?: string) {
    const target = this.scopeUser(userId);
    const attempts = await prisma.quizAttempt.findMany({
      where: { workspaceId: this.workspaceId, setId, userId: target },
      include: { responses: true }, take: 500,
    });
    const pairs = attempts.flatMap((a) => a.responses.map((r) => ({
      confidence: r.confidence, correct: r.correct, conceptKey: r.conceptKey,
    })));
    const scoped = conceptKey ? pairs.filter((p) => p.conceptKey === conceptKey) : pairs;
    const byConcept = new Map<string, typeof scoped>();
    for (const p of scoped) {
      const arr = byConcept.get(p.conceptKey || "general") ?? [];
      arr.push(p);
      byConcept.set(p.conceptKey || "general", arr);
    }
    const overall = calibrationPattern(scoped.map((p) => ({ confidence: p.confidence, correct: p.correct })));
    return {
      overall: { ...overall, error: meanCalibrationError(scoped.map((p) => ({ confidence: p.confidence, correct: p.correct }))), n: scoped.length },
      byConcept: [...byConcept.entries()].slice(0, 30).map(([k, v]) => ({
        conceptKey: k, ...calibrationPattern(v.map((p) => ({ confidence: p.confidence, correct: p.correct }))), n: v.length,
      })),
      guidance: "Private and constructive: prediction-before-feedback narrows overconfidence; longer time is never scored as low ability.",
    };
  }

  // -- Drop-off funnel (attempt lifecycle; page positions need instrumentation) ---------------------------
  async dropoff(setId: string, windowDays = 90) {
    const since = windowSince(windowDays);
    const attempts = await prisma.quizAttempt.findMany({
      where: { workspaceId: this.workspaceId, setId, startedAt: { gte: since } },
      select: { submittedAt: true, score: true, total: true, startedAt: true },
      take: 2000,
    });
    const started = attempts.length;
    const submitted = attempts.filter((a) => a.submittedAt).length;
    const scored = attempts.filter((a) => a.submittedAt && a.total > 0).length;
    const interrupted = attempts.filter((a) => !a.submittedAt && Date.now() - new Date(a.startedAt).getTime() > 7 * 86_400_000).length;
    return {
      funnel: funnel([
        { name: "attempts started", count: started },
        { name: "submitted", count: submitted },
        { name: "scored", count: scored },
      ]),
      interruptedUnsubmitted: interrupted,
      checkIn: "You paused here. What best describes the reason?",
      checkInOptions: ABANDON_REASONS,
      needsInstrumentation: ["lesson starts", "reading/video positions", "hint requests", "technical interruptions", "accommodation transitions"],
    };
  }

  // -- Question quality flags -------------------------------------------------------------------------------
  async questionQuality(setId: string, windowDays = 90) {
    const items = await this.itemAnalysis(setId, windowDays, 5);
    const flags = items.items
      .filter((i) => i.flag)
      .map((i) => ({
        prompt: i.prompt, n: i.n, p: i.p, discrimination: i.discrimination,
        causes: i.causes,
        action: i.action,
      }));
    const bank = await prisma.assessmentItem.findMany({
      where: { workspaceId: this.workspaceId, setId }, select: { templateKey: true, status: true }, take: 200,
    });
    return {
      flags: flags.slice(0, 30),
      lifecycle: "draft → review → pilot → active → monitor → revise → retire (every revision versions the item)",
      bankItems: bank.length,
      retired: bank.filter((b) => b.status === "RETIRED" || b.status === "INVALIDATED").length,
    };
  }

  // -- Cohort report (suppressed, CI'd, non-causal) ----------------------------------------------------------------
  async cohortReport(setA: string, setB: string, conceptKey: string, windowDays = 90) {
    const since = windowSince(windowDays);
    const gather = async (setId: string) => {
      const obs = await prisma.masteryObservation.findMany({
        where: { workspaceId: this.workspaceId, createdAt: { gte: since }, concept: { setId, key: conceptKey } },
        select: { userId: true, value: true },
        take: 5000,
      });
      const byUser = new Map<string, number[]>();
      for (const o of obs) {
        const arr = byUser.get(o.userId) ?? [];
        arr.push(o.value);
        byUser.set(o.userId, arr);
      }
      const gains = [...byUser.values()]
        .filter((v) => v.length >= 2)
        .map((v) => v[v.length - 1]! - v[0]!);
      return gains;
    };
    const [ga, gb] = await Promise.all([gather(setA), gather(setB)]);
    const cell = (gains: number[]) => {
      if (suppressible(gains.length)) return { n: gains.length, suppressed: true as const };
      const { mean, ci } = meanCI(gains);
      return { n: gains.length, gain: mean, ci_95: ci, suppressed: false as const };
    };
    const a = cell(ga);
    const b = cell(gb);
    const diff = !a.suppressed && !b.suppressed && a.gain !== undefined && b.gain !== undefined
      ? Math.round((a.gain - b.gain) * 100) / 100 : null;
    return {
      conceptKey,
      cohortA: { setId: setA, ...a },
      cohortB: { setId: setB, ...b },
      difference: diff,
      interpretation: "Small observed differences need instructional-context investigation before any attribution. Never rankings; never admissions/discipline use.",
      privacy: { minimum_cell_size: COHORT_MIN_CELL, small_cells_suppressed: true },
    };
  }

  // -- Early warnings (observable only; dismissible, correctable, appealable) -------------------------------------------
  async earlyWarnings(setId: string, userId?: string) {
    const targets = this.role === "member" ? [this.userId] : (userId ? [userId] : await this.learnerIds(setId));
    const out: { userId: string; warnings: { kind: string; evidence: string[]; severity: string; disclaimer: string; suggestion: string; dismissHint: string }[] }[] = [];
    for (const uid of targets.slice(0, 50)) {
      const [obs, attempts, misc, goals, mastery] = await Promise.all([
        prisma.masteryObservation.findMany({
          where: { workspaceId: this.workspaceId, userId: uid, concept: { setId } },
          orderBy: { createdAt: "desc" }, take: 100,
        }),
        prisma.quizAttempt.findMany({
          where: { workspaceId: this.workspaceId, setId, userId: uid },
          include: { responses: { select: { correct: true, confidence: true } } },
          orderBy: { startedAt: "desc" }, take: 20,
        }),
        prisma.misconception.findMany({
          where: { workspaceId: this.workspaceId, userId: uid, status: { notIn: ["RESOLVED", "DISMISSED"] as never } },
          take: 10,
        }),
        prisma.learnerGoal.findMany({
          where: { workspaceId: this.workspaceId, userId: uid, status: "ACTIVE" as never }, take: 10,
        }),
        prisma.learnerMastery.findMany({
          where: { workspaceId: this.workspaceId, userId: uid },
          include: { concept: { select: { id: true, setId: true } } }, take: 300,
        }),
      ]);
      const resp = attempts.flatMap((a) => a.responses);
      const recent = resp.slice(0, 12);
      const acc = recent.length ? recent.filter((r) => r.correct).length / recent.length : 1;
      const hiConfWrong = recent.filter((r) => !r.correct && r.confidence >= 0.7).length;
      const firstHalf = obs.slice(-10);
      const delta = firstHalf.length >= 4
        ? (firstHalf.slice(-2).reduce((s, o) => s + o.value, 0) / 2) - (firstHalf.slice(0, 2).reduce((s, o) => s + o.value, 0) / 2) : 0;
      const lastPractice = obs[0]?.createdAt ?? attempts[0]?.startedAt;
      const daysGap = lastPractice ? (Date.now() - new Date(lastPractice).getTime()) / 86_400_000 : 0;
      const unsubmitted = attempts.filter((a) => !a.submittedAt);
      const recallHigh = mastery.some((m) => {
        const d = (m.dimensions ?? {}) as Record<string, number>;
        return m.concept.setId === setId && (d.recall ?? 0) >= 0.7 && (d.transfer ?? 0) < 0.5;
      });
      const overdue = goals.some((g) => g.deadline && new Date(g.deadline) < new Date() && g.progress < 1);
      const signals = evaluateWarnings({
        prereqFailRate: 1 - acc, recentDelta: delta,
        retriesWithoutGain: attempts.length >= 4 && acc < 0.5 ? attempts.length : 0,
        activeCluster: misc.length > 0, milestoneOverdue: overdue,
        daysSincePractice: daysGap, calibrationGap: hiConfWrong / Math.max(1, recent.length),
        abandonmentsAtConcept: unsubmitted.length,
        recallHighTransferLow: recallHigh,
        interruptedUnsubmitted: unsubmitted.some((a) => Date.now() - new Date(a.startedAt).getTime() > 7 * 86_400_000),
      });
      out.push({
        userId: uid,
        warnings: signals.map((w) => ({
          kind: w.kind, evidence: w.evidence, severity: w.severity,
          disclaimer: warningDisclaimer(),
          suggestion: suggestionFor(w.kind),
          dismissHint: "See, correct, dismiss, or appeal from the learner view.",
        })),
      });
    }
    return out.filter((o) => o.warnings.length > 0);
  }

  private async learnerIds(setId: string): Promise<string[]> {
    const rows = await prisma.quizAttempt.findMany({
      where: { workspaceId: this.workspaceId, setId },
      select: { userId: true }, take: 500,
    });
    return [...new Set(rows.map((r) => r.userId))];
  }

  async dismissWarning(conceptKey: string, reason: string) {
    return prisma.graphCorrection.create({
      data: {
        workspaceId: this.workspaceId, userId: this.userId,
        targetType: "early_warning", targetId: conceptKey, field: "dismiss",
        oldValue: "", newValue: reason.slice(0, 1000), reason,
        scope: "profile",
      },
    });
  }

  // -- Intervention effectiveness (associative unless experimental) --------------------------------------------------------------
  async interventionOutcomes(setId: string, userId?: string) {
    const target = this.scopeUser(userId);
    const loops = await prisma.adaptiveLoop.findMany({
      where: { workspaceId: this.workspaceId, setId, userId: target },
      orderBy: { createdAt: "desc" }, take: 100,
    });
    const out = [];
    for (const loop of loops.slice(0, 30)) {
      if (!loop.conceptId) continue;
      const after = await prisma.masteryObservation.findMany({
        where: {
          workspaceId: this.workspaceId, conceptId: loop.conceptId, userId: target,
          createdAt: { gt: loop.createdAt },
        },
        orderBy: { createdAt: "asc" }, take: 20,
      });
      const before = (loop.stateBefore ?? {}) as { knowledge?: Record<string, number> };
      const preVal = before.knowledge?.recall ?? 0.5;
      const post = after[0]?.value ?? null;
      const delayed = after.find((o) => o.createdAt.getTime() - loop.createdAt.getTime() >= 7 * 86_400_000)?.value ?? null;
      const transfer = after.find((o) => o.novelty >= 0.5)?.value ?? null;
      out.push({
        interventionId: loop.id, type: loop.strategy, targetConcept: loop.conceptId,
        completion: loop.response !== null,
        immediateGain: post !== null ? Math.round((post - preVal) * 100) / 100 : null,
        delayedGain: delayed !== null ? Math.round((delayed - preVal) * 100) / 100 : null,
        transferGain: transfer !== null ? Math.round((transfer - preVal) * 100) / 100 : null,
        gainConfidence: loop.gainConfidence,
        interpretation: post === null
          ? "no outcome measured yet"
          : "associative result — use randomized or stepped-wedge designs before causal claims",
      });
    }
    return out;
  }

  // -- Learner map (strengths, growth, misconception, next step) -----------------------------------------------------------------------
  async learnerMap(setId: string) {
    const [mastery, misc, attempts] = await Promise.all([
      prisma.learnerMastery.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId },
        include: { concept: { select: { id: true, key: true, label: true, setId: true } } },
        take: 300,
      }),
      prisma.misconception.findMany({
        where: { workspaceId: this.workspaceId, userId: this.userId, status: { notIn: ["RESOLVED", "DISMISSED"] as never } },
        include: { concept: { select: { label: true } } }, take: 10,
      }),
      prisma.quizAttempt.findMany({
        where: { workspaceId: this.workspaceId, setId, userId: this.userId },
        include: { responses: { select: { correct: true, confidence: true } } },
        orderBy: { startedAt: "desc" }, take: 30,
      }),
    ]);
    const inSet = mastery.filter((m) => m.concept.setId === setId).sort((a, b) => b.mastery - a.mastery);
    const resp = attempts.flatMap((a) => a.responses);
    const hiConfWrong = resp.filter((r) => !r.correct && r.confidence >= 0.7).length;
    return {
      strong: inSet.filter((m) => m.mastery >= 0.7).slice(0, 6).map((m) => m.concept.label),
      developing: inSet.filter((m) => m.mastery < 0.7).slice(0, 6).map((m) => ({ label: m.concept.label, status: m.status })),
      misconceptions: misc.map((m) => ({ label: m.statement.slice(0, 140), concept: m.concept.label })),
      calibration: hiConfWrong > 0
        ? "confidence currently runs higher than transfer performance — practice predicting before feedback"
        : "confidence roughly tracks performance",
      nextStep: inSet.find((m) => m.mastery < 0.7)?.concept.label ?? "retrieval review",
    };
  }

  metricDefinitions() {
    return METRIC_DEFS;
  }
}

function suggestionFor(kind: string): string {
  switch (kind) {
    case "prereq_failures": return "Complete a 10-minute prerequisite repair, then retry two new questions.";
    case "declining": return "Revisit the last two topics with retrieval checks before new material.";
    case "retries_stalled": return "Stop repeating — request a different strategy or instructor check.";
    case "misconception_cluster": return "Work through a contrast-case activity for the flagged interpretation.";
    case "milestone_missed": return "Re-plan the goal deadline or narrow its scope.";
    case "practice_gap": return "Schedule one short retrieval session this week.";
    case "confidence_mismatch": return "Require prediction-before-feedback on the next three items.";
    case "concept_abandonment": return "Tell us why the spot blocks you (check-in options above).";
    case "low_transfer": return "Try one unfamiliar case with the same structure.";
    default: return "Resume saved work or report the interruption.";
  }
}

export function metricEnvelope<T>(e: Parameters<typeof envelope<T>>[0]) {
  return envelope(e);
}
