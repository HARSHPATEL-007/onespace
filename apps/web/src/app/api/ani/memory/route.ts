import { actionContext } from "@/lib/action-context";
import { AniService } from "@n0va/modules-ani/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { workspaceId, userId, role } = await actionContext();

  let body: { action?: string; type?: string; content?: string; importance?: number; tags?: string[]; feature?: string; timeSavedMs?: number; satisfaction?: number; meetingId?: string; title?: string; participants?: string[]; decisions?: number; actions?: number; engagement?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const svc = new AniService(workspaceId, userId, role);

  switch (body.action) {
    case "save_memory": {
      if (!body.type || !body.content) return Response.json({ error: "Missing type or content" }, { status: 400 });
      const id = await svc.persistMemoryMark(body.type, body.content, body.importance ?? 0.5, body.tags ?? []);
      return Response.json({ id });
    }
    case "get_memories": {
      const marks = await svc.getMemoryMarks(body.type, 20);
      return Response.json({ marks });
    }
    case "record_outcome": {
      if (!body.feature) return Response.json({ error: "Missing feature" }, { status: 400 });
      await svc.recordOutcome(body.feature, body.action ?? "use", body.timeSavedMs ?? 0, body.satisfaction ?? 0.5);
      return Response.json({ ok: true });
    }
    case "get_outcomes": {
      const outcomes = await svc.getOutcomes(50);
      return Response.json({ outcomes });
    }
    case "save_meeting": {
      if (!body.meetingId) return Response.json({ error: "Missing meetingId" }, { status: 400 });
      await svc.saveMeetingSession(body.meetingId, body.title ?? "Meeting", body.participants ?? [], body.decisions ?? 0, body.actions ?? 0, body.engagement ?? 0.5);
      return Response.json({ ok: true });
    }
    case "get_meetings": {
      const meetings = await svc.getMeetingSessions(10);
      return Response.json({ meetings });
    }
    default:
      return Response.json({ error: "Unknown action" }, { status: 400 });
  }
}
