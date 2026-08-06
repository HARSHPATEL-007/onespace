import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "keep";

export const NOTE_COLORS = [
  "default",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
  "gray",
] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const noteInputSchema = z.object({
  title: z.string().max(300).default(""),
  body: z.string().max(20000).default(""),
  color: z.enum(NOTE_COLORS).default("default"),
  pinned: z.boolean().default(false),
  labels: z.array(z.string().max(40)).max(12).default([]),
});

export type NoteInput = z.infer<typeof noteInputSchema>;

export class KeepService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for keep`);
    }
  }

  async list(showArchived = false) {
    await this.assert("READ");
    return prisma.note.findMany({
      where: { workspaceId: this.workspaceId, archived: showArchived },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    });
  }

  async get(id: string) {
    await this.assert("READ");
    return this.owned(id);
  }

  async create(input: NoteInput) {
    await this.assert("CREATE");
    const note = await prisma.note.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        title: input.title,
        body: input.body,
        color: input.color,
        pinned: input.pinned,
        labels: input.labels,
      },
    });
    await this.audit("note.created", note.id);
    return note;
  }

  async update(id: string, input: Partial<NoteInput>) {
    await this.assert("UPDATE");
    await this.owned(id);
    const note = await prisma.note.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
        ...(input.labels !== undefined ? { labels: input.labels } : {}),
      },
    });
    await this.audit("note.updated", id);
    return note;
  }

  async togglePin(id: string) {
    const note = await this.owned(id);
    return this.update(id, { pinned: !note.pinned });
  }

  async archive(id: string, archived = true) {
    await this.assert("UPDATE");
    await this.owned(id);
    await prisma.note.update({ where: { id }, data: { archived } });
    await this.audit(archived ? "note.archived" : "note.unarchived", id);
  }

  async remove(id: string) {
    await this.assert("DELETE");
    await this.owned(id);
    await prisma.note.delete({ where: { id } });
    await this.audit("note.deleted", id);
  }

  private async owned(id: string) {
    const note = await prisma.note.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!note) throw new Error("Note not found in this workspace");
    return note;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Note",
      targetId,
    });
  }
}