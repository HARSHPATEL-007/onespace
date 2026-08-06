import { z } from "zod";
import { prisma, logAudit } from "@n0va/db";
import { can, type Role } from "@n0va/authz";

const MODULE = "calendar";

export const eventInputSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(8000).optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  allDay: z.boolean().default(false),
  attendees: z.array(z.string()).max(200).default([]),
});

export type EventInput = z.infer<typeof eventInputSchema>;

export class CalendarService {
  constructor(
    private readonly workspaceId: string,
    private readonly userId: string,
    private readonly role: Role,
  ) {}

  private async assert(action: "READ" | "CREATE" | "UPDATE" | "DELETE") {
    if (!(await can(this.workspaceId, this.role, MODULE, action))) {
      throw new Error(`Missing ${action} permission for calendar`);
    }
  }

  async listInRange(start: Date, end: Date) {
    await this.assert("READ");
    return prisma.calendarEvent.findMany({
      where: {
        workspaceId: this.workspaceId,
        startAt: { lt: end },
        endAt: { gt: start },
      },
      orderBy: { startAt: "asc" },
    });
  }

  async create(input: EventInput) {
    await this.assert("CREATE");
    const event = await prisma.calendarEvent.create({
      data: {
        workspaceId: this.workspaceId,
        createdById: this.userId,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        allDay: input.allDay,
        attendees: input.attendees,
      },
    });
    await this.audit("event.created", event.id);
    return event;
  }

  async update(id: string, input: Partial<EventInput>) {
    await this.assert("UPDATE");
    await this.owned(id);
    const event = await prisma.calendarEvent.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.location !== undefined ? { location: input.location ?? null } : {}),
        ...(input.startAt !== undefined ? { startAt: new Date(input.startAt) } : {}),
        ...(input.endAt !== undefined ? { endAt: new Date(input.endAt) } : {}),
        ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
        ...(input.attendees !== undefined ? { attendees: input.attendees } : {}),
      },
    });
    await this.audit("event.updated", id);
    return event;
  }

  async remove(id: string) {
    await this.assert("DELETE");
    await this.owned(id);
    await prisma.calendarEvent.delete({ where: { id } });
    await this.audit("event.deleted", id);
  }

  private async owned(id: string) {
    const event = await prisma.calendarEvent.findFirst({ where: { id, workspaceId: this.workspaceId } });
    if (!event) throw new Error("Event not found in this workspace");
    return event;
  }

  private audit(action: string, targetId: string) {
    return logAudit({
      workspaceId: this.workspaceId,
      actorId: this.userId,
      module: MODULE,
      action,
      targetType: "CalendarEvent",
      targetId,
    });
  }
}