import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "videos";

export const videoSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(3000).default(""),
  url: z.string().url(),
  provider: z.enum(["youtube", "vimeo", "other"]).default("other"),
});

export function embedFor(url: string, provider: string): string | null {
  if (provider === "youtube") {
    const id = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/.exec(url)?.[1];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (provider === "vimeo") {
    const id = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}

export class VideosService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for videos`);
    }
  }

  async list() {
    await this.assert("READ");
    return prisma.video.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { uploadedAt: "desc" },
    });
  }

  async get(id: string) {
    await this.assert("READ");
    const video = await prisma.video.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!video) throw new Error("Video not found in this workspace");
    return video;
  }

  async create(input: z.infer<typeof videoSchema>) {
    await this.assert("CREATE");
    const video = await prisma.video.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, ...input },
    });
    await this.audit("video.added", video.id);
    return video;
  }

  async update(id: string, input: Partial<z.infer<typeof videoSchema>>) {
    await this.assert("UPDATE");
    await this.owned(id);
    return prisma.video.update({ where: { id }, data: input });
  }

  async remove(id: string) {
    await this.assert("DELETE");
    await this.owned(id);
    await prisma.video.delete({ where: { id } });
    await this.audit("video.deleted", id);
  }

  private async owned(id: string) {
    const video = await prisma.video.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!video) throw new Error("Video not found in this workspace");
    return video;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Video",
      targetId,
    });
  }
}
