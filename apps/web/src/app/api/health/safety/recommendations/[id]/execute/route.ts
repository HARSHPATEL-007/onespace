import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const actionKind = (body.actionKind as string | undefined) ?? "EXECUTE";
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const guard = await svc.executionGuard(id, actionKind);
    if (!guard.allowed) return NextResponse.json({ ok: false, guard }, { status: 403 });
    // Transition to EXECUTING then COMPLETED if guard passes (mock execution)
    try { await svc.transitionSafetyRecommendation(id, "EXECUTING", `execute_${actionKind.toLowerCase()}`); } catch {}
    return NextResponse.json({ ok: true, guard, note: "Execution guard passed — action may proceed under audit. Cross-module tasks/mail/tasks require separate guarded execution." });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
