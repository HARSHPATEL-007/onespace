import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ grantId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { grantId } = await params;
  const body = await request.json().catch(() => ({}));
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const ev = await svc.identityRevoke(grantId, {
    effective_at: body.effective_at ? String(body.effective_at) : undefined,
    scope: body.scope as { operations?: string[]; projects?: string[]; platforms?: string[]; territories?: string[] } | undefined,
    reason: body.reason ? String(body.reason) : undefined,
  });
  return NextResponse.json(ev);
}
