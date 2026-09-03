import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body.state || !["enabled", "restricted", "disabled"].includes(body.state)) {
    return NextResponse.json({ error: "state must be enabled | restricted | disabled" }, { status: 400 });
  }
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const entitlement = await svc.editionSetState(id, body.state, body.actor ?? ctx.userId);
    return NextResponse.json({ ok: true, entitlement });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
