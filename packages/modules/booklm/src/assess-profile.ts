import { z } from "zod";
import { prisma } from "@n0va/db";
import {
  ASSESS_DIMS, ASSESS_SEQUENCE, aggregateDimension, conditionSplit,
  decisionRule, validateBlueprint, compositeGrade,
  type AssessDim,
} from "./assess-dims";

export const evidenceSchema = z.object({
  setId: z.string().min(1),
  conceptKey: z.string().max(120).default(""),
  conceptId: z.string().optional(),
  dimension: z.enum(ASSESS_DIMS),
  score: z.number().min(0).max(1),
  subscores: z.record(z.string().max(60), z.number().min(0).max(1)).default({}),
  correct: z.boolean().default(true),
  confidence: z.number().min(0).max(1).default(0.5),
  supportLevel: z.enum(["independent", "cued", "scaffolded", "demonstrated"]).default("independent"),
  transferLevel: z.number().int().min(1).max(6).optional(),
  condition: z.string().max(40).default("unspecified"),
  prompt: z.string().max(2000).default(""),
  answer: z.string().max(4000).default(""),
  responseTimeMs: z.number().int().min(0).default(0),
  reasonableMethod: z.boolean().default(true),
});

export const blueprintSchema = z.object({
  setId: z.string().min(1),
  objective: z.string().trim().min(1).max(300),
  weights: z.record(z.string().max(60), z.number().min(0).max(1)),
  minimums: z.record(z.string().max(60), z.number().int().min(0).max(100)),
});

/** Assessment dimension → learner-graph dimension for evidence folding. */
const DIM_MAP: Record<string, string> = {
  retrieval: "recall", application: "application", novel_transfer: "transfer",
  error_diagnosis: "analysis", concept_mapping: "conceptual", teach_back: "conceptual",
  oral_explanation: "conceptual", practical_demonstration: "procedural",
  project_evaluation: "creation", reflection_metacognition: "metacognition",
  peer_assessment: "analysis", portfolio_evidence: "creation",
};

