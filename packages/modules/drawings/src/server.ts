import { z } from "zod";
import { prisma, logAudit, type Prisma } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "drawings";

export const drawingSchema = z.object({ name: z.string().min(1).max(200) });

export interface Shape {
  id: string;
  type: "rect" | "ellipse" | "line" | "text";
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text?: string;
}

export const shapeSchema: z.ZodType<Shape> = z.object({
  id: z.string(),
  type: z.enum(["rect", "ellipse", "line", "text"]),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  color: z.string(),
  text: z.string().optional(),
});

export const canvasSchema = z.array(shapeSchema);

export class DrawingsService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for drawings`);
    }
  }

  async list() {
    await this.assert("READ");
    return prisma.drawing.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { updatedAt: "desc" },
    });
  }

  async get(id: string) {
    await this.assert("READ");
    const drawing = await prisma.drawing.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!drawing) throw new Error("Drawing not found in this workspace");
    return drawing;
  }

  async create(name: string) {
    await this.assert("CREATE");
    const drawing = await prisma.drawing.create({
      data: { workspaceId: this.workspaceId, createdById: this.userId, name, canvas: [] },
    });
    await this.audit("drawing.created", drawing.id);
    return drawing;
  }

  async rename(id: string, name: string) {
    await this.assert("UPDATE");
    await this.owned(id);
    return prisma.drawing.update({ where: { id }, data: { name } });
  }

  async remove(id: string) {
    await this.assert("DELETE");
    await this.owned(id);
    await prisma.drawing.delete({ where: { id } });
    await this.audit("drawing.deleted", id);
  }

  async saveCanvas(id: string, canvas: Shape[]) {
    await this.assert("UPDATE");
    await this.owned(id);
    return prisma.drawing.update({ where: { id }, data: { canvas: canvas as unknown as Prisma.InputJsonValue, updatedAt: new Date() } });
  }

  private async owned(id: string) {
    const drawing = await prisma.drawing.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!drawing) throw new Error("Drawing not found in this workspace");
    return drawing;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Drawing",
      targetId,
    });
  }
}
