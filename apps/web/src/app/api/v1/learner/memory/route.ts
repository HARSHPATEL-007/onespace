import { auth } from "@n0va/auth";
import { MemoryService, memoryRecordSchema, classroomSchema } from "@n0va/modules-booklm/memories";
import { requireWorkspace } from "@/lib/context";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return requireWorkspace().catch(() => null);
}

function svc(c: { workspace: { id: string }; user: { id: string }; memberRole: string }) {
  return new MemoryService(c.workspace.id, c.user.id, c.memberRole);
}

/**
 * GET /v1/learner/memory?view=... — list | classroom | export | contradictions&id=...
 * Filters: scope, courseId, search.
 */
export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "list";
  try {
    const m = svc(c);
    if (view === "list") {
      return NextResponse.json({
        memories: await m.list({
          scope: url.searchParams.get("scope") ?? undefined,
          courseId: url.searchParams.get("courseId") ?? undefined,
          search: url.searchParams.get("search") ?? undefined,
        }),
      });
    }
    if (view === "classroom") {
      const setId = url.searchParams.get("setId") ?? "";
      if (!setId) return NextResponse.json({ error: "setId required" }, { status: 400 });
      return NextResponse.json({
        classroom: await m.listClassroom(setId, url.searchParams.get("section") ?? "default", true),
      });
    }
    if (view === "export") {
      return NextResponse.json(await m.exportAll());
    }
    if (view === "contradictions") {
      const id = url.searchParams.get("id") ?? "";
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      return NextResponse.json({ contradictions: await m.contradictions(id) });
    }
    return NextResponse.json({ error: "Unknown view" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

/**
 * POST /v1/learner/memory — create | propose | confirm | correct | delete |
 * pause | scope | forget | forget-scope | do-not-infer | classroom-propose |
 * classroom-approve | classroom-conflict | scan | retrieve
 */
export async function POST(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const action = String(b.action ?? "create");
  try {
    const m = svc(c);
    switch (action) {
      case "create": {
        const parsed = memoryRecordSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await m.create(parsed.data), { status: 201 });
      }
      case "propose": {
        const { id, scope, expiresInDays, occurrences, distinctContexts } = b as {
          id?: string; scope?: string; expiresInDays?: number; occurrences?: number; distinctContexts?: number;
        };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        const evidence = occurrences != null || distinctContexts != null
          ? { occurrences: Number(occurrences ?? 1), distinctContexts: Number(distinctContexts ?? 1) }
          : undefined;
        return NextResponse.json(await m.propose(id, scope ?? "SESSION", expiresInDays ?? 30, evidence));
      }
      case "confirm": {
        const { id, scope } = b as { id?: string; scope?: string };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await m.confirm(id, scope));
      }
      case "correct": {
        const { id, correction, newValue, reason, scope } = b as Record<string, string>;
        if (!id || !correction) return NextResponse.json({ error: "id + correction required" }, { status: 400 });
        return NextResponse.json(await m.correct(id, correction, newValue ?? "", reason ?? "", scope));
      }
      case "delete": {
        const { id, exportFirst } = b as { id?: string; exportFirst?: boolean };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await m.remove(id, !!exportFirst));
      }
      case "pause": {
        const { id, paused } = b as { id?: string; paused?: boolean };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        await m.setPaused(id, paused ?? true);
        return NextResponse.json({ ok: true });
      }
      case "scope": {
        const { id, scope, confirmed } = b as { id?: string; scope?: string; confirmed?: boolean };
        if (!id || !scope) return NextResponse.json({ error: "id + scope required" }, { status: 400 });
        return NextResponse.json(await m.setScope(id, scope, !!confirmed));
      }
      case "forget": {
        const sessionId = String(b.sessionId ?? "");
        return NextResponse.json(await m.forgetConversation(sessionId));
      }
      case "forget-scope": {
        const { scope, courseId } = b as { scope?: string; courseId?: string };
        if (!["TASK", "SESSION", "COURSE"].includes(scope ?? "")) {
          return NextResponse.json({ error: "scope must be TASK, SESSION, or COURSE" }, { status: 400 });
        }
        return NextResponse.json(await m.forgetScope(scope as "TASK" | "SESSION" | "COURSE", courseId));
      }
      case "classroom-conflict": {
        const { id, externalUsage } = b as { id?: string; externalUsage?: string };
        if (!id || !externalUsage) return NextResponse.json({ error: "id + externalUsage required" }, { status: 400 });
        return NextResponse.json(await m.flagClassroomConflict(id, externalUsage));
      }
      case "do-not-infer": {
        const { key, on } = b as { key?: string; on?: boolean };
        if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
        return NextResponse.json({ doNotInfer: await m.setDoNotInfer(key, on ?? true) });
      }
      case "classroom-propose": {
        const parsed = classroomSchema.safeParse(b);
        if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
        return NextResponse.json(await m.proposeClassroom(parsed.data), { status: 201 });
      }
      case "classroom-approve": {
        const { id, approve } = b as { id?: string; approve?: boolean };
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        await m.approveClassroom(id, approve ?? true);
        return NextResponse.json({ ok: true });
      }
      case "scan": {
        const text = String(b.text ?? "");
        if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
        return NextResponse.json(m.scanDocument(text));
      }
      case "retrieve": {
        const { scopes, limit, courseId, profileId } = b as { scopes?: string[]; limit?: number; courseId?: string; profileId?: string | null };
        return NextResponse.json({
          memories: await m.retrieveForTask({ scopes, limit: limit ?? 20, courseId, profileId }),
        });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status = msg.startsWith("Forbidden") ? 403 : msg.includes("requires") || msg.includes("cannot") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
