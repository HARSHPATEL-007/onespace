import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "Workspace not found" }, { status: 403 });
  const { itemId } = await params;
  const body = await request.json().catch(()=> ({}));
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try{
    const inst = await svc.marketplaceInstall(itemId, { project_id: body.project_id ?? body.projectId, n0va_version: body.n0va_version ?? "5.0.0" });
    return NextResponse.json({ installation: inst });
  }catch(e){
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
