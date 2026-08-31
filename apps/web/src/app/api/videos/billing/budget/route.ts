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
  const budgets = await svc.listBillingBudgets();
  return NextResponse.json({ budgets });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const body = await request.json().catch(() => ({}));
  const bp = await svc.createBillingBudget({
    scope: String(body.scope ?? "project") as never,
    scope_id: String(body.scope_id ?? body.scopeId ?? "project_001"),
    currency: String(body.currency ?? "USD") as never,
    period: String(body.period ?? "monthly") as never,
    limit_cents: Number(body.limit_cents ?? 100000),
    enforcement: String(body.enforcement ?? "soft") as never,
    thresholds: body.thresholds ?? [{ percentage:50, action:"notify_owner" },{ percentage:80, action:"require_project_admin_approval" },{ percentage:100, action:"block_new_premium_usage" }],
    allowed_fallbacks: body.allowed_fallbacks ?? ["standard_model","proxy_export"],
    per_operation_cap_cents: body.per_operation_cap_cents,
  });
  return NextResponse.json({ budget: bp });
}
