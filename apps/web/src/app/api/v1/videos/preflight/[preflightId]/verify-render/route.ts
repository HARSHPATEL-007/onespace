import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ preflightId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { preflightId } = await params; const body = await request.json().catch(()=>({}));
  const { render_id, expected_timeline_hash, scan_mode } = body;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const res = await svc.pfRecheckExport(String(preflightId));
  return NextResponse.json({ preflight_id: preflightId, render_id: render_id ?? "render_018", expected_timeline_hash, scan_mode: scan_mode ?? "full", ...res });
}
