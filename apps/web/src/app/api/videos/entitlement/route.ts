import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/videos/entitlement?tenant_id=xxx — returns envelope + usage + ledger
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const url = new URL(request.url);
  const tenantParam = url.searchParams.get("tenant_id");
  const tenantId = tenantParam ?? membership.workspaceId;
  // Tenant isolation: only allow own workspace unless ADMIN
  if (tenantId !== membership.workspaceId && membership.role !== "OWNER" && membership.role !== "ADMIN") {
    return NextResponse.json({ error: "Tenant isolation: cannot view other workspace entitlements" }, { status: 403 });
  }
  const data = await svc.getEntitlement(tenantId);
  const matrix = await svc.getCapabilityMatrix();
  const tiers = await svc.listTiers();
  const addOns = await svc.catalogAddOns();
  return NextResponse.json({ ...data, matrix, tiers, addOnCatalog: addOns });
}

// POST /api/videos/entitlement — set tier { plan, overrides, addOns }
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const plan = String(body.plan ?? "").toLowerCase();
  if (!["creator","team","business","studio","regulated"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan — must be creator|team|business|studio|regulated" }, { status: 400 });
  }
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  // Only ADMIN/OWNER can change tier
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    return NextResponse.json({ error: "Requires ADMIN/OWNER to change tier" }, { status: 403 });
  }
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const tenantId = String(body.tenant_id ?? membership.workspaceId);
  if (tenantId !== membership.workspaceId && membership.role !== "OWNER") {
    return NextResponse.json({ error: "Tenant isolation" }, { status: 403 });
  }
  const envelope = await svc.setEntitlementTier({ tenant_id: tenantId, plan: plan as "creator", overrides: body.overrides, addOns: body.addOns });
  return NextResponse.json({ envelope, success: true });
}
