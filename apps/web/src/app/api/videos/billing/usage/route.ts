import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  const ledger = await svc.getBillingLedger(limit);
  return NextResponse.json({ ledger });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const body = await request.json().catch(() => ({}));
  if (!body.meter || !body.quantity) return NextResponse.json({ error: "meter and quantity required" }, { status: 400 });
  const evt = await svc.recordBillingUsage({
    meter: String(body.meter) as never,
    quantity: Number(body.quantity),
    project_id: body.project_id,
    asset_id: body.asset_id,
    job_id: body.job_id,
    provider: body.provider,
    causation_id: body.causation_id,
    correlation_id: body.correlation_id,
    idempotency_key: String(body.idempotency_key ?? `manual:${Date.now()}`),
    schema_version: "1.0.0",
  } as never);
  return NextResponse.json({ usage: evt });
}
