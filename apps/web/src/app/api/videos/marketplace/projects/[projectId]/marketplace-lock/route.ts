import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  const { projectId } = await params;
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const lockfile = await svc.marketplaceLockfile(projectId);
  return NextResponse.json({ lockfile });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  const { projectId } = await params;
  const body = await request.json().catch(()=> ({}));
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  // For demo, just return current lockfile — updates happen via installs
  const lockfile = await svc.marketplaceLockfile(projectId);
  return NextResponse.json({ lockfile, received: body });
}
