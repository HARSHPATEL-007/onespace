import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string; destinationId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId, destinationId } = await params;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try {
    const h = await svc.liveDestinationHealth(String(sessionId), String(destinationId));
    return NextResponse.json(h);
  } catch (e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 404 }); }
}
