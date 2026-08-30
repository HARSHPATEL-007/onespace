import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params; const body = await request.json().catch(()=>({}));
  const { source_language, target_language, voice_policy, pronunciation_dictionary_id, lip_sync, preserve_music_and_effects, review_stages } = body;
  if (!source_language || !target_language) return NextResponse.json({ error: "source_language, target_language required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const dub = await svc.audioCreateDub(String(projectId), { source_language: String(source_language), target_language: String(target_language), voice_policy: voice_policy?String(voice_policy):undefined, pronunciation_dictionary_id: pronunciation_dictionary_id?String(pronunciation_dictionary_id):undefined, lip_sync: Boolean(lip_sync), preserve_music_and_effects: Boolean(preserve_music_and_effects) });
  return NextResponse.json(dub, { status: 201 });
}
