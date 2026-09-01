import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.patientId || !body.dataCategory || !body.purpose || !body.action) return NextResponse.json({ error: "patientId, dataCategory, purpose, action required" }, { status: 400 });
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try { const decision = await svc.walletDecide({ patientId: body.patientId, dataCategory: body.dataCategory, purpose: body.purpose, action: body.action, jurisdiction: body.jurisdiction, requesterRole: body.requesterRole, requesterId: body.requesterId, emergency: body.emergency }); return NextResponse.json({ ok: true, ...decision }); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
