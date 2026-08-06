import { z } from "zod";
import { prisma, logAudit, type LegalDocument } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "legal";

export const legalDocSchema = z.object({
  title: z.string().trim().min(1).max(160),
  kind: z.enum(["CONTRACT", "POLICY", "COMPLIANCE", "OTHER"]).default("CONTRACT"),
  content: z.string().max(20_000).default(""),
});

export class LegalService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for legal`);
    }
  }

  async list(): Promise<LegalDocument[]> {
    await this.assert("READ");
    return prisma.legalDocument.findMany({ where: { workspaceId: this.workspaceId }, orderBy: { updatedAt: "desc" } });
  }

  async create(input: z.infer<typeof legalDocSchema>): Promise<void> {
    await this.assert("CREATE");
    await prisma.legalDocument.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, title: input.title, kind: input.kind, content: input.content },
    });
    await this.audit("legal.created", input.title);
  }

  async advanceStatus(id: string): Promise<void> {
    await this.assert("UPDATE");
    const doc = await prisma.legalDocument.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!doc) throw new Error("Document not found");
    const next: Record<string, string> = { DRAFT: "IN_REVIEW", IN_REVIEW: "APPROVED", APPROVED: "ACTIVE", ACTIVE: "ACTIVE" };
    await prisma.legalDocument.update({ where: { id }, data: { status: next[doc.status] as never } });
    await this.audit("legal.status_changed", doc.title);
  }

  async remove(id: string): Promise<void> {
    await this.assert("DELETE");
    await prisma.legalDocument.delete({ where: { id } });
    await this.audit("legal.deleted", id);
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "LegalDocument",
      targetId,
    });
  }
}
