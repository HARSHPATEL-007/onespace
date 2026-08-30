import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(()=>({}));
  const { asset_id, session_id, requested_resolution, device_id, destination } = body;
  if (!asset_id || !session_id) return NextResponse.json({ error: "asset_id, session_id required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const res = await svc.ztPlaybackAuthorize({ asset_id: String(asset_id), session_id: String(session_id), requested_resolution: requested_resolution?String(requested_resolution):undefined, device_id: device_id?String(device_id):undefined, destination: destination?String(destination):undefined });
  return NextResponse.json(res);
}
