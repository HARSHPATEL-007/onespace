import { auth } from "@n0va/auth";
import { OrchestratorService, runTurnSchema } from "@n0va/modules-booklm/orchestrate";
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
  return new OrchestratorService(c.workspace.id, c.user.id, c.memberRole);
}

/**
 * GET /v1/tutor/agents?view=... — registry | sessions | session&id=... |
 * events&id=... | escalations[&status=...]
 */
export async function GET(req: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const view = url.searchParams.get("view") ?? "registry";
  const id = url.searchParams.get("id") ?? "";
  try {
    const o = svc(c);
    switch (view) {
      case "registry":
        return NextResponse.json({ agents: await o.listAgents() });
      case "session":
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await o.sessionDetail(id));
      case "events":
        if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json({ events: await o.sessionEvents(id) });
      case "escalations":
        return NextResponse.json({ escalations: await o.listEscalations(url.searchParams.get("status") ?? undefined) });
      default:
        return NextResponse.json({ error: "Unknown view" }, { status: 400 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.includes("not found") ? 404 : 500 });
  }
}

/**
 * POST /v1/tutor/agents — start | turn | seed | escalate-resolve.
 * turn: { sessionId?, setId?, conceptId?, message }
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
  const action = String(b.action ?? "turn");
  try {
    const o = svc(c);
    if (action === "seed") {
      return NextResponse.json({ agents: await o.seedRegistry() });
    }
    if (action === "start") {
      const setId = typeof b.setId === "string" ? b.setId : undefined;
      return NextResponse.json(await o.startSession(setId), { status: 201 });
    }
    if (action === "turn") {
      const parsed = runTurnSchema.safeParse(b);
      if (!parsed.success) return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
      return NextResponse.json(await o.runTurn(parsed.data));
    }
    if (action === "escalate-resolve") {
      const { id, resolution, status } = b as { id?: string; resolution?: string; status?: string };
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      await o.resolveEscalation(id, String(resolution ?? ""), status === "DISMISSED" ? "DISMISSED" : "RESOLVED");
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: msg.startsWith("Forbidden") ? 403 : 500 });
  }
}
