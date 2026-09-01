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
  try { const rows = await svc.listPostMarket(searchParams.get("modelId") ?? undefined); return NextResponse.json({ ok: true, rows }); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.modelId || !body.periodStart || !body.periodEnd) return NextResponse.json({ error: "modelId, periodStart, periodEnd required" }, { status: 400 });
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try { const report = await svc.createPostMarket({ modelId: body.modelId, modelVersion: body.modelVersion ?? null, periodStart: new Date(body.periodStart), periodEnd: new Date(body.periodEnd), realWorldPerformance: body.realWorldPerformance, complaints: body.complaints, capa: body.capa }); return NextResponse.json({ ok: true, report }); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
