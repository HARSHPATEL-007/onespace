import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";
import { VoiceNotesService } from "@n0va/modules-voice/server";
import { TasksService } from "@n0va/modules-tasks/server";
import { CalendarService } from "@n0va/modules-calendar/server";
import { prisma } from "@n0va/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { action?: "confirm" | "reject"; kind?: string; dueAt?: string | null; startAt?: string | null; endAt?: string | null; ownerId?: string | null; title?: string; sourceText?: string; priority?: string; force?: boolean };
  const svc = new VoiceNotesService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
  try {
    let target: { type: "task" | "calendar_event"; id: string } | undefined;
    if (body.action === "confirm") {
      if (body.kind === "EVENT") {
        const cal = new CalendarService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
        const startAt = body.startAt ?? new Date().toISOString();
        const endAt = body.endAt ?? new Date(new Date(startAt).getTime() + 60 * 60_000).toISOString();
        if (!body.force) {
          const conflicts = await cal.listInRange(new Date(startAt), new Date(endAt));
          if (conflicts.length > 0) {
            return NextResponse.json(
              { ok: false, conflicts: conflicts.map((c) => ({ id: c.id, title: c.title, startAt: c.startAt, endAt: c.endAt })) },
              { status: 409 },
            );
          }
        }
        const event = await cal.create({
          title: body.title ?? "Voice note event",
          description: body.sourceText ?? null,
          startAt,
          endAt,
          allDay: false,
          recurrence: "NONE",
          repeatUntil: null,
          attendees: [],
        });
        target = { type: "calendar_event", id: event.id };
      } else {
        const tasks = new TasksService(ctx.workspace.id, ctx.user.id, ctx.memberRole);
        let list = await prisma.taskList.findFirst({ where: { workspaceId: ctx.workspace.id, name: "Voice Inbox" } });
        if (!list) list = await tasks.createList({ name: "Voice Inbox", color: "violet" });
        const task = await tasks.createTask(list.id, {
          title: body.title ?? "Voice item",
          notes: body.sourceText ?? null,
          dueDate: body.dueAt ?? null,
          priority: body.priority === "HIGH" ? "HIGH" : body.priority === "LOW" ? "LOW" : "MEDIUM",
          assigneeId: body.ownerId ?? null,
        });
        target = { type: "task", id: task.id };
      }
    }
    const result = await svc.confirmExtraction(id, body.action === "reject" ? "reject" : "confirm", target);
    return NextResponse.json({ ok: true, ...result, target });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
