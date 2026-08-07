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

export const playlistSchema = z.object({
  name: z.string().min(1).max(100),
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

  async playlists() {
    await this.assert("READ");
    return prisma.videoPlaylist.findMany({
      where: { workspaceId: this.workspaceId },
      include: { _count: { select: { videos: true } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async createPlaylist(name: string) {
    await this.assert("CREATE");
    const playlist = await prisma.videoPlaylist.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, name },
    });
    await this.audit("playlist.created", playlist.id, "VideoPlaylist");
    return playlist;
  }

  async renamePlaylist(id: string, name: string) {
    await this.assert("UPDATE");
    await this.ownedPlaylist(id);
    const playlist = await prisma.videoPlaylist.update({ where: { id }, data: { name } });
    await this.audit("playlist.renamed", id, "VideoPlaylist");
    return playlist;
  }

  async removePlaylist(id: string) {
    await this.assert("DELETE");
    await this.ownedPlaylist(id);
    await prisma.videoPlaylist.delete({ where: { id } });
    await this.audit("playlist.deleted", id, "VideoPlaylist");
  }

  async setVideoPlaylist(videoId: string, playlistId: string | null) {
    await this.assert("UPDATE");
    await this.owned(videoId);
    if (playlistId) {
      const playlist = await prisma.videoPlaylist.findFirst({
        where: { id: playlistId, workspaceId: this.workspaceId },
      });
      if (!playlist) throw new Error("Playlist not found in this workspace");
    }
    const video = await prisma.video.update({ where: { id: videoId }, data: { playlistId } });
    await this.audit("video.playlist.updated", videoId, "Video", { playlistId });
    return video;
  }

  private async owned(id: string) {
    const video = await prisma.video.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!video) throw new Error("Video not found in this workspace");
    return video;
  }

  private async ownedPlaylist(id: string) {
    const playlist = await prisma.videoPlaylist.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!playlist) throw new Error("Playlist not found in this workspace");
    return playlist;
  }

  private audit(action: string, targetId: string, targetType = "Video", metadata?: Record<string, unknown>) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType,
      targetId,
      metadata,
    });
  }
}
