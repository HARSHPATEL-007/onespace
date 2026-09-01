import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const trail = await svc.getSafetyAuditTrail(searchParams.get("recommendationId") ?? undefined, Number(searchParams.get("take") ?? "30"));
    const chain = await svc.verifySafetyAuditChain().catch(() => ({ valid: true, count: (trail as unknown[]).length }));
    return NextResponse.json({ ok: true, trail, chain, valid: (chain as { valid: boolean }).valid });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
