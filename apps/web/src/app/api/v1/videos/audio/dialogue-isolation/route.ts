import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(()=>({}));
  const { source_asset_id, speaker_id, time_range, preserve_room_tone, preserve_emotion, maximum_artifact_risk, review_required } = body;
  if (!source_asset_id || !speaker_id || !time_range) return NextResponse.json({ error: "source_asset_id, speaker_id, time_range required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  try {
    const res = await svc.audioIsolate({ source_asset_id: String(source_asset_id), speaker_id: String(speaker_id), time_range: { start_ms: Number(time_range.start_ms), end_ms: Number(time_range.end_ms) }, preserve_room_tone: Boolean(preserve_room_tone), maximum_artifact_risk: maximum_artifact_risk?Number(maximum_artifact_risk):undefined });
    return NextResponse.json(res, { status: 201 });
  } catch (e: unknown) { return NextResponse.json({ error: (e as Error).message }, { status: 422 }); }
}
