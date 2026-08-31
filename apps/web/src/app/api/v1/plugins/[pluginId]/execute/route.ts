import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ pluginId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { pluginId } = await params; const body = await request.json().catch(()=>({}));
  const { version, operation, asset_ids, timeline_version, purpose } = body;
  if (!operation || !asset_ids) return NextResponse.json({ error: "operation, asset_ids required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try {
    const exec = await svc.ppExecutePlugin(String(pluginId), { version: version?String(version):undefined, operation: String(operation), asset_ids: (asset_ids as string[]).map(String), timeline_version: timeline_version?String(timeline_version):undefined, purpose: purpose?String(purpose):undefined });
    return NextResponse.json(exec);
  } catch (e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 422 }); }
}
