import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})); const { source, similarity_mode, scope } = body;
  if (!source?.asset_id) return NextResponse.json({ error: "source.asset_id required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const results = await svc.srSimilarSearch({ source: { asset_id: String(source.asset_id), start_ms: source.start_ms ? Number(source.start_ms) : undefined, end_ms: source.end_ms ? Number(source.end_ms) : undefined }, similarity_mode: similarity_mode ? String(similarity_mode) : undefined, scope: scope ? { tenant_id: String(scope.tenant_id ?? membership.workspaceId), project_ids: scope.project_ids?.map(String) } : undefined });
  return NextResponse.json(results);
}
