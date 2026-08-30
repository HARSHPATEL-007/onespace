import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(()=>({}));
  const { action, asset_id, destination, purpose, required_approvers } = body;
  if (!action || !asset_id) return NextResponse.json({ error: "action, asset_id required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const req = await svc.ztRequestPrivileged({ action: String(action), asset_id: String(asset_id), destination: destination?String(destination):undefined, purpose: purpose?String(purpose):"approved_broadcast_delivery", required_approvers: required_approvers?Number(required_approvers):undefined });
  return NextResponse.json(req, { status: 201 });
}
