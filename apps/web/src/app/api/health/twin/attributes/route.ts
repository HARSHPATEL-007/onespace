import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";
import { attributeEnvelopeSchema } from "@n0va/modules-health/twin-safeguards";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try { const rows = await svc.twinListAttributes(searchParams.get("patientId") ?? undefined, Number(searchParams.get("take") ?? "20")); return NextResponse.json({ ok: true, rows }); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  if (!body.patientId || !body.name) return NextResponse.json({ error: "patientId and name required" }, { status: 400 });
  // Coerce value
  const parsed = attributeEnvelopeSchema.safeParse({ name: body.name, value: Number(body.value), unit: body.unit, origin: body.origin ?? "OBSERVED", status: body.status ?? "ACTIVE", observedInputs: body.observedInputs ?? [], timeHorizon: body.timeHorizon });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try { const attribute = await svc.twinCreateAttribute({ patientId: body.patientId, ...parsed.data }); return NextResponse.json({ ok: true, attribute }); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
