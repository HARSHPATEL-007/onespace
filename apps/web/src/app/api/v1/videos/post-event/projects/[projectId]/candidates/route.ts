import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params; const body = await request.json().catch(()=>({}));
  const { candidate_types, signals, minimum_confidence } = body;
  if (!candidate_types) return NextResponse.json({ error: "candidate_types required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const res = await svc.continuumGenerateCandidates(String(projectId), { candidate_types: (candidate_types as string[]).map(String), signals: (signals as string[] ?? []).map(String), minimum_confidence: minimum_confidence?Number(minimum_confidence):undefined });
  return NextResponse.json(res);
}
