import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await params; const body = await request.json().catch(()=>({}));
  const { project_name, source_policy, generate, languages, derivative_profiles, review_mode } = body;
  if (!project_name) return NextResponse.json({ error: "project_name required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const proj = await svc.continuumCreateProject({ session_id: String(sessionId), project_name: String(project_name), source_policy: source_policy?String(source_policy):undefined, generate: generate?.map(String), languages: languages?.map(String), derivative_profiles: derivative_profiles?.map(String), review_mode: review_mode?String(review_mode):undefined });
  return NextResponse.json(proj, { status: 201 });
}
