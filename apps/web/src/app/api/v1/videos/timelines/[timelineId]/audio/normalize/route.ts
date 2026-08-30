import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ timelineId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { timelineId } = await params; const body = await request.json().catch(()=>({}));
  const { destination_profile, preserve_dynamic_range, true_peak_protection, create_new_delivery_version } = body;
  if (!destination_profile) return NextResponse.json({ error: "destination_profile required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const res = await svc.audioNormalize(String(timelineId), { destination_profile: String(destination_profile), preserve_dynamic_range: Boolean(preserve_dynamic_range), true_peak_protection: Boolean(true_peak_protection) });
  return NextResponse.json(res);
}
