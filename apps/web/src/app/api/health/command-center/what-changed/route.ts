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
  const patientId = searchParams.get("patientId");
  if (!patientId) return NextResponse.json({ error: "patientId required" }, { status: 400 });
  const referencePoint = searchParams.get("referencePoint") ?? "since_last_visit";
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const result = await svc.commandCenterWhatChanged(patientId, referencePoint);
    const rows = (result as { events?: unknown[] })?.events ?? [];
    return NextResponse.json({ ok: true, events: rows, referencePoint, whatChanged: rows });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.patientId || !body.category || !body.title) return NextResponse.json({ error: "patientId, category, title required" }, { status: 400 });
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try { const event = await svc.commandCenterRecordWhatChanged(body.patientId, body.category, body.title, body.supportingRecordId, body.provenanceRef, body.referencePoint); return NextResponse.json({ ok: true, event }); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
