import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { sessionId } = await params; const body = await request.json().catch(()=>({}));
  const { source, start_offset_seconds, duration_seconds, speed, graphics_template } = body;
  if (!source || start_offset_seconds===undefined || duration_seconds===undefined) return NextResponse.json({ error: "source, start_offset_seconds, duration_seconds required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try {
    const r = await svc.liveStartReplay(String(sessionId), { source: String(source), start_offset_seconds: Number(start_offset_seconds), duration_seconds: Number(duration_seconds), speed: speed?Number(speed):undefined, graphics_template: graphics_template?String(graphics_template):undefined });
    return NextResponse.json(r, { status: 201 });
  } catch (e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 422 }); }
}
