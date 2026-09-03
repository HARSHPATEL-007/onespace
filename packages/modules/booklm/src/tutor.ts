import { z } from "zod";
import { prisma } from "@n0va/db";

export const TUTOR_MODES = [
  "SOCRATIC", "DIRECT", "WORKED_EXAMPLE", "PRACTICE", "EXAM", "DEBUGGING",
  "DEBATE", "RESEARCH_SUPERVISOR", "FLASHCARD", "ORAL_EXAM", "PEER_REVIEW", "ACCESSIBILITY",
] as const;

export const sessionSchema = z.object({
  setId: z.string().optional(),
  mode: z.enum(TUTOR_MODES).default("DIRECT"),
  agent: z.string().max(60).default("tutor"),
});

export const memorySchema = z.object({
  sessionId: z.string().optional(),
  scope: z.enum(["SESSION", "COURSE", "LONG_TERM", "TEMP", "CLASSROOM_SHARED"]).default("SESSION"),
  key: z.string().trim().min(1).max(200),
  value: z.string().max(5000),
  confidence: z.number().min(0).max(1).default(0.5),
  provenance: z.string().max(1000).default(""),
  ttlHours: z.number().min(0).max(24 * 365).default(0),
});

export const decisionSchema = z.object({
  sessionId: z.string().min(1),
  detectedIssue: z.string().trim().min(1).max(2000),
  evidenceUsed: z.string().max(5000).default(""),
  chosenStrategy: z.string().trim().min(1).max(2000),
  alternatives: z.string().max(5000).default(""),
  expectedOutcome: z.string().max(2000).default(""),
  confidence: z.number().min(0).max(1).default(0.5),
});

const AGENT_FOR_MODE: Record<string, string> = {
  SOCRATIC: "socratic-questioner",
  DIRECT: "tutor",
  WORKED_EXAMPLE: "tutor",
  PRACTICE: "assessment",
  EXAM: "assessment",
  DEBUGGING: "tutor",
  DEBATE: "debate",
  RESEARCH_SUPERVISOR: "research",
  FLASHCARD: "tutor",
  ORAL_EXAM: "assessment",
  PEER_REVIEW: "teacher-supervisor",
  ACCESSIBILITY: "accessibility",
};

export class TutorService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string,
  ) {}

  async startSession(input: z.infer<typeof sessionSchema>) {
    const agent = AGENT_FOR_MODE[input.mode] ?? "tutor";
    return prisma.tutorSession.create({
      data: {
        workspaceId: this.workspaceId, userId: this.userId,
        setId: input.setId || null, mode: input.mode as never, agent,
      },
    });
  }

  async listSessions() {
    return prisma.tutorSession.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId },
      orderBy: { updatedAt: "desc" }, take: 30,
      include: { decisions: { orderBy: { createdAt: "desc" }, take: 5 } },
    });
  }

  async logDecision(input: z.infer<typeof decisionSchema>) {
    // Escalation: low confidence or sensitive topics go to teacher-supervisor queue
    const needsEscalation = input.confidence < 0.45 || /harm|cheat|exam leak|self-harm/i.test(input.detectedIssue);
    const d = await prisma.pedagogicalDecision.create({
      data: {
        workspaceId: this.workspaceId,
        sessionId: input.sessionId,
        detectedIssue: input.detectedIssue,
        evidenceUsed: input.evidenceUsed,
        chosenStrategy: input.chosenStrategy,
        alternatives: input.alternatives,
        expectedOutcome: input.expectedOutcome,
        confidence: input.confidence,
      },
    });
    await prisma.tutorSession.update({
      where: { id: input.sessionId },
      data: { summary: `${input.chosenStrategy} (conf ${input.confidence})`, updatedAt: new Date() },
    });
    return { decision: d, escalated: needsEscalation };
  }

  async overrideDecision(decisionId: string, override: string) {
    return prisma.pedagogicalDecision.update({
      where: { id: decisionId }, data: { learnerOverride: override.slice(0, 2000) },
    });
  }

  /** User-visible memory with provenance + expiry. TEMP expires; LONG_TERM persists. */
  async remember(input: z.infer<typeof memorySchema>) {
    // Prompt-injection guard: never store instructions smuggled in pasted docs as learner facts
    const suspicious = /ignore (previous|all) instructions|system prompt|jailbreak/i.test(input.value);
    return prisma.tutorMemory.create({
      data: {
        workspaceId: this.workspaceId, userId: this.userId,
        sessionId: input.sessionId || null,
        scope: input.scope as never,
        key: input.key,
        value: suspicious ? `[quarantined suspected injection]: ${input.value.slice(0, 500)}` : input.value,
        confidence: suspicious ? 0.05 : input.confidence,
        provenance: input.provenance || `tutor:${this.userId}`,
        expiresAt: input.ttlHours > 0 ? new Date(Date.now() + input.ttlHours * 3_600_000)
          : input.scope === "TEMP" ? new Date(Date.now() + 24 * 3_600_000) : null,
      },
    });
  }

  async memories(scope?: string) {
    await prisma.tutorMemory.deleteMany({
      where: { workspaceId: this.workspaceId, userId: this.userId, expiresAt: { lt: new Date() } },
    });
    return prisma.tutorMemory.findMany({
      where: { workspaceId: this.workspaceId, userId: this.userId, ...(scope ? { scope: scope as never } : {}) },
      orderBy: { createdAt: "desc" }, take: 100,
    });
  }

  async forgetMemory(id: string) {
    await prisma.tutorMemory.deleteMany({ where: { id, workspaceId: this.workspaceId, userId: this.userId } });
  }

  /** Tenant-isolated: instructors see only aggregated classroom memory, never raw long-term. */
  async classroomMemory() {
    if (!["admin", "owner", "teacher"].includes(this.role)) throw new Error("Forbidden: instructor role required");
    return prisma.tutorMemory.findMany({
      where: { workspaceId: this.workspaceId, scope: "CLASSROOM_SHARED" as never },
      orderBy: { createdAt: "desc" }, take: 100,
    });
  }
}
