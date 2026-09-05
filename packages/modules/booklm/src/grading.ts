import { z } from "zod";
import { prisma } from "@n0va/db";
import {
  gradeUncertainty, classifyPartialCredit, approvalGate, explainGrade,
  disparityOfMeans, applyRegradeRule, validateRubricContract,
  doublePenaltyCheck, nonEvidenceCheck, calibrationDeploymentGate,
  gradingSourceCheck, type DeploymentThresholds,
} from "./assess-grading";

export const richEvidenceSchema = z.object({
  criterionId: z.string().min(1),
  points: z.number().min(0).max(1000),
  evidenceQuote: z.string().max(2000).default(""),
  reasoning: z.string().max(2000).default(""),
  location: z.string().max(200).default(""),
  supports: z.string().max(500).default(""),
  strength: z.number().min(0).max(1).default(0.5),
  confidence: z.number().min(0).max(1).default(0.5),
  subscores: z.record(z.string().max(60), z.number().min(0).max(1)).default({}),
  errorKind: z.string().max(60).default(""),
  diagnosis: z.string().max(1000).default(""),
});

export const gradeV2Schema = z.object({
  assessmentId: z.string().min(1),
  userId: z.string().min(1),
  evidence: z.array(richEvidenceSchema).min(1).max(40),
  explanation: z.string().max(4000).default(""),
  blindKey: z.string().max(100).default(""),
  gradingContext: z.record(z.string().max(80), z.unknown()).default({}),
});

export const calibrationSchema = z.object({
  assessmentId: z.string().min(1),
  response: z.string().max(8000),
  instructorScores: z.record(z.string().max(120), z.number().min(0).max(1000)),
});

export const fairnessSchema = z.object({
  setId: z.string().optional(),
  scope: z.string().max(200).default(""),
  dimension: z.string().max(120).default(""),
  groups: z.array(z.object({
    name: z.string().max(120), mean: z.number(), sd: z.number().min(0), n: z.number().int().min(0),
  })).min(2).max(10),
  finding: z.string().max(2000).default(""),
  action: z.string().max(2000).default(""),
});

const HOLDS = [
  "score_change_over_10_percent", "rubric_version_conflict",
  "criterion_disagreement", "accessibility_context_uncertain",
  "novel_valid_method_possible",
];

