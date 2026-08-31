import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ tenantId: string; pluginId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tenantId, pluginId } = await params; const body = await request.json().catch(()=>({}));
  const { version, scope } = body;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const rec = await svc.ppEnablePlugin(String(pluginId), String(tenantId), { projects: scope?.projects?.map(String), asset_classes: scope?.asset_classes?.map(String), regions: scope?.regions?.map(String) });
  return NextResponse.json(rec);
}
