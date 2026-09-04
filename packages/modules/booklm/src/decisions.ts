import { z } from "zod";
import { prisma } from "@n0va/db";
import {
  ISSUES, strategyScore, confidenceBand, mustShowAlternatives,
  governanceChecks, outcomeQuality, type IssueType,
} from "./pedagogy";

export const evidenceItemSchema = z.object({
  type: z.string().max(60),
  ref: z.string().max(200),
  result: z.string().max(200).default(""),
  context: z.string().max(200).default(""),
  at: z.string().max(50).default(""),
  invalid: z.boolean().default(false),
});

export const alternativeSchema = z.object({
  strategy: z.string().max(120),
  fit: z.object({
    learningNeed: z.number().min(0).max(1).default(0.5),
    evidenceQuality: z.number().min(0).max(1).default(0.5),
    preferenceFit: z.number().min(0).max(1).default(0.5),
    accessibilityFit: z.number().min(0).max(1).default(0.8),
    policyFit: z.number().min(0).max(1).default(0.8),
    timeFit: z.number().min(0).max(1).default(0.6),
    complexity: z.number().min(0).max(1).default(0.3),
    dependenceRisk: z.number().min(0).max(1).default(0.2),
  }).default({}),
  reasonNotSelected: z.string().max(1000).default(""),
  risks: z.array(z.string().max(300)).max(5).default([]),
});

export const pedagogyDecisionSchema = z.object({
  setId: z.string().optional(),
  conceptId: z.string().optional(),
  trigger: z.string().max(120).default("assessment_submitted"),
  issueType: z.string().max(60).default("insufficient_evidence"),
  issueDescription: z.string().max(2000).default(""),
  severity: z.enum(["low", "moderate", "high"]).default("moderate"),
  evidence: z.array(evidenceItemSchema).max(20).default([]),
  chosenMode: z.string().max(60).default(""),
  chosenAction: z.string().max(2000).default(""),
  alternatives: z.array(alternativeSchema).max(10).default([]),
  expectedTarget: z.string().max(1000).default(""),
  successMeasure: z.string().max(1000).default(""),
  confIssue: z.number().min(0).max(1).default(0.5),
  confStrategy: z.number().min(0).max(1).default(0.5),
  confOutcome: z.number().min(0).max(1).default(0.5),
  agents: z.array(z.string().max(80)).max(15).default([]),
  stateSnapshot: z.string().max(120).default(""),
  policySnapshot: z.string().max(120).default(""),
});

export const reviewSchema = z.object({
  predictedOutcome: z.string().max(1000).default(""),
  observedOutcome: z.string().max(1000).default(""),
  predictionError: z.string().max(1000).default(""),
  effectiveness: z.number().min(0).max(1).optional(),
  nextAction: z.string().max(1000).default(""),
  confIssue: z.number().min(0).max(1).optional(),
  confStrategy: z.number().min(0).max(1).optional(),
});

const LEARNER_CONTROLS = ["accept", "modify", "reject", "defer", "ask_why", "ask_teacher"] as const;
const EDUCATOR_CONTROLS = [
  "approve", "reject", "modify_strategy", "correct_issue", "invalidate_evidence",
  "lock_strategy", "require_review", "block_inference", "add_context",
  "override_progression", "export",
] as const;

