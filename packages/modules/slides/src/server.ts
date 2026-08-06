import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "slides";

export const presentationSchema = z.object({ title: z.string().min(1).max(200) });

export type Block =
  | { type: "title"; content: string }
  | { type: "subtitle"; content: string }
  | { type: "text"; content: string }
  | { type: "bullets"; content: string }
  | { type: "quote"; content: string };

export const blocksSchema = z.array(
  z.object({
    type: z.enum(["title", "subtitle", "text", "bullets", "quote"]),
    content: z.string().max(5000),
  }),
);

export function defaultBlocks(): Block[] {
  return [
    { type: "title", content: "Your title here" },
    { type: "subtitle", content: "A subtitle for your story" },
  ];
}

export class SlidesService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for slides`);
    }
  }

  async list() {
    await this.assert("READ");
    return prisma.presentation.findMany({
      where: { workspaceId: this.workspaceId },
      include: { _count: { select: { slides: true } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async get(id: string) {
    await this.assert("READ");
    const pres = await prisma.presentation.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: { slides: { orderBy: { sortOrder: "asc" } } },
    });
    if (!pres) throw new Error("Presentation not found in this workspace");
    return pres;
  }

  async create(title: string) {
    await this.assert("CREATE");
    const pres = await prisma.presentation.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        title,
        slides: {
          create: [{ workspaceId: this.workspaceId, sortOrder: 0, blocks: defaultBlocks() }],
        },
      },
    });
    await this.audit("presentation.created", pres.id);
    return pres;
  }

  async rename(id: string, title: string) {
    await this.assert("UPDATE");
    await this.owned(id);
    return prisma.presentation.update({ where: { id }, data: { title } });
  }

  async setTheme(id: string, theme: string) {
    await this.assert("UPDATE");
    await this.owned(id);
    return prisma.presentation.update({ where: { id }, data: { theme } });
  }

  async remove(id: string) {
    await this.assert("DELETE");
    await this.owned(id);
    await prisma.presentation.delete({ where: { id } });
    await this.audit("presentation.deleted", id);
  }

  async addSlide(presentationId: string) {
    await this.assert("UPDATE");
    const pres = await this.owned(presentationId);
    const count = await prisma.slide.count({ where: { presentationId } });
    return prisma.slide.create({
      data: {
        presentationId,
        workspaceId: this.workspaceId,
        sortOrder: count,
        blocks: [{ type: "title", content: "New slide" }],
      },
    });
  }

  async saveBlocks(slideId: string, blocks: Block[]) {
    await this.assert("UPDATE");
    const slide = await prisma.slide.findFirst({ where: { id: slideId, workspaceId: this.workspaceId } });
    if (!slide) throw new Error("Slide not found in this workspace");
    await prisma.slide.update({ where: { id: slideId }, data: { blocks, updatedAt: new Date() } });
    await prisma.presentation.update({ where: { id: slide.presentationId }, data: { updatedAt: new Date() } });
    return slide;
  }

  async removeSlide(slideId: string) {
    await this.assert("DELETE");
    const slide = await prisma.slide.findFirst({ where: { id: slideId, workspaceId: this.workspaceId } });
    if (!slide) throw new Error("Slide not found in this workspace");
    const count = await prisma.slide.count({ where: { presentationId: slide.presentationId } });
    if (count <= 1) throw new Error("Cannot delete the last slide");
    await prisma.slide.delete({ where: { id: slideId } });
    return slide;
  }

  async moveSlide(slideId: string, direction: "up" | "down") {
    await this.assert("UPDATE");
    const slide = await prisma.slide.findFirst({ where: { id: slideId, workspaceId: this.workspaceId } });
    if (!slide) throw new Error("Slide not found in this workspace");
    const neighbour = await prisma.slide.findFirst({
      where: {
        presentationId: slide.presentationId,
        sortOrder: direction === "up" ? { lt: slide.sortOrder } : { gt: slide.sortOrder },
      },
      orderBy: { sortOrder: direction === "up" ? "desc" : "asc" },
    });
    if (!neighbour) return;
    await prisma.$transaction([
      prisma.slide.update({ where: { id: slideId }, data: { sortOrder: neighbour.sortOrder } }),
      prisma.slide.update({ where: { id: neighbour.id }, data: { sortOrder: slide.sortOrder } }),
    ]);
  }

  private async owned(id: string) {
    const pres = await prisma.presentation.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!pres) throw new Error("Presentation not found in this workspace");
    return pres;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Presentation",
      targetId,
    });
  }
}
