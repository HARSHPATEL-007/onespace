import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ timelineId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { timelineId } = await params; const body = await request.json().catch(()=>({}));
  const { language, style, include, narration_mode, review_required } = body;
  if (!language) return NextResponse.json({ error: "language required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const evs = await svc.a11yGenerateAD(String(timelineId), { language: String(language), style: style?String(style):undefined, include: include?.map(String), narration_mode: narration_mode?String(narration_mode):undefined });
  return NextResponse.json(evs, { status: 201 });
}
