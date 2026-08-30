import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(()=>({}));
  const { asset_ids, actions, purpose, duration_minutes, device_id } = body;
  if (!asset_ids || !actions || !purpose) return NextResponse.json({ error: "asset_ids, actions, purpose required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const grant = await svc.ztRequestGrant({ asset_ids: (asset_ids as string[]).map(String), actions: (actions as string[]).map(String), purpose: String(purpose), duration_minutes: duration_minutes?Number(duration_minutes):undefined, device_id: device_id?String(device_id):"device_008" });
  return NextResponse.json(grant, { status: 201 });
}
