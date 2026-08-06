import { CalendarService } from "@n0va/modules-calendar/server";
import { CalendarApp } from "@n0va/modules-calendar/components";
import { requireWorkspace } from "@/lib/context";
import { createEventAction, deleteEventAction, updateEventAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const ctx = await requireWorkspace();
  const svc = new CalendarService(ctx.workspace.id, ctx.user.id, ctx.memberRole);

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 60);

  const events = await svc.listInRange(start, end);

  return (
    <CalendarApp
      events={events}
      actions={{ create: createEventAction, update: updateEventAction, remove: deleteEventAction }}
    />
  );
}