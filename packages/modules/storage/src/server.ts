import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "cloud-storage";

export const STORAGE_ROOT =
  process.env.N0VA_STORAGE_ROOT ?? path.join(process.cwd(), ".data", "storage");

export function storageDirFor(workspaceId: string) {
  const dir = path.join(STORAGE_ROOT, workspaceId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export class StorageService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for cloud-storage`);
    }
  }

  async list(parentId: string | null) {
    await this.assert("READ");
    return prisma.storageItem.findMany({
      where: {
        workspaceId: this.workspaceId,
        parentId: parentId ?? null,
        trashedAt: null,
      },
      orderBy: [{ isFolder: "desc" }, { name: "asc" }],
    });
  }

  async breadcrumbs(parentId: string | null) {
    await this.assert("READ");
    const crumbs: Array<{ id: string; name: string }> = [];
    let current = parentId ? await this.owned(parentId) : null;
    while (current) {
      crumbs.unshift({ id: current.id, name: current.name });
      current = current.parentId ? await this.owned(current.parentId) : null;
    }
    return crumbs;
  }

  async createFolder(name: string, parentId: string | null) {
    await this.assert("CREATE");
    const item = await prisma.storageItem.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name,
        isFolder: true,
        parentId: parentId ?? null,
      },
    });
    await this.audit("storage.folder.created", item.id);
    return item;
  }

  async recordUpload(input: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
    checksum: string;
    parentId: string | null;
  }) {
    await this.assert("CREATE");
    const item = await prisma.storageItem.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name: input.name,
        isFolder: false,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
        checksum: input.checksum,
        parentId: input.parentId ?? null,
      },
    });
    await prisma.storageFileVersion.create({
      data: {
        itemId: item.id,
        workspaceId: this.workspaceId,
        sizeBytes: input.sizeBytes,
        storageKey: input.storageKey,
      },
    });
    await this.audit("storage.file.uploaded", item.id, { sizeBytes: input.sizeBytes });
    return item;
  }

  async rename(id: string, name: string) {
    await this.assert("UPDATE");
    await this.owned(id);
    const item = await prisma.storageItem.update({ where: { id }, data: { name } });
    await this.audit("storage.item.renamed", id, { name });
    return item;
  }

  async move(id: string, parentId: string | null) {
    await this.assert("UPDATE");
    await this.owned(id);
    if (parentId) await this.owned(parentId);
    const item = await prisma.storageItem.update({
      where: { id },
      data: { parentId: parentId ?? null },
    });
    await this.audit("storage.item.moved", id, { parentId });
    return item;
  }

  async trash(id: string) {
    await this.assert("DELETE");
    await this.owned(id);
    const item = await prisma.storageItem.update({
      where: { id },
      data: { trashedAt: new Date() },
    });
    await this.audit("storage.item.trashed", id);
    return item;
  }

  async restore(id: string) {
    await this.assert("UPDATE");
    await this.owned(id);
    const item = await prisma.storageItem.update({
      where: { id },
      data: { trashedAt: null },
    });
    await this.audit("storage.item.restored", id);
    return item;
  }

  async listTrash() {
    await this.assert("READ");
    return prisma.storageItem.findMany({
      where: { workspaceId: this.workspaceId, trashedAt: { not: null } },
      orderBy: { trashedAt: "desc" },
      take: 200,
    });
  }

  async purge(id: string) {
    await this.assert("DELETE");
    const item = await this.owned(id);
    if (item.storageKey) {
      const disk = path.join(storageDirFor(this.workspaceId), item.storageKey);
      try {
        fs.rmSync(disk, { force: true });
      } catch {
        // best-effort cleanup
      }
    }
    await prisma.storageItem.delete({ where: { id } });
    await this.audit("storage.item.purged", id);
  }

  async getForDownload(id: string) {
    await this.assert("READ");
    return this.owned(id);
  }

  async versions(itemId: string) {
    await this.assert("READ");
    await this.owned(itemId);
    return prisma.storageFileVersion.findMany({
      where: { itemId },
      orderBy: { createdAt: "desc" },
    });
  }

  private async owned(id: string) {
    const item = await prisma.storageItem.findFirst({
      where: { id, workspaceId: this.workspaceId },
    });
    if (!item) throw new Error("Storage item not found in this workspace");
    return item;
  }

  private audit(action: string, targetId: string, metadata?: Record<string, unknown>) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "StorageItem",
      targetId,
      metadata,
    });
  }
}

export function checksumOf(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}