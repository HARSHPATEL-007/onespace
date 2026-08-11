import { z } from "zod";
import { prisma } from "@n0va/db";

const MODULE = "files";

export const fileSchema = z.object({
  filename: z.string().max(255);
  mimeType: z.string().max(120);
  sizeBytes: z.number().max(10_000_000_000);
  module: z.string().max(80);
  targetId: z.string().optional();
  uploadedById: z.string();
  storageKey: z.string().max(500);
  metadata: z.record(z.unknown()).optional();
});

export interface FileRecord {
  id: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  module: string;
  targetId: string | null;
  uploadedById: string;
  storageKey: string;
  metadata: unknown;
  createdAt: Date;
}

export class FilesService {
  constructor(private readonly workspaceId: string) {}

  async record(input: z.infer<typeof fileSchema>) {
    return prisma.attachment.create({
      data: {
        workspaceId: this.workspaceId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        module: input.module,
        targetId: input.targetId,
        uploadedById: input.uploadedById,
        storageKey: input.storageKey,
        metadata: input.metadata as never,
      },
    });
  }

  async list(module?: string, targetId?: string) {
    return prisma.attachment.findMany({
      where: {
        workspaceId: this.workspaceId,
        ...(module ? { module } : {}),
        ...(targetId ? { targetId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(id: string) {
    return prisma.attachment.findFirst({
      where: { id, workspaceId: this.workspaceId },
    });
  }

  async remove(id: string) {
    return prisma.attachment.deleteMany({
      where: { id, workspaceId: this.workspaceId },
    });
  }

  async totalUsage() {
    const result = await prisma.attachment.aggregate({
      where: { workspaceId: this.workspaceId },
      _sum: { sizeBytes: true },
    });
    return result._sum.sizeBytes ?? 0;
  }

  generateStorageKey(filename: string): string {
    const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    return `workspaces/${this.workspaceId}/${timestamp}-${random}${ext}`;
  }
}

export { MODULE };
