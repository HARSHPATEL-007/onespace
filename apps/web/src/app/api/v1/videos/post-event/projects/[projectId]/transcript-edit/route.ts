import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params; const body = await request.json().catch(()=>({}));
  const { selection, edit_mode, ripple_tracks, preserve_room_tone, review_required } = body;
  if (!selection?.start_segment_id || !selection?.end_segment_id) return NextResponse.json({ error: "selection.start_segment_id and end_segment_id required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try {
    const res = await svc.continuumTranscriptEdit(String(projectId), { selection: { start_segment_id: String(selection.start_segment_id), end_segment_id: String(selection.end_segment_id) }, edit_mode: String(edit_mode ?? "remove"), ripple_tracks: (ripple_tracks as string[] ?? []).map(String), preserve_room_tone: Boolean(preserve_room_tone) });
    return NextResponse.json(res);
  } catch (e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 422 }); }
}