export class AssessProfileService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string = "member",
  ) {}

  private assertInstructor() {
    if (!["admin", "owner", "teacher"].includes(this.role)) throw new Error("Forbidden: instructor role required");
  }

  /** Record dimension evidence: attempt + response with subscores, support, condition. */
  async recordEvidence(input: z.infer<typeof evidenceSchema>) {
    // Correct-through-irrelevant-method must not score as sound reasoning.
    const score = input.reasonableMethod ? input.score : Math.min(input.score, 0.4);
    const attempt = await prisma.quizAttempt.create({
      data: {
        workspaceId: this.workspaceId, setId: input.setId, userId: this.userId,
        mode: "PRACTICE" as never, score: input.correct ? 1 : 0, total: 1,
        durationSec: Math.round(input.responseTimeMs / 1000),
        dimension: input.dimension,
        condition: { label: input.condition, supportLevel: input.supportLevel } as never,
        submittedAt: new Date(),
        responses: {
          create: [{
            prompt: input.prompt.slice(0, 2000), answer: input.answer.slice(0, 4000),
            picked: "", correct: input.correct, responseTimeMs: input.responseTimeMs,
            confidence: input.confidence, conceptKey: input.conceptKey,
            dimension: input.dimension, subscores: input.subscores as never,
            supportLevel: input.supportLevel,
            transferLevel: input.transferLevel ?? null,
            conditionLabel: input.condition,
          }],
        },
      },
      include: { responses: true },
    });
    // Fold into the learner graph as an observation (evidence-linked, never a leap).
    if (input.conceptId) {
      const { LearnerGraphService } = await import("./graph");
      const g = new LearnerGraphService(this.workspaceId, this.userId, this.role);
      await g.observe({
        conceptId: input.conceptId, dimension: (DIM_MAP[input.dimension] ?? "recall") as never,
        value: score, confidence: input.confidence,
        sourceType: `assessment_${input.dimension}`, sourceId: attempt.id,
        context: `${input.condition}/${input.supportLevel}`, novelty: input.transferLevel ? Math.min(1, input.transferLevel / 6) : 0,
        visibility: "learner-and-instructor",
      }).catch(() => undefined);
    }
    return attempt;
  }

  /** Multidimensional profile: separate scores, coverage, conditions — no composite. */
  async profile(setId: string, conceptKey?: string) {
    const attempts = await prisma.quizAttempt.findMany({
      where: { workspaceId: this.workspaceId, setId, userId: this.userId },
      include: { responses: true },
      orderBy: { startedAt: "desc" }, take: 300,
    });
    const byDim = new Map<string, { score: number; independent: boolean; condition: string; supportLevel: "independent" | "cued" | "scaffolded" | "demonstrated"; transferLevel?: number | null; at: number }[]>();
    for (const a of attempts) {
      for (const r of a.responses) {
        if (!r.dimension) continue;
        if (conceptKey && r.conceptKey !== conceptKey) continue;
        const subs = (r.subscores ?? {}) as Record<string, number>;
        const subVals = Object.values(subs).filter((v): v is number => typeof v === "number");
        const score = subVals.length > 0
          ? subVals.reduce((s, v) => s + v, 0) / subVals.length
          : r.correct ? 0.75 : 0.25;
        const arr = byDim.get(r.dimension) ?? [];
        arr.push({
          score: Math.round(score * 100) / 100,
          independent: r.supportLevel === "independent",
          condition: r.conditionLabel || "unspecified",
          supportLevel: (["independent", "cued", "scaffolded", "demonstrated"].includes(r.supportLevel) ? r.supportLevel : "independent") as never,
          transferLevel: r.transferLevel,
          at: new Date(a.startedAt).getTime(),
        });
        byDim.set(r.dimension, arr);
      }
    }
    const dimensions: Record<string, ReturnType<typeof aggregateDimension> & { conditions: Record<string, { n: number; avg: number }> }> = {};
    for (const dim of ASSESS_DIMS) {
      const ev = byDim.get(dim) ?? [];
      dimensions[dim] = { ...aggregateDimension(ev), conditions: conditionSplit(ev) };
    }
    const scores = Object.fromEntries(
      Object.entries(dimensions).map(([k, v]) => [k, v.score]),
    ) as Partial<Record<AssessDim, number | null>>;
    return { dimensions, scores, rule: decisionRule(scores) };
  }

  async learnerReport(setId: string, conceptKey: string, conceptLabel: string) {
    const { dimensions, scores } = await this.profile(setId, conceptKey);
    const sampled = (Object.entries(scores) as [AssessDim, number | null][]).filter(([, v]) => v !== null);
    const strengths = sampled.filter(([, v]) => v! >= 0.7).map(([k]) => k);
    const developing = sampled.filter(([, v]) => v! >= 0.5 && v! < 0.7).map(([k]) => k);
    const lowest = [...sampled].sort((a, b) => a[1]! - b[1]!)[0];
    const transfer = dimensions.novel_transfer ?? { score: null, tasks: 0, confidence: 0, limitations: [] as string[] };
    return {
      concept: conceptLabel,
      strengths, developing,
      nextGrowthArea: lowest?.[0] ?? null,
      evidence: lowest
        ? `Strongest evidence sits in ${strengths[0]?.replace(/_/g, " ") ?? "familiar work"}; ${lowest[0].replace(/_/g, " ")} is lowest at ${Math.round(lowest[1]! * 100)}% over ${dimensions[lowest[0]]?.tasks ?? 0} task(s).`
        : "No evidence sampled yet — complete a retrieval check first.",
      transferNote: transfer.score !== null && transfer.score < 0.6
        ? "Familiar work succeeds but novel contexts lag — mastery from familiar exercises alone is not claimed."
        : null,
      confidence: lowest ? (dimensions[lowest[0]]?.confidence ?? 0) : 0,
      limitations: lowest ? (dimensions[lowest[0]]?.limitations ?? []) : [],
    };
  }

  async educatorReport(setId: string, conceptKey: string, conceptLabel: string) {
    const { dimensions, scores } = await this.profile(setId, conceptKey);
    const sampled = (Object.entries(dimensions) as [string, (typeof dimensions)[AssessDim]][]).filter(([, v]) => v.tasks > 0);
    const reliable = [...sampled].sort((a, b) => b[1].quality - a[1].quality)[0];
    const unresolved = (Object.entries(scores) as [AssessDim, number | null][])
      .filter(([, v]) => v !== null)
      .sort((a, b) => a[1]! - b[1]!)[0];
    const unsampled = ASSESS_DIMS.filter((d) => (dimensions[d]?.tasks ?? 0) === 0);
    return {
      concept: conceptLabel,
      coverage: `${sampled.length} of ${ASSESS_DIMS.length} dimensions sampled`,
      reliableFinding: reliable ? `${reliable[0].replace(/_/g, " ")} (quality ${reliable[1].quality})` : "none yet",
      unresolvedQuestion: unresolved ? `${unresolved[0].replace(/_/g, " ")} at ${Math.round(unresolved[1]! * 100)}%` : "none yet",
      explanations: [
        "surface-pattern dependence",
        "limited unfamiliar-context experience",
        "language complexity in the novel prompt",
      ],
      recommendedAssessment: unsampled.slice(0, 3).map((d) => d.replace(/_/g, " ")),
      scores,
    };
  }

  async sequence(setId: string, conceptKey?: string) {
    const { dimensions } = await this.profile(setId, conceptKey);
    return ASSESS_SEQUENCE.map((dim) => ({
      dim, question: dim.replace(/_/g, " "),
      done: dimensions[dim]?.tasks ?? 0,
      score: dimensions[dim]?.score ?? null,
    }));
  }

  // -- Blueprints (educator-defined weights + minimums) ----------------------------------
  async upsertBlueprint(input: z.infer<typeof blueprintSchema>) {
    this.assertInstructor();
    const check = validateBlueprint(
      input.weights as Record<string, number>,
      input.minimums as Record<string, number>,
    );
    if (!check.valid) throw new Error(`Blueprint invalid: ${check.problems.join("; ")}`);
    return prisma.assessmentBlueprint.upsert({
      where: { workspaceId_setId_objective: { workspaceId: this.workspaceId, setId: input.setId, objective: input.objective } },
      update: { weights: input.weights as never, minimums: input.minimums as never, createdById: this.userId },
      create: {
        workspaceId: this.workspaceId, setId: input.setId, objective: input.objective,
        weights: input.weights as never, minimums: input.minimums as never, createdById: this.userId,
      },
    });
  }

  async listBlueprints(setId: string) {
    return prisma.assessmentBlueprint.findMany({ where: { workspaceId: this.workspaceId, setId }, take: 50 });
  }

  async blueprintCheck(setId: string, objective: string, conceptKey?: string) {
    const bp = await prisma.assessmentBlueprint.findUnique({
      where: { workspaceId_setId_objective: { workspaceId: this.workspaceId, setId, objective } },
    });
    if (!bp) return { configured: false as const };
    const { dimensions } = await this.profile(setId, conceptKey);
    const weights = (bp.weights ?? {}) as Record<string, number>;
    const minimums = (bp.minimums ?? {}) as Record<string, number>;
    const unmet = Object.entries(minimums)
      .filter(([dim, n]) => (dimensions[dim as AssessDim]?.tasks ?? 0) < n)
      .map(([dim, n]) => `${dim.replace(/_/g, " ")}: ${(dimensions[dim as AssessDim]?.tasks ?? 0)}/${n} tasks`);
    const scores = Object.fromEntries(
      (Object.keys(weights) as AssessDim[]).map((d) => [d, dimensions[d]?.score ?? null]),
    ) as Partial<Record<AssessDim, number | null>>;
    const { compositeGrade } = await import("./assess-dims");
    return {
      configured: true as const, objective,
      unmetMinimums: unmet,
      grade: compositeGrade(scores, weights),
      note: "Composite grade exists only through these educator-approved weights; components preserved.",
    };
  }
}
