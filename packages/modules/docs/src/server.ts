import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "docs";

export const docMetaSchema = z.object({
  title: z.string().max(300),
});

export const commentSchema = z.object({
  text: z.string().min(1).max(4000),
});

export class DocsService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for docs`);
    }
  }

  async list() {
    await this.assert("READ");
    return prisma.doc.findMany({
      where: { workspaceId: this.workspaceId },
      include: { _count: { select: { comments: true } } },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    });
  }

  async get(id: string) {
    await this.assert("READ");
    return this.owned(id);
  }

  async create() {
    await this.assert("CREATE");
    const doc = await prisma.doc.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        title: "Untitled document",
      },
    });
    await this.audit("doc.created", doc.id);
    return doc;
  }

  async updateTitle(id: string, title: string) {
    await this.assert("UPDATE");
    await this.owned(id);
    await prisma.doc.update({ where: { id }, data: { title } });
  }

  async saveContent(id: string, content: string) {
    await this.assert("UPDATE");
    await this.owned(id);
    const [doc] = await prisma.$transaction([
      prisma.doc.update({ where: { id }, data: { content, version: { increment: 1 } } }),
      prisma.docRevision.create({
        data: {
          docId: id,
          workspaceId: this.workspaceId,
          content,
          createdById: this.userId,
        },
      }),
    ]);
    return doc;
  }

  async togglePin(id: string) {
    await this.assert("UPDATE");
    const doc = await this.owned(id);
    await prisma.doc.update({ where: { id }, data: { pinned: !doc.pinned } });
  }

  async remove(id: string) {
    await this.assert("DELETE");
    await this.owned(id);
    await prisma.doc.delete({ where: { id } });
    await this.audit("doc.deleted", id);
  }

  async revisions(id: string) {
    await this.assert("READ");
    await this.owned(id);
    return prisma.docRevision.findMany({
      where: { docId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async revisionsWithAuthors(id: string) {
    await this.assert("READ");
    await this.owned(id);
    const revisions = await prisma.docRevision.findMany({
      where: { docId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const userIds = Array.from(
      new Set(revisions.map((r) => r.createdById).filter((v): v is string => Boolean(v))),
    );
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return revisions.map((r) => {
      const author = r.createdById ? byId.get(r.createdById) : undefined;
      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        authorName: author ? author.name ?? author.email : "Unknown",
        content: r.content,
        preview: contentPreview(r.content),
      };
    });
  }

  async revisionContent(id: string, revisionId: string) {
    await this.owned(id);
    const revision = await prisma.docRevision.findFirst({
      where: { id: revisionId, docId: id },
    });
    if (!revision) throw new Error("Revision not found");
    return revision;
  }

  async comments(id: string) {
    await this.assert("READ");
    await this.owned(id);
    return prisma.docComment.findMany({
      where: { docId: id },
      orderBy: { createdAt: "asc" },
    });
  }

  async addComment(id: string, text: string, authorName: string) {
    await this.assert("UPDATE");
    await this.owned(id);
    const comment = await prisma.docComment.create({
      data: {
        docId: id,
        workspaceId: this.workspaceId,
        createdById: this.userId,
        authorName,
        text,
      },
    });
    await this.audit("doc.comment.added", id);
    return comment;
  }

  private async owned(id: string) {
    const doc = await prisma.doc.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!doc) throw new Error("Document not found in this workspace");
    return doc;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Doc",
      targetId,
    });
  }
}

type TipNode = { text?: string; content?: TipNode[] };

function contentPreview(content: string) {
  try {
    const json = JSON.parse(content) as { content?: TipNode[] };
    const parts: string[] = [];
    const walk = (nodes?: TipNode[]) => {
      if (!nodes) return;
      for (const node of nodes) {
        if (typeof node.text === "string" && node.text.trim()) parts.push(node.text);
        walk(node.content);
      }
    };
    walk(json.content);
    return parts.join(" ").slice(0, 160);
  } catch {
    return "";
  }
}