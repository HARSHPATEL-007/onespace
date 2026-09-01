import { NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { requireWorkspace } from "@/lib/context";
import { HealthService } from "@n0va/modules-health/server";
import { validationStudySchema } from "@n0va/modules-health/registry";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const { searchParams } = new URL(req.url);
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try { const rows = await svc.listValidationStudies(searchParams.get("modelId") ?? undefined); return NextResponse.json({ ok: true, rows }); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await requireWorkspace().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const parsed = validationStudySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const svc = new HealthService(ctx.workspaceId, ctx.userId, ctx.role);
  try { const study = await svc.createValidationStudy(parsed.data); return NextResponse.json({ ok: true, study }); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
