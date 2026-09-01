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
    // List via prisma directly — inference trust
    const { prisma } = await import("@n0va/db");
    const rows = await (prisma as never as { healthInferenceTrust:{findMany:(a:unknown)=>Promise<unknown[]>}}).healthInferenceTrust.findMany({ where:{ workspaceId: ctx.workspaceId, ...(searchParams.get("patientId")? { patientId: searchParams.get("patientId") }: {}) }, orderBy:{createdAt:"desc"}, take: Number(searchParams.get("take") ?? "20") }).catch(()=>[]);
    return NextResponse.json({ ok: true, rows });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try { const inference = await svc.provenanceCreateInference(body); return NextResponse.json({ ok: true, inference }); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
