import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { assetId } = await params; const body = await request.json().catch(()=>({}));
  const { detectors, regions, create_transform_suggestions } = body;
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const res = await svc.privacyScan(String(assetId), { detectors: detectors?.map(String) ?? ["faces"], regions: regions?.map(String) });
  return NextResponse.json(res);
}