export class GradingService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string,
  ) {}

  private assertInstructor() {
    if (!["admin", "owner", "teacher"].includes(this.role)) throw new Error("Forbidden: instructor role required");
  }

  /**
   * Evidence → rubric interpretation → uncertainty → policy → explanation.
   * AI proposes criterion judgments; instructors control consequential decisions.
   */
  async submitGradeV2(input: z.infer<typeof gradeV2Schema>) {
    this.assertInstructor();
    const assessment = await prisma.assessment.findFirst({
      where: { id: input.assessmentId, workspaceId: this.workspaceId },
      include: { criteria: true },
    });
    if (!assessment) throw new Error("Assessment not found");
    if (assessment.criteria.length === 0) throw new Error("Assessment has no criteria");

    let total = 0, maxPoints = 0;
    const uncertainties: number[] = [];
    const reasons: string[] = [];
    const perEvidence: Record<string, unknown>[] = [];
    // Contract-guard metadata per criterion (labels + non-evidence lists).
    const evMeta = input.evidence.map((e) => {
      const crit = assessment.criteria.find((c) => c.id === e.criterionId);
      return {
        id: e.criterionId, label: crit?.label ?? e.criterionId,
        location: e.location, quote: e.evidenceQuote,
        nonEvidence: crit?.nonEvidence ?? [],
        reasoning: `${e.reasoning} ${e.diagnosis}`,
      };
    });
    const flagsBy = new Map<string, string[]>();
    const flag = (id: string, s: string) => flagsBy.set(id, [...(flagsBy.get(id) ?? []), s]);
    // Double-penalty + non-evidence scans: warnings for the instructor.
    // Shared evidence is sometimes legitimate, so these never auto-adjust.
    for (const f of doublePenaltyCheck(evMeta.map((m) => ({
      criterionId: m.id, criterionLabel: m.label, location: m.location, quote: m.quote,
    })))) {
      const a = assessment.criteria.find((c) => c.label === f.criterionA)?.id;
      const b = assessment.criteria.find((c) => c.label === f.criterionB)?.id;
      if (a) flag(a, `double-penalty risk with ${f.criterionB}`);
      if (b) flag(b, `double-penalty risk with ${f.criterionA}`);
      reasons.push(`double-penalty risk: ${f.criterionA} × ${f.criterionB} — confirm one error is not penalized twice`);
    }
    for (const m of evMeta) {
      for (const hit of nonEvidenceCheck(m.reasoning, m.nonEvidence)) {
        flag(m.id, hit);
        reasons.push(`${m.label}: ${hit}`);
      }
    }
    for (const e of input.evidence) {
      const crit = assessment.criteria.find((c) => c.id === e.criterionId);
      if (!crit) throw new Error(`Unknown criterion ${e.criterionId}`);
      maxPoints += crit.maxPoints * crit.weight;
      const pts = Math.min(e.points, crit.maxPoints);
      total += pts * crit.weight;
      // Boundary proximity: fractional closeness to half-points.
      const frac = Math.abs(pts - Math.round(pts));
      const boundary = frac > 0.3 && frac < 0.7 ? 0.7 : frac > 0.15 ? 0.4 : 0.1;
      const u = gradeUncertainty(pts, crit.maxPoints, {
        evidenceCount: (e.evidenceQuote ? 1 : 0) + Object.keys(e.subscores).length,
        boundaryProximity: boundary,
        implicitEvidence: !e.evidenceQuote && Object.keys(e.subscores).length === 0,
        alternativeMethod: e.errorKind === "alternative_method",
      });
      uncertainties.push(u.confidence);
      reasons.push(...u.reasons.map((r) => `${crit.label}: ${r}`));
      perEvidence.push({ criterionId: e.criterionId, uncertainty: u, action: u.action, flags: flagsBy.get(e.criterionId) ?? [] });
    }
    const confidence = uncertainties.length
      ? Math.round((uncertainties.reduce((s, v) => s + v, 0) / uncertainties.length) * 100) / 100 : 0.5;
    const gate = approvalGate({
      stakes: assessment.stakes, confidence,
      holds: input.evidence.some((e) => !e.evidenceQuote && Object.keys(e.subscores).length === 0)
        ? ["missing_criterion_evidence"] : [],
      mode: assessment.gradingMode === "human_only" ? "human_only" : undefined,
    });
    total = Math.round(total * 100) / 100;
    maxPoints = Math.round(maxPoints * 100) / 100;
    const publish = gate.publish && assessment.stakes === "low";

    const grade = await prisma.grade.create({
      data: {
        workspaceId: this.workspaceId, assessmentId: input.assessmentId, userId: input.userId,
        totalPoints: total, maxPoints,
        explanation: input.explanation, blindKey: input.blindKey,
        approved: publish,
        uncertainty: 1 - confidence,
        uncertaintyReasons: [...new Set(reasons)].slice(0, 10),
        scoreLow: Math.round(total * confidence * 100) / 100,
        scoreHigh: total,
        reviewStatus: gate.reviewStatus,
        gradingContext: {
          ...(input.gradingContext ?? {}),
          rubricVersion: assessment.rubricVersion,
          stakes: assessment.stakes, gradingMode: assessment.gradingMode,
        } as never,
        gradingMode: assessment.gradingMode,
        evidence: {
          create: input.evidence.map((e) => ({
            criterionId: e.criterionId, points: Math.min(e.points, assessment.criteria.find((c) => c.id === e.criterionId)!.maxPoints),
            evidenceQuote: e.evidenceQuote, reasoning: e.reasoning,
            location: e.location, supports: e.supports, strength: e.strength,
            confidence: e.confidence,
            reviewStatus: gate.reviewStatus === "auto_published" ? "auto" : "instructor_approval_required",
            subscores: e.subscores as never, errorKind: e.errorKind, diagnosis: e.diagnosis,
          })),
        },
        audits: {
          create: [{
            workspaceId: this.workspaceId, actorId: this.userId,
            action: "GRADE_SUBMITTED", detail: `total=${total} conf=${confidence} gate=${gate.reviewStatus}`,
            newScore: total, reason: gate.reason, learnerNotified: publish,
          }],
        },
      },
      include: { evidence: { include: { criterion: true } } },
    });
    return { grade, confidence, gate, perEvidence };
  }

  /** Criterion-level approval: approve C1 and revise C3 without redoing all. */
  async approveCriterion(gradeId: string, criterionId: string, approved: boolean, points?: number, note = "") {
    this.assertInstructor();
    const ev = await prisma.gradeEvidence.findFirst({
      where: { gradeId, criterionId },
      include: { grade: { include: { assessment: { include: { criteria: true } } } }, criterion: true },
    });
    if (!ev || ev.grade.workspaceId !== this.workspaceId) throw new Error("Evidence not found");
    const prev = ev.grade.totalPoints;
    let total = prev;
    if (points !== undefined) {
      const pts = Math.min(points, ev.criterion.maxPoints);
      await prisma.gradeEvidence.update({
        where: { id: ev.id },
        data: { points: pts, reviewStatus: approved ? "approved" : "revised" },
      });
      const fresh = await prisma.gradeEvidence.findMany({
        where: { gradeId },
        include: { criterion: true },
      });
      total = Math.round(fresh.reduce((s, x) => s + Math.min(x.points, x.criterion.maxPoints) * x.criterion.weight, 0) * 100) / 100;
      await prisma.grade.update({ where: { id: gradeId }, data: { totalPoints: total } });
    } else {
      await prisma.gradeEvidence.update({
        where: { id: ev.id }, data: { reviewStatus: approved ? "approved" : "revised" },
      });
    }
    const allApproved = (await prisma.gradeEvidence.count({ where: { gradeId, reviewStatus: "approved" } }))
      === (await prisma.gradeEvidence.count({ where: { gradeId } }));
    await prisma.grade.update({
      where: { id: gradeId },
      data: { approved: allApproved, reviewStatus: allApproved ? "approved" : "instructor_review" },
    });
    await prisma.gradeAudit.create({
      data: {
        gradeId, workspaceId: this.workspaceId, actorId: this.userId,
        action: approved ? "CRITERION_APPROVED" : "CRITERION_REVISED",
        detail: `${ev.criterion.label}: ${note}`.slice(0, 1000),
        previousScore: prev, newScore: total, reason: note.slice(0, 1000), learnerNotified: true,
      },
    });
    return { total, approved: allApproved };
  }

  /** Append-only grade history (originals never overwritten). */
  async gradeHistory(gradeId: string) {
    const grade = await prisma.grade.findFirst({
      where: { id: gradeId, workspaceId: this.workspaceId },
      include: {
        audits: { orderBy: { createdAt: "asc" } },
        evidence: { include: { criterion: true } },
        assessment: { select: { title: true, rubricVersion: true } },
      },
    });
    if (!grade) throw new Error("Grade not found");
    if (this.role === "member" && grade.userId !== this.userId) throw new Error("Forbidden");
    return grade;
  }

  /** Partial-credit helper: classify a wrong-answer-with-reasoning case. */
  partialCredit(args: { finalCorrect: boolean; structureSound: boolean; earlyError?: boolean; wrongModel?: boolean; sufficientEvidence?: boolean; alternativeValid?: boolean }) {
    return classifyPartialCredit(args);
  }

  /** Learner explanation: specific, respectful, actionable — never vague. */
  async explainGrade(gradeId: string) {
    const grade = await prisma.grade.findFirst({
      where: { id: gradeId, workspaceId: this.workspaceId },
      include: { evidence: { include: { criterion: true } } },
    });
    if (!grade) throw new Error("Grade not found");
    if (this.role === "member" && grade.userId !== this.userId) throw new Error("Forbidden");
    return explainGrade({
      total: grade.totalPoints, max: grade.maxPoints,
      criteria: grade.evidence.map((e) => ({
        label: `${e.criterion.label}`,
        points: e.points, max: e.criterion.maxPoints,
        gap: e.diagnosis || (e.points < e.criterion.maxPoints ? `Evidence: ${(e.evidenceQuote || e.reasoning).slice(0, 160) || "see rubric"}` : ""),
        next: e.points >= e.criterion.maxPoints ? "" : `Address: ${(e.supports || e.criterion.description).slice(0, 160)}`,
        reviewed: e.reviewStatus === "instructor_approval_required",
      })),
    });
  }

  /** Rubric-as-contract validation: levels, must-haves, weights, dependencies. */
  async validateRubric(assessmentId: string) {
    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, workspaceId: this.workspaceId },
      include: { criteria: true },
    });
    if (!assessment) throw new Error("Assessment not found");
    return {
      assessmentId, title: assessment.title,
      rubricVersion: assessment.rubricVersion, frozen: assessment.rubricFrozen,
      ...validateRubricContract({
        rubricVersion: assessment.rubricVersion,
        frozen: assessment.rubricFrozen,
        criteria: assessment.criteria.map((c) => ({
          id: c.id, label: c.label, weight: c.weight, maxPoints: c.maxPoints,
          levels: (c.levels ?? {}) as Record<string, string>,
          mustHave: c.mustHave, acceptableVariants: c.acceptableVariants,
          nonEvidence: c.nonEvidence, dependsOn: c.dependsOn,
        })),
      }),
    };
  }

  /**
   * Source-grounded grading check: snapshot drift mapped to the criteria
   * it touches. Ambiguous sources flag review instead of penalizing
   * reasonable learner interpretations.
   */
  async gradingSourceCheck(gradeId: string, currentSnapshot: string, changedEvidence: string[] = []) {
    const grade = await prisma.grade.findFirst({
      where: { id: gradeId, workspaceId: this.workspaceId },
      include: { evidence: { include: { criterion: true } } },
    });
    if (!grade) throw new Error("Grade not found");
    if (this.role === "member" && grade.userId !== this.userId) throw new Error("Forbidden");
    const ctx = (grade.gradingContext ?? {}) as Record<string, unknown>;
    // Snapshots ride in gradingContext when the caller records them; absent
    // author/answer snapshots fall back to the grading snapshot (declared,
    // never invented — the note carries the assumption).
    const gradeSnapshot = String(ctx.gradeSnapshot ?? ctx.sourceSnapshot ?? "unknown");
    return gradingSourceCheck({
      authorSnapshot: String(ctx.authorSnapshot ?? gradeSnapshot),
      answerSnapshot: String(ctx.answerSnapshot ?? gradeSnapshot),
      gradeSnapshot,
      currentSnapshot,
      changedEvidence,
      criteriaEvidence: grade.evidence.map((e) => ({
        criterionId: e.criterionId, label: e.criterion.label, quotes: [e.evidenceQuote, e.reasoning],
      })),
    });
  }

  /** Calibration deployment gate: per-criterion go/no-go, never totals-only. */
  async deploymentGate(assessmentId: string, thresholds?: DeploymentThresholds) {
    const metrics = await this.calibrationMetrics(assessmentId);
    return {
      assessmentId,
      ...calibrationDeploymentGate(
        Object.fromEntries(Object.entries(metrics.byCriterion).map(([k, v]) => [k, { exact: v.exact, meanAbs: v.meanAbs, n: v.n }])),
        thresholds,
      ),
    };
  }

  /** Instructor appeal resolution with an append-only audit entry. */
  async appealResolve(appealId: string, status: "UPHELD" | "OVERTURNED", resolution: string) {
    this.assertInstructor();
    const appeal = await prisma.gradeAppeal.findFirst({
      where: { id: appealId },
      include: { grade: true },
    });
    if (!appeal || appeal.grade.workspaceId !== this.workspaceId) throw new Error("Appeal not found");
    await prisma.gradeAppeal.update({
      where: { id: appealId },
      data: { status: status as never, resolution: resolution.slice(0, 2000) },
    });
    await prisma.gradeAudit.create({
      data: {
        gradeId: appeal.gradeId, workspaceId: this.workspaceId, actorId: this.userId,
        action: status === "UPHELD" ? "APPEAL_UPHELD" : "APPEAL_OVERTURNED",
        detail: `appeal ${appealId}: ${resolution}`.slice(0, 1000),
        reason: resolution.slice(0, 1000), learnerNotified: true,
      },
    });
    return { appealId, status };
  }

  // -- Rubric versioning ------------------------------------------------------------------
  async freezeRubric(assessmentId: string, frozen: boolean) {
    this.assertInstructor();
    return prisma.assessment.updateMany({
      where: { id: assessmentId, workspaceId: this.workspaceId },
      data: { rubricFrozen: frozen },
    });
  }

  async bumpRubricVersion(assessmentId: string) {
    this.assertInstructor();
    const a = await prisma.assessment.findFirst({ where: { id: assessmentId, workspaceId: this.workspaceId } });
    if (!a) throw new Error("Assessment not found");
    if (a.rubricFrozen) throw new Error("Rubric frozen — unfreeze to version");
    await prisma.rubricCriterion.updateMany({
      where: { assessmentId }, data: { version: a.rubricVersion + 1 },
    });
    return prisma.assessment.updateMany({
      where: { id: assessmentId, workspaceId: this.workspaceId },
      data: { rubricVersion: a.rubricVersion + 1 },
    });
  }

  /** Shadow regrade: compute impact without changing results. */
  async shadowRegrade(assessmentId: string) {
    this.assertInstructor();
    const [assessment, grades] = await Promise.all([
      prisma.assessment.findFirst({
        where: { id: assessmentId, workspaceId: this.workspaceId }, include: { criteria: true },
      }),
      prisma.grade.findMany({
        where: { workspaceId: this.workspaceId, assessmentId },
        include: { evidence: true },
      }),
    ]);
    if (!assessment) throw new Error("Assessment not found");
    return grades.map((g) => {
      const recomputed = Math.round(g.evidence.reduce((s, e) => {
        const crit = assessment.criteria.find((c) => c.id === e.criterionId);
        if (!crit) return s;
        return s + Math.min(e.points, crit.maxPoints) * crit.weight;
      }, 0) * 100) / 100;
      return {
        gradeId: g.id, userId: g.userId, oldScore: g.totalPoints,
        newScore: recomputed, delta: Math.round((recomputed - g.totalPoints) * 100) / 100,
        rubricVersion: assessment.rubricVersion,
      };
    });
  }

  /** Apply regrade: increases auto (policy permitting); decreases need review. */
  async applyRegrade(assessmentId: string, gradeIds: string[], allowAutoIncrease = true, reason = "") {
    this.assertInstructor();
    const diffs = (await this.shadowRegrade(assessmentId)).filter((d) => gradeIds.includes(d.gradeId));
    const applied: string[] = [];
    const held: string[] = [];
    for (const d of diffs) {
      const rule = applyRegradeRule(d.oldScore, d.newScore, { allowAutoIncrease });
      if (rule.apply === "auto") {
        await prisma.grade.update({ where: { id: d.gradeId }, data: { totalPoints: d.newScore } });
        await prisma.gradeAudit.create({
          data: {
            gradeId: d.gradeId, workspaceId: this.workspaceId, actorId: this.userId,
            action: "REGRADE_APPLIED", detail: `shadow regrade Δ${rule.delta}`,
            previousScore: d.oldScore, newScore: d.newScore,
            reason: reason.slice(0, 1000) || "rubric/source update", learnerNotified: true,
          },
        });
        applied.push(d.gradeId);
      } else if (rule.apply === "review") {
        held.push(d.gradeId);
      }
    }
    return { applied, held, note: "Decreases and policy-blocked increases require explicit review. Originals preserved in audit." };
  }

  // -- Calibration ---------------------------------------------------------------------------
  async saveCalibration(input: z.infer<typeof calibrationSchema>) {
    this.assertInstructor();
    return prisma.calibrationExample.create({
      data: {
        workspaceId: this.workspaceId, assessmentId: input.assessmentId,
        response: input.response, instructorScores: input.instructorScores as never,
        createdById: this.userId,
      },
    });
  }

  async recordAiScores(exampleId: string, aiScores: Record<string, number>) {
    this.assertInstructor();
    return prisma.calibrationExample.updateMany({
      where: { id: exampleId, workspaceId: this.workspaceId },
      data: { aiScores: aiScores as never, status: "scored" },
    });
  }

  async listCalibration(assessmentId: string) {
    return prisma.calibrationExample.findMany({
      where: { workspaceId: this.workspaceId, assessmentId },
      orderBy: { createdAt: "desc" }, take: 100,
    });
  }

  /** Criterion-level agreement (never totals-only). */
  async calibrationMetrics(assessmentId: string) {
    const examples = await prisma.calibrationExample.findMany({
      where: { workspaceId: this.workspaceId, assessmentId }, take: 200,
    });
    const scored = examples.filter((e) => e.aiScores);
    let exact = 0, adjacent = 0, total = 0, absSum = 0;
    const byCriterion = new Map<string, { exact: number; n: number; abs: number }>();
    for (const e of scored) {
      const ins = (e.instructorScores ?? {}) as Record<string, number>;
      const ai = (e.aiScores ?? {}) as Record<string, number>;
      for (const [k, v] of Object.entries(ins)) {
        if (typeof ai[k] !== "number") continue;
        total++;
        const diff = Math.abs(v - (ai[k] as number));
        absSum += diff;
        if (diff === 0) exact++;
        if (diff <= 1) adjacent++;
        const c = byCriterion.get(k) ?? { exact: 0, n: 0, abs: 0 };
        c.n++; c.abs += diff; if (diff === 0) c.exact++;
        byCriterion.set(k, c);
      }
    }
    const overrides = await prisma.gradeAudit.count({
      where: { workspaceId: this.workspaceId, action: { in: ["CRITERION_REVISED", "CRITERION_APPROVED"] } },
    });
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      examples: examples.length, scored: scored.length,
      exactAgreement: total ? r2(exact / total) : 0,
      adjacentAgreement: total ? r2(adjacent / total) : 0,
      meanAbsDifference: total ? r2(absSum / total) : 0,
      byCriterion: Object.fromEntries([...byCriterion.entries()].map(([k, v]) => [k, {
        exact: v.n ? r2(v.exact / v.n) : 0, meanAbs: v.n ? r2(v.abs / v.n) : 0, n: v.n,
      }])),
      instructorOverrides: overrides,
    };
  }

  // -- Fairness (aggregate-only; identities never touch graders) ----------------------------------
  async saveFairness(input: z.infer<typeof fairnessSchema>) {
    this.assertInstructor();
    return prisma.fairnessAudit.create({
      data: {
        workspaceId: this.workspaceId, setId: input.setId || null,
        scope: input.scope, dimension: input.dimension,
        groups: input.groups as never,
        metrics: { note: "aggregate-only; n<10 groups suppressed" } as never,
        finding: input.finding, action: input.action, createdById: this.userId,
      },
    });
  }

  async fairnessMetrics(groups: { name: string; mean: number; sd: number; n: number }[]) {
    return disparityOfMeans(groups);
  }

  async listFairness(setId?: string) {
    return prisma.fairnessAudit.findMany({
      where: { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) },
      orderBy: { createdAt: "desc" }, take: 50,
    });
  }

  async resolveFairness(id: string, status: string, action: string) {
    this.assertInstructor();
    return prisma.fairnessAudit.updateMany({
      where: { id, workspaceId: this.workspaceId },
      data: { status, action: action.slice(0, 2000) },
    });
  }

  // -- Blind queue (identity stripped; blindKey only) --------------------------------------------------
  async blindQueue() {
    this.assertInstructor();
    const rows = await prisma.grade.findMany({
      where: { workspaceId: this.workspaceId, approved: false },
      include: { evidence: { include: { criterion: true } }, assessment: { select: { id: true, title: true, stakes: true } } },
      orderBy: { createdAt: "asc" }, take: 50,
    });
    return rows.map((g) => ({
      gradeId: g.id, blindKey: g.blindKey || g.id.slice(0, 8),
      assessment: g.assessment.title, stakes: g.assessment.stakes,
      total: g.totalPoints, max: g.maxPoints,
      uncertainty: g.uncertainty, reviewStatus: g.reviewStatus,
      criteria: g.evidence.map((e) => ({
        criterionId: e.criterionId, label: e.criterion.label,
        points: e.points, max: e.criterion.maxPoints,
        quote: e.evidenceQuote.slice(0, 300), reasoning: e.reasoning.slice(0, 300),
      })),
    }));
  }

  // -- Dashboard -----------------------------------------------------------------------------------------------
  async dashboard(assessmentId: string) {
    this.assertInstructor();
    const [assessment, grades, cal, fairness, challenges, deployment] = await Promise.all([
      prisma.assessment.findFirst({ where: { id: assessmentId, workspaceId: this.workspaceId } }),
      prisma.grade.findMany({ where: { workspaceId: this.workspaceId, assessmentId }, select: { approved: true, reviewStatus: true, uncertainty: true } }),
      this.calibrationMetrics(assessmentId).catch(() => null),
      prisma.fairnessAudit.findMany({ where: { workspaceId: this.workspaceId, status: "open" }, take: 20 }),
      prisma.evidenceChallenge.count({
        where: { workspaceId: this.workspaceId, status: "OPEN" as never },
      }).catch(() => 0),
      this.deploymentGate(assessmentId).catch(() => null),
    ]);
    if (!assessment) throw new Error("Assessment not found");
    const auto = grades.filter((g) => g.approved).length;
    const review = grades.filter((g) => !g.approved && g.reviewStatus !== "human_grading_required").length;
    const human = grades.filter((g) => !g.approved && g.reviewStatus === "human_grading_required").length;
    return {
      assessment: assessment.title, rubricVersion: assessment.rubricVersion,
      frozen: assessment.rubricFrozen, stakes: assessment.stakes, mode: assessment.gradingMode,
      submissions: grades.length,
      autoPublishable: auto, reviewRequired: review, humanRequired: human,
      calibration: cal ? {
        agreement: cal.exactAgreement, partialAgreement: cal.adjacentAgreement,
        overrides: cal.instructorOverrides, examples: cal.examples,
      } : null,
      fairness: { open: fairness.length },
      sourceStatus: { openChallenges: challenges },
      deployment,
    };
  }
}
