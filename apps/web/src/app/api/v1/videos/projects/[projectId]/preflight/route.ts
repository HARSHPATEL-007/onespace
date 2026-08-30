import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params; const body = await request.json().catch(() => ({}));
  const { project_version, timeline_id, destinations, checks, include_evidence, mode } = body;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const run = await svc.pfRun({ project_id: String(projectId), project_version: project_version ? Number(project_version) : undefined, timeline_id: timeline_id ? String(timeline_id) : undefined, destinations: destinations as unknown as (string|{platform:string;territory?:string;profile?:string})[], checks: checks?.map(String), mode: mode ? String(mode) : undefined });
  return NextResponse.json(run, { status: 201 });
}
export async function GET(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const latest = await svc.pfLatest(String(projectId));
  if (!latest) return NextResponse.json({ error: "No preflight" }, { status: 404 });
  return NextResponse.json(latest);
}
