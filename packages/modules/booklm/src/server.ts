import { z } from "zod";
import { prisma, type LearningItem } from "@n0va/db";

export const learningSetSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  description: z.string().max(500).default(""),
});

export const learningItemSchema = z.object({
  kind: z.enum(["DOC", "VIDEO", "LINK", "NOTE"]),
  title: z.string().trim().min(1, "Title is required").max(200),
  source: z.string().max(2000).default(""),
  notes: z.string().max(5000).default(""),
  refId: z.string().optional(),
});

export type LearningSetWithItems = {
  id: string;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  items: LearningItem[];
};

export type SourcePick = { id: string; title: string; kind: "DOC" | "VIDEO" };

export class LearningService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string,
  ) {}

  async list(): Promise<LearningSetWithItems[]> {
    return prisma.learningSet.findMany({
      where: { workspaceId: this.workspaceId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async create(title: string, description: string): Promise<string> {
    const set = await prisma.learningSet.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, title, description },
    });
    return set.id;
  }

  async get(id: string): Promise<LearningSetWithItems | null> {
    return prisma.learningSet.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async updateMeta(id: string, title: string, description: string): Promise<void> {
    await prisma.learningSet.update({ where: { id }, data: { title, description } });
  }

  async remove(id: string): Promise<void> {
    await prisma.learningSet.delete({ where: { id } });
  }

  async addItem(setId: string, input: z.infer<typeof learningItemSchema>): Promise<void> {
    const count = await prisma.learningItem.count({ where: { setId } });
    await prisma.learningItem.create({
      data: {
        setId,
        workspaceId: this.workspaceId,
        kind: input.kind,
        title: input.title,
        source: input.source,
        notes: input.notes,
        refId: input.refId,
        sortOrder: count,
      },
    });
    await prisma.learningSet.update({ where: { id: setId }, data: { updatedAt: new Date() } });
  }

  async removeItem(setId: string, itemId: string): Promise<void> {
    await prisma.learningItem.delete({ where: { id: itemId, setId } });
  }

  async moveItem(setId: string, itemId: string, dir: "up" | "down"): Promise<void> {
    const items = await prisma.learningItem.findMany({ where: { setId }, orderBy: { sortOrder: "asc" } });
    const i = items.findIndex((x) => x.id === itemId);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= items.length) return;
    const a = items[i]!;
    const b = items[j]!;
    await prisma.$transaction([
      prisma.learningItem.update({ where: { id: itemId }, data: { sortOrder: b.sortOrder } }),
      prisma.learningItem.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
    ]);
  }

  /** Cross-module source pickers for "add from workspace" */
  async pickDocs(): Promise<SourcePick[]> {
    const docs = await prisma.doc.findMany({ where: { workspaceId: this.workspaceId }, select: { id: true, title: true } });
    return docs.map((d) => ({ id: d.id, title: d.title, kind: "DOC" as const }));
  }

  async pickVideos(): Promise<SourcePick[]> {
    const vids = await prisma.video.findMany({ where: { workspaceId: this.workspaceId }, select: { id: true, title: true } });
    return vids.map((v) => ({ id: v.id, title: v.title, kind: "VIDEO" as const }));
  }

  async updateGoal(setId: string, goal: string, difficulty: string): Promise<void> {
    await prisma.learningSet.updateMany({ where: { id: setId, workspaceId: this.workspaceId }, data: { goal: goal.slice(0, 500), difficulty } });
    await prisma.studyPlan.upsert({
      where: { workspaceId_setId_userId: { workspaceId: this.workspaceId, setId, userId: this.userId } },
      update: { goal: goal.slice(0, 500), difficulty, lastActiveAt: new Date() },
      create: { workspaceId: this.workspaceId, setId, userId: this.userId, goal: goal.slice(0, 500), difficulty },
    });
  }

  async saveNextAction(setId: string, nextAction: string, reason: string): Promise<void> {
    await prisma.studyPlan.upsert({
      where: { workspaceId_setId_userId: { workspaceId: this.workspaceId, setId, userId: this.userId } },
      update: { nextAction: nextAction.slice(0, 500), nextActionReason: reason.slice(0, 500), lastActiveAt: new Date() },
      create: { workspaceId: this.workspaceId, setId, userId: this.userId, nextAction: nextAction.slice(0, 500), nextActionReason: reason.slice(0, 500) },
    });
  }

  async touchActivity(setId: string): Promise<void> {
    const plan = await prisma.studyPlan.findUnique({
      where: { workspaceId_setId_userId: { workspaceId: this.workspaceId, setId, userId: this.userId } },
    });
    if (!plan) {
      await prisma.studyPlan.create({ data: { workspaceId: this.workspaceId, setId, userId: this.userId, streakDays: 1 } });
      return;
    }
    const last = new Date(plan.lastActiveAt);
    const now = new Date();
    const sameDay = last.toDateString() === now.toDateString();
    const yesterday = new Date(now.getTime() - 86_400_000).toDateString() === last.toDateString();
    await prisma.studyPlan.update({
      where: { id: plan.id },
      data: { lastActiveAt: now, streakDays: sameDay ? plan.streakDays : yesterday ? plan.streakDays + 1 : 1 },
    });
  }

  async listAnnotations(setId: string) {
    return prisma.learningAnnotation.findMany({
      where: { workspaceId: this.workspaceId, setId },
      orderBy: { createdAt: "desc" }, take: 100,
    });
  }

  async addAnnotation(setId: string | null, itemId: string | null, quote: string, comment: string) {
    return prisma.learningAnnotation.create({
      data: {
        workspaceId: this.workspaceId, setId: setId || null, itemId: itemId || null,
        userId: this.userId, quote: quote.slice(0, 2000), comment: comment.slice(0, 5000),
      },
    });
  }

  async resolveAnnotation(id: string, resolved: boolean) {
    await prisma.learningAnnotation.updateMany({ where: { id, workspaceId: this.workspaceId }, data: { resolved } });
  }
}
