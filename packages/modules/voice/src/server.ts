import { z } from "zod";
import { prisma, logAudit, type CallLog } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "voice";

export const callLogSchema = z.object({
  direction: z.enum(["IN", "OUT"]),
  number: z.string().trim().min(3).max(40),
  contactName: z.string().max(120).default(""),
  durationSec: z.number().int().min(0).max(86400).default(0),
  status: z.string().max(30).default("completed"),
});

export const callNoteSchema = z.object({
  id: z.string().min(1),
  note: z.string().max(2000).default(""),
});

export const callIdSchema = z.string().min(1);

export type CallLogRow = CallLog;

export class VoiceService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for voice`);
    }
  }

  async list(): Promise<CallLogRow[]> {
    return prisma.callLog.findMany({
      where: { workspaceId: this.workspaceId },
      orderBy: { startedAt: "desc" },
      take: 200,
    });
  }

  async log(input: z.infer<typeof callLogSchema>): Promise<void> {
    await prisma.callLog.create({
      data: {
        workspaceId: this.workspaceId,
        direction: input.direction,
        number: input.number,
        contactName: input.contactName,
        durationSec: input.durationSec,
        status: input.status,
      },
    });
  }

  async clear(): Promise<void> {
    await prisma.callLog.deleteMany({ where: { workspaceId: this.workspaceId } });
  }

  async toggleFavorite(id: string): Promise<void> {
    await this.assert("UPDATE");
    const call = await this.owned(id);
    await prisma.callLog.update({ where: { id }, data: { favorite: !call.favorite } });
    await this.audit("call.favorited", id);
  }

  async setNote(id: string, note: string): Promise<void> {
    await this.assert("UPDATE");
    await this.owned(id);
    await prisma.callLog.update({ where: { id }, data: { note } });
    await this.audit("call.noted", id);
  }

  /** Cross-module contact picker */
  async contacts(): Promise<Array<{ id: string; firstName: string; lastName: string | null; phone: string | null }>> {
    return prisma.contact.findMany({
      where: { workspaceId: this.workspaceId, phone: { not: null } },
      select: { id: true, firstName: true, lastName: true, phone: true },
      take: 50,
    });
  }

  private async owned(id: string) {
    const call = await prisma.callLog.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!call) throw new Error("Call log entry not found in this workspace");
    return call;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "Call",
      targetId,
    });
  }
}

export { VoiceNotesService } from "./voiceNotes";
export type { IngestInput, CorrectInput, SearchFilters, VoiceSourceName, VoiceConsentName } from "./voiceNotes";
