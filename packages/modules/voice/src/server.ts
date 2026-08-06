import { z } from "zod";
import { prisma, type CallLog } from "@n0va/db";

export const callLogSchema = z.object({
  direction: z.enum(["IN", "OUT"]),
  number: z.string().trim().min(3).max(40),
  contactName: z.string().max(120).default(""),
  durationSec: z.number().int().min(0).max(86400).default(0),
  status: z.string().max(30).default("completed"),
});

export type CallLogRow = CallLog;

export class VoiceService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: string,
  ) {}

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

  /** Cross-module contact picker */
  async contacts(): Promise<Array<{ id: string; firstName: string; lastName: string | null; phone: string | null }>> {
    return prisma.contact.findMany({
      where: { workspaceId: this.workspaceId, phone: { not: null } },
      select: { id: true, firstName: true, lastName: true, phone: true },
      take: 50,
    });
  }
}
