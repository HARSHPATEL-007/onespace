import { z } from "zod";
import { prisma } from "@n0va/db";

export const misconceptionSchema = z.object({
  conceptId: z.string().min(1),
  statement: z.string().trim().min(1).max(1000),
  detectedFrom: z.array(z.string().max(120)).max(20).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  affectedConceptIds: z.array(z.string()).max(30).default([]),
  counterevidence: z.array(z.string()).max(30).default([]),
});

/** Learner-safe stage descriptions — never a stigmatizing diagnosis. */
export function learnerStageLabel(status: string): string {
  switch (status) {
    case "CANDIDATE": return "a pattern worth a second look";
    case "EVIDENCE_GATHERING": return "collecting examples";
    case "TESTING": return "testing with a quick check";
    case "CLARIFICATION": return "asking what you meant";
    case "CONFIRMED": return "current interpretation to revisit";
    case "REMEDIATION": return "working through a counterexample";
    case "REASSESSED": return "checking again in a new context";
    case "RESOLVED": return "resolved";
    case "DORMANT": return "quiet for now";
    case "PERSISTENT": return "still showing up — let's try a different angle";
    default: return "under review";
  }
}

const ADVANCE: Record<string, string[]> = {
  CANDIDATE: ["EVIDENCE_GATHERING", "DISMISSED"],
  EVIDENCE_GATHERING: ["TESTING", "DISMISSED"],
  TESTING: ["CLARIFICATION", "CONFIRMED", "DISMISSED"],
  CLARIFICATION: ["CONFIRMED", "DISMISSED"],
  CONFIRMED: ["REMEDIATION", "DORMANT"],
  REMEDIATION: ["REASSESSED", "PERSISTENT"],
  REASSESSED: ["RESOLVED", "PERSISTENT", "REMEDIATION"],
  PERSISTENT: ["REMEDIATION", "DORMANT"],
  DORMANT: ["EVIDENCE_GATHERING", "RESOLVED"],
  RESOLVED: [],
  DISMISSED: [],
};

export class MisconceptionService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string = "member",
  ) {}

  private assertInstructor() {
    if (!["admin", "owner", "teacher"].includes(this.role)) throw new Error("Forbidden: instructor role required");
  }

  async list(status?: string, includeResolved = false) {
    return prisma.misconception.findMany({
      where: {
        workspaceId: this.workspaceId, userId: this.userId,
        ...(status ? { status: status as never } : {}),
        ...(!status && !includeResolved ? { status: { notIn: ["RESOLVED", "DISMISSED"] as never } } : {}),
      },
      include: { concept: { select: { id: true, key: true, label: true } } },
      orderBy: { updatedAt: "desc" }, take: 100,
    });
  }

  /** Report a candidate (no permanent labeling without sufficient evidence). */
  async report(input: z.infer<typeof misconceptionSchema>) {
    const dup = await prisma.misconception.findFirst({
      where: {
        workspaceId: this.workspaceId, userId: this.userId,
        conceptId: input.conceptId, statement: input.statement,
        status: { notIn: ["RESOLVED", "DISMISSED"] as never },
      },
    });
    if (dup) {
      return prisma.misconception.update({
        where: { id: dup.id },
        data: {
          detectedFrom: [...new Set([...dup.detectedFrom, ...input.detectedFrom])].slice(0, 20),
          confidence: Math.min(0.95, Math.max(dup.confidence, input.confidence) + 0.05),
        },
      });
    }
    return prisma.misconception.create({
      data: {
        workspaceId: this.workspaceId, userId: this.userId,
        conceptId: input.conceptId, statement: input.statement,
        detectedFrom: input.detectedFrom, confidence: input.confidence,
        severity: input.severity, affectedConceptIds: input.affectedConceptIds,
        counterevidence: input.counterevidence,
      },
    });
  }

  async advance(id: string, to: string) {
    const m = await prisma.misconception.findFirst({
      where: { id, workspaceId: this.workspaceId, userId: this.userId },
    });
    if (!m) throw new Error("Misconception not found");
    const allowed = ADVANCE[m.status] ?? [];
    if (!allowed.includes(to)) throw new Error(`Invalid transition ${m.status} → ${to}`);
    if (["CONFIRMED", "RESOLVED", "DISMISSED"].includes(to)) this.assertInstructor();
    return prisma.misconception.update({
      where: { id },
      data: {
        status: to as never,
        resolvedAt: ["RESOLVED", "DISMISSED"].includes(to) ? new Date() : null,
      },
    });
  }

  async acknowledge(id: string, acknowledged: boolean) {
    return prisma.misconception.updateMany({
      where: { id, workspaceId: this.workspaceId, userId: this.userId },
      data: { learnerAcknowledged: acknowledged },
    });
  }

  async attachCounterevidence(id: string, evidenceIds: string[]) {
    const m = await prisma.misconception.findFirst({
      where: { id, workspaceId: this.workspaceId, userId: this.userId },
    });
    if (!m) throw new Error("Misconception not found");
    return prisma.misconception.update({
      where: { id },
      data: { counterevidence: [...new Set([...m.counterevidence, ...evidenceIds])].slice(0, 30) },
    });
  }

  /** Cluster across related concepts by affected-concept overlap. */
  async clusters() {
    const all = await this.list(undefined, true);
    const groups: { members: typeof all; concepts: string[] }[] = [];
    for (const m of all.filter((x) => !["RESOLVED", "DISMISSED"].includes(x.status))) {
      const set = new Set([m.conceptId, ...m.affectedConceptIds]);
      const g = groups.find((gr) => gr.concepts.some((c) => set.has(c)));
      if (g) {
        g.members.push(m);
        for (const c of set) if (!g.concepts.includes(c)) g.concepts.push(c);
      } else {
        groups.push({ members: [m], concepts: [...set] });
      }
    }
    return groups.map((g) => ({
      size: g.members.length,
      conceptIds: g.concepts,
      statements: g.members.map((m) => ({ id: m.id, statement: m.statement, status: m.status, severity: m.severity })),
      learnerLabel: "interpretations to revisit together",
    }));
  }

  /** Root-cause hint: confusion between similar terms via commonly-confused deps. */
  async rootCauseHints(conceptId: string) {
    const deps = await prisma.conceptDependency.findMany({
      where: {
        workspaceId: this.workspaceId,
        OR: [{ fromId: conceptId }, { toId: conceptId }],
        relation: "COMMONLY_CONFUSED_WITH" as never,
      },
      include: {
        from: { select: { id: true, label: true } },
        to: { select: { id: true, label: true } },
      },
    });
    return deps.map((d) => ({
      withConcept: d.fromId === conceptId ? d.to.label : d.from.label,
      hint: "Learners often confuse these two — check language ambiguity and surface-feature similarity.",
      confidence: d.confidence,
    }));
  }
}
