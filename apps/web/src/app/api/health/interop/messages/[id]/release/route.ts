import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const open = (await svc.interopListQuarantine("OPEN")) as Array<{ id: string; messageId: string }>;
    const match = open.find((q) => q.messageId === id);
    if (!match) return NextResponse.json({ error: "No open quarantine for this message" }, { status: 404 });
    const row = await svc.interopResolveQuarantine(match.id, { decision: "RELEASED", note: body.note ?? "released by authorized reviewer" });
    return NextResponse.json({ ok: true, row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
