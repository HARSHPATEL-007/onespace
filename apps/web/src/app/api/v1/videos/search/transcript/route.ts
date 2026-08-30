import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})); const { phrase, query, speaker_id, language, time_range, boolean_query } = body;
  if (!phrase && !query && !boolean_query) return NextResponse.json({ error: "phrase/query/boolean_query required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const results = await svc.srExactSearch({ phrase: phrase ? String(phrase) : undefined, query: query ? String(query) : undefined, speaker_id: speaker_id ? String(speaker_id) : undefined, language: language ? String(language) : undefined, time_range, boolean_query: boolean_query ? String(boolean_query) : undefined, tenant_id: membership.workspaceId });
  return NextResponse.json(results);
}
