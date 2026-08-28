import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const timeline_id = body.timeline_id ? String(body.timeline_id) : "tl001";
  const source_mode = body.source_mode ? String(body.source_mode) : "proxy";
  const target_mode = body.target_mode ? String(body.target_mode) : "camera_original";
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const map = await svc.interchangeRelinkMap(timeline_id, source_mode, target_mode);
  return NextResponse.json(map);
}