export class DecisionService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string = "member",
  ) {}

  private assertInstructor() {
    if (!["admin", "owner", "teacher"].includes(this.role)) throw new Error("Forbidden: instructor role required");
  }

  /** Create a versioned decision record with scored alternatives + governance gate. */
  async create(input: z.input<typeof pedagogyDecisionSchema>) {
    const issue = ISSUES[(input.issueType ?? "insufficient_evidence") as IssueType];
    const scoredAlternatives = (input.alternatives ?? []).map((a) => {
      const { score, factors } = strategyScore(a.fit ?? {});
      return { ...a, score, factors, selectionStatus: "not_selected" as const };
    });
    const ci = input.confIssue ?? 0.5, cs = input.confStrategy ?? 0.5, co = input.confOutcome ?? 0.5;
    const confOverall = Math.round(((ci + cs + co) / 3) * 100) / 100;
    const violations = governanceChecks({ hasRationale: (input.chosenAction ?? "").length > 0 });
    const blocking = violations.filter((v) => v.violated);
    const rec = await prisma.decisionRecord.create({
      data: {
        workspaceId: this.workspaceId, setId: input.setId || null, userId: this.userId,
        conceptId: input.conceptId || null, trigger: input.trigger ?? "assessment_submitted",
        issueType: input.issueType ?? "insufficient_evidence",
        issueDescription: input.issueDescription || issue?.prefer || "Under review.",
        severity: input.severity ?? "moderate", evidence: (input.evidence ?? []) as never,
        chosenMode: input.chosenMode ?? "", chosenAction: input.chosenAction ?? "",
        alternatives: scoredAlternatives as never,
        expectedTarget: input.expectedTarget ?? "", successMeasure: input.successMeasure ?? "",
        confOverall, confIssue: ci, confStrategy: cs, confOutcome: co,
        status: blocking.length > 0 ? ("ESCALATED" as never) : ("PENDING_LEARNER" as never),
        controlNote: blocking.length > 0 ? `governance hold: ${blocking.map((b) => b.rule).join(", ")}` : "",
        provenance: { agents: input.agents ?? [], stateSnapshot: input.stateSnapshot ?? "", policySnapshot: input.policySnapshot ?? "" } as never,
      },
    });
    return rec;
  }

  async get(id: string) {
    const rec = await prisma.decisionRecord.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: { reviews: { orderBy: { createdAt: "asc" } } },
    });
    if (!rec) throw new Error("Decision not found");
    if (this.role === "member" && rec.userId !== this.userId) throw new Error("Forbidden");
    return rec;
  }

  async list(setId?: string, status?: string, mineOnly = true) {
    return prisma.decisionRecord.findMany({
      where: {
        workspaceId: this.workspaceId,
        ...(mineOnly && this.role === "member" ? { userId: this.userId } : {}),
        ...(setId ? { setId } : {}),
        ...(status ? { status: status as never } : {}),
      },
      include: { reviews: { take: 5 } },
      orderBy: { createdAt: "desc" }, take: 50,
    });
  }

  /** Learner-facing explanation card (simple summary; detail preserved in record). */
  async card(id: string) {
    const rec = await this.get(id);
    const issue = ISSUES[rec.issueType as IssueType];
    const band = confidenceBand(rec.confOverall);
    const showAlts = mustShowAlternatives({
      confidence: rec.confOverall,
      changesPath: true,
      highImpact: rec.severity === "high",
    });
    const evidence = (rec.evidence ?? []) as { type: string; ref: string; result: string; context: string; at: string; invalid?: boolean }[];
    return {
      id: rec.id, status: rec.status,
      title: "Why this next step?",
      detectedIssue: rec.issueDescription,
      issueLabel: issue?.label ?? rec.issueType,
      evidence: evidence.filter((e) => !e.invalid).map((e) => ({
        text: `${e.type.replace(/_/g, " ")}${e.context ? ` (${e.context})` : ""}: ${e.result || e.ref}`,
        at: e.at,
      })),
      strategy: { mode: rec.chosenMode, action: rec.chosenAction },
      alternatives: showAlts
        ? ((rec.alternatives ?? []) as { strategy: string; reasonNotSelected: string; risks: string[] }[]).map((a) => ({
            strategy: a.strategy,
            bestIf: a.reasonNotSelected || "viable alternative",
            risks: a.risks,
          }))
        : [],
      expectedOutcome: { target: rec.expectedTarget, successTest: rec.successMeasure },
      confidence: {
        overall: rec.confOverall, band: band.band, meaning: band.meaning,
        why: `issue detection ${Math.round(rec.confIssue * 100)}%, strategy ${Math.round(rec.confStrategy * 100)}%, outcome ${Math.round(rec.confOutcome * 100)}% — confidence is not correctness; the next performance validates it.`,
      },
      controls: [...LEARNER_CONTROLS],
    };
  }

  /** Learner control: accept / modify / reject / defer / ask_why / ask_teacher. */
  async control(id: string, action: string, note = "", modifiedAction = "") {
    if (!(LEARNER_CONTROLS as readonly string[]).includes(action)) throw new Error(`Unknown control ${action}`);
    const rec = await this.get(id);
    if (rec.userId !== this.userId) throw new Error("Forbidden: only the learner controls this decision");
    if (action === "ask_why") return this.card(id);
    if (action === "ask_teacher") {
      const updated = await prisma.decisionRecord.update({
        where: { id }, data: { status: "ESCALATED" as never, controlBy: this.userId, controlNote: note.slice(0, 1000) },
      });
      return updated;
    }
    const status = action === "accept" ? "ACCEPTED" : action === "reject" ? "REJECTED" : action === "defer" ? "DEFERRED" : "MODIFIED";
    // Rejection is preference/context evidence — record it as such, never as resistance.
    const updated = await prisma.decisionRecord.update({
      where: { id },
      data: {
        status: status as never, controlBy: this.userId, controlNote: note.slice(0, 1000),
        ...(action === "modify" && modifiedAction ? { chosenAction: modifiedAction.slice(0, 2000), version: { increment: 1 } } : {}),
      },
    });
    return updated;
  }

  /** Educator actions: 11 authorized operations with labeled attribution. */
  async educator(id: string, action: string, note = "", payload: Record<string, unknown> = {}) {
    this.assertInstructor();
    if (!(EDUCATOR_CONTROLS as readonly string[]).includes(action)) throw new Error(`Unknown educator action ${action}`);
    const rec = await prisma.decisionRecord.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!rec) throw new Error("Decision not found");
    const tag = `[instructor:${this.userId}]`;
    switch (action) {
      case "approve":
        return prisma.decisionRecord.update({ where: { id }, data: { status: "ACCEPTED" as never, controlBy: this.userId, controlNote: `${tag} approved. ${note}`.slice(0, 1000) } });
      case "reject":
        return prisma.decisionRecord.update({ where: { id }, data: { status: "REJECTED" as never, controlBy: this.userId, controlNote: `${tag} rejected. ${note}`.slice(0, 1000) } });
      case "modify_strategy":
        return prisma.decisionRecord.update({
          where: { id },
          data: {
            status: "MODIFIED" as never, controlBy: this.userId,
            chosenMode: String(payload.mode ?? rec.chosenMode).slice(0, 60),
            chosenAction: String(payload.action ?? rec.chosenAction).slice(0, 2000),
            controlNote: `${tag} ${note}`.slice(0, 1000), version: { increment: 1 },
          },
        });
      case "correct_issue": {
        const issueType = String(payload.issueType ?? rec.issueType);
        const issue = ISSUES[issueType as IssueType];
        return prisma.decisionRecord.update({
          where: { id },
          data: {
            issueType, issueDescription: String(payload.description ?? issue?.prefer ?? rec.issueDescription).slice(0, 2000),
            controlBy: this.userId, controlNote: `${tag} reclassified. ${note}`.slice(0, 1000), version: { increment: 1 },
          },
        });
      }
      case "invalidate_evidence": {
        const ref = String(payload.ref ?? "");
        const evidence = ((rec.evidence ?? []) as { ref: string }[]).map((e) =>
          e.ref === ref ? { ...e, invalid: true } : e,
        );
        return prisma.decisionRecord.update({
          where: { id }, data: { evidence: evidence as never, controlBy: this.userId, controlNote: `${tag} invalidated ${ref}. ${note}`.slice(0, 1000), version: { increment: 1 } },
        });
      }
      case "lock_strategy":
        return prisma.decisionRecord.update({
          where: { id }, data: { controlBy: this.userId, controlNote: `${tag} locked strategy: ${rec.chosenMode}. Automated updates must not overwrite without policy. ${note}`.slice(0, 1000) },
        });
      case "require_review":
        return prisma.decisionRecord.update({ where: { id }, data: { status: "ESCALATED" as never, controlBy: this.userId, controlNote: `${tag} human review required. ${note}`.slice(0, 1000) } });
      case "block_inference":
        return prisma.decisionRecord.update({
          where: { id }, data: { controlBy: this.userId, controlNote: `${tag} blocked inference reuse: ${String(payload.inference ?? "")}. ${note}`.slice(0, 1000) },
        });
      case "add_context": {
        const evidence = [...((rec.evidence ?? []) as unknown[]), {
          type: "instructor_context", ref: `instructor:${this.userId}`,
          result: String(payload.context ?? note).slice(0, 500), context: "instructor", at: new Date().toISOString(),
        }];
        return prisma.decisionRecord.update({
          where: { id }, data: { evidence: evidence as never, controlBy: this.userId, version: { increment: 1 } },
        });
      }
      case "override_progression":
        return prisma.decisionRecord.update({
          where: { id }, data: { status: "MODIFIED" as never, controlBy: this.userId, controlNote: `${tag} progression override (appealable). ${note}`.slice(0, 1000), version: { increment: 1 } },
        });
      case "export":
        return this.get(id);
      default:
        throw new Error("Unreachable");
    }
  }

  /** Delivery/measurement markers for the intervention state machine. */
  async mark(id: string, to: "DELIVERED" | "MEASURED") {
    return prisma.decisionRecord.updateMany({
      where: { id, workspaceId: this.workspaceId },
      data: { status: to as never },
    });
  }

  /** Post-intervention review: prediction retained, outcome appended, never rewritten. */
  async review(id: string, input: z.infer<typeof reviewSchema>) {
    const rec = await this.get(id);
    const review = await prisma.decisionReview.create({
      data: {
        workspaceId: this.workspaceId, decisionId: id,
        predictedOutcome: input.predictedOutcome, observedOutcome: input.observedOutcome,
        predictionError: input.predictionError,
        effectiveness: input.effectiveness ?? null, nextAction: input.nextAction,
        confidenceUpdate: { confIssue: input.confIssue ?? null, confStrategy: input.confStrategy ?? null } as never,
      },
    });
    await prisma.decisionRecord.updateMany({
      where: { id, workspaceId: this.workspaceId },
      data: { status: "REVIEWED" as never },
    });
    void rec;
    return review;
  }

  /** Decision metrics: completeness, control behavior, outcome attainment. */
  async metrics(setId?: string) {
    const where = { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) };
    const [all, reviews] = await Promise.all([
      prisma.decisionRecord.findMany({ where, select: { status: true, confOverall: true, evidence: true, alternatives: true, controlBy: true } }),
      prisma.decisionReview.findMany({ where: { workspaceId: this.workspaceId }, select: { effectiveness: true, decisionId: true } }),
    ]);
    const complete = all.filter((d) =>
      (d.evidence as unknown[] | null)?.length && (d.alternatives as unknown[] | null)?.length && d.confOverall > 0,
    ).length;
    const byStatus = new Map<string, number>();
    for (const d of all) byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);
    const eff = reviews.map((r) => r.effectiveness).filter((e): e is number => typeof e === "number");
    const r2 = (n: number) => Math.round(n * 100) / 100;
    return {
      decisions: all.length,
      completeRecordRate: all.length ? r2(complete / all.length) : 0,
      byStatus: Object.fromEntries(byStatus),
      learnerControlRate: all.length ? r2(all.filter((d) => d.controlBy).length / all.length) : 0,
      reviews: reviews.length,
      outcomeAttainment: eff.length ? r2(eff.filter((e) => e >= 0.6).length / eff.length) : 0,
      avgEffectiveness: eff.length ? r2(eff.reduce((s, e) => s + e, 0) / eff.length) : 0,
    };
  }
}
