import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const url = new URL(req.url);
    const rows = await svc.txnListEvents(
      url.searchParams.get("aggregateType") ?? undefined,
      url.searchParams.get("aggregateId") ?? undefined,
      url.searchParams.get("sagaId") ?? undefined,
      url.searchParams.get("eventType") ?? undefined,
    );
    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
