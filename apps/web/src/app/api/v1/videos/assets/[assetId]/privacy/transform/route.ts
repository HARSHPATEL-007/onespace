import { NextRequest, NextResponse } from "next/server";
import { auth } from "@n0va/auth";
import { prisma } from "@n0va/db";
import { VideosService } from "@n0va/modules-videos/server";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  const session = await auth(); if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { assetId } = await params; const body = await request.json().catch(()=>({}));
  const { transformations, profile, post_render_verification, review_required } = body;
  if (!transformations) return NextResponse.json({ error: "transformations required" }, { status: 400 });
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: session.user.id, status: "ACTIVE" } }); if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 403 });
  const svc = new VideosService(membership.workspaceId, session.user.id, membership.role);
  const asset = await svc.privacyTransform(String(assetId), { transformations: (transformations as string[]).map(String), profile: String(profile ?? "eu_external_share"), post_render_verification: post_render_verification!==false });
  return NextResponse.json(asset, { status: 201 });
}
