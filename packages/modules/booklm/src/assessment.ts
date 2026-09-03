import { z } from "zod";
import { prisma } from "@n0va/db";

export const assessmentSchema = z.object({
  setId: z.string().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(""),
  criteria: z.array(z.object({
    label: z.string().trim().min(1).max(200),
    description: z.string().max(1000).default(""),
    weight: z.number().min(0).max(10).default(1),
    maxPoints: z.number().min(0).max(1000).default(10),
  })).min(1).max(20),
});

export const gradeSchema = z.object({
  assessmentId: z.string().min(1),
  userId: z.string().min(1),
  evidence: z.array(z.object({
    criterionId: z.string().min(1),
    points: z.number().min(0).max(1000),
    evidenceQuote: z.string().max(2000).default(""),
    reasoning: z.string().max(2000).default(""),
  })).min(1),
  explanation: z.string().max(4000).default(""),
  blindKey: z.string().max(100).default(""),
});

export const attemptSchema = z.object({
  setId: z.string().min(1),
  mode: z.enum(["PRACTICE", "EXAM", "OPEN_BOOK", "CLOSED_BOOK", "ORAL"]).default("PRACTICE"),
  responses: z.array(z.object({
    prompt: z.string().min(1).max(2000),
    answer: z.string().max(2000),
    picked: z.string().max(2000).default(""),
    correct: z.boolean(),
    responseTimeMs: z.number().int().min(0).default(0),
    confidence: z.number().min(0).max(1).default(0.5),
    conceptKey: z.string().max(120).default(""),
  })).min(1).max(50),
  durationSec: z.number().int().min(0).default(0),
  integrityFlags: z.string().max(1000).default(""),
  accommodation: z.string().max(500).default(""),
});

export class AssessmentService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string,
  ) {}

  private assertInstructor() {
    if (!["admin", "owner", "teacher"].includes(this.role)) throw new Error("Forbidden: instructor role required");
  }

  async createAssessment(input: z.infer<typeof assessmentSchema>) {
    this.assertInstructor();
    return prisma.assessment.create({
      data: {
        workspaceId: this.workspaceId,
        setId: input.setId || null,
        title: input.title,
        description: input.description,
        createdById: this.userId,
        criteria: { create: input.criteria.map((c) => ({ ...c })) },
      },
      include: { criteria: true },
    });
  }

  async listAssessments(setId?: string) {
    return prisma.assessment.findMany({
      where: { workspaceId: this.workspaceId, ...(setId ? { setId } : {}) },
      include: { criteria: true }, orderBy: { createdAt: "desc" }, take: 50,
    });
  }

  /** Rubric-aware grading with criterion-level evidence + audit trail. */
  async submitGrade(input: z.infer<typeof gradeSchema>) {
    this.assertInstructor();
    const assessment = await prisma.assessment.findFirst({
      where: { id: input.assessmentId, workspaceId: this.workspaceId },
      include: { criteria: true },
    });
    if (!assessment) throw new Error("Assessment not found");
    const maxPoints = assessment.criteria.reduce((s, c) => s + c.maxPoints * c.weight, 0);
    // Clamp points per criterion; partial credit preserved
    let total = 0;
    for (const e of input.evidence) {
      const crit = assessment.criteria.find((c) => c.id === e.criterionId);
      if (!crit) throw new Error(`Unknown criterion ${e.criterionId}`);
      total += Math.min(e.points, crit.maxPoints) * crit.weight;
    }
    const grade = await prisma.grade.create({
      data: {
        workspaceId: this.workspaceId, assessmentId: input.assessmentId, userId: input.userId,
        totalPoints: Math.round(total * 100) / 100, maxPoints: Math.round(maxPoints * 100) / 100,
        explanation: input.explanation, blindKey: input.blindKey,
        evidence: { create: input.evidence.map((e) => ({ ...e })) },
        audits: { create: [{ workspaceId: this.workspaceId, actorId: this.userId, action: "GRADE_SUBMITTED", detail: `total=${total}` }] },
      },
      include: { evidence: true },
    });
    return grade;
  }

  async approveGrade(gradeId: string, approved: boolean) {
    this.assertInstructor();
    const g = await prisma.grade.update({ where: { id: gradeId }, data: { approved } });
    await prisma.gradeAudit.create({
      data: { gradeId, workspaceId: this.workspaceId, actorId: this.userId, action: approved ? "GRADE_APPROVED" : "GRADE_REJECTED", detail: "" },
    });
    return g;
  }

  async appealGrade(gradeId: string, reason: string) {
    return prisma.gradeAppeal.create({
      data: { gradeId, workspaceId: this.workspaceId, userId: this.userId, reason: reason.slice(0, 2000) },
    });
  }

  async resolveAppeal(appealId: string, status: "UPHELD" | "OVERTURNED", resolution: string) {
    this.assertInstructor();
    return prisma.gradeAppeal.update({ where: { id: appealId }, data: { status: status as never, resolution: resolution.slice(0, 2000) } });
  }

  async gradesForAssessment(assessmentId: string) {
    this.assertInstructor();
    return prisma.grade.findMany({
      where: { workspaceId: this.workspaceId, assessmentId },
      include: { evidence: { include: { criterion: true } }, user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: "desc" }, take: 200,
    });
  }

  async myGrades() {
    return prisma.grade.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      include: { evidence: { include: { criterion: true } }, assessment: true },
      orderBy: { createdAt: "desc" }, take: 50,
    });
  }

  /** Record a quiz attempt; feeds adaptive engine + integrity tracking. */
  async recordAttempt(input: z.infer<typeof attemptSchema>) {
    const score = input.responses.filter((r) => r.correct).length;
    // Item exposure tracking: count prior attempts per prompt hash
    const attempt = await prisma.quizAttempt.create({
      data: {
        workspaceId: this.workspaceId, setId: input.setId, userId: this.userId,
        mode: input.mode as never, score, total: input.responses.length,
        durationSec: input.durationSec, integrityFlags: input.integrityFlags,
        accommodation: input.accommodation,
        submittedAt: new Date(),
        responses: { create: input.responses.map((r) => ({ ...r })) },
      },
      include: { responses: true },
    });
    return attempt;
  }

  async attemptsForSet(setId: string, mineOnly = false) {
    const where: Record<string, unknown> = { workspaceId: this.workspaceId, setId };
    if (mineOnly || !["admin", "owner", "teacher"].includes(this.role)) {
      (where as Record<string, string>).userId = this.userId;
    }
    return prisma.quizAttempt.findMany({ where: where as never, orderBy: { startedAt: "desc" }, take: 100, include: { responses: true } });
  }
}
