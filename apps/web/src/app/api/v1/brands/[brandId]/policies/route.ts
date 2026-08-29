import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { brandId } = await params;
  const body = await request.json().catch(() => ({}));
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  // body: { name, source_documents, mode: draft, require_human_approval }
  const version = body.version ? String(body.version) : "2026.08";
  const policy = await svc.brandCreatePolicy({ brand_id: brandId, version, name: body.name ? String(body.name) : undefined });
  // Optionally compile documents if provided
  if (body.source_documents) {
    const { compileBrandDocuments } = await import("@n0va/modules-videos/brand");
    compileBrandDocuments({ brandbook_v7: "Brand Book v7" });
  }
  return NextResponse.json(policy);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { brandId } = await params;
  const { searchParams } = new URL(request.url);
  const version = searchParams.get("version") ?? "2026.08";
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const policy = await svc.brandGetPolicy(brandId, version);
  if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  return NextResponse.json(policy);
}
