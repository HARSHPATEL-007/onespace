import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";

// Risk-tiered feature catalog — every feature carries user, purpose,
// evidence, approval path, safety boundary, data requirement, outcome,
// and release phase. T4 autonomous features cannot self-register.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try {
    const phase = searchParams.get("phase");
    const rows = await svc.releaseFeatures(
      searchParams.get("tier") ?? undefined,
      phase === null ? undefined : Number(phase),
    );
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
  try {
    const feature = await svc.releaseFeature(body);
    return NextResponse.json({ ok: true, feature });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
