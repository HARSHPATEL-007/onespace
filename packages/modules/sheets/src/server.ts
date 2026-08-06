import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "sheets";

export const workbookSchema = z.object({ name: z.string().min(1).max(200) });
export const sheetNameSchema = z.object({ name: z.string().min(1).max(60) });
export const cellSchema = z.object({
  col: z.number().int().min(0).max(511),
  row: z.number().int().min(0).max(1023),
  value: z.string().max(10_000),
});

const DEFAULT_ROWS = 100;
const DEFAULT_COLS = 26;

function emptyRows(cols = DEFAULT_COLS, rows = DEFAULT_ROWS): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

export class SheetsService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for sheets`);
    }
  }

  async list() {
    await this.assert("READ");
    return prisma.sheetWorkbook.findMany({
      where: { workspaceId: this.workspaceId },
      include: { sheets: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  async get(workbookId: string) {
    await this.assert("READ");
    const wb = await prisma.sheetWorkbook.findFirst({
      where: { id: workbookId, workspaceId: this.workspaceId },
      include: { sheets: true },
    });
    if (!wb) throw new Error("Workbook not found in this workspace");
    return wb;
  }

  async create(name: string) {
    await this.assert("CREATE");
    const wb = await prisma.sheetWorkbook.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        name,
        sheets: { create: { workspaceId: this.workspaceId, name: "Sheet 1", rows: emptyRows() } },
      },
    });
    await this.audit("workbook.created", wb.id);
    return wb;
  }

  async rename(workbookId: string, name: string) {
    await this.assert("UPDATE");
    await this.ownedWorkbook(workbookId);
    await prisma.sheetWorkbook.update({ where: { id: workbookId }, data: { name } });
  }

  async remove(workbookId: string) {
    await this.assert("DELETE");
    await this.ownedWorkbook(workbookId);
    await prisma.sheetWorkbook.delete({ where: { id: workbookId } });
    await this.audit("workbook.deleted", workbookId);
  }

  async addSheet(workbookId: string, name: string) {
    await this.assert("UPDATE");
    await this.ownedWorkbook(workbookId);
    return prisma.sheet.create({
      data: { workbookId, workspaceId: this.workspaceId, name, rows: emptyRows() },
    });
  }

  async renameSheet(sheetId: string, name: string) {
    await this.assert("UPDATE");
    await this.ownedSheet(sheetId);
    return prisma.sheet.update({ where: { id: sheetId }, data: { name } });
  }

  async removeSheet(sheetId: string) {
    await this.assert("DELETE");
    const sheet = await this.ownedSheet(sheetId);
    await prisma.sheet.delete({ where: { id: sheetId } });
    return sheet;
  }

  async saveCell(sheetId: string, col: number, row: number, value: string) {
    await this.assert("UPDATE");
    const sheet = await this.ownedSheet(sheetId);
    const rows = (sheet.rows ?? []) as string[][];
    while (rows.length <= row) rows.push(Array.from({ length: DEFAULT_COLS }, () => ""));
    while (rows[row]!.length <= col) rows[row]!.push("");
    rows[row]![col] = value;
    const updated = await prisma.sheet.update({
      where: { id: sheetId },
      data: { rows, updatedAt: new Date() },
    });
    await prisma.sheetWorkbook.update({ where: { id: sheet.workbookId }, data: { updatedAt: new Date() } });
    return updated;
  }

  async workbookUpdated(workbookId: string) {
    await prisma.sheetWorkbook.update({ where: { id: workbookId }, data: { updatedAt: new Date() } });
  }

  private async ownedWorkbook(id: string) {
    const wb = await prisma.sheetWorkbook.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!wb) throw new Error("Workbook not found in this workspace");
    return wb;
  }

  private async ownedSheet(id: string) {
    const sheet = await prisma.sheet.findFirst({
      where: { id, workspaceId: this.workspaceId },
      include: { workbook: { select: { id: true } } },
    });
    if (!sheet) throw new Error("Sheet not found in this workspace");
    return sheet;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "SheetWorkbook",
      targetId,
    });
  }
}