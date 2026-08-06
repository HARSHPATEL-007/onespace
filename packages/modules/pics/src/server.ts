import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "pics";

export const albumSchema = z.object({ name: z.string().min(1).max(200) });

export function picsDirFor(workspaceId: string): string {
  const dir = path.join(process.cwd(), "data", "pics", workspaceId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function imageDimensions(buffer: Buffer): { width?: number; height?: number } {
  try {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      // PNG: IHDR at offset 16
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      // JPEG: scan markers
      let off = 2;
      while (off < buffer.length - 9) {
        if (buffer[off] !== 0xff) { off++; continue; }
        const marker = buffer[off + 1]!;
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buffer.readUInt16BE(off + 5), width: buffer.readUInt16BE(off + 7) };
        }
        off += 2 + buffer.readUInt16BE(off + 2);
      }
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return { width: buffer.readUInt16LE(26), height: buffer.readUInt16LE(28) };
    }
  } catch {
    // fall through
  }
  return {};
}

export class PicsService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for pics`);
    }
  }

  async albums() {
    await this.assert("READ");
    return prisma.album.findMany({
      where: { workspaceId: this.workspaceId },
      include: { _count: { select: { photos: true } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async photos(albumId?: string | null) {
    await this.assert("READ");
    return prisma.photo.findMany({
      where: { workspaceId: this.workspaceId, ...(albumId ? { albumId } : {}) },
      orderBy: { uploadedAt: "desc" },
    });
  }

  async createAlbum(name: string) {
    await this.assert("CREATE");
    const album = await prisma.album.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, name },
    });
    await this.audit("album.created", album.id);
    return album;
  }

  async renameAlbum(id: string, name: string) {
    await this.assert("UPDATE");
    await this.ownedAlbum(id);
    return prisma.album.update({ where: { id }, data: { name } });
  }

  async removeAlbum(id: string) {
    await this.assert("DELETE");
    await this.ownedAlbum(id);
    await prisma.album.delete({ where: { id } });
    await this.audit("album.deleted", id);
  }

  async recordUpload(input: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    albumId?: string | null;
    width?: number | null;
    height?: number | null;
  }) {
    await this.assert("CREATE");
    const photo = await prisma.photo.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        albumId: input.albumId ?? null,
        filename: input.name,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
        width: input.width ?? null,
        height: input.height ?? null,
      },
    });
    if (input.albumId) {
      await prisma.album.update({ where: { id: input.albumId }, data: { updatedAt: new Date() } });
    }
    await this.audit("photo.uploaded", photo.id);
    return photo;
  }

  async removePhoto(id: string) {
    await this.assert("DELETE");
    const photo = await prisma.photo.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!photo) throw new Error("Photo not found in this workspace");
    await prisma.photo.delete({ where: { id } });
    const file = path.join(picsDirFor(this.workspaceId), photo.storageKey);
    fs.rmSync(file, { force: true });
    await this.audit("photo.deleted", id);
  }

  async movePhoto(id: string, albumId: string | null) {
    await this.assert("UPDATE");
    const photo = await prisma.photo.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!photo) throw new Error("Photo not found in this workspace");
    if (albumId) await this.ownedAlbum(albumId);
    return prisma.photo.update({ where: { id }, data: { albumId } });
  }

  private async ownedAlbum(id: string) {
    const album = await prisma.album.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!album) throw new Error("Album not found in this workspace");
    return album;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Photo",
      targetId,
    });
  }
}
