import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(()=>({}));
  const { asset_id, action, session_id, expires_in_seconds, watermark_profile } = body;
  if (!asset_id || !action || !session_id) return NextResponse.json({ error: "asset_id, action, session_id required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const cap = await svc.ztMediaCapability({ asset_id: String(asset_id), action: String(action), session_id: String(session_id), expires_in_seconds: expires_in_seconds?Number(expires_in_seconds):undefined, watermark_profile: watermark_profile?String(watermark_profile):undefined });
  return NextResponse.json(cap, { status: 201 });
}
