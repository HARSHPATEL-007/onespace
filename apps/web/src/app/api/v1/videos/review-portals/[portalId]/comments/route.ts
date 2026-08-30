import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ portalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { portalId } = await params;
  const body = await request.json().catch(() => ({}));
  const { snapshot_id, time_ms, frame, text, annotation } = body;
  if (!snapshot_id || time_ms === undefined || frame === undefined || !text) return NextResponse.json({ error: "snapshot_id, time_ms, frame, text required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } });
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try {
    const comment = await svc.portalAddComment(String(portalId), {
      snapshot_id: String(snapshot_id), time_ms: Number(time_ms), frame: Number(frame), text: String(text), annotation: annotation ? { type: String(annotation.type), x: Number(annotation.x), y: Number(annotation.y), width: Number(annotation.width), height: Number(annotation.height) } : undefined,
    });
    return NextResponse.json(comment, { status: 201 });
  } catch (e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 422 }); }
}
