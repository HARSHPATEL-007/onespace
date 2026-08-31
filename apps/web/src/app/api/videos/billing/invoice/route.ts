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
  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? undefined;
  if (url.searchParams.get("id")) {
    const inv = await svc.getBillingInvoice(url.searchParams.get("id")!);
    return NextResponse.json({ invoice: inv });
  }
  const invoice = await svc.aggregateBillingInvoice(period);
  return NextResponse.json({ invoice });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const body = await request.json().catch(() => ({}));
  const period = String(body.period ?? new Date().toISOString().slice(0,7));
  const invoice = await svc.aggregateBillingInvoice(period);
  const finalized = await svc.finalizeBillingInvoice(invoice.invoice_id);
  return NextResponse.json({ invoice: finalized });
}
