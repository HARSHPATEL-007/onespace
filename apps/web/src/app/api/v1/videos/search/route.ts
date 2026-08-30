import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})); const { query, scope, mode, include, limit } = body;
  if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const result = await svc.srSmartSearch({ query: String(query), scope: scope ? { tenant_id: String(scope.tenant_id ?? membership.workspaceId), project_ids: (scope.project_ids as string[])?.map(String) } : undefined, mode: mode ? String(mode) : undefined, limit: limit ? Number(limit) : undefined });
  // honor include toggles — we always include evidence/confidence in mock
  return NextResponse.json(result);
}
export async function GET(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url); const q = searchParams.get("q") ?? "Find approved clips of the CEO discussing Product X in an energetic scene";
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const result = await svc.srSmartSearch({ query: q, mode: "smart", limit: 10 });
  return NextResponse.json(result);
}
