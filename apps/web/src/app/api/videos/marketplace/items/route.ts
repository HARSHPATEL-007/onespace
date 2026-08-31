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
  // Ensure seed for demo
  try{ await svc.marketplaceSeed(); }catch{}
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;
  const category = url.searchParams.get("category") as never ?? undefined;
  const license_type = url.searchParams.get("license_type") ?? undefined;
  const security_status = url.searchParams.get("security_status") as never ?? undefined;
  const publisher_verified = url.searchParams.get("publisher_verified");
  const commercial_use = url.searchParams.get("commercial_use");
  const result = await svc.marketplaceSearch({ q, category, license_type, security_status, publisher_verified: publisher_verified? publisher_verified==="true": undefined, commercial_use: commercial_use? commercial_use==="true": undefined, limit: Number(url.searchParams.get("limit") ?? 20) } as never);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const body = await request.json().catch(()=> ({}));
  const item = await svc.marketplaceCreateItem(body);
  return NextResponse.json({ item });
}
