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
    const aggregateType = url.searchParams.get("aggregateType");
    const aggregateId = url.searchParams.get("aggregateId");
    if (!aggregateType || !aggregateId) return NextResponse.json({ error: "aggregateType and aggregateId required" }, { status: 400 });
    const view = await svc.txnPatientStatus(aggregateType, aggregateId);
    return NextResponse.json({ ok: true, ...view });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
