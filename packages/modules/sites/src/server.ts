import { z } from "zod";
import { prisma, type Prisma, type SitePage } from "@n0va/db";

export const siteSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  description: z.string().max(500).default(""),
});

export const sitePageSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120),
});

export const pageBlockSchema = z.object({
  id: z.string(),
  type: z.enum(["heading", "text", "quote", "bullets"]),
  content: z.string().default(""),
  bullets: z.array(z.string()).default([]),
});

export type PageBlock = z.infer<typeof pageBlockSchema>;

const EMPTY_BLOCKS: PageBlock[] = [
  { id: "b-heading", type: "heading", content: "Welcome to my site", bullets: [] },
  { id: "b-text", type: "text", content: "Start editing this page — every change saves automatically.", bullets: [] },
];

export type SiteWithPages = {
  id: string;
  name: string;
  description: string;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
  pages: SitePage[];
};

export class SiteService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string,
  ) {}

  async list(): Promise<SiteWithPages[]> {
    return prisma.site.findMany({
      where: { workspaceId: this.workspaceId },
      include: { pages: { orderBy: { sortOrder: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async create(name: string, description: string): Promise<string> {
    const site = await prisma.site.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, name, description },
    });
    await prisma.sitePage.create({
      data: {
        siteId: site.id,
        workspaceId: this.workspaceId,
        title: "Home",
        slug: "home",
        blocks: EMPTY_BLOCKS,
        sortOrder: 0,
      },
    });
    return site.id;
  }

  async get(id: string): Promise<SiteWithPages | null> {
    return prisma.site.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: { pages: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async rename(id: string, name: string, description: string): Promise<void> {
    await prisma.site.update({ where: { id }, data: { name, description } });
  }

  async setPublished(id: string, published: boolean): Promise<void> {
    await prisma.site.update({ where: { id }, data: { published } });
  }

  async remove(id: string): Promise<void> {
    await prisma.site.delete({ where: { id } });
  }

  async addPage(id: string): Promise<void> {
    const count = await prisma.sitePage.count({ where: { siteId: id } });
    const n = count + 1;
    const base = `page-${n}`;
    let slug = base;
    let exists = await prisma.sitePage.findUnique({ where: { siteId_slug: { siteId: id, slug } } });
    while (exists) {
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      exists = await prisma.sitePage.findUnique({ where: { siteId_slug: { siteId: id, slug } } });
    }
    await prisma.sitePage.create({
      data: {
        siteId: id,
        workspaceId: this.workspaceId,
        title: `Page ${n}`,
        slug,
        blocks: EMPTY_BLOCKS,
        sortOrder: count,
      },
    });
  }

  async updatePage(
    siteId: string,
    pageId: string,
    input: { title?: string; blocks?: unknown },
  ): Promise<void> {
    const page = await prisma.sitePage.findFirst({
      where: { id: pageId, siteId, workspaceId: this.workspaceId },
    });
    if (!page) throw new Error("Page not found");
    await prisma.sitePage.update({
      where: { id: pageId },
      data: {
        title: input.title ?? page.title,
        blocks: (input.blocks ?? page.blocks) as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  }

  async removePage(siteId: string, pageId: string): Promise<void> {
    const remaining = await prisma.sitePage.count({ where: { siteId } });
    if (remaining <= 1) throw new Error("A site needs at least one page");
    await prisma.sitePage.delete({
      where: { id: pageId, siteId, workspaceId: this.workspaceId },
    });
  }

  async movePage(siteId: string, pageId: string, dir: "up" | "down"): Promise<void> {
    const pages = await prisma.sitePage.findMany({ where: { siteId }, orderBy: { sortOrder: "asc" } });
    const i = pages.findIndex((p) => p.id === pageId);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= pages.length) return;
    const a = pages[i]!;
    const b = pages[j]!;
    await prisma.$transaction([
      prisma.sitePage.update({ where: { id: pageId }, data: { sortOrder: b.sortOrder } }),
      prisma.sitePage.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } }),
    ]);
  }
}
