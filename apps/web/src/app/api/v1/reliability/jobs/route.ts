import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(()=>({}));
  const { asset_id, asset_version, operation, parameters_hash, timeline_version } = body;
  if (!asset_id || !operation) return NextResponse.json({ error: "asset_id, operation required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const job = await svc.relCreateJob({ asset_id: String(asset_id), asset_version: asset_version?Number(asset_version):undefined, operation: String(operation), parameters_hash: parameters_hash?String(parameters_hash):undefined, timeline_version: timeline_version?Number(timeline_version):undefined });
  return NextResponse.json(job, { status: 201 });
}
